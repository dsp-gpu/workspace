# Agent doxytags — план реализации (живой)

> **Создано**: 2026-05-03
> **Спека**: `MemoryBank/specs/LLM_and_RAG/12_DoxyTags_Agent_Spec.md`
> **Где код**: `C:\finetune-env\dsp_assistant\agent_doxytags\`
> **Workflow**: Кодо пишет команды → Alex выполняет в PyCharm → ревью → правки → коммит

---

## Этапы

| # | Этап | Файл | Статус | Тест |
|---|---|---|---|---|
| 1 | tree-sitter parser public-методов + doxygen extraction | `extractor.py` | ✅ DONE 2026-05-03 | `smoke_extractor.py` 7/7 ✅ |
| 2 | analyzer: что в doxygen есть/нет (diff vs required) | `analyzer.py` | ✅ DONE 2026-05-03 | `smoke_analyzer.py` 1/1/3/2 ✅ |
| 3 | git pre-flight + walker (обход репо/файлов) | `git_check.py`, `walker.py` | ✅ DONE 2026-05-03 | `smoke_walker_git.py` 38 hpp в spectrum ✅ |
| 4 | Доменные эвристики (вместо LLM) | `heuristics.py`, `prompts/009_*.md` (резерв) | ✅ DONE 2026-05-03 | `smoke_heuristics.py` **332/332 = 100%** ✅ |
| 5 | patcher: вставка строк + tree-sitter re-validate + .bak rollback | `patcher.py` | ✅ DONE 2026-05-03 | `smoke_patcher.py` **5/5 ready** ✅ |
| 6 | CLI `dsp-asst doxytags fill` (интеграция в `cli/main.py`) | `cli.py` | 📋 (after pilot) | manual smoke |
| 7 | **Subagent profile для Sonnet 4.7** — Phase 2 LLM-генерация русских описаний | `.claude/agents/doxytags.md` | ✅ DONE 2026-05-03 | Alex запускает в новой сессии |
| 8 | Pilot Phase 1+2 на одном файле в Sonnet 4.7 | (Sonnet+Edit) | ⏳ next | Alex запускает |
| 9 | Прогон на всём `spectrum/` после одобрения | (Sonnet+Edit) | 📋 | Alex |
| 10 | Прогон на остальные 7 модулей | (Sonnet+Edit) | 📋 | Alex |

---

## Текущая сессия (2026-05-03)

**Сейчас**: Этап 1 — smoke-тест existing `extractor.py` на `fft_processor_rocm.hpp`.

**Команда для PyCharm Alex'а**:
```python
python C:\finetune-env\smoke_extractor.py
```

**Ожидаемый вывод**:
- 7 public-методов FFTProcessorROCm
- `ProcessComplex(CPU)` с полным doxygen блоком (после нашей sanity-check правки)
- `params_with_test = {data, params, prof_events}` (3/3)
- `has_return_check = True`, `has_throws_check = True`

---

## Архитектурные решения (фиксируем по ходу)

### А1. extractor.py — оставляем как есть, расширяем по необходимости

Покрытие Spec 12 §3 шаг 2.a-c — ✅ (см. таблицу выше).

Что **возможно** придётся добавить после smoke-теста:
- Поле `params_with_test_check` для @test_check на out-параметрах (сейчас только на @return/@throws)
- Эвристика «is_trivial_filter» (1-строчный getter, ctor=default, =delete)
- Парсинг `@autoprofile { warmup, runs, target_method, enabled }` ключей

### А2. analyzer.py — алгоритм coverage по обновлённой Spec 09 §5.4

```python
def compute_coverage(method: MethodInfo) -> CoverageStatus:
    # inputs
    total = len(method.params)
    with_tag = len(method.doxygen.params_with_test) if method.doxygen else 0
    coverage_inputs = 1.0 if total == 0 else with_tag / total

    # outputs
    has_return_check = method.is_void or (method.doxygen and method.doxygen.has_return_check)
    has_throw_check  = (not method.has_throw_in_body) or (method.doxygen and method.doxygen.has_throws_check)
    coverage_outputs = 1.0 if (has_return_check and has_throw_check) else 0.0

    if coverage_inputs == 1.0 and coverage_outputs == 1.0:
        return CoverageStatus.READY_FOR_AUTOTEST
    elif coverage_inputs > 0 or has_return_check or has_throw_check:
        return CoverageStatus.PARTIAL
    else:
        return CoverageStatus.SKIPPED
```

### А3. patcher.py — ключевые инварианты

1. **Никогда не переписывать существующее** (Spec 12 §4) — только дописывать к концу блока, перед `*/`.
2. `.bak` после успеха — удаляется (Spec 12 §3 уточнение из ревью).
3. Tree-sitter re-validate: `_PARSER.parse(new_source)` не должен падать.
4. Стиль `///` файлов — пропускаем с warning (Spec 12 §4.6 обновлено).

---

## Логи сессий

- **2026-05-03 первая сессия**: Phase A правок спек завершена; agent_doxytags/extractor.py обнаружен — пишем smoke-тест.

---

## 📸 Снимок состояния (2026-05-03, после 4 репо)

**Где мы находимся**: production-прогон doxytags на 8 репо DSP-GPU.

### Сделано (4 из 8 репо)

| # | Репо | Commit | Файлов | +/- | Особенности |
|---|------|--------|--------|-----|-------------|
| 1 | stats | `8bdb210` | 11 | +263/-2 | Pilot — нашли 3 типа багов Sonnet |
| 2 | heterodyne | `400d8b5` | 4 | +190/-15 | 6 ручных правок (multi-line дубли) |
| 3 | signal_generators | `6550734` | 24 | +610/-34 | Применён `clean_doxytags_dups.py` (26 /// дублей) |
| 4 | linalg | `8a5b447` | 11 | +154/-5 | Применён скрипт (5 /// дублей) |

### Осталось (4 репо)
- **radar** ~13 hpp — следующий
- **strategies** ~23 hpp
- **spectrum** ~38 hpp (большой, есть pilot из Phase A)
- **core** ~70 hpp — последний, самый большой

### Найденные паттерны багов Sonnet (для усиления профиля)

**Тип 1**: дубль `///` короткий + `/** */` полный.
- Sonnet добавил полный блок но **не удалил** старый `///`.
- Profile §6.3 v2 учёл — но для уже-обработанных репо нужен `clean_doxytags_dups.py`.

**Тип 2**: дубль `/** */` без тегов + `/** */` полный.
- В heterodyne нашлось 6 случаев. В signal_generators/linalg отсутствовали (Sonnet работал по обновлённому профилю).
- Profile §6.3 покрывает: «слить старое в `@details`».

**Тип 3**: `@test_ref TypeName` повторяется в `@return` блоке.
- Найдено 1 раз в stats. После усиления профиля — больше не появлялось.

**Тип 4**: кривой indent для namespace-функций (5 пробелов вместо 1).
- Patcher.py баг — пофикшен в `_indent_from_doxygen`.

**Тип 5** (false positive grep): между двумя `/** */` блоками может быть **реальный код**, не пустота. Не дубль — это разные методы. Скрипт `clean_doxytags_dups.py` это понимает (проверяет `between`).

### Артефакты

**Production code** (`C:\finetune-env\dsp_assistant\agent_doxytags\`):
- `extractor.py` — tree-sitter парсер + wrapper-detect + trivial-filter
- `analyzer.py` — coverage statuses (READY/PARTIAL/SKIPPED/TRIVIAL)
- `heuristics.py` — 100% покрытия `@test` (collect_structs_with_test_tags)
- `walker.py` + `git_check.py` — обход + pre-flight
- `patcher.py` — генерация скелета + умные `@test_check` + delta validation + rollback

**Workflow scripts** (`C:\finetune-env\`):
- `apply_doxytags_repo.py` — Phase 1 in-place на весь репо
- `clean_doxytags_dups.py` — авточистка `///` + `/** */` дублей после Sonnet
- `smoke_extractor.py` / `smoke_analyzer.py` / `smoke_heuristics.py` / `smoke_patcher.py` / `smoke_patcher_spectrum.py` / `smoke_walker_git.py`

**Subagent profile**:
- `e:\DSP-GPU\.claude\agents\doxytags.md` — обновлён 2 раза (§6.3 v1 → v2 после ревью stats/heterodyne)

### Workflow для оставшихся репо

```
1. Alex: меняет {REPO} в промпте, запускает в новой Sonnet 4.7 сессии.
2. Sonnet: Phase 1 (apply_doxytags_repo.py) + Phase 2 (Edit русские описания).
3. Alex: пишет «<repo> готов».
4. Opus 4.7 (я):
   - git status + diff stat
   - python clean_doxytags_dups.py --root E:\DSP-GPU\<repo>\include
   - проверка дублей вручную (если есть multi-line — слить в @details)
   - git add + commit + push
5. Переход к следующему репо.
```

### Ссылки

- Спека агента: `MemoryBank/specs/LLM_and_RAG/12_DoxyTags_Agent_Spec.md`
- Спека @test тегов: `MemoryBank/specs/LLM_and_RAG/09_RAG_md_Spec.md`
- Эталон стиля шапок: `MemoryBank/specs/Header_Comment_Format_Plan_2026-05-01.md`
- Договорённости: `MemoryBank/specs/Review_LLM_RAG_specs_2026-05-03.md` §9
