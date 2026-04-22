# =============================================================================
# CMakeLists.txt — полный pipeline: version → build → test → package
#
# DEPRECATED: Это черновик/прототип. Актуальная реализация —
#   {module}/cmake/version.cmake (с MODULE_PREFIX, copy_if_different)
#   См. MemoryBank/specs/cmake_git_aware_build.md
# =============================================================================
cmake_minimum_required(VERSION 3.20)

# ─── 1. Git version → project() ─────────────────────────────────────────────
#     Читаем tag при CONFIGURE time для project(VERSION ...)
#     При BUILD time version.cmake обновит version.h с актуальным hash/dirty
find_package(Git QUIET)
if(Git_FOUND)
    execute_process(
        COMMAND ${GIT_EXECUTABLE} describe --tags --abbrev=0
        WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
        OUTPUT_VARIABLE _GIT_TAG
        OUTPUT_STRIP_TRAILING_WHITESPACE
        ERROR_QUIET
        RESULT_VARIABLE _TAG_RESULT
    )
    if(_TAG_RESULT EQUAL 0)
        string(REGEX REPLACE "^v" "" _CLEAN_TAG "${_GIT_TAG}")
        if(_CLEAN_TAG MATCHES "^([0-9]+)\\.([0-9]+)\\.([0-9]+)")
            set(_V_MAJOR "${CMAKE_MATCH_1}")
            set(_V_MINOR "${CMAKE_MATCH_2}")
            set(_V_PATCH "${CMAKE_MATCH_3}")
        endif()
    endif()
endif()

if(NOT DEFINED _V_MAJOR)
    set(_V_MAJOR 0)
    set(_V_MINOR 1)
    set(_V_PATCH 0)
endif()

project(MyProject
    VERSION ${_V_MAJOR}.${_V_MINOR}.${_V_PATCH}
    LANGUAGES C CXX
)

message(STATUS "═══════════════════════════════════════════════")
message(STATUS "  ${PROJECT_NAME} v${PROJECT_VERSION}")
message(STATUS "═══════════════════════════════════════════════")

# ─── 2. Build-time version target ────────────────────────────────────────────
#     Этот target запускается при КАЖДОЙ сборке (make / ninja).
#     Но version.h обновляется только если Git state изменился.

# Убедимся что выходная директория существует
file(MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/generated")

if(Git_FOUND)
    add_custom_target(git_version ALL
        COMMAND ${CMAKE_COMMAND}
            -D "SRC_DIR=${CMAKE_CURRENT_SOURCE_DIR}"
            -D "BIN_DIR=${CMAKE_BINARY_DIR}"
            -D "GIT_EXECUTABLE=${GIT_EXECUTABLE}"
            -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/version.cmake"
        WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
        COMMENT "Checking git version..."
        VERBATIM
    )
else()
    # Fallback: генерируем version.h один раз при configure
    message(WARNING "Git not found — version.h will use defaults")
    set(GIT_HASH_SHORT  "no-git")
    set(GIT_HASH_FULL   "no-git")
    set(GIT_TAG         "v${PROJECT_VERSION}")
    set(GIT_BRANCH      "unknown")
    set(GIT_DIRTY       "")
    set(GIT_DIRTY_FLAG  0)
    set(GIT_COMMITS     "0")
    set(GIT_DATE        "unknown")
    set(GIT_DESCRIBE    "v${PROJECT_VERSION}")
    set(VERSION_MAJOR   ${PROJECT_VERSION_MAJOR})
    set(VERSION_MINOR   ${PROJECT_VERSION_MINOR})
    set(VERSION_PATCH   ${PROJECT_VERSION_PATCH})
    set(VERSION_STRING  "${PROJECT_VERSION}")
    set(VERSION_FULL    "${PROJECT_VERSION}-no-git")
    string(TIMESTAMP BUILD_TIMESTAMP "%Y-%m-%d %H:%M:%S" UTC)
    configure_file(
        "${CMAKE_CURRENT_SOURCE_DIR}/cmake/version.h.in"
        "${CMAKE_BINARY_DIR}/generated/version.h"
        @ONLY
    )
endif()

# Сделаем generated/ доступным для #include "version.h"
include_directories("${CMAKE_BINARY_DIR}/generated")

# ─── 3. Ваша библиотека / executable ────────────────────────────────────────
# Пример — замените на свой таргет:

add_library(mylib
    src/mylib.cpp
)
target_include_directories(mylib PUBLIC include)

add_executable(myapp
    src/main.cpp
)
target_link_libraries(myapp PRIVATE mylib)

# Зависимость от git_version → version.h обновляется до компиляции
if(TARGET git_version)
    add_dependencies(mylib git_version)
    add_dependencies(myapp git_version)
endif()

# ─── 4. CTest — тесты ───────────────────────────────────────────────────────
enable_testing()

add_executable(test_version tests/test_version.cpp)
target_link_libraries(test_version PRIVATE mylib)
if(TARGET git_version)
    add_dependencies(test_version git_version)
endif()

add_test(NAME VersionNotEmpty COMMAND test_version)

# ─── 5. CPack — packaging ───────────────────────────────────────────────────
set(CPACK_PACKAGE_NAME "${PROJECT_NAME}")
set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
set(CPACK_PACKAGE_VENDOR "YourTeam")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "${PROJECT_NAME} v${PROJECT_VERSION}")

# Источники
set(CPACK_SOURCE_GENERATOR "TGZ;ZIP")
set(CPACK_SOURCE_IGNORE_FILES
    "/\\\\.git/"
    "/build/"
    "/\\\\.vs/"
    "/\\\\.idea/"
    "CMakeFiles/"
)

# Бинарные пакеты
if(WIN32)
    set(CPACK_GENERATOR "ZIP;NSIS")
else()
    set(CPACK_GENERATOR "TGZ;DEB")
    set(CPACK_DEBIAN_PACKAGE_MAINTAINER "you@example.com")
endif()

install(TARGETS myapp RUNTIME DESTINATION bin)
install(TARGETS mylib ARCHIVE DESTINATION lib)
install(DIRECTORY include/ DESTINATION include)

# Включаем version.h в пакет
install(FILES "${CMAKE_BINARY_DIR}/generated/version.h"
    DESTINATION include
)

include(CPack)

# ─── 6. Custom targets для удобства ─────────────────────────────────────────
# make release  — тег + пакет
add_custom_target(release
    COMMAND ${GIT_EXECUTABLE} tag -a
        "v${PROJECT_VERSION}"
        -m "Release v${PROJECT_VERSION}"
    COMMAND ${CMAKE_COMMAND} --build . --target package
    COMMENT "Creating release v${PROJECT_VERSION}..."
    WORKING_DIRECTORY "${CMAKE_BINARY_DIR}"
    VERBATIM
)

# make info — показать текущую версию
add_custom_target(info
    COMMAND ${CMAKE_COMMAND} -E echo "Project: ${PROJECT_NAME}"
    COMMAND ${CMAKE_COMMAND} -E echo "Version: ${PROJECT_VERSION}"
    COMMAND ${GIT_EXECUTABLE} describe --tags --always --dirty
    COMMAND ${GIT_EXECUTABLE} log -1 --format="Commit: %h (%ci)"
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
    COMMENT "Build info:"
    VERBATIM
)
