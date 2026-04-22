---
paths:
  - "**/*console_output*"
  - "**/*console*.hpp"
  - "**/*console*.cpp"
---

# 07 — Консольный вывод (ConsoleOutput — одна точка на все GPU)

> ⚠️ До 10 GPU работают параллельно. Без единой точки вывод перемешается.
> Источник: `core/include/core/services/console_output.hpp`

## Дизайн (AsyncServiceBase)

- **Синглтон** `ConsoleOutput` наследуется от `AsyncServiceBase<ConsoleMessage>`.
- **Фоновый worker-поток** + потокобезопасная очередь.
- GPU-потоки делают **Enqueue** (почти без задержки).
- Форматирование + вывод в stdout/stderr — в одном worker-потоке.

```cpp
#include <core/services/console_output.hpp>

using drv_gpu_lib::ConsoleOutput;
```

## API (все неблокирующие)

```cpp
// 4 уровня (ConsoleMessage::Level):
ConsoleOutput::GetInstance().Print       (gpu_id, "Module", "info msg");      // INFO
ConsoleOutput::GetInstance().PrintWarning(gpu_id, "Module", "warning msg");   // WARNING
ConsoleOutput::GetInstance().PrintError  (gpu_id, "Module", "error msg");     // ERRLEVEL → stderr
ConsoleOutput::GetInstance().PrintDebug  (gpu_id, "Module", "debug msg");     // DEBUG

// Системное (без префикса GPU):
ConsoleOutput::GetInstance().PrintSystem("Init", "Starting workspace...");
```

**Важно**: уровень называется `ERRLEVEL` (не `ERROR`) — чтобы не конфликтовать с макросом Windows.

## Формат вывода

```
[ЧЧ:ММ:СС.ммм] [УРОВЕНЬ] [GPU_XX] [Модуль] сообщение
```

| Уровень | Префикс | Поток |
|---------|---------|-------|
| DEBUG | `[DBG]` | stdout |
| INFO | `[INF]` | stdout |
| WARNING | `[WRN]` | stdout |
| ERRLEVEL | `[ERR]` | **stderr** |

Системные сообщения (`gpu_id == -1`) → префикс `[SYSTEM]` вместо `[GPU_XX]`.

## Включение / выключение

```cpp
// Старт/стоп сервиса:
ConsoleOutput::GetInstance().Start();   // в main() при старте
ConsoleOutput::GetInstance().Stop();    // авто в деструкторе

// Глобально:
ConsoleOutput::GetInstance().SetEnabled(true);
bool on = ConsoleOutput::GetInstance().IsEnabled();

// Per-GPU (из configGPU.json, поле is_console):
ConsoleOutput::GetInstance().SetGPUEnabled(gpu_id, true);
bool on = ConsoleOutput::GetInstance().IsGPUEnabled(gpu_id);
```

Внутри: `unordered_set<int> disabled_gpus_` + mutex. Отключённые GPU просто пропускаются в `ProcessMessage`.

## 🚫 ЗАПРЕЩЕНО

- `std::cout`, `std::cerr`, `std::clog`
- `printf(...)`, `fprintf(...)`
- Собственные «форматировщики» консоли

**Исключение**: внутренности самого `ConsoleOutput::ProcessMessage` (там единственный `std::cout`/`std::cerr` на весь проект).

## Почему критично

- 10 GPU × N модулей = хаос без синхронизации.
- Гарантирована атомарность одного сообщения.
- Можно заменить backend (файл, JSON-stream) в **одном** месте.
- Можно отключить per-GPU при отладке одной карты.

## configGPU.json (per-GPU флаги)

```json
{
  "gpus": [
    { "id": 0, "is_console": true,  "is_prof": true, "is_log": true  },
    { "id": 2, "is_console": false, "is_prof": true, "is_log": false }
  ]
}
```
