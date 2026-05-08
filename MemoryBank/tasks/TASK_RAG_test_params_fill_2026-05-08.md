# TASK_RAG_test_params_fill — заполнить `test_params` для всех 9 репо

> **Этап:** CONTEXT-FUEL (C1) · **Приоритет:** 🔴 P0 · **Effort:** ~4.5 ч · **Зависимости:** none
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`
> **Design-doc:** `MemoryBank/specs/LLM_and_RAG/RAG_kfp_design_2026-05-08.md`
> **Schema-migration:** `TASK_RAG_schema_migration_2026-05-08.md` (выполнить ДО этого таска)

## 🎯 Цель

Заполнить `rag_dsp.test_params` (сейчас 0 записей) до ≥200 записей за счёт LEVEL 0 (auto-extract)
+ ручная верификация ~20 ключевых классов (LEVEL 2). Без этого AI генерирует тесты «вслепую».

## 📋 Подэтапы

### C1a — extractor (~1.5 ч)

Написать `dsp_assistant/cli/params_extract.py` (**переиспользовать** существующий
`dsp_assistant/agent_doxytags/extractor.py` + `analyzer.py` — у них уже есть tree-sitter cpp parsing):

1. Walker по `<repo>/include/**/*.hpp` (использовать `indexer/file_walker.py`).
2. Tree-sitter cpp parsing — найти methods + params (шаблон в `indexer/chunker_cpp.py`).
3. Regex эвристики на тело метода / cpp-реализацию:
   - `if (X == 0) throw ...` → `throw_checks: [{"on": "X == 0", "type": "..."}]`
   - `if (X < a || X > b) throw` → `edge_values: {min: a, max: b}`
   - `assert(X > 0)` → `constraints: {positive: true}`
   - `nextPow2(X)` / `power_of_two(X)` → `pattern: "power_of_2"`
   - `clamp(X, a, b)` → `edge_values: {min: a, max: b, clamped: true}`
4. Запись в `rag_dsp.test_params` с `confidence=0.5`, `human_verified=false`,
   `extracted_from = {file, line, snippet}`.
5. CLI: `dsp-asst params extract --repo <name> [--dry-run] [--method <fqn>] [--all]`.

### C1b — прогон + ручная верификация (~3 ч)

1. `dsp-asst params extract --all` на 9 репо. Ожидание: ~327 записей LEVEL 0.

2. **Ручная верификация ~20 ключевых классов** (LEVEL 2 → confidence=1.0):

| Репо | Класс | ~Методов |
|------|-------|----------|
| core | `ScopedHipEvent` | 5 |
| core | `ProfilingFacade` | 8 |
| core | `BufferSet<N>` | 6 |
| spectrum | `FFTProcessorROCm` | 7 |
| spectrum | `SpectrumMaximaFinderROCm` | 5 |
| spectrum | `FirFilterROCm` | 4 |
| spectrum | `IirFilterROCm` | 4 |
| spectrum | `MovingAverageFilterROCm` | 3 |
| spectrum | `LchFarrowROCm` | 4 |
| stats | `StatisticsProcessor` | 5 |
| signal_generators | `FormSignalGeneratorROCm` | 3 |
| heterodyne | `HeterodyneROCm` | 4 |
| heterodyne | `NCOOp`/`MixDownOp` | 4 |
| linalg | `CaponProcessor` | 5 |
| linalg | `MatrixOpsROCm` | 6 |
| radar | `RadarPipeline` | 3 |
| radar | `BeamFormer` | 3 |
| strategies | `MedianStrategy` | 2 |
| strategies | `PipelineBuilder` | 4 |

→ ~85 методов × {edge_values + throw_checks + return_checks} = ~85 LEVEL 2 записей.

3. Сравнить LEVEL 0 (auto) vs LEVEL 2 (ручная) → пометить расхождения, обновить эвристики.

## ✅ DoD

- [ ] `dsp_assistant/cli/params_extract.py` написан, `dsp-asst params extract --repo core` → ≥10 записей
- [ ] `rag_dsp.test_params` ≥ **200 записей** (LEVEL 0)
- [ ] `human_verified=true` ≥ **80 записей** (LEVEL 2 на 20 ключевых классах)
- [ ] CLI поддерживает `--dry-run`, `--method <fqn>`, `--all`
- [ ] Запись в sessions

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Design: `RAG_kfp_design_2026-05-08.md`
- Schema migration: `TASK_RAG_schema_migration_2026-05-08.md`
- **Переиспользовать**: `dsp_assistant/agent_doxytags/{extractor,analyzer,heuristics}.py`
- Spec 09 §5: `MemoryBank/specs/LLM_and_RAG/09_RAG_md_Spec.md`

*Maintained by: Кодо · 2026-05-08*
