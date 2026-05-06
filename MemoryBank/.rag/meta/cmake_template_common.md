<!-- type:meta_cmake_common repo:dsp_gpu source:CMakeLists.txt -->

# CMake Common Template — DSP-GPU

_Intersection общих строк из 8 `CMakeLists.txt` (core, spectrum, stats, signal_generators, heterodyne, linalg, radar, strategies). Строки в ≥6/8 файлов._

Per-repo специфика → `cmake_summary.md` (`inherits: dsp_gpu__root__meta_cmake_common__v1`). Плейсхолдеры: `<TARGET>` = имя библиотеки (DspSpectrum/DspCore/...), `<MODULE>` = имя модуля в верхнем регистре (SPECTRUM/CORE/...).

## Преамбула

```cmake
cmake_minimum_required(VERSION 3.25)
project(<TARGET> VERSION 0.1.0
```

## Зависимости (find_package)

```cmake
find_package(Git QUIET)
```

## Опции сборки

```cmake
option(DSP_<MODULE>_BUILD_PYTHON "Build Python bindings"  OFF)
option(DSP_<MODULE>_BUILD_TESTS  "Build tests"            ON)
```

## Библиотека / Targets

```cmake
add_library(<TARGET> STATIC)
add_library(<TARGET>::<TARGET> ALIAS <TARGET>)
add_subdirectory(python)
add_subdirectory(tests)
```

## Настройки target'ов

```cmake
set(GIT_EXECUTABLE git)
set_target_properties(<TARGET> PROPERTIES POSITION_INDEPENDENT_CODE ON)
```

## target_* команды

```cmake
target_compile_definitions(<TARGET> PUBLIC ENABLE_ROCM=1)
target_compile_features(<TARGET> PUBLIC cxx_std_17)
target_include_directories(<TARGET>
target_sources(<TARGET> PRIVATE
```

## Git Version

```cmake
-D GIT_EXECUTABLE=${GIT_EXECUTABLE}
add_custom_target(git_version_<TARGET> ALL
add_dependencies(<TARGET> git_version_<TARGET>)
if(NOT GIT_EXECUTABLE)
```

## Условные блоки

```cmake
endif()
if(DSP_<MODULE>_BUILD_PYTHON)
if(DSP_<MODULE>_BUILD_TESTS)
if(ENABLE_ROCM)
```

## Install

```cmake
include(GNUInstallDirs)
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
install(EXPORT <TARGET>Targets NAMESPACE <TARGET>::
install(FILES
install(FILES "${CMAKE_CURRENT_BINARY_DIR}/generated/version.h"
install(FILES "${CMAKE_CURRENT_BINARY_DIR}/generated/version.json"
install(TARGETS <TARGET> EXPORT <TARGET>Targets
```

## Package config

```cmake
configure_package_config_file(cmake/<TARGET>Config.cmake.in
include(CMakePackageConfigHelpers)
write_basic_package_version_file(
```

## Прочее

```cmake
"${CMAKE_CURRENT_BINARY_DIR}/<TARGET>Config.cmake"
"${CMAKE_CURRENT_BINARY_DIR}/<TARGET>ConfigVersion.cmake"
$<BUILD_INTERFACE:${CMAKE_CURRENT_BINARY_DIR}/generated>
$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
$<INSTALL_INTERFACE:include>
)
-D BIN_DIR=${CMAKE_CURRENT_BINARY_DIR}
-D MODULE_PREFIX=DSP<MODULE>
-D SRC_DIR=${CMAKE_CURRENT_SOURCE_DIR}
-P ${CMAKE_CURRENT_SOURCE_DIR}/cmake/version.cmake
ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
COMMAND ${CMAKE_COMMAND}
COMMENT "[<TARGET>] Checking git version..."
DESTINATION ${CMAKE_INSTALL_DATADIR}/<TARGET>
DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/<TARGET>
DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/<TARGET>
INSTALL_DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/<TARGET>
LANGUAGES CXX HIP)
PRIVATE
PUBLIC
VERBATIM
VERSION ${PROJECT_VERSION} COMPATIBILITY SameMajorVersion
fetch_dsp_core()
include(cmake/fetch_deps.cmake)
kernels/
src
```

