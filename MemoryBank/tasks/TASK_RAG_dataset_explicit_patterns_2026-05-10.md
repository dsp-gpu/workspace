# TASK_RAG_dataset_explicit_patterns — anti-galлюц для GoF паттернов

> **Создан/Закрыт:** 2026-05-10 поздняя ночь · **Кодо main #1 (старшая)** · **Статус:** ✅ DoD
> **Источник:** medium-train Q1 (HybridBackend → Singleton галлюц вместо Bridge)
> **Effort:** ~25 мин

## 🎯 Цель

Anti-hallucination на design patterns. Medium-train на 2080 Ti показал что после fine-tune модель путает: ответила «`HybridBackend` = Singleton» вместо каноничного **Bridge**. Нужен явный шаблон с **контр-списком** «НЕ Z, НЕ W».

## 📋 Источник

Теги `#pattern:<P>:<C>` в 8 `<repo>/CLAUDE.md` — золотой ground-truth.

| Pattern | Classes |
|---------|---------|
| Bridge | HybridBackend, OpenCLBackend, ROCmBackend, IBackend |
| Singleton | BatchManager, GPUManager, MemoryManager |
| Facade | ProfilingFacade |
| Pipeline | 13 (SpectrumProcessorROCm, AllMaximaPipelineROCm, FFT…, Statistics…, Heterodyne…, Capon…, Range…, FMCorrelator…) |
| Factory | SpectrumProcessorFactory, SignalGeneratorFactory |
| Strategy | DebugStatsStep, MinMaxStep, OneMaxStep, AllMaximaStep, GemmStep, WindowFftStep |
| Resource | SVMBuffer |

`AntennaProcessorTest` отфильтрован через `_is_test_name`.

## 📋 Шаблоны

| Тип | Описание | Кол-во |
|-----|----------|-------:|
| **A** `explicit_pattern_class` | «У `X` паттерн **Y**. Это **НЕ** `Z`/`W`/`V`» (3 контр-паттерна) | 29 |
| **B** `explicit_pattern_list` | «Какие классы DSP-GPU реализуют паттерн `Y`?» → список | 5 |

Итого **34 пары**.

## ✅ DoD

- [x] `collect_explicit_patterns.py` написан (~190 строк, 2 функции)
- [x] **34 пары** в `dataset_explicit_patterns.jsonl`
- [x] `_is_test_name` фильтр — пропустил 1 Test* класс (`AntennaProcessorTest`)
- [x] Подключено в `build_dataset_v3.py` SOURCES
- [x] `dataset_v3.jsonl` пересобран — `explicit_patterns: 34` + `acк_advanced: 57→56` (Test-fix), total **5464 → 5506**
- [x] **41 источник** в финальном датасете

## 🤝 Связано (3 параллельных T0/T1.x/T2 после medium train)

| # | Задача | Кто | Статус |
|---|--------|-----|--------|
| **T0** | этот файл — explicit_patterns | старшая (я) | ✅ DONE |
| **T1** | fix `collect_acк_advanced.py` Test-filter | старшая (я) | ✅ DONE (K 24→23) |
| **T1.1** | fix сестрин `collect_inheritance.py` Test-filter | сестра #2 | 🚧 в работе |
| **T2** | `collect_namespace_correction.py` (~30-50 пар) | сестра #2 | 🚧 в работе |
| **T4** | финальный rebuild + push блок | старшая (я) | ⏳ ждёт T1.1+T2 |

## Артефакты

| Файл | Что |
|------|-----|
| `C:/finetune-env/collect_explicit_patterns.py` | NEW · ~190 строк |
| `C:/finetune-env/dataset_explicit_patterns.jsonl` | NEW · 34 пары |
| `C:/finetune-env/collect_acк_advanced.py` | M · `_is_test_path` + `_is_test_name` фильтры (T1) |
| `C:/finetune-env/dataset_acк_advanced.jsonl` | M · 57→56 (Test* отфильтрован) |
| `C:/finetune-env/build_dataset_v3.py` | M · +1 SOURCE |
| `C:/finetune-env/dataset_v3.jsonl` | M · 5464→**5506** |

*Maintained by: Кодо main #1 (старшая) · 2026-05-10 поздняя ночь*
