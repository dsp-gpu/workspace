# TASK_RAG_dataset_pybind_bridge — пары Python ↔ C++ из rag_dsp.pybind_bindings

> **Статус:** ✅ **DoD 9.05 поздний вечер** (Кодо main)
> **Effort:** ~30 мин

---

## 🎯 Цель

Использовать таблицу **`rag_dsp.pybind_bindings`** (42 классов, 140 methods_exposed) для генерации пар Python ↔ C++. Это критично для DSP-GPU — модель должна знать как из Python вызвать C++ методы.

Источник ранее не использовался — ни одно из 11 предыдущих SOURCES build_dataset_v3.py не покрывало pybind11 биндинги напрямую.

---

## 📋 Реализация

### `collect_pybind_bridge_pairs.py` — 3 шаблона

| Шаблон | Триггер | Output |
|---|---|---|
| **py_class_overview** | каждый pybind binding | «Python-класс `dsp_X.Y` — биндинг C++ `cpp_fqn`. Импорт: ... Методы: ...» |
| **py_method_call** | каждый method из `methods_exposed` | «`dsp_X.Y.method()` — обёртка над C++ `cpp::Y::method()`. Пример Python кода» |
| **cpp_to_py_lookup** | обратный поиск | «Для C++ класса X есть Python биндинг `dsp_X.Y`» |

Без LLM — детерминированная шаблонизация из БД.

### Robustness fix

`cpp_brief` приходит **сырой doxygen-блок** (`/** @class X @brief ... @note ... */`) → новая функция `clean_doxy_brief()` через regex `@brief (.+?)(?=\n\s*\*?\s*@|\Z)` извлекает только текст brief'а.

---

## 📊 Результаты

### Генерация

| Метрика | Значение |
|---|---:|
| Source bindings | 42 |
| methods_exposed суммарно | 140 |
| Generated pairs | **224** |
|   • py_method_call | 140 |
|   • py_class_overview | 42 |
|   • cpp_to_py_lookup | 42 |

По py_module: dsp_spectrum 81, dsp_signal_generators 33, dsp_stats 29, dsp_radar 20, dsp_linalg 19, dsp_strategies 18, dsp_heterodyne 15, dsp_core 9.

### Финальный rebuild

| Метрика | До | После | Δ |
|---|---:|---:|---|
| Total pairs | 3565 | **3726** | +161 (+4.5%) |
| Loaded (до dedup) | 3733 | 3948 | +215 |
| Unique classes | 1456 | 1458 | +2 (новых классов мало) |
| Top-15 cap-hit | 12 | **15** (полностью!) | python биндинги подтянули |
| Dedup dropped | 211 | 220 | norm |
| Mid-clean (cap-30) | 168 | 222 | cap бьёт чаще |

**От baseline `dataset_enriched.jsonl` (1093 dirty):** 1093 → 3726 = **+241%**.

---

## ✅ DoD

- [x] `collect_pybind_bridge_pairs.py` написан + smoke 3/3 ✅
- [x] 3 шаблона работают, brief очищен от doxygen-мусора
- [x] 224 пары сгенерировано (overview 42 + method_call 140 + cpp_to_py 42)
- [x] Интегрировано в `build_dataset_v3.py` SOURCES
- [x] `dataset_v3.jsonl` пересобран → **3726 пар**
- [x] Все 8 py_modules имеют покрытие
- [x] Top-15 теперь полностью cap=30 — модель будет уверенно знать main API + Python биндинги

---

## Артефакты

| Файл | Что |
|---|---|
| `C:/finetune-env/collect_pybind_bridge_pairs.py` | NEW · ~250 строк |
| `C:/finetune-env/dataset_pybind_bridge.jsonl` | NEW · 224 пары |
| `C:/finetune-env/dataset_pybind_bridge_report.txt` | NEW · отчёт |
| `C:/finetune-env/build_dataset_v3.py` | M · +1 SOURCE |
| `C:/finetune-env/dataset_v3.jsonl` | M · 3565 → 3726 пар |

---

## Связано

- Источник: `rag_dsp.pybind_bindings` (заполнен ранее — RAG_PYBIND трек)
- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Phase B: `TASK_FINETUNE_phase_B_2026-05-12.md`
- Предыдущая dataset-задача: `TASK_RAG_dataset_test_params_pairs_2026-05-09.md`

---

## Что НЕ использовано (резерв на будущее)

| Таблица | Кол-во | Почему отложено |
|---|---:|---|
| `enum_values` | **0 rows** | Таблица пустая — заполнить отдельным треком |
| `ai_summary` в symbols | **0 rows** | Не было прогона AI-summarizer'а |
| `linked_use_cases` в test_params | 43 | Уже частично через usage_docs |
| `linked_pipelines` | 0 | Пусто |
| `includes` / `deps` | n/a | Можно сделать «какие зависимости у класса X» — следующий ход |

---

*Created+Closed: 2026-05-09 поздний вечер · Кодо main*
