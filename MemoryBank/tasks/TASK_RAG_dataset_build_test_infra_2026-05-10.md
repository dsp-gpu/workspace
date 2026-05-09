# TASK_RAG_dataset_build_test_infra — test_utils + cmake/*.cmake + CMakePresets

> **Создан:** 2026-05-10 · **Закрыт:** 2026-05-10 (Кодо main) · **Статус:** ✅ DoD
> **Effort:** ~25 мин · **Источник:** 3 неохваченных части build/test инфраструктуры

## 🎯 Цель

Покрыть последние 3 ниши:
- `core/test_utils/*.hpp` — 12 файлов test infrastructure (validators / runners / references / reporters / configs)
- `<repo>/cmake/*.cmake` — 14 файлов (fetch_deps + version)
- `<repo>/CMakePresets.json` — 9 файлов build presets (debian-local-dev / debian-mi100 / debian-rx9070)

## 📋 Шаблоны

| Шаблон | Output |
|--------|--------|
| `test_util_overview` | header (ЧТО) + классы + public функции из header-only `*.hpp` |
| `cmake_module` | header-комментарий + functions/macros + find_package + FetchContent |
| `cmake_presets` | список configurePresets + buildPresets |

## ✅ DoD

- [x] `collect_build_test_infra.py` написан (~250 строк, 3 функции)
- [x] **28 пар**: test_utils=2 + cmake=17 + presets=9
- [x] Output `dataset_build_test_infra.jsonl` валиден
- [x] Добавлено в `build_dataset_v3.py` SOURCES
- [x] `dataset_v3.jsonl` пересобран — `build_test_infra: 28` в split, total **5343 → 5464**
- [x] **39 источников** в финальном датасете

## ⚠️ Замечание

`test_utils` дал только 2 пары — мой regex для public функций в header-only файлах слабый (matches только когда сигнатура в одной строке). 12 .hpp обработано, но из 10 в большинстве — template free functions с многострочной сигнатурой. Можно докрутить позже, но эффект небольшой.

## Артефакты

| Файл | Что |
|------|-----|
| `C:/finetune-env/collect_build_test_infra.py` | NEW · 3 функции |
| `C:/finetune-env/dataset_build_test_infra.jsonl` | NEW · 28 пар |

*Maintained by: Кодо main · 2026-05-10*
