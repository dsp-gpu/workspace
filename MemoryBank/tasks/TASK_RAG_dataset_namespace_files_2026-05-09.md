# TASK_RAG_dataset_namespace + file_grouping — финальные шаблоны

> **Статус:** ✅ **DoD 9.05 поздняя ночь** (Кодо main)
> **Effort:** ~30 мин (2 шаблона разом)

---

## 🎯 Цель

После DS_DOC_RICH (4253 пар) — добрать ещё 2 источника из БД, ранее не использованных:

1. **`namespace symbols`** (601 в БД, 71 после blacklist tests) — учит модель **правильным namespace prefixes** (критично: `dsp::spectrum::FFTProcessor` vs голое `FFTProcessor`).
2. **`files + symbols` JOIN** для index — учит модель **структуре .hpp файлов** (важно для include resolver в её "голове").

---

## 📋 Реализация

### `collect_namespace_overview.py`

Шаблон один на каждый уникальный (DISTINCT FQN) namespace со skip blacklist:
- prefixes: `test_`, `Test`, `anonymous`, `_`, `detail::detail`
- exact: `std`, `boost`, `rocprim`, `thrust`, `rocblas`, `hipfft`, `rocsolver`, `test`, `tests`, `detail`

Для каждого namespace → output с группировкой по kind (Классы / Структуры / Enums / Функции) с doxy briefs (cleaned).

**Результат:** 22 пары (49 пропущенных пустых — это leaf-namespace где `s.namespace = ns.fqn` не нашёл детей; парент дерева не наследует контент дочерних — это правильная логика).

Покрыты главные: `drv_gpu_lib` (40 symbols), `gpu_test_utils` (33), `signal_gen` (33), `strategies` (31), `vector_algebra` (25), `fm_correlator` (23), `statistics` (20), `antenna_fft` (16), `fft_processor` (15), `filters` (15).

### `collect_file_grouping.py`

Шаблон: для каждого `.hpp/.h` файла → пара «какие классы/функции определены в `X.hpp`». Skip:
- `/third_party/` (json.hpp, pocketfft, plog)
- `/tests/`, `/test/` (не основной API)
- `/Doc/addition/` (legacy junk)
- `< 2 symbols` (мало контента)
- `> 50 symbols` (auto-gen / третьи стороны)

**Robustness:** path normalization `\\ → /` чтобы фильтр работал на Windows-путях.

**Результат:** 125 пар из 262 проектных hpp (137 skipped по size threshold).

---

## 📊 Финальный rebuild

| Метрика | До | После | Δ |
|---|---:|---:|---|
| Total pairs | 4253 | **4398** | +145 (+3.4%) |
| По источникам: namespace | 0 | 22 | +22 |
| По источникам: file_grouping | 0 | 125 | +125 |
| Unique classes | 1478 | **1570** | +92 (+6%) |

**От baseline 1093:** **+302%** (4x baseline).

---

## ✅ DoD

- [x] Оба скрипта написаны + smoke OK
- [x] 22 + 125 = 147 чистых пар сгенерировано
- [x] Оба интегрированы в `build_dataset_v3.py` SOURCES (14 + 15)
- [x] `dataset_v3.jsonl` пересобран → **4398 пар**
- [x] Diminishing returns зафиксированы — **больше шаблоны не нужны** для Phase B 12.05

---

## ⚠️ Решение: остановка наращивания dataset

После 7 dataset-задач за вечер 9.05:

```
1093  baseline (Phase A)
2020  + DS (5 templates)            +927
2213  + CTX2 LEVEL 1                +193
2662  + DS_BALANCE (sister)         +449
2876  + usage_docs (sister)         +214
3565  + DS_TP_PAIRS    (моё)        +689
3726  + DS_PYBIND      (моё)        +161
4253  + DS_DOC_RICH    (моё)        +527
4275  + DS_NAMESPACE   (моё)        +22
4398  + DS_FILE_GROUP  (моё)        +123  ← FINAL
```

Прирост последних 3 шаблонов = +672 пар (15% от финала). Каждая следующая задача даёт меньше пар — **diminishing returns**. Дальнейшие шаблоны (negative pairs, fields, deps cross-ref) рискуют **разбавить сигнал** — модель учит мусор, а не паттерны.

**Phase B 12.05 будет тренироваться на dataset_v3 = 4398 пар.**

---

## Артефакты

| Файл | Что |
|---|---|
| `C:/finetune-env/collect_namespace_overview.py` | NEW · ~180 строк |
| `C:/finetune-env/collect_file_grouping.py` | NEW · ~180 строк |
| `C:/finetune-env/dataset_namespace_overview.jsonl` | NEW · 22 пары |
| `C:/finetune-env/dataset_file_grouping.jsonl` | NEW · 125 пар |
| `C:/finetune-env/build_dataset_v3.py` | M · +2 SOURCES (15 total) |
| `C:/finetune-env/dataset_v3.jsonl` | M · 4253 → 4398 пар |

---

## Что осталось НЕ использовано (резерв для Phase C)

| Таблица/поле | Почему отложено |
|---|---|
| `enum_values` | 0 rows (таблица пустая) |
| `symbols.ai_summary` | 0 rows (нет AI-summarizer'а) |
| `deps` | 0 rows (не заполнена) |
| `includes.resolved_file_id` | 0 везде (не разрешены) |
| `public_field` (719) | частично через class_overview |
| Negative/contrastive pairs | risk diluting signal — нужен thoughtful design |
| Method-by-return-type index | exotic, нужна валидация полезности |

---

*Created+Closed: 2026-05-09 поздняя ночь · Кодо main · ФИНАЛ dataset наращивания*
