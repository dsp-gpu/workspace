# 00 — DSP-GPU Project Overview

> Project rules for Continue/Qwen. Mirrors critical parts of `.claude/rules/`.
> Full canonical rules → `.claude/rules/*.md` (16 files).

## Project

**DSP-GPU** — модульная GPU-библиотека ЦОС (10 git-репозиториев под `github.com/dsp-gpu/`).

- **Платформа**: Debian Linux + ROCm 7.2+ (HIP, hipFFT, rocPRIM, rocBLAS, rocSOLVER)
- **GPU target**: AMD Radeon RX 9070 (gfx1201) + MI100 (gfx908)
- **Языки**: C++17 (ядра/lib), Python (биндинги через pybind11)

## 10 репозиториев

| # | Репо | Назначение |
|---|------|-----------|
| 1 | `workspace` | корень: CLAUDE.md, MemoryBank, .vscode, .claude |
| 2 | `core` | DrvGPU, ProfilingFacade, ConsoleOutput, Logger |
| 3 | `spectrum` | FFT/IFFT, окна, фильтры, lch_farrow |
| 4 | `stats` | welford, median, histogram, SNR |
| 5 | `signal_generators` | CW, LFM, Noise, Script, FormSignal |
| 6 | `heterodyne` | NCO, MixDown/Up, LFM Dechirp |
| 7 | `linalg` | Matrix ops, SVD, eig, Capon |
| 8 | `radar` | range_angle, fm_correlator |
| 9 | `strategies` | PipelineBuilder + IPipelineStep |
| 10 | `DSP` | мета: Python/, Doc/, Examples/, Results/ |

## Пользователь

- **Alex** (мужчина, senior DSP/GPU engineer)
- Язык: **русский**, неформально, эмодзи по делу
- Стиль: **короткие** ответы, max 5 строк перед действием
- Не угадывать, не фантазировать — спросить **один** короткий вопрос с вариантами A/B/C

## Стиль работы

1. **Читать перед говорить**: утверждаешь про код/API/путь → сначала прочитай файл
2. **Не плодить сущности**: перед новым классом — поищи существующий
3. **ООП / SOLID / GRASP / GoF** — основы стиля C++
4. **Один класс — один файл** (Op → `operations/`, Step → `steps/`)
5. Признавать ошибки взаимно — без самобичевания, без оправданий

## Где искать детали

- `.claude/rules/*.md` — полные правила (16 файлов)
- `MemoryBank/MASTER_INDEX.md` — статус проекта
- `MemoryBank/tasks/IN_PROGRESS.md` — что в работе
- `MemoryBank/.claude/specs/` — спеки (Ref03, Optimization, Profiling, ZeroCopy)
- `MemoryBank/.architecture/` — C4-диаграммы
