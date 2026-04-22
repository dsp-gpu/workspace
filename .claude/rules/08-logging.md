---
paths:
  - "**/*logger*"
  - "**/logger/**"
  - "**/*.log"
---

# 08 — Логирование (Logger + plog, per-GPU)

> Backend: **plog**. Один логгер на GPU, файлы раздельные.
> Источник: `core/include/core/logger/logger.hpp`

## Заголовок

```cpp
#include <core/logger/logger.hpp>

using drv_gpu_lib::Logger;
```

## Получение логгера

```cpp
Logger::GetInstance(gpu_id);  // возвращает ILogger& для конкретной GPU
```

## Макросы (рекомендуемый способ)

```cpp
DRVGPU_LOG_DEBUG(gpu_id)   << "init stream " << stream_id;
DRVGPU_LOG_INFO(gpu_id)    << "kernel compiled in " << ms << " ms";
DRVGPU_LOG_WARNING(gpu_id) << "buffer reallocated " << old_size << " → " << new_size;
DRVGPU_LOG_ERROR(gpu_id)   << "hipMalloc failed: " << hipGetErrorString(err);
```

## Уровни

| Уровень | Когда |
|---------|------|
| `DEBUG` | Детали потока, значения переменных (только в Debug-сборке) |
| `INFO` | Нормальный ход (старт/стоп, init) |
| `WARNING` | Подозрительное но не критичное (реаллокация, fallback) |
| `ERROR` | Сбои операции (hip error, OOM) |
| `FATAL` | Невозможность продолжить (перед `std::terminate`) |

## Размещение логов

```
DSP/Logs/
└── DRVGPU_<gpu_id:02>/
    └── YYYY-MM-DD/
        └── HH-MM-SS.log
```

Пример: `DSP/Logs/DRVGPU_00/2026-04-22/14-32-07.log`.

## Разница с ConsoleOutput

| Аспект | `ConsoleOutput` | `Logger` |
|--------|-----------------|---------|
| Цель | Диагностика в реальном времени | История для пост-разбора |
| Буфер | Async очередь | plog rolling files |
| Уровень детализации | INFO/WARNING/ERR | DEBUG включительно |
| Per-GPU файлы | ❌ один stdout | ✅ отдельные файлы |
| Вкл/выкл per-GPU | `is_console` | `is_log` |

**Обычно пишут и туда и туда** — в консоль короткое, в лог подробности.

## Factory (для тестов / production подмены)

```cpp
auto my_logger = std::make_unique<MyCustomLogger>();
Logger::SetInstance(gpu_id, std::move(my_logger));
```

Позволяет подменить `ILogger` в тестах на моковый.

## 🚫 Запрещено

- `std::ofstream` напрямую для логов — только через `Logger`.
- Общий файл из нескольких GPU — всегда per-GPU.
- `DEBUG` в горячих циклах GPU — замедлит поток.
- `plog::init` / `PLOG_*` напрямую — только через `Logger::GetInstance()` + макросы `DRVGPU_LOG_*`.

## Инициализация в main()

```cpp
// startup:
for (int gpu : active_gpus) Logger::GetInstance(gpu);

// где-то в модуле:
DRVGPU_LOG_INFO(gpu_id) << "Module '" << name << "' initialized";
```

## configGPU.json

```json
{ "id": 2, "is_log": false }  // GPU_02 без логов
```
