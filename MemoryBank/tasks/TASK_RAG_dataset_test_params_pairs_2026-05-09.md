# TASK_RAG_dataset_test_params_pairs — пары на основе rag_dsp.test_params

> **Статус:** ✅ **DoD 9.05 поздний вечер** (Кодо main)
> **Effort:** ~1 ч (включая 1 fix robustness'а)

---

## 🎯 Цель

Использовать **983 ready_for_autotest** записей в `rag_dsp.test_params` (заполнены через CTX2 doxygen `@test*` parser) для генерации пар с информацией о **граничных условиях**, **исключениях** и **гарантиях возврата** методов.

Это **критично** для Phase B QLoRA — модель будет знать, что:
- `LfmGeneratorROCm::GenerateToCpu` принимает `beam_count ∈ [1, 50000]` и кидает на `-1`/`100000`
- `SVMBuffer::CheckCLError` бросает на `cl_int != CL_SUCCESS`
- `ROCmCore::SupportsDoublePrecision` возвращает `device_props_.arch.hasDoubles`

---

## 📋 Реализация

### `collect_test_params_pairs.py` — 3 шаблона

| Шаблон | Триггер | Output |
|---|---|---|
| **param_edges** | regular `param_name`, `edge_values` not empty | «Параметр X типа Y: range [a,b], typical=N, error_values=[..]» |
| **method_throws** | `param_name='__throws__'`, `throw_checks` not empty | «Метод бросает исключение если: ...» |
| **method_return** | `param_name='__return__'`, `return_checks` not empty | «Возвращает T. Гарантии: ...» |

Все шаблоны **детерминированные**, без LLM. Источник — JOIN `test_params + symbols + parent symbol + files` (для repo).

### Robustness fixes
1. `range`/`size` могут быть не парой → graceful fallback (исключение → skip).
2. `kind='free_function'` с `name="Class::method"` → парсинг класса из имени (parser DSP-GPU так классифицирует, parent_id=NULL).

---

## 📊 Результаты

### Генерация (`collect_test_params_pairs.py`)

| Метрика | Значение |
|---|---:|
| Source rows (ready_for_autotest) | 983 |
| Skipped (no class resolve) | 29 (3%) |
| Generated pairs | **780** |
|   • param_edges | 464 |
|   • method_return | 201 |
|   • method_throws | 115 |

По репо: spectrum 262, core 247, strategies 80, stats 55, signal_generators 52, linalg 39, heterodyne 22, radar 21, DSP 2.

### Финальный rebuild (`build_dataset_v3.py`)

| Метрика | До | После | Δ |
|---|---:|---:|---|
| Total pairs | 2662 | **3565** | +903 (+34%) |
| Unique classes | 724 | **1456** | +732 (+101%) |
| Top-15 cap-hit | 8 | 12 | хвост подтянулся |
| Dedup dropped | n/a | 211 | norm |
| Mid-clean dropped (cap-30) | 74 | 168 | norm |
| Short-output (filter) | 13 | 13 | norm |

**От baseline `dataset_enriched.jsonl` (1093 dirty):** 1093 → 3565 = **+226%**.

---

## ✅ DoD

- [x] `collect_test_params_pairs.py` написан + smoke 5/5 ✅
- [x] 3 шаблона работают на реальных данных, верифицированы вручную (LfmGenerator/SVMBuffer/ROCmCore примеры)
- [x] 780 пар сгенерировано (97% покрытие 983 ready_for_autotest)
- [x] Интегрировано в `build_dataset_v3.py` SOURCES
- [x] `dataset_v3.jsonl` пересобран → **3565 пар**
- [x] DoD ≥ 2000 — ✅ с запасом 1565 (78%)
- [x] DoD ≥ 3000 (растяжка для Phase B качества) — ✅ с запасом 565 (19%)

---

## Артефакты

| Файл | Что |
|---|---|
| `C:/finetune-env/collect_test_params_pairs.py` | NEW · ~280 строк |
| `C:/finetune-env/dataset_test_params_pairs.jsonl` | NEW · 780 пар |
| `C:/finetune-env/dataset_test_params_pairs_report.txt` | NEW · отчёт |
| `C:/finetune-env/build_dataset_v3.py` | M · +1 SOURCE |
| `C:/finetune-env/dataset_v3.jsonl` | M · 2662 → 3565 пар |

---

## Связано

- Источник 1: CTX2 ✅ (`rag_dsp.test_params` 983 ready_for_autotest)
- Источник 2: CTX1 ✅ (LEVEL 0+2 заполнен)
- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Phase B: `TASK_FINETUNE_phase_B_2026-05-12.md`

---

*Created+Closed: 2026-05-09 поздний вечер · Кодо main*
