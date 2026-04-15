# 🗂️ DSP-GPU — MemoryBank MASTER INDEX

> **Workspace**: `E:\DSP-GPU\`
> **Organization**: `github.com/dsp-gpu`
> **Исходный проект**: `E:\C++\GPUWorkLib\` (монолит, не трогаем!)
> **Последнее обновление**: 2026-04-15 (ночная сессия — 8 репо отрефакторены + запушены)

---

## 🚦 Статус: Миграция GPUWorkLib → dsp-gpu

| Фаза | Описание | Статус |
|------|----------|--------|
| [Фаза 0](tasks/TASK_ModArch_Phase0_Audit.md) | Аудит зависимостей | ✅ DONE |
| [Фаза 1](tasks/TASK_ModArch_Phase1_Skeleton.md) | CMake-скелеты 9 репо | ✅ DONE + pushed |
| [Фаза 2](tasks/TASK_ModArch_Phase2_Copy.md) | Копирование кода | ✅ DONE |
| [Фаза 3](tasks/TASK_ModArch_Phase3_CMake.md) | CMake-адаптация | ✅ DONE |
| [Фаза 3b](tasks/TASK_ModArch_Phase3b_Python.md) | Python bindings | ✅ DONE |
| **Фаза 3c** | **AMD-стандарт миграция + ScopedHipEvent RAII** | ✅ **DONE 2026-04-15** (см. changelog/) |
| [Фаза 4](tasks/TASK_ModArch_Phase4_Test.md) | Тестирование на Linux GPU | ⬜ **ГОТОВО К ЗАПУСКУ** |

---

## 🎯 Что завтра на Linux GPU (Radeon 9070 + ROCm 7.2)

```bash
# В правильном порядке зависимостей
for repo in core spectrum stats signal_generators heterodyne linalg radar strategies; do
  cd /home/alex/DSP-GPU/$repo
  cmake -S . -B build --preset debian-local-dev
  cmake --build build --parallel 32 && (cd build && ctest --output-on-failure)
done
```

**Готовый промпт для новой сессии**: [prompts/2026-04-16_continue_core_spectrum.md](prompts/2026-04-16_continue_core_spectrum.md)

---

## 📊 Статус репо (2026-04-15 ночью)

| Репо | Последний commit | Состояние |
|------|------------------|-----------|
| **core** | `9d56922` feat(core): ScopedHipEvent RAII | ✅ готов |
| **spectrum** | `3c44fa7` refactor: клиенты ScopedHipEvent + read-only helper | ✅ готов |
| **stats** | `4654d2a` fix: ScopedHipEvent + CMake→spectrum (SNR_05) | ✅ готов |
| **signal_generators** | `bf7e34b` fix: compile error + ScopedHipEvent | ✅ готов |
| **heterodyne** | `feb347b` fix: ScopedHipEvent 13 пар + kernels | ✅ готов |
| **linalg** | `ac2e4dc` refactor: AMD-стандарт (WIP сестрёнки, подтверждён) | ✅ готов (tests TODO) |
| **radar** | `2e5d634` refactor: полная миграция AMD (A+B) | ✅ готов |
| **strategies** | `17ed7ce` refactor: миграция + A3c CreateWithFlags | ✅ готов |
| **DSP** (meta) | `1c62b33` cmake: stats требует spectrum | ✅ готов |
| **workspace** | `c7afd20` memory: TASK_Radar_Migration | ✅ |

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
| 3 | Глубокое ревью core (backends/, services/, logger/, config/) | на свежую голову |
| 4 | Git push tags v0.2.0 (если сборка зелёная) | после OK Alex |

---

## ⚠️ Важные ссылки

- **Рабочий код**: `E:\C++\GPUWorkLib\` (эталон, не трогать!)
- **GitHub org**: `github.com/dsp-gpu`
- **Новый workspace**: `E:\DSP-GPU\`
- **Ветки**: `main` = Linux/ROCm, `nvidia` = Windows/OpenCL (не объединяются)

---

*Created: 2026-04-12 | Updated: 2026-04-15 (night) | Maintained by: Кодо*
