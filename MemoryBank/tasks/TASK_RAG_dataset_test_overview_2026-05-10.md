# TASK_RAG_dataset_test_overview — пары из C++ test_*.hpp

> **Создан:** 2026-05-10 · **Закрыт:** 2026-05-10 (Кодо main) · **Статус:** ✅ DoD
> **Тип:** новый источник в dataset_v3 (header `// ЧТО / ЗАЧЕМ / ПОЧЕМУ` + doxygen `@brief`)
> **Приоритет:** 🟠 P1 · **Effort:** ~30 мин · **Зависимости:** нет

## 🎯 Цель

Тесты в DSP-GPU (header-only `.hpp`, по правилу `15-cpp-testing.md`) имеют стандартизированный header-блок:

```
// ============================================================================
// test_capon_benchmark_rocm — runner бенчмарков CaponProcessor (ROCm)
// ЧТО:    ComputeRelief() и AdaptiveBeamform() → Results/Profiler/...
// ЗАЧЕМ:  Capon — самая тяжёлая операция linalg. Бенчмарк детектирует регрессии
// ПОЧЕМУ: Нет AMD GPU → [SKIP]. ProfilingFacade для вывода.
// ============================================================================
```

Это **готовая инструкция-описание**, лучше doxygen для понимания edge-cases.

## 📋 Шаблоны

| Шаблон | Output |
|--------|--------|
| `test_overview` | header (ЧТО/ЗАЧЕМ/ПОЧЕМУ) + namespace + run-функции + Test-классы |
| `test_target_method` | если в header упомянут `Class::method()` — отдельная пара «где находится тест для X» |

## ✅ DoD

- [x] `collect_test_overview.py` написан (~210 строк)
- [x] Парсинг 75 файлов (8 репо): 0 fail
- [x] **77 пар сгенерировано** (по 1-2 на файл)
- [x] Output `dataset_test_overview.jsonl` валиден
- [x] Добавлено в `build_dataset_v3.py` SOURCES
- [x] `dataset_v3.jsonl` пересобран — `test_overview: 77` в по-источникам, total **4683 → 4756**

## 📊 Распределение

| Репо | Test-файлов | Пар |
|------|-------------|-----|
| core | 22 | 23 |
| spectrum | 18 | 18 |
| linalg | 9 | 9 |
| radar | 8 | 9 |
| stats | 6 | 6 |
| strategies | 5 | 5 |
| heterodyne | 4 | 4 |
| signal_generators | 3 | 3 |

## Артефакты

| Файл | Что |
|------|-----|
| `C:/finetune-env/collect_test_overview.py` | NEW · парсер 75 hpp |
| `C:/finetune-env/dataset_test_overview.jsonl` | NEW · 77 пар |
| `C:/finetune-env/build_dataset_v3.py` | M · +1 SOURCE |

*Maintained by: Кодо main · 2026-05-10*
