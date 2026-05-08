# TASK_RAG_doxygen_test_parser — `@test*` парсер + LEVEL 1 AI heuristics

> **Этап:** CONTEXT-FUEL (C2) · **Приоритет:** 🔴 P0 · **Effort:** ~3 ч · **Зависимости:** TASK_RAG_test_params_fill (C1)
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`
> **Design-doc:** `MemoryBank/specs/LLM_and_RAG/RAG_kfp_design_2026-05-08.md` §3.2

## 🎯 Цель

Связать **3 представления КФП** (см. design-doc §1):
- `@test*` теги в `.hpp` (источник правды, LEVEL 2)
- AI heuristics через промпт 009 (LEVEL 1, confidence=0.8)
- БД `rag_dsp.test_params` (синхронизация двух выше)

После C1 (LEVEL 0 auto-extract) — этот TASK добавляет **семантический слой**.

## 📋 Подэтапы

### 1. Doxygen `@test*` парсер для индексера (~1 ч)

В `dsp_assistant/indexer/cpp_extras.py` добавить:

```python
def parse_test_tags(doxy_block: str) -> dict:
    """
    Парсит из doxygen-блока:
      @test {description}
      @test_field <name>: <constraint>
      @test_ref <linked_class>::<method>
      @test_check <expr>
    Возвращает dict для UPSERT в test_params.
    """
```

Регексы:
- `@test\s+(?P<descr>.+?)$` — описание тест-сценария
- `@test_field\s+(?P<name>\S+):\s+(?P<constraint>.+?)$` — границы параметра
- `@test_check\s+(?P<expr>.+?)$` — return check expression
- `@test_ref\s+(?P<ref>\S+)` — связь с use_case/pipeline

Интеграция в `indexer/build.py` — при обработке symbol с doxygen-блоком вызвать
`parse_test_tags()` и UPSERT в `test_params`.

### 2. LEVEL 1 AI heuristics через промпт 009 (~1.5 ч)

`MemoryBank/specs/LLM_and_RAG/prompts/009_test_params_heuristics.md` — новый промпт:
- Вход: `doxy_brief` класса + связанные методы (через C2 + C5/C6) + use_cases
- Выход: предложение `@test*` тегов для методов которые их не имеют
- Confidence threshold: 0.8 (если ниже → пометить для ручной правки)

Команда: `dsp-asst params heuristics --repo X [--method Y] [--apply]`
- `--apply` → UPSERT в БД с confidence=0.8
- Без `--apply` → diff-вывод для ревью

### 3. Pre-commit hook для синка (~30 мин)

`MemoryBank/hooks/pre-commit` (расширить):
- Если `*.hpp` изменён → распарсить `@test*` теги (шаг 1) → UPSERT в БД
- Если запись существует с `human_verified=true` и текст изменился → инкремент `verified_at`

## ✅ DoD

- [ ] `parse_test_tags()` парсит 5 эталонных .hpp (FFTProcessorROCm, ScopedHipEvent, ProfilingFacade, CaponProcessor, IGpuOperation)
- [ ] `@test_field` теги попадают в `rag_dsp.test_params` с confidence=1.0
- [ ] `prompts/009_test_params_heuristics.md` написан
- [ ] `dsp-asst params heuristics --repo core` выдаёт ≥10 предложений
- [ ] Pre-commit hook ручной тест на одном файле
- [ ] Запись в sessions

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Зависимость: `TASK_RAG_test_params_fill_2026-05-08.md`
- Design: `RAG_kfp_design_2026-05-08.md` §3.2
- Spec 12: `MemoryBank/specs/LLM_and_RAG/12_DoxyTags_Agent_Spec.md`
- **Переиспользовать**: `dsp_assistant/agent_doxytags/{analyzer,heuristics}.py`

*Maintained by: Кодо · 2026-05-08*
