# Шаблон CMakeLists.txt модуля DSP-GPU (для правила 12)

> Вынесенные подробности из `MemoryBank/.claude/rules/12-cmake-build.md`.
> Запреты и политика правок → `12-cmake-build.md`.

## Полный `CMakeLists.txt` модуля

```cmake
cmake_minimum_required(VERSION 3.25)
project(dsp_{repo} LANGUAGES CXX HIP)

# ----------------------------------------------------------------------
# Standard
# ----------------------------------------------------------------------
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_HIP_STANDARD 17)

# ----------------------------------------------------------------------
# Dependencies (lowercase!)
# ----------------------------------------------------------------------
find_package(hip     REQUIRED)
find_package(hipfft  REQUIRED)   # если нужен FFT
find_package(rocprim REQUIRED)   # если нужен reduce/scan/sort
find_package(rocblas REQUIRED)   # если нужна линалг

# ----------------------------------------------------------------------
# Target
# ----------------------------------------------------------------------
add_library(dsp_{repo} STATIC
    src/{repo}_processor.cpp
    src/operations/mean_op.cpp
    src/operations/median_op.cpp
    # ... HIP kernels:
    kernels/rocm/welford.hip
    kernels/rocm/histogram.hip
)

target_include_directories(dsp_{repo}
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
)

target_link_libraries(dsp_{repo}
    PUBLIC
        dsp::core
        hip::device
        hip::host
        hip::hipfft
        roc::rocprim
        roc::rocblas
)

# Alias для пользователей (find_package dsp_{repo} CONFIG → dsp::{repo})
add_library(dsp::{repo} ALIAS dsp_{repo})

# HIP offload архитектуры
set_target_properties(dsp_{repo} PROPERTIES
    HIP_ARCHITECTURES "gfx1201;gfx908"
)

# ----------------------------------------------------------------------
# Tests & Python
# ----------------------------------------------------------------------
option(DSP_BUILD_TESTS "Build C++ tests" ON)
option(DSP_BUILD_PYTHON "Build pybind11 module" ON)

if (DSP_BUILD_TESTS)
    add_subdirectory(tests)
endif()

if (DSP_BUILD_PYTHON)
    add_subdirectory(python)
endif()

# ----------------------------------------------------------------------
# Install
# ----------------------------------------------------------------------
install(TARGETS dsp_{repo} EXPORT dsp_{repo}Targets
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
    INCLUDES DESTINATION include
)
install(DIRECTORY include/ DESTINATION include)
```

## `tests/CMakeLists.txt`

```cmake
add_executable(test_{repo} main.cpp)
target_link_libraries(test_{repo} PRIVATE dsp::{repo})
target_include_directories(test_{repo} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
```

## `python/CMakeLists.txt`

```cmake
find_package(pybind11 CONFIG REQUIRED)

pybind11_add_module(dsp_{repo}_pyd
    dsp_{repo}_module.cpp
)

target_link_libraries(dsp_{repo}_pyd PRIVATE dsp::{repo})

set_target_properties(dsp_{repo}_pyd PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/python_dist
)
```

## Cross-repo FetchContent (для local-dev через FETCHCONTENT_SOURCE_DIR_DSP*)

```cmake
include(FetchContent)
FetchContent_Declare(dsp_core
    GIT_REPOSITORY https://github.com/dsp-gpu/core.git
    GIT_TAG        v0.1.0
)
FetchContent_MakeAvailable(dsp_core)
```

С `FETCHCONTENT_SOURCE_DIR_DSP_CORE=/home/alex/DSP-GPU/core` — будет брать локальную папку.

## Опции DSP-GPU

| Опция | По умолчанию | Назначение |
|-------|--------------|-----------|
| `DSP_BUILD_TESTS` | `ON` | C++ тесты |
| `DSP_BUILD_PYTHON` | `ON` | pybind11 модули |
| `DSP_BUILD_EXAMPLES` | `OFF` | Примеры из `DSP/` |
| `DSP_HIP_ARCHITECTURES` | `gfx1201;gfx908` | Список arch |

## Быстрые проверки

```bash
rocminfo | grep gfx                 # установлен ли ROCm?
hipcc --version                     # hipcc работает?
cmake --find-package -DNAME=hipfft -DCOMPILER_ID=GNU -DLANGUAGE=CXX -DMODE=EXIST
```
