<!-- type:meta_overview repo:dsp_gpu source:CLAUDE.md -->

# DSP-GPU — Project Overview

_Источник: CLAUDE.md_

# 🤖 CLAUDE — DSP-GPU

> **Проект**: DSP-GPU — модульная GPU-библиотека ЦОС (10 репо под `github.com/dsp-gpu/`)
> **Платформа**: Debian Linux + ROCm 7.2+ (HIP, hipFFT, rocPRIM, rocBLAS, rocSOLVER)
> **GPU target**: AMD Radeon RX 9070 (gfx1201) + MI100 (gfx908)
> **Ассистент**: Кодо (Claude)

---

## 🧠 Режим работы ассистента

Жёсткий режим (читать первым, всегда) → **`~/.claude/CLAUDE.md`** (глобальный SYSTEM_PROMPT).
Модульные правила для проекта → **`.claude/rules/*.md`** (16 файлов, path-scoped где уместно).

Canonical правил живёт в `MemoryBank/.claude/rules/`. Синхронизация в `.claude/rules/` — автоматически через `MemoryBank/sync_rules.py` (git pre-commit hook). Подробности → `MemoryBank/README_sync_rules.md`.

---

## 👤 Alex

- Обращаться: **«Ты — Любимая умная девочка»** или **«Кодо»** (мужчина, senior).
- Русский, неформально, с эмодзи — **по делу**.
- Детали → `.claude/rules/01-user-profile.md`.

---

## 🚨 3 критических правила (нарушать нельзя)

1. **🚫 pytest ЗАПРЕЩЁН НАВСЕГДА** — только `common.runner.TestRunner` + `SkipTest`.
   → `.claude/rules/04-testing-python.md`
2. **🚨 НЕ писать в `.claude/worktrees/*/`** — файлы теряются, не попадают в git.
   → `.claude/rules/03-worktree-safety.md`
3. **🔴 Только ROCm 7.2+ / HIP** — без clFFT / cuFFT / OpenCL для вычислений.
   → `.claude/rules/09-rocm-only.md`

---

## 🧭 Единые точки (только через них)

| Функция | Сервис | Правило |
|---------|--------|---------|
| Профилирование GPU | `drv_gpu_lib::profiling::ProfilingFacade` | [06](.claude/rules/06-profiling.md) |
| Консольный вывод | `drv_gpu_lib::ConsoleOutput::GetInstance()` | [07](.claude/rules/07-console-output.md) |
| Логирование | `drv_gpu_lib::Logger::GetInstance(gpu_id)` + `DRVGPU_LOG_*` | [08](.claude/rules/08-logging.md) |

> ⚠️ Старый `GPUProfiler` — **`@deprecated`** (до Phase D). В новом коде — только `ProfilingFacade`.
> 🚫 `std::cout` / `std::cerr` / `printf` — **запрещены**. Только `ConsoleOutput`.

---

## 📦 10 репозиториев

| # | Репо | Назначение |
|---|------|-----------|
| 1 | `workspace` | CLAUDE.md, MemoryBank, .vscode, .claude (этот корень) |
| 2 | `core` | DrvGPU, ProfilingFacade, ConsoleOutput, Logger |
| 3 | `spectrum` | FFT / IFFT / оконные функции / фильтры / lch_farrow |
| 4 | `stats` | welford / median / histogram / SNR |
| 5 | `signal_generators` | CW, LFM, Noise, Script, FormSignal |
| 6 | `heterodyne` | NCO, MixDown/Up, LFM Dechirp |
| 7 | `linalg` | Matrix ops, SVD, eig, Capon |
| 8 | `radar` | range_angle, fm_correlator |
| 9 | `strategies` | PipelineBuilder + IPipelineStep |
| 10 | `DSP` | мета: Python/, Doc/, Examples/, Results/, Logs/ |

Каноничные имена (не `fft_func`!) и статусы → `.claude/rules/10-modules.md`.

---

## 🏗️ Архитектура & Сборка

- **6-слойная модель Ref03** (GpuContext → IGpuOperation → GpuKernelOp → BufferSet → Ops → Facade) → [05](.claude/rules/05-architecture-ref03.md).
- **Стиль кода**: ООП / SOLID / GRASP / GoF → [14](.claude/rules/14-cpp-style.md).
- **C++ тесты** (ООП, header-only `.hpp`, `all_test.hpp`) → [15](.claude/rules/15-cpp-testing.md).
- **CMake** (пресеты `debian-*`, `find_package` lowercase, БЕЗ правок без OK) → [12](.claude/rules/12-cmake-build.md).
- **Python bindings** (pybind11, `dsp_{repo}_module.cpp`, тесты в `DSP/Python/`) → [11](.claude/rules/11-python-bindings.md).
- **Оптимизация HIP / ROCm** (гайды, Cheatsheet, ZeroCopy, Mermaid-палитра) → [13](.claude/rules/13-optimization-docs.md).
- **ROCm-only стек** (hipFFT / rocPRIM / rocBLAS / rocSOLVER, никакого clFFT) → [09](.claude/rules/09-rocm-only.md).

---

## 📁 MemoryBank (центр управления)

```
MemoryBank/
├── MASTER_INDEX.md         # 🗂️ читать первым в начале сессии
├── .claude/rules/          # canonical правил Кодо (16 файлов) ← источник истины
├── .claude/specs/          # база знаний (Ref03, Optimization, Profiling, ZeroCopy, Mermaid)
├── .architecture/          # C4-диаграммы, анализ архитектуры
├── .agent/                 # материалы для 5 синьоров
├── specs/                  # спецификации по темам + ревью
├── tasks/                  # IN_PROGRESS.md + TASK_{topic}_{phase}.md
├── prompts/                # готовые промпты для subagents
├── feedback/               # обратная связь / ревью
├── sessions/               # YYYY-MM-DD.md
├── changelog/              # YYYY-MM.md
├── hooks/pre-commit        # git hook для авто-синка правил
├── sync_rules.py           # sync canonical → .claude/rules/
└── README_sync_rules.md    # инструкция
```

Workflow сессии → [02](.claude/rules/02-workflow.md).

---

## 🚀 Новая задача — обязательная последовательность

```
сформулировать вопрос
  → Context7 (доки библиотек)
  → WebFetch/URL (свежие статьи)
  → sequential-thinking (если сложная — архитектура/математика)
  → GitHub search (референсный код)
  → писать код
```

Детали → [00-new-task-workflow](.claude/rules/00-new-task-workflow.md).

---

## 🗣️ Команды Alex

| Команда | Действие |
|---------|---------|
| «Покажи статус» | `MASTER_INDEX.md` + `tasks/IN_PROGRESS.md` |
| «Добавь задачу: ...» | `tasks/TASK_<topic>_<phase>.md` |
| «Запиши в спеку: ...» | `specs/{topic}_YYYY-MM-DD.md` |
| «Сохрани исследование» | `specs/` или `.claude/specs/` |
| «Что сделали сегодня?» | `sessions/YYYY-MM-DD.md` |

---

*Last updated: 2026-04-22 · Maintained by: Кодо*
