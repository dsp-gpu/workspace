# TASK_RAG_dataset_doc_rich — пары из rich doc_blocks (rag_dsp.doc_blocks)

> **Статус:** ✅ **DoD 9.05 ночь** (Кодо main)
> **Effort:** ~30 мин

---

## 🎯 Цель

Использовать **`rag_dsp.doc_blocks`** (2650 блоков) — раньше из неё в датасет шло только ~340 пар через `usage_docs` + `class_overview` + `pipeline_data_flow`. Остальные **~2310 блоков не использовались** для fine-tune.

В концептах есть много содержательного: `python_test_usecase`, `python_binding`, `example`, `usage`, `parameters`, `benchmark`, `cross_repo_pipeline`, `c1_system_context`, специфичные для модулей (`filters_full`, `lch_farrow_full`, `capon_full` и т.д.).

---

## 📋 Реализация

### `collect_doc_rich_pairs.py`

Шаблон один: instruction = «{спец-фраза по концепту} `{class_or_module}` (репо {repo})», output = `content_md` (с очисткой YAML frontmatter и обрезкой по последнему `\n\n` если > 3500 chars).

Подбор instruction под concept:
- `python_test_usecase`/`python_binding` → «Как использовать pybind11-биндинги X из Python»
- `benchmark` → «Что показывают бенчмарки для X»
- `example`/`usage` → «Покажи пример использования X»
- `filters`/`fm_correlator`/`lch_farrow`/`capon_beamforming` → спец-фразы под алгоритм
- fallback — «Опиши {concept} для X»

### Фильтры (важно для качества)

**SKIP_CONCEPTS** (уже в датасете другими шаблонами):
- `usecase`, `class_overview`, `pipeline_data_flow`, `overview`
- `section`, `tests` (слишком общие "## Header" блоки)
- `method_*_doxygen`, `method_*_signature` (через method_doxygen / method_signatures)
- `s_\d+`, `c` (мусорные индексы)

**SKIP_MODULE_NAMES** (doc-секции, не классы):
- `gpu`, `api`, `quick`, `dsp`, `drv_gpu`, `full_reference`, `classes`, `meta`, `architecture`, `checkpoint_c1_c4_reports`, `code_examples`, `fft`, `fft_func_full`, `fft_func_api`

Иначе модель учится мусорным ассоциациям типа `architecture` ↔ длинные таблицы.

### Cleanup
- YAML frontmatter `---\n...\n---` срезается
- Длина > 3500 chars → обрезка по последнему `\n\n` + " ... (обрезано)"
- Только заголовки (`# Header`) короче 50 chars → skip

---

## 📊 Результаты

### Генерация

| Метрика | Значение |
|---|---:|
| Source doc_blocks (≥100 chars) | 2287 |
| Skipped — concept blacklist | 1109 |
| Skipped — module blacklist | 620 |
| Skipped — content < 200 | 39 |
| Generated pairs | **519** |

Top concepts: `python_test_usecase` 47, `python_binding` 35, `example` 13, `usage` 11, `meta_overview` 9, `parameters` 8, `benchmark` 7, `python` 7, `cross_repo_pipeline` 5, `c1_system_context`/`c2_container` 2 каждый.

По репо: spectrum 140, radar 131, strategies 68, dsp 66, linalg 54, core 29, dsp_gpu 12, signal_generators 9, heterodyne 5, stats 5.

### Финальный rebuild

| Метрика | До | После | Δ |
|---|---:|---:|---|
| Total pairs | 3726 | **4253** | +527 (+14%) |
| Loaded (до dedup) | 3948 | 4493 | +545 |
| Unique classes | 1458 | 1478 | +20 |
| Mid-clean dropped | 222 | 240 | norm |
| Dedup dropped | 220 | 220 | 0 (ничего из 519 не дублировало!) |

**От baseline `dataset_enriched.jsonl` (1093 dirty):** 1093 → 4253 = **+289%**.

---

## ✅ DoD

- [x] `collect_doc_rich_pairs.py` написан + smoke 2/2 ✅
- [x] 2 уровня blacklist (concepts + module names) — фильтрует 1729 doc-секций
- [x] 519 пар сгенерировано (23% от 2287 rich blocks — высокая планка качества)
- [x] Интегрировано в `build_dataset_v3.py` SOURCES (13-й источник)
- [x] `dataset_v3.jsonl` пересобран → **4253 пар**
- [x] Полный dedup-pass: 0 дублей с уже существующими источниками
- [x] От baseline 1093 = **+289% запас** для Phase B 12.05

---

## Артефакты

| Файл | Что |
|---|---|
| `C:/finetune-env/collect_doc_rich_pairs.py` | NEW · ~210 строк |
| `C:/finetune-env/dataset_doc_rich.jsonl` | NEW · 519 пар |
| `C:/finetune-env/dataset_doc_rich_report.txt` | NEW · отчёт |
| `C:/finetune-env/build_dataset_v3.py` | M · +1 SOURCE |
| `C:/finetune-env/dataset_v3.jsonl` | M · 3726 → 4253 пар |

---

## Связано

- Источник: `rag_dsp.doc_blocks` (2650 rows, заполнены ранее)
- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Phase B: `TASK_FINETUNE_phase_B_2026-05-12.md`
- Предыдущие dataset-задачи: DS_TP_PAIRS, DS_PYBIND, DS_BALANCE

---

## Что НЕ использовано (резерв)

- `enum_values` — 0 rows (таблица пустая)
- `ai_summary` в symbols — 0 rows (нет AI-summarizer'а)
- `deps` — 0 rows (не заполнена)
- `includes` — 309 проектных, но `resolved_file_id=0` (без резолва не привязать к классу)
- 1729 пропущенных doc_blocks (concept-blacklist + module-blacklist) — мусор для fine-tune

---

*Created+Closed: 2026-05-09 ночь · Кодо main*
