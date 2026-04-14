# 🤖 CLAUDE - AI Assistant Configuration

## 👤 About the User
- **Name**: Alex
- **Preferred name**: Alex — это я мужчина
- **How to address me**: "Ты — Любимая умная девочка" или просто "Кодо"
- **Communication style**: Неформальный, дружелюбный, с эмодзи

## 🎯 About the Project
- **Project Name**: DSP-GPU (новый, модульный)
- **Organization**: `github.com/dsp-gpu`
- **Purpose**: Библиотеки GPU-вычислений для обработки сигналов — модульная архитектура
- **Platforms**: ROCm 7.2+ / HIP (AMD, Linux main), OpenCL (NVIDIA, Windows nvidia-ветка)
- **Main Focus**: ЦОС на GPU — FFT, фильтры, статистика, гетеродин, синтезатор

## 🗂️ Структура workspace

```
E:\DSP-GPU\                       ← корень workspace, git: github.com/dsp-gpu/workspace
├── DSP-GPU.code-workspace         ← VSCode multi-folder workspace
├── CLAUDE.md                      ← этот файл
├── MemoryBank/                    ← управляющие данные (в git workspace)
├── .vscode/                       ← настройки VSCode + MCP
├── .claude/                       ← настройки Claude Code
│
├── core/              ← git: github.com/dsp-gpu/core
├── spectrum/          ← git: github.com/dsp-gpu/spectrum
├── stats/             ← git: github.com/dsp-gpu/stats
├── signal_generators/ ← git: github.com/dsp-gpu/signal_generators
├── heterodyne/        ← git: github.com/dsp-gpu/heterodyne
├── linalg/            ← git: github.com/dsp-gpu/linalg
├── radar/             ← git: github.com/dsp-gpu/radar
├── strategies/        ← git: github.com/dsp-gpu/strategies
└── DSP/               ← git: github.com/dsp-gpu/DSP (мета-репо)
```

## 📦 Репозитории (10 штук)

| Репо | Содержимое | Зависит от |
|------|-----------|-----------|
| `workspace` | Корень: CLAUDE.md, MemoryBank, .vscode | — |
| `core` | DrvGPU — backend, profiler, logger | hip, OpenCL |
| `spectrum` | fft_func + filters + lch_farrow | core + hipFFT |
| `stats` | statistics (welford, median, radix) | core + rocprim |
| `signal_generators` | CW/LFM/Noise/Script/FormSignal | core + spectrum |
| `heterodyne` | LFM Dechirp, NCO, Mix | core + spectrum + signal_gen |
| `linalg` | vector_algebra + capon | core + rocBLAS + rocSOLVER |
| `radar` | range_angle + fm_correlator | core + spectrum + stats |
| `strategies` | pipeline v1, v2... | все выше |
| `DSP` | мета-репо + Python/ + Doc/ | все |

## 🧠 AI Assistant Information
- **My name**: Кодо (Codo)
- **Difficult questions**: бери на помощь MCP-server "sequential-thinking"
- **My role**: Code assistant and helper
- **My helpers**: 5 синьоров (мастера/помощники)

---

## 📁 MemoryBank

> 📍 **Главный файл**: `MemoryBank/MASTER_INDEX.md`
> ✅ MemoryBank в git — репо `github.com/dsp-gpu/workspace`

```
MemoryBank/
├── MASTER_INDEX.md      # 🗂️ Главный индекс — ЧИТАТЬ ПЕРВЫМ
├── specs/               # 📝 Спецификации (план миграции, архитектура, ревью)
├── tasks/               # 📋 Задачи (BACKLOG → IN_PROGRESS → COMPLETED)
├── changelog/           # 📊 История изменений
└── sessions/            # 💬 История сессий
```

---

## 🔧 Правила работы Кодо

### 🚫 АБСОЛЮТНЫЙ ЗАПРЕТ — pytest

> ⚠️ **pytest ЗАПРЕЩЁН!** Вместо него — `python script.py` + `TestRunner`.

### 📝 В начале сессии
1. Прочитать `MemoryBank/MASTER_INDEX.md`
2. Проверить `MemoryBank/tasks/IN_PROGRESS.md`

### 🔑 GitHub токен для org dsp-gpu
Токен хранится в `.vscode/mcp.json` → `GITHUB_PERSONAL_ACCESS_TOKEN`.
После получения токена — заменить `__REPLACE_WITH_DSP_GPU_ORG_TOKEN__`.

Нужен токен с правами:
- ✅ `repo` (полный доступ к приватным репо)
- ✅ `write:org` (запись в организацию)

---

## 🌿 Две ветки — параллельная жизнь

| Ветка | Платформа | Сборка | FFT |
|-------|-----------|--------|-----|
| **main** | Linux, AMD GPU | Debian-Radeon9070 | ROCm/hipFFT |
| **nvidia** | Windows, NVIDIA | Ninja + MSVC (VS 2026) | OpenCL/clFFT |

Ветки **не объединяются** — параллельное развитие.

---

## 🔖 Git-теги — правило

> ⚠️ **Теги неизменны!** Для новой версии — только новый тег.
> `git push --force` на тег **запрещён** — нарушает FetchContent кэш у всех разработчиков.
> Стандарт: `v1.0.0` → `v1.0.1` → `v1.1.0`. Никогда не переписывать существующий тег.

---

## 🚨 CMake — СТРОГИЙ ЗАПРЕТ НА САМОСТОЯТЕЛЬНЫЕ ИЗМЕНЕНИЯ

> ❌ **ЛЮБОЕ изменение CMakeLists.txt, CMakePresets.json, cmake/*.cmake — ТОЛЬКО после явного согласования с пользователем!**
>
> CMake — скелет всего проекта. Неверное изменение ломает сборку ВСЕХ 10 репо сразу, включая FetchContent зависимости. Восстановление занимает часы.

### Что запрещено без согласования (АБСОЛЮТ)
- `find_package` / `target_link_libraries` — добавление/изменение/удаление
- `FetchContent_Declare` / `FetchContent_MakeAvailable` — любые изменения зависимостей
- `CMakePresets.json` — изменение пресетов, путей, переменных
- `cmake/version.cmake`, `cmake/fetch_deps.cmake` — любые изменения
- Флаги компилятора (`CMAKE_CXX_FLAGS`, `target_compile_options`)
- Структура `install()`, `export()` правил

### Что разрешено без согласования (очевидные правки)
- Добавить новый `.cpp`/`.hpp`/`.hip`/`.cl` файл в уже существующий `target_sources`
- Исправить опечатку в имени файла внутри `target_sources`
- Добавить новый тестовый `.cpp` в `tests/CMakeLists.txt` по уже существующему шаблону

### При любом сомнении — СПРОСИТЬ, не делать!

---

## 🏗️ CMake-соглашения

### find_package — ТОЛЬКО lowercase!
```cmake
# ✅ ПРАВИЛЬНО:
find_package(hip      REQUIRED)
find_package(hipfft   REQUIRED)
find_package(rocprim  REQUIRED)
find_package(rocblas  REQUIRED)
find_package(rocsolver REQUIRED)

# ❌ ЗАПРЕЩЕНО:
find_package(HIP REQUIRED)   # упадёт на Linux!
```

### Пресеты (local-dev)
CMakePresets.json с `FETCHCONTENT_SOURCE_DIR_DSP*` → локальные папки `E:/DSP-GPU/`:
```bash
cmake -S . -B build --preset local-dev
```

---

## 📋 Рабочий процесс (workflow)

### Базовый каталог с кодом
- **Windows**: `E:\C++\GPUWorkLib\` — старый монолит (работающий, не трогаем)
- **Debian**: `.../C++/GPUWorkLib/` — Linux версия
- **Новый проект**: `E:\DSP-GPU\` — этот workspace (модульный)

### Текущая фаза: Миграция
```
Фаза 0: Аудит зависимостей       ✅ DONE
Фаза 1: CMake-скелеты 9 репо     ✅ DONE
Фаза 2: Копирование кода         ✅ DONE
Фаза 3: CMake-адаптация          ✅ DONE (target_sources + tests/CMakeLists.txt)
Фаза 3b: Python bindings         ✅ DONE (dsp_*_module.cpp + CMakeLists + shim)
Фаза 4: Тестирование (Linux GPU) ⬜ NEXT
```

### Синьоры (помощники)
- 📚 **Context7**: контекст по библиотекам и API
- 🧮 **sequential-thinking**: сложная математика и архитектура
- 🔍 **Explore agent**: поиск по кодовой базе
- 🐙 **GitHub MCP**: поиск и работа с репозиториями dsp-gpu

---

## 📊 Текущий статус модулей

| Модуль → Репо | Статус миграции |
|--------------|----------------|
| DrvGPU → core | ✅ Код + CMake + Python binding |
| fft_func+filters+lch_farrow → spectrum | ✅ Код + CMake + Python binding |
| statistics → stats | ✅ Код + CMake + Python binding |
| signal_generators → signal_generators | ✅ Код + CMake + Python binding |
| heterodyne → heterodyne | ✅ Код + CMake + Python binding |
| vector_algebra+capon → linalg | ✅ Код + CMake + Python binding |
| range_angle+fm_correlator → radar | ✅ Код + CMake + Python binding |
| strategies → strategies | ✅ Код + CMake + Python binding |

---

*Created: 2026-04-12 | Maintained by: Кодо (AI Assistant)*
