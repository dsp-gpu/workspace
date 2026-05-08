# КФП Design: `rag_dsp.test_params` для AI-генерации тестов (2026-05-08)

> **Что:** design-doc для центральной таблицы знаний о коде, которые **нельзя извлечь грепом**.
> **Контекст:** вынесено из раздела 4 `RAG_deep_analysis_2026-05-08.md`.
> **Связано:** `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md` (actionable задачи C1a/C1b/C2 → заполняют test_params).

---

## 1. Терминология

**КФП = Конфигурация Функциональных Параметров** = таблица `rag_dsp.test_params` + JSON-файлы в `test_params/` + doxygen-теги `@test/@test_field/@test_ref/@test_check` в `.hpp`.

**Что в ней:**
- допустимый диапазон параметра (`fft_size ∈ [1..1300000]`),
- типичные значения (`fft_size ∈ [256, 1024, 4096]`),
- паттерн (`power_of_2`, `prime`, `gpu_pointer`),
- единица (`Гц`, `доля VRAM`, `complex samples`),
- зависимости (`data.size() == beam_count * n_point`),
- что бросает (`throws on n_point=0`),
- что проверять в результате (`result[0].magnitudes.size() == nextPow2(n_point) * repeat_count`).

**Три представления одних и тех же знаний** (так задумано в spec 09):
1. **Doxygen `@test*`** в `.hpp` — источник правды (правит программист).
2. **MD-карточка** в `<repo>/.rag/test_params/<ns>_<class>.md` — для AI-генератора тестов и для поиска.
3. **JSON в `test_params/`** + строки в БД — для CLI/API/sync.

---

## 2. Зачем это критично для LLM на 9070

> Без `test_params` AI на запрос «сгенерируй smoke-тест для `FFTProcessorROCm::ProcessComplex`» возвращает заведомо неправильные значения (`fft_size = 100` вместо `power_of_2`), потому что **в коде эти знания не маркированы**.

С `test_params` промпт получает блок:
```
@param data: size=[100..1300000], typical=6000, edge=[0,1], unit="complex samples"
@param params.n_point: power_of_2, throws on 0
@return: result[0].magnitudes.size() == nextPow2(n_point) * repeat_count
```
и AI генерит **рабочий** тест.

---

## 3. Расширение схемы `test_params`

### 3.1 Минимум для Phase B (12.05)

| Поле | Сейчас в schema 03 §2.8 | Что добавить | Зачем |
|------|------------------------|--------------|-------|
| `param_name`, `param_type` | ✅ | — | — |
| `edge_values` (JSONB) | ✅ — `{min, max, typical[], edge[]}` | + `step`, `formula`, `pattern` (см. spec 09 §5.2) | сейчас формат не совпадает с doxygen `@test` |
| `constraints` (JSONB) | ✅ — `{power_of_two, throws_if_zero, …}` | + `unit`, `boundary`, `depends`, `formula` | для AI важна **физическая** размерность и связи |
| `extracted_from` | ✅ — `{file, line, snippet}` | + `doxy_block_id` (FK на doc_blocks) | связать с источником в RAG |
| `human_verified`, `operator_name` | ✅ | + `verified_at`, `confidence` | track over time |
| **NEW: `return_checks` (JSONB)** | ❌ | `[{"expr": "result[0].size() == n_point", "context": "..."}]` | сегодня AI не знает что проверять в выходе |
| **NEW: `throw_checks` (JSONB)** | ❌ | `[{"on": "n_point == 0", "type": "std::invalid_argument"}]` | для negative-тестов |
| **NEW: `linked_use_cases` (TEXT[])** | ❌ | id'шники из `use_cases` | связь «параметр → use-case» |
| **NEW: `linked_pipelines` (TEXT[])** | ❌ | id'шники из `pipelines` | какие pipeline'ы используют этот параметр |
| **NEW: `embedding_text`** | ❌ | компилируется из (param_name, type, edge, constraints, return_checks) | чтобы попадать в Qdrant `target_table='test_params'` |
| **NEW: `coverage_status`** | ❌ | enum `ready_for_autotest`/`partial`/`skipped` (spec 09 §5.4) | фильтрация на retrieval-этапе |

### 3.2 Концепция «@test triple» — 3 уровня заполнения

```
LEVEL 0 (auto, 100% coverage)     ← без участия Alex
  ├─ AI парсит код (if/throw/assert/clamp), пишет черновик
  └─ confidence=0.5, human_verified=false

LEVEL 1 (heuristics, ~80% coverage) ← agent_doxytags + промпт 009
  ├─ AI читает doxy_brief + связанные методы + use_cases
  └─ предлагает теги. Alex просматривает diff
  └─ confidence=0.8, partially verified

LEVEL 2 (programmer, 100% coverage) ← Alex руками или AI с правкой
  ├─ программист пишет @test в .hpp
  └─ pre-commit парсит, обновляет test_params
  └─ confidence=1.0, human_verified=true
```

**Сегодня LEVEL 0/1/2 не реализованы** — есть только базовая структура таблицы. Реализация — задачи C1a/C1b/C2 в `TASK_RAG_context_fuel_2026-05-08.md`.

---

## 4. Чем расширить КФП — 5 направлений (приоритет)

| Приоритет | Направление | Что делать | Зависимости |
|-----------|-------------|------------|-------------|
| **🔴 P0** | Заполнить test_params для всех 9 репо | `cli/params_extract.py` (LEVEL 0) → ~327 записей; ручная верификация ~20 ключевых классов (LEVEL 2) | C1a + C1b в TASK |
| **🟠 P1** | Embeddable `test_params` в Qdrant | 4-я `target_table` в Qdrant (`doc_blocks` + `use_cases` + `pipelines` + `test_params`); запрос «нормальные значения для FFT batch на 128 лучах» резолвится в граничные значения, не в текст doxygen | после P0 |
| **🟠 P1** | Связь с use_cases / pipelines | `linked_use_cases[]`, `linked_pipelines[]` + JSONB-индексы; tool `dsp_test_params(class_or_method, param=None)` возвращает edge-values + список pipeline'ов | C5 в TASK |
| **🟡 P2** | `coverage_status` колонка | `ready_for_autotest`/`partial`/`skipped` (spec 09 §5.4) — сейчас вычисляется в `agent_doxytags/analyzer.py` ad-hoc, должно быть колонкой для фильтрации на retrieval-этапе | после P0 |
| **🟡 P2** | `test_history` отдельная таблица | `gpu_test_utils::TestRunner::OnTestComplete()` пишет результат прогона (`pass/fail`, `duration_ms`, `actual_vs_expected_diff`) → `test_params` становится **живой базой**: AI видит «эти границы реально проверены, эти гипотетические» | после `TASK_validators` |

---

## 5. Связи с другими частями системы

```
                    ┌──────────────────────────┐
                    │   .hpp (@test* теги)     │  ← LEVEL 2 источник правды
                    └────────────┬─────────────┘
                                 │ doxygen parser (C2)
                                 ▼
   ┌──────────────────────────────────────────────────────┐
   │            rag_dsp.test_params (БД)                   │
   │  param_name | edge_values | constraints | confidence  │
   │  return_checks | throw_checks | linked_*              │
   └────────┬─────────────────────────┬──────────────────┘
            │ embedding_text          │ JSON sync
            ▼                         ▼
   ┌────────────────────┐   ┌───────────────────────────────┐
   │ Qdrant collection  │   │ <repo>/.rag/test_params/*.md  │
   │ target_table=      │   │ + test_params/*.json          │
   │ "test_params"      │   └───────────────────────────────┘
   └────────────────────┘            │
            │                         │ pre-commit hook (E4)
            └──────────┬──────────────┘
                       ▼
              ┌─────────────────┐
              │ dsp_test_params │ ← MCP tool (C5)
              │ MCP tool        │
              └─────────────────┘
                       ▼
              ┌─────────────────────────────┐
              │ LLM (Continue/Cline + Qwen3)│
              │ генерирует тест с правильными│
              │ границами и throw_checks    │
              └─────────────────────────────┘
```

**Цикл жизни одной записи:**
1. `cli/params_extract.py` → LEVEL 0 черновик в БД (confidence=0.5)
2. `agent_doxytags` LEVEL 1 heuristics → confidence=0.8
3. Программист пишет `@test*` в .hpp → pre-commit парсит → confidence=1.0
4. `TestRunner::OnTestComplete()` → пишет `test_history` (отдельная таблица)
5. Через embedding_text запись попадает в Qdrant → доступна для `dsp_test_params(...)` MCP tool
6. LLM использует через `dsp_context_pack(query, intent="generate_test")` (см. §7 deep_analysis)

---

*Maintained by: Кодо · 2026-05-08 · вынесено из RAG_deep_analysis_2026-05-08.md §4.*
