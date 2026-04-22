---
paths:
  - "**/CMakeLists.txt"
  - "**/*.cmake"
  - "**/CMakePresets.json"
---

# 12 — CMake Build (Debian + ROCm)

> ⚠️ **БЕЗ явного OK от Alex — CMake НЕ ПРАВИМ.** CMake — скелет 10 репо.
> **Полный шаблон `CMakeLists.txt`** → `@MemoryBank/.claude/specs/CMake_Module_Template.md`

## 🚫 Запрещено без согласования (АБСОЛЮТ)

- `find_package` / `target_link_libraries` — добавлять/менять/удалять
- `FetchContent_Declare` / `FetchContent_MakeAvailable` — любые изменения
- `CMakePresets.json` — пресеты, пути, переменные
- `cmake/version.cmake`, `cmake/fetch_deps.cmake` — любые изменения
- Флаги компилятора (`CMAKE_CXX_FLAGS`, `target_compile_options`)
- Структура `install()`, `export()` правил

## ✅ Разрешено (очевидные правки)

- Добавить новый `.cpp` / `.hpp` / `.hip` / `.cl` в уже существующий `target_sources`
- Исправить опечатку в имени файла внутри `target_sources`
- Добавить новый тест `.cpp` в `tests/CMakeLists.txt` по существующему шаблону

**При любом сомнении — СПРОСИТЬ.**

## Пресеты

```bash
cmake --preset debian-local-dev     # Debian dev (основной)
cmake --preset debian-release
cmake --preset debian-debug

cmake --build --preset debian-release -j$(nproc)
```

## `find_package` — lowercase! (Linux case-sensitive)

```cmake
# ✅ ПРАВИЛЬНО:
find_package(hip       REQUIRED)
find_package(hipfft    REQUIRED)
find_package(rocprim   REQUIRED)
find_package(rocblas   REQUIRED)
find_package(rocsolver REQUIRED)

# ❌ ЗАПРЕЩЕНО:
find_package(HIP REQUIRED)   # упадёт на Debian!
```

## Опции

| Опция | По умолчанию | Назначение |
|-------|--------------|-----------|
| `DSP_BUILD_TESTS` | `ON` | C++ тесты |
| `DSP_BUILD_PYTHON` | `ON` | pybind11 модули |
| `DSP_BUILD_EXAMPLES` | `OFF` | Примеры из `DSP/` |
| `DSP_HIP_ARCHITECTURES` | `gfx1201;gfx908` | Список arch |

## Быстрые проверки

```bash
rocminfo | grep gfx              # ROCm установлен?
hipcc --version                  # hipcc работает?
cmake --find-package -DNAME=hipfft -DCOMPILER_ID=GNU -DLANGUAGE=CXX -DMODE=EXIST
```

## Зависимости между репо (коротко)

```cmake
find_package(dsp_core CONFIG REQUIRED)     # installed package
# ИЛИ FetchContent (для local-dev):
include(FetchContent)
FetchContent_Declare(dsp_core GIT_REPOSITORY ... GIT_TAG v0.1.0)
FetchContent_MakeAvailable(dsp_core)
```

Для local-dev — `FETCHCONTENT_SOURCE_DIR_DSP_CORE` указывает на локальную папку.
Полный шаблон и комментарии → `@MemoryBank/.claude/specs/CMake_Module_Template.md`.
