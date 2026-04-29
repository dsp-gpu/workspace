# 01 — Critical Bans (нарушать НЕЛЬЗЯ)

> 5 запретов. Каждый — реальный инцидент в истории проекта.

## 🚫 1. pytest ЗАПРЕЩЁН НАВСЕГДА

- НЕ использовать `pytest`, `@pytest.*`, `import pytest`
- Замена: `common.runner.TestRunner` + `SkipTest` (Python тесты в `DSP/Python/`)
- Причина: Alex потерял 3 дня работы из-за pytest-конфликтов
- C++ тесты — header-only `.hpp`, ООП-обёртки, `all_test.hpp` (не GoogleTest)

## 🚫 2. НЕ писать в `.claude/worktrees/*/`

- Файлы в worktree теряются при закрытии сессии (не попадают в git)
- Все артефакты (планы, спеки, ревью) — в **корень** основного репо
- Прецедент 2026-03-20: потеряно 5 часов работы агента
- Правильно: `<git toplevel>/MemoryBank/...`, `<git toplevel>/{repo}/src/...`

## 🚫 3. ROCm ONLY (никакого cuFFT / clFFT / OpenCL)

- Разрешено: HIP, hipFFT, rocPRIM, rocBLAS, rocSOLVER, rocRAND
- Запрещено: clFFT (мёртвая, не поддерживает RDNA4), cuFFT/CUDA (другая платформа), OpenCL для вычислений (только interop)
- CMake (Linux case-sensitive): `find_package(hip REQUIRED)` — **lowercase**
- Компилятор: `hipcc -O3 -std=c++17 --offload-arch=gfx1201 --offload-arch=gfx908`

## 🚫 4. std::cout / std::cerr / printf — ЗАПРЕЩЕНЫ

- Использовать **только** `drv_gpu_lib::ConsoleOutput::GetInstance()` (из `core/`)
- Логирование: `drv_gpu_lib::Logger::GetInstance(gpu_id)` + макросы `DRVGPU_LOG_*`
- Причина: единая точка вывода, маршрутизация по уровням, потокобезопасность

## 🚫 5. Старый GPUProfiler — `@deprecated`

- НЕ использовать `GPUProfiler` (под удаление в Phase D)
- Замена: `drv_gpu_lib::profiling::ProfilingFacade` (единая точка профилирования)
- Экспорт: `ProfilingFacade::ExportJson()` / `ExportMarkdown()` — НЕ через `GetStats()` + ручной цикл
- Все `hipEvent_t` — оборачивать в `ScopedHipEvent` (RAII), голые `hipEventCreate` запрещены

## CMake disclaimer

- НЕ менять `CMakeLists.txt` / `*.cmake` без явного OK от Alex
- Если правка нужна — показать DIFF-preview, ждать «делай»
- Не добавлять `if(WIN32)` / `if(UNIX)` гарды — main = Linux/ROCm
