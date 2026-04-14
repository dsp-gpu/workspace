# 🚧 IN PROGRESS — Фаза 4: Тестирование на GPU

**Начато**: 2026-04-14
**Текущий репо**: `core`
**Координатор**: `workflow-coordinator`

---

## 🎯 Цель фазы 4

Собрать и протестировать 8 репо DSP-GPU на Linux + AMD Radeon 9070 (gfx1201) + ROCm 7.2.
Начинаем с `core`, отлаживаем весь pipeline на нём, потом применяем тот же шаблон к остальным 7 репо по одному.

---

## 📝 План работ (core — первый на отладку)

### Этап 1 — Убрать лишний слой `/dsp/` из include
**Исполнитель**: `fix-agent`
**Статус**: ⏳ in_progress

1. `git mv core/include/dsp/ core/include/core/` (сохраняем историю)
2. Массовая правка во всех `.cpp`/`.hpp`:
   - `#include <dsp/services/gpu_profiler.hpp>` → `#include <core/services/gpu_profiler.hpp>`
   - `#include "dsp/..."` → `#include "core/..."`
   - Аналогично для относительных (`"../interface/i_backend.hpp"` → `"interface/i_backend.hpp"` остаются)
3. CMake (⏸ **требует OK Alex через DIFF-preview**):
   - `$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include/dsp>` → **удалить** (костыль)
   - `$<INSTALL_INTERFACE:include/dsp>` → `$<INSTALL_INTERFACE:include/core>`
4. Build verify: `cmake --build build --parallel 32`

### Этап 2 — Logger: PIMPL + Factory (SOLID/GoF)
**Исполнитель**: `fix-agent` + ручная правка
**Статус**: ⏸ pending (после этапа 1 и build)

1. Создать **фабрику** `core/include/core/logger/logger_factory.hpp`:
   ```cpp
   class LoggerFactory {
   public:
     static ILoggerPtr CreateDefault(int gpu_id);
   };
   ```
2. Переместить `default_logger.hpp` → `core/src/logger/` (приватный header, не публикуется)
3. Применить **PIMPL** в `default_logger.hpp`:
   - Убрать `#include <plog/...>` из заголовка
   - Добавить `class Impl; std::unique_ptr<Impl> impl_;`
4. `default_logger.cpp` — plog живёт только здесь, в классе `Impl`
5. CMake (⏸ **OK Alex**):
   - Добавить `PRIVATE third_party/plog/include`
6. Build verify

### Этап 3 — Тесты core
**Исполнитель**: `test-agent`
**Статус**: ⏸ pending

1. Прочитать тесты в `core/tests/`
2. Адаптировать include пути (после переименования `/dsp/` → `/core/`)
3. Запустить `ctest --preset debian-local-dev --output-on-failure`

### Этап 4 — Документация core
**Исполнитель**: `doc-agent`
**Статус**: ⏸ pending

1. Full/Quick/API.md для core
2. `git add Doc/ && git commit` (локально)
3. `git push` — **только по OK Alex**

---

## 🗺️ После core — остальные 7 репо по графу

Отладив pipeline на `core`, применяем то же (Этапы 1 → 4) **по одному**:

```
spectrum → stats → signal_generators → linalg → heterodyne → radar → strategies → DSP
```

**Не параллелим** — Alex решил «сначала один отладим, потом остальные».

---

## ✅ Договорённости

- `/dsp/` **убираем везде** (все 8 репо) — стандарт AMD `hipfft/hipfft.h`
- Logger — **PIMPL + Factory** (клиенты видят только `ILogger` + фабрику, plog невидим снаружи)
- Third_party (plog, nlohmann, pocketfft) — локально в каждом репо где нужно, PRIVATE include_dir
- CMake правки — **только через DIFF-preview + OK Alex**
- `git mv` вместо `cp + rm` — сохраняем историю
- `git push` / `git tag` — **только после OK Alex**

---

## 📊 Прогресс

| Репо | Этап 1 /dsp/ | Этап 2 logger | Этап 3 test | Этап 4 doc |
|------|:---:|:---:|:---:|:---:|
| core | ⏳ | ⏸ | ⏸ | ⏸ |
| spectrum | ⏸ | — | ⏸ | ⏸ |
| stats | ⏸ | — | ⏸ | ⏸ |
| signal_generators | ⏸ | — | ⏸ | ⏸ |
| linalg | ⏸ | — | ⏸ | ⏸ |
| heterodyne | ⏸ | — | ⏸ | ⏸ |
| radar | ⏸ | — | ⏸ | ⏸ |
| strategies | ⏸ | — | ⏸ | ⏸ |
| DSP (мета) | ⏸ | — | ⏸ | ⏸ |

Этап 2 (logger) нужен только для `core` — в остальных репо нет своего логгера.

---

*Обновлено: 2026-04-14 | Кодо*
