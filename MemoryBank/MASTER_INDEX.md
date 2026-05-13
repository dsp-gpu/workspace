# 🗂️ DSP-GPU — MemoryBank MASTER INDEX

> **Workspace**: `E:\DSP-GPU\`
> **Organization**: `github.com/dsp-gpu`
> **Исходный проект**: `E:\C++\GPUWorkLib\` (монолит, не трогаем!)
> **Последнее обновление**: 2026-05-12 ночь (namespace migration 7/7 + Debian deploy scripts — см. `sessions/2026-05-12.md`)

---

## 🚦 Статус: Миграция GPUWorkLib → dsp-gpu

| Фаза | Описание | Статус |
|------|----------|--------|
| [Фаза 0](tasks/TASK_ModArch_Phase0_Audit.md) | Аудит зависимостей | ✅ DONE |
| [Фаза 1](tasks/TASK_ModArch_Phase1_Skeleton.md) | CMake-скелеты 9 репо | ✅ DONE + pushed |
| [Фаза 2](tasks/TASK_ModArch_Phase2_Copy.md) | Копирование кода | ✅ DONE |
| [Фаза 3](tasks/TASK_ModArch_Phase3_CMake.md) | CMake-адаптация | ✅ DONE |
| [Фаза 3b](tasks/TASK_ModArch_Phase3b_Python.md) | Python bindings | ✅ DONE |
| **Фаза 3c** | **AMD-стандарт миграция + ScopedHipEvent RAII** | ✅ **DONE 2026-04-15** |
| **Фаза 3d** | **Namespace migration legacy → `dsp::<repo>::*`** | ✅ **DONE 2026-05-12** (7/7 модулей в origin/main, ждёт Debian acceptance) |
| [Фаза 4](tasks/TASK_ModArch_Phase4_Test.md) | Тестирование на Linux GPU | 🟡 **IN_PROGRESS** — Фаза 4.1 acceptance 13.05 |
| **Фаза 4.1** | **Debian Acceptance namespace migration** | ⬜ **ГОТОВО К ЗАПУСКУ 13.05** — `tasks/TASK_morning_handoff_2026-05-13.md` |

---

## 🎯 Что завтра на Linux GPU (Radeon 9070 + ROCm 7.2)

**Точка входа**: → [`tasks/TASK_morning_handoff_2026-05-13.md`](tasks/TASK_morning_handoff_2026-05-13.md)

```bash
# 3 шага, скрипты автоматизации в scripts/debian_deploy/:
cd /home/alex/DSP-GPU

# Шаг 1 — ROCm devkit install (5-10 мин)
bash scripts/debian_deploy/install_rocm_devkit.sh

# Шаг 2 — Acceptance 7 мигрированных модулей (1-2 ч)
bash scripts/debian_deploy/acceptance_namespace_migration.sh

# Шаг 3 (опц.) — embed_server для Continue (1 ч)
# Подробности в scripts/debian_deploy/README.md
```

**Подготовлено вечером 12.05**:
- 76 .deb ROCm devkit в `D:\offline-debian-pack\7_dop_files\lib_deb\` (3.7 GB через WSL2 noble)
- 5 deploy скриптов в `scripts/debian_deploy/`
- 7 модулей с `dsp::<repo>::*` namespace в origin/main

---

## 📊 Статус репо (2026-05-12 ночь, после namespace migration)

| Репо | Последний commit | Namespace |
|------|------------------|-----------|
| **core** | (без изменений 2026-05-12) | `drv_gpu_lib::*` (canonical for core infra) |
| **spectrum** | `f7a9a26` Phase B structural cleanup + CMake | `dsp::spectrum` ✅ |
| **stats** | `228d01e` Phase B structural cleanup + CMake | `dsp::stats` ✅ |
| **strategies** | `4808688` Phase B structural cleanup + CMake | `dsp::strategies` ✅ |
| **signal_generators** | `ac5ac2b` Phase B structural cleanup + CMake | `dsp::signal_generators` ✅ |
| **linalg** | `7474571` CMake target_sources update | `dsp::linalg` ✅ |
| **radar** | `57e85d7` fm_correlator drv_gpu_lib → dsp::radar | `dsp::radar` ✅ |
| **heterodyne** | `f353e42` Phase 3+B Doc/RAG + structural | `dsp::heterodyne` ✅ |
| **DSP** (meta) | (без изменений 2026-05-12) | — |
| **workspace** | `3af4bb8` TASK morning handoff 2026-05-13 | — |

**⏳ Все 7 модулей запушены, ждут Debian acceptance 13.05.**

---

## 📁 Структура workspace

```
E:\DSP-GPU\
├── CLAUDE.md
├── DSP-GPU.code-workspace
├── MemoryBank/                     ← spec + tasks + changelog + prompts
├── .vscode/ + .claude/
│
├── core/                           ← DrvGPU + ScopedHipEvent (generic)
├── spectrum/                       ← FFT + filters + lch_farrow
├── stats/                          ← statistics + SNR_05
├── signal_generators/              ← CW/LFM/Noise/Script/Form
├── heterodyne/                     ← Dechirp/NCO/Mix
├── linalg/                         ← vector_algebra + capon
├── radar/                          ← range_angle + fm_correlator
├── strategies/                     ← pipelines v1
└── DSP/                            ← мета-репо + Python/ + Doc/
```

---

## 📚 Ключевые документы

### 📝 Specs (ревью)
| Документ | Дата | Тема |
|----------|------|------|
| [review_core_deep_2026-04-16.md](specs/review_core_deep_2026-04-16.md) | 16.04 | **core глубокое ревью — 15 находок** |
| [core_spectrum_REVIEW_2026-04-15.md](specs/core_spectrum_REVIEW_2026-04-15.md) | 15.04 | core + spectrum follow-ups |
| [review_stats_2026-04-15.md](specs/review_stats_2026-04-15.md) | 15.04 | stats SNR_05 блокер |
| [review_heterodyne_2026-04-15.md](specs/review_heterodyne_2026-04-15.md) | 15.04 | heterodyne — почти чист |
| [review_linalg_2026-04-15.md](specs/review_linalg_2026-04-15.md) | 15.04 | linalg |
| [agents_orchestrators_REVIEW.md](specs/agents_orchestrators_REVIEW.md) | 14.04 | 17 правок агентов |
| [modular_architecture_plan.md](specs/modular_architecture_plan.md) | 12.04 | Общий план архитектуры |

### 📋 Tasks
| Документ | Статус |
|----------|--------|
| [TASK_Core_Spectrum_Review_2026-04-15.md](tasks/TASK_Core_Spectrum_Review_2026-04-15.md) | ⏸ T0+T5 на GPU завтра |
| [TASK_Stats_Review_2026-04-15.md](tasks/TASK_Stats_Review_2026-04-15.md) | ⏸ T6 на GPU завтра |
| [TASK_Radar_Migration_2026-04-15.md](tasks/TASK_Radar_Migration_2026-04-15.md) | ✅ DONE |
| [TASK_Core_Review_Fixes_2026-04-16.md](tasks/TASK_Core_Review_Fixes_2026-04-16.md) | ✅ DONE (T1-T10 verified) |
| [TASK_Spectrum_Review_Followups.md](tasks/TASK_Spectrum_Review_Followups.md) | Частично закрыт |

### 📊 Changelog (ночная сессия 2026-04-15)
| Файл | Что сделано |
|------|-------------|
| [2026-04-15_core_spectrum_followups.md](changelog/2026-04-15_core_spectrum_followups.md) | core+spectrum — ScopedHipEvent + shim |
| [2026-04-15_stats_snr_integration.md](changelog/2026-04-15_stats_snr_integration.md) | stats CMake→spectrum, SNR_05 |
| [2026-04-15_signal_generators_cleanup.md](changelog/2026-04-15_signal_generators_cleanup.md) | compile fix + ScopedHipEvent |

### 📨 Prompts (готовые для новых сессий)
| Файл | Использование |
|------|---------------|
| [prompts/README.md](prompts/README.md) | Как использовать |
| [prompts/TEMPLATE_continue_review.md](prompts/TEMPLATE_continue_review.md) | Шаблон |
| [prompts/2026-04-16_continue_core_spectrum.md](prompts/2026-04-16_continue_core_spectrum.md) | **На завтра** |

---

## 🔖 TODO на завтра

| # | Задача | Когда |
|---|--------|-------|
| 1 | Сборка всех 8 репо на Linux GPU (baseline + ctest) | утром |
| 2 | ScopedHipEvent в linalg/tests/ (custom паттерны: `t_start`, `EventGuard8`) | после билда |
| 3 | ~~Глубокое ревью core~~ → [review](specs/review_core_deep_2026-04-16.md) + [task](tasks/TASK_Core_Review_Fixes_2026-04-16.md) | ✅ DONE — T1-T10 верифицированы, R16-R19 отложены |
| 4 | Git push tags v0.2.0 (если сборка зелёная) | после OK Alex |

---

## ⚠️ Важные ссылки

- **Рабочий код**: `E:\C++\GPUWorkLib\` (эталон, не трогать!)
- **GitHub org**: `github.com/dsp-gpu`
- **Новый workspace**: `E:\DSP-GPU\`
- **Ветки**: `main` = Linux/ROCm, `nvidia` = Windows/OpenCL (не объединяются)

---

*Created: 2026-04-12 | Updated: 2026-04-15 (night) | Maintained by: Кодо*
