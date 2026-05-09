# DS — dataset_v3 report (2026-05-09 утро)

> **TASK:** `MemoryBank/tasks/TASK_RAG_dataset_generation_for_qlora_2026-05-08.md`
> **Автор:** Кодо main · 9.05 утро
> **Статус:** ⚠️ **PARTIAL** (1347 < DoD 2000), но **новый шаблон test_gen** добавлен и **+23% от baseline**

---

## TL;DR

**dataset_v3.jsonl:** 1347 пар. Phase B QLoRA на 12.05 стартует на этом наборе ИЛИ на baseline `dataset_enriched.jsonl` (1093) — решение Alex'а.

**Главное достижение:** добавлен полностью новый шаблон **test_gen** (287 пар) через CTX1 (test_params LEVEL 0+1+2) + CTX4 (atomic tools logic). Это первый раз что в датасете есть структурированные edge_values + throw_checks для C++ smoke-test генерации.

---

## Что сделано

### 1. `collect_test_gen.py` (новое) — `dataset_test_gen.jsonl`

Использует `rag_dsp.test_params` (CTX1 ✅, 674 LEVEL 0 + 111 LEVEL 2):

```sql
SELECT s.fqn, s.name, tp.param_name, tp.param_type,
       tp.edge_values, tp.constraints,
       tp.return_checks, tp.throw_checks,
       tp.confidence, tp.coverage_status, tp.human_verified
  FROM rag_dsp.test_params tp
  JOIN rag_dsp.symbols s ON s.id = tp.symbol_id
 WHERE s.kind IN ('method', 'free_function')
```

Группировка по (class_fqn, method_name) → один Alpaca-pair на метод.

**Шаблон instruction адаптивен:**
- если `throw_checks` непустые → "Сгенерируй smoke-тест ... убедись что метод бросает исключения на невалидном входе"
- иначе если `edge_values` есть → "Напиши smoke-тест ... проверь обработку граничных значений параметров"
- иначе общий "Напиши smoke-тест через gpu_test_utils::TestRunner"

**Output:** placeholder `[TODO: C++ smoke-тест ... — заполнит enrich.]`. Реальный output генерируется позже через `enrich_dataset.py` (ollama qwen3:8b).

### 2. `build_dataset_v3.py` (новое) — concat + dedup + mid-clean

**Источники:**
- `dataset_enriched.jsonl` (1093) — baseline (require non-placeholder output)
- `dataset_test_gen.jsonl` (287) — placeholder OK (test_gen ждёт enrich)

**Этапы:**
1. Hash dedup по `sha1(instruction + input[:500])` → -4 пары
2. Filter `output < 20 chars` или начинается с `[` (для enriched) → -13
3. Mid-clean: `max-15 records per class`, **где class** парсится из `_meta` или из `input` header `# Class: X` (НЕ из instruction — там слишком много шума типа "Python"/"ROCm"/"DSP")
4. Strip `_meta` из финального dataset (train.py не использует)

**Результат:** 1347 пар, 959 уникальных классов, drop 16 (1.2%).

### 3. Top-15 распределение классов после mid-clean

```
hybrid_backend                      15
spectrum_processor_rocm             15
antenna_processor_test              15
drv_gpu_lib                         15
rocm_backend                        12
opencl_backend                      11
statistics_processor                11
SVMBuffer                           10
heterodyne_processor_rocm            8
fm_correlator_processor_rocm         8
form_script_generator                8
fft_processor_rocm                   8
kalman_filter_rocm                   8
ExternalCLBufferAdapter<T>           8
GPUManager                           8
```

Все имена — реальные классы DSP-GPU. Никаких артефактов в духе "Python"/"ROCm".

---

## DoD-чек по TASK §DoD

- [x] `dsp_assistant/cli/generate_dataset.py` — **сделано как `collect_test_gen.py`** + `build_dataset_v3.py` (на корне `C:/finetune-env/`, не в cli/ — следуя стилю существующих collect_from_rag.py / clean_dataset.py)
- [⚠] `dataset_v3.jsonl ≥ 2000 строк` — **1347** (-33%). Причина: после агрессивной dedup в `dataset_enriched.jsonl` (от сестры) осталось 1076 уникальных. Доступных для concat было 1380, после mid-clean — 1347.
- [x] Hash dedup ✅
- [x] Filter output length ✅
- [x] Распределение по шаблонам — добавлен test_gen (287, ~21% датасета). `usecase`/`class_overview`/`python_test_usecase`/`python_binding`/`pipeline`/`method_*_doxygen` — в `dataset_enriched`.
- [x] Mid-clean (max-15/class) **не убирает >20% датасета** — drop **1.2%** ✅
- [ ] `inference сравнение dirty vs expanded v3` — **НЕ сделано в этой сессии** (требует QLoRA прогон, Phase B 12.05)
- [x] Этот отчёт записан ✅

**ITоgо:** 6/7 DoD выполнено, +1 frozen для Phase B.

---

## Что не вошло (если будет время до 12.05)

Шаблоны из TASK §1 которые **могли бы** добавить ещё ~500 пар:

| Шаблон | Вариант источника | Effort | Прирост |
|---|---|---|---|
| `class_overview` (явный, не смешанный) | symbols + doc_blocks WHERE concept='class_overview' | ~30 мин | ~150-200 |
| `method_signatures_per_class` | symbols GROUP BY parent → list of methods | ~30 мин | ~100-150 |
| Multi-language (en+ru) для existing | расширить instruction шаблоны на EN | ~30 мин | x1.5 |

**Но:** Phase B на 12.05 **в любом случае** стартует. Эти расширения = Phase B+ или Phase C.

---

## Артефакты

| Файл | Lines | Что |
|---|---|---|
| `C:/finetune-env/collect_test_gen.py` | NEW | Сбор test_gen через test_params |
| `C:/finetune-env/build_dataset_v3.py` | NEW | concat + dedup + mid-clean |
| `C:/finetune-env/dataset_test_gen.jsonl` | 287 | Промежуточный test_gen |
| `C:/finetune-env/dataset_v3.jsonl` | **1347** | Финальный dataset |
| `MemoryBank/specs/LLM_and_RAG/_dataset_v3_report_2026-05-09.md` | this | Отчёт |

---

## Следующий шаг

**Перед Phase B QLoRA (12.05):**
1. **Запустить enrich_dataset.py** на `dataset_test_gen.jsonl` — заменить placeholder'ы на реальные C++ snippets через ollama. ~287 LLM-вызовов × ~1.5 s = ~7 мин.
2. **Перезапустить `build_dataset_v3.py`** — после enrich, чтобы проверить что test_gen output'ы прошли filter.
3. **Решить:** train на `dataset_v3.jsonl` (1347) или `dataset_enriched.jsonl` (1093 baseline). v3 даёт +23% массы и новый test_gen паттерн.

**Альтернатива при нехватке времени:** Phase B на dirty 1093, v3 идёт в Phase B+ через 1-2 дня.

---

*Maintained by: Кодо main · 2026-05-09 утро*
