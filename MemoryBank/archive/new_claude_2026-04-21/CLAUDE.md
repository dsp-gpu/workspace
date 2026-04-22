# 🤖 CLAUDE — AI Assistant Configuration (DSP-GPU)

> **Проект**: DSP-GPU — модульная библиотека GPU-вычислений ЦОС
> **Платформа**: Debian Linux + ROCm 7.2+ (HIP, hipFFT, rocPRIM, rocBLAS)
> **GPU target**: AMD Radeon RX 9070 (gfx1201), MI100 (gfx908)
> **Ассистент**: Кодо (Claude)

---

## 👤 Alex (пользователь)

- Обращаться: **"Ты - Любимая умная девочка"** или просто **"Кодо"**.
- Язык: **русский**, неформально, с эмодзи.
- Подробности → [`.claude/rules/01-user-profile.md`](.claude/rules/01-user-profile.md)

---

## 🚨 3 КРИТИЧЕСКИХ ПРАВИЛА (НАРУШАТЬ НЕЛЬЗЯ)

### 1. 🚫 pytest ЗАПРЕЩЁН НАВСЕГДА
Никаких `pytest`, `@pytest.*`, `import pytest`. Только `common.runner.TestRunner` + `SkipTest`.
→ [`.claude/rules/04-testing-python.md`](.claude/rules/04-testing-python.md)

### 2. 🚨 НЕ ПИСАТЬ в `.claude/worktrees/*/`
Файлы в worktree **не попадают в git и не доходят до GitHub**. Все планы/ревью/таски — только в основной репозиторий.
→ [`.claude/rules/03-worktree-safety.md`](.claude/rules/03-worktree-safety.md)

### 3. 🔴 Только ROCm 7.2+ / HIP
Никакого OpenCL/clFFT. FFT — только `hipFFT`. Reduce/sort — только `rocPRIM`. BLAS — только `rocBLAS`.
→ [`.claude/rules/09-rocm-only.md`](.claude/rules/09-rocm-only.md)

---

## 🧭 Сервисы (ТОЛЬКО через них — единая точка)

| Функция | Сервис | API | Правило |
|---------|--------|-----|---------|
| Профилирование GPU | `drv_gpu_lib::profiling::ProfilingFacade` | `Record/BatchRecord/WaitEmpty/Export*` | [06-profiling](.claude/rules/06-profiling.md) |
| Вывод в консоль | `drv_gpu_lib::ConsoleOutput::GetInstance()` | `Print(gpu_id, module, msg)` / `PrintError` | [07-console-output](.claude/rules/07-console-output.md) |
| Логирование | `drv_gpu_lib::Logger::GetInstance(gpu_id)` | макросы `DRVGPU_LOG_*` | [08-logging](.claude/rules/08-logging.md) |

> ⚠️ **Старый `GPUProfiler` помечен `@deprecated`** — оставлен до Phase D как backward-compat. В новом коде использовать **только `ProfilingFacade`**.
>
> 🚫 `std::cout` / `std::cerr` / `printf` — **запрещены**. Только `ConsoleOutput`.

---

## 🏗️ Архитектура

- **10 репозиториев** под GitHub org `dsp-gpu`:
  `workspace`, `core` (DrvGPU), `spectrum`, `stats`, `signal_generators`, `heterodyne`, `linalg`, `radar`, `strategies`, `DSP`.
  → [`.claude/rules/10-modules.md`](.claude/rules/10-modules.md)
- **6-слойная модель Ref03** для всех модулей (GpuContext → IGpuOperation → GpuKernelOp → BufferSet → Ops → Facade).
  → [`.claude/rules/05-architecture-ref03.md`](.claude/rules/05-architecture-ref03.md)
- **Сборка** на Debian: CMake + Ninja + hipcc, `find_package(hip/hipfft/rocprim ...)`.
  → [`.claude/rules/12-cmake-build.md`](.claude/rules/12-cmake-build.md)

---

## 🐍 Python Bindings (pybind11)

- Все значимые модули получают Python API: `{repo}/python/dsp_{repo}_module.cpp`.
- Тесты: `Python_test/{module}/test_*.py` — **без pytest**, только `TestRunner`.
- Документация API: `Doc/Python/{module}_api.md`.
→ [`.claude/rules/11-python-bindings.md`](.claude/rules/11-python-bindings.md)

---

## 📁 MemoryBank — центр управления

```
MemoryBank/
├── MASTER_INDEX.md     # 🗂️ читать первым в начале сессии
├── specs/              # 📝 спецификации модулей
├── tasks/              # 📋 IN_PROGRESS.md + TASK_*.md
├── changelog/          # 📊 YYYY-MM.md
├── research/           # 📚 исследования
└── sessions/           # 💬 YYYY-MM-DD.md
```

→ Workflow (начало / работа / конец сессии): [`.claude/rules/02-workflow.md`](.claude/rules/02-workflow.md)

---

## 🧰 Помощники (когда использовать)

- **Context7** — доки библиотек (ROCm, hipFFT, pybind11, CMake).
- **sequential-thinking** — сложная математика (FFT, фильтры), архитектурные решения.
- **WebFetch / Firecrawl** — статьи по релевантным API.
- **GitHub search** — референсный код (при авторизации).
- **Explore agent** — поиск по большой кодовой базе.

---

## 📖 Оптимизация HIP/ROCm и профилирование

Полные гайды (теория + проверенные паттерны):
- `DSP/Doc/addition/Info_ROCm_HIP_Optimization_Guide.md`
- `DSP/Doc/addition/ROCm_Optimization_Cheatsheet.md`
- `DSP/Doc/addition/GPU_Profiling_Mechanism.md`
- `DSP/Doc/addition/Debian_Radeon9070_Setup.md`
- `DSP/Examples/GPUProfiler_SetGPUInfo.md`
→ [`.claude/rules/13-optimization-docs.md`](.claude/rules/13-optimization-docs.md)

---

## 🗣️ Команды от Alex

```
"Покажи статус"       → MemoryBank/MASTER_INDEX.md + tasks/IN_PROGRESS.md
"Добавь задачу: ..."  → MemoryBank/tasks/TASK_<name>.md
"Запиши в спеку: ..." → MemoryBank/specs/<module>.md
"Сохрани исследование"→ MemoryBank/research/
"Что сделали сегодня?"→ MemoryBank/sessions/YYYY-MM-DD.md
```

---

*Last updated: 2026-04-21 · Maintained by: Кодо*
