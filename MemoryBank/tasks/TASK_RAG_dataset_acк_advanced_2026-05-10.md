# TASK_RAG_dataset_acк_advanced — A+C+K: cpp impl + pybind module + hierarchies

> **Создан:** 2026-05-10 · **Закрыт:** 2026-05-10 (Кодо main) · **Статус:** ✅ DoD
> **Effort:** ~30 мин · **Источник:** обсуждение с сестрой (`MemoryBank/prompts/discuss_dataset_next_2026-05-10.md`)

## 🎯 Цель

Финальный заход по **новой семантике** (без augmentation):

| Шаблон | Что |
|--------|-----|
| **A** `cpp_implementation_head` | Первые ~80 строк `.cpp` файла для топ-50 классов с doxy + ≥3 methods |
| **C** `pybind_module_full` | Целостный `PYBIND11_MODULE(...)` блок из 8 `<repo>/python/dsp_*_module.cpp` |
| **K** `type_hierarchy` | `class X : public Y` пары через regex по headers (parent_id в БД пуст) |

**Решение:** взять A+C+K, отказаться от E (augmentation round 4 — diminishing returns после 3 раундов python_aug + usage_aug + negative_lookup = 490 alt-пар).

## ✅ DoD

- [x] `collect_acк_advanced.py` написан (~250 строк, 3 функции)
- [x] **57 пар**: K=24 + C=8 + A=25
- [x] Output `dataset_acк_advanced.jsonl` валиден
- [x] Добавлено в `build_dataset_v3.py` SOURCES (label=`acк_advanced`)
- [x] `dataset_v3.jsonl` пересобран — `acк_advanced: 57` в split, total **5295 → 5343** (+48 после mid-clean cap-15)
- [x] **35 источников** в финальном датасете

## 📊 По шаблонам

| Шаблон | Пар | Прим. |
|--------|-----|-------|
| K type_hierarchy | 24 | regex `class X : public Y` по 8 репо |
| C pybind_module_full | 8 | по одному на репо |
| A cpp_implementation_head | 25 | топ-50 классов из БД, найдено .cpp для 25 (часть классов inline-only) |

## ⚠️ Известное ограничение

A — 25 из 50 потому что часть классов inline (header-only без .cpp) либо имена не маппятся по правилу CamelCase→snake_case. Можно добить ещё ~15 через явный поиск через `files` таблицу, но **diminishing returns** — пропустили.

## Артефакты

| Файл | Что |
|------|-----|
| `C:/finetune-env/collect_acк_advanced.py` | NEW · 3 функции (K + C + A) |
| `C:/finetune-env/dataset_acк_advanced.jsonl` | NEW · 57 пар |

*Maintained by: Кодо main · 2026-05-10*
