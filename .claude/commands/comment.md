---
description: Добавить header-комменты и inline-смысловые комменты в C++ файлы DSP-GPU по утверждённому формату (human → doxygen → object)
---

Добавь header-комменты в файлы: $ARGUMENTS

Если аргумент не указан — спроси у пользователя.

## 📌 Источник истины

Формат жёстко зафиксирован в:

- **`MemoryBank/specs/Header_Comment_Format_Plan_2026-05-01.md`** — полная спека (Q1–Q5 утверждены Alex 2026-05-01)
- **`.claude/rules/14-cpp-style.md`** — раздел «Header comments»

Эталоны (после Phase B `core/`):

1. `core/include/core/services/scoped_hip_event.hpp` — RAII move-only
2. `core/include/core/services/profiling/profiling_facade.hpp` — Singleton + async
3. `core/include/core/services/buffer_set.hpp` — Template
4. `core/include/core/interface/i_gpu_operation.hpp` — Interface

---

## 🎯 Принципы (5 утверждённых)

1. **Язык:** русский (как `OUTPUT_LANGUAGE = Russian` в Doxyfile).
2. **История:** ровно **2 строки** — `Создан: <дата>` + `Изменён: <дата> (что поменяли)`. Промежуточные правки — в `git log`, не в шапку.
3. **`.cpp` не дублирует doxygen:** doxygen-теги один раз в `.hpp`. В `.cpp` — только смысловой `//` блок над impl + section dividers.
4. **Inline — только где код сам не объясняет «почему».** Не комментировать тривиальное (`int n = data.size(); // размер data` ← шум).
5. **Раскатка по репо поэтапно** (core → spectrum → stats → ...).

---

## 🧱 Что значит «смысловые комментарии»

❌ Шум (очевидно из кода):
```cpp
int n;             // переменная n
i++;               // инкремент i
void Process();    // метод Process
```

✅ Три вопроса — **ЧТО** (если неочевидно) + **ЗАЧЕМ** + **ПОЧЕМУ именно так**:
```cpp
// ROCm освобождаем ПЕРВЫМ — намеренный порядок!
// ZeroCopyBridge импортирует cl_mem в HIP: сначала разрушить OpenCL →
// HIP получит dangling pointer → use-after-free в драйвере.
rocm_->Cleanup();
```

---

## Алгоритм

### Шаг 1 — определи область по аргументу

DSP-GPU = **10 репозиториев**. Аргумент = имя репо или путь.

| Аргумент | Папка | Что трогать |
|----------|-------|-------------|
| `core` | `core/include/core/` + `core/src/` | публичные `.hpp` + смысловые блоки в `.cpp` |
| `spectrum`, `stats`, `signal_generators`, `heterodyne`, `linalg`, `radar`, `strategies` | `{repo}/include/dsp/{repo}/` + `{repo}/src/` | то же |
| полный путь к файлу | файл напрямую | только этот файл |

Если аргумент не подходит ни под одно правило — спроси Alex.

### Шаг 2 — прочитай контекст модуля

- `{repo}/CLAUDE.md` — короткая специфика репо (~40 строк).
- `{repo}/Doc/Full.md` или `Quick.md` — пайплайн модуля.
- `MemoryBank/specs/Header_Comment_Format_Plan_2026-05-01.md` — формат.

Цель — понять роль класса в pipeline ЦОС, ловушки, нюансы.

### Шаг 3 — Read + анализ ПЕРЕД правкой

**Обязательно прочитай файл полностью**, потом составь мысленный список:

- Что уже прокомментировано (хорошо или поверхностно)?
- Что вообще не прокомментировано, но должно быть?
- Есть ли устаревшие/неверные комментарии?
- Соответствует ли существующая шапка новому формату? Если да (полностью) — не трогать. Если нет — переписать целиком.

Только после анализа — редактируй.

### Шаг 4 — применить формат

См. раздел «Правила комментирования» ниже.

---

## 📐 Правила комментирования

### A. `.hpp` с публичным API (класс / структура / template / свободная функция)

**Трёхчастный формат: human → doxygen → object.**

#### A.1. Шапка файла + класс

```cpp
#pragma once

// ============================================================================
// ScopedHipEvent — RAII-обёртка над hipEvent_t (exception-safe)
//
// ЧТО:    Владеет hipEvent_t, гарантирует hipEventDestroy в деструкторе.
//         Move-only: копирование запрещено, перемещение передаёт владение.
//
// ЗАЧЕМ:  В hot-path GPU-модулей (FFT, filters, lch_farrow, heterodyne)
//         событиями профилируются 3-6 стадий подряд. Если между
//         hipEventCreate и последним hipEventDestroy что-то бросает
//         (hipfftExecC2C, kernel launch, runtime_error) — события утекают.
//
// ПОЧЕМУ: RAII вместо ручного hipEventDestroy → exception-safe.
//         Move-only → нельзя случайно скопировать handle (double-free).
//         Без виртуальных методов → zero overhead vs голый hipEvent_t.
//
// Использование:
//   drv_gpu_lib::ScopedHipEvent ev_up_s, ev_up_e;
//   ev_up_s.CreateOrThrow();
//   ev_up_e.CreateOrThrow();
//   hipEventRecord(ev_up_s.get(), stream);
//   UploadData(...);
//   hipEventRecord(ev_up_e.get(), stream);
//   // При исключении выше — события корректно освобождаются.
//
// История:
//   - Создан:  2026-04-14 (в spectrum, namespace fft_processor)
//   - Изменён: 2026-04-15 (перенесён в core/services, namespace drv_gpu_lib)
// ============================================================================

#if ENABLE_ROCM

#include <hip/hip_runtime.h>

namespace drv_gpu_lib {

/**
 * @class ScopedHipEvent
 * @brief RAII-обёртка над hipEvent_t — гарантирует hipEventDestroy при выходе из scope.
 *
 * @note Move-only. Не thread-safe (один event = один владелец).
 * @note Требует #if ENABLE_ROCM — отсутствует в CPU-only сборках.
 * @see drv_gpu_lib::ScopedProfileTimer
 */
class ScopedHipEvent {
    ...
};

}  // namespace drv_gpu_lib

#endif  // ENABLE_ROCM
```

**Жёсткие правила:**

- Один файл = один header-блок `// ====` сверху + один `/** @class */` блок прямо над классом.
- `// ЧТО / ЗАЧЕМ / ПОЧЕМУ` — три обязательных раздела по 1–4 строки каждый.
- `Использование:` — короткий пример 3–7 строк.
- `История:` — ровно 2 строки (`Создан:` + `Изменён:`).
- Doxygen-блок — короткий: `@class`, `@brief` (одна строка), `@note` (move-only / thread-safe / requires ENABLE_ROCM), `@see`, `@deprecated` если нужен.
- `@author` / `@date` / `@file` — **не нужны** (информация уже в шапке + git blame).

#### A.2. Метод в `.hpp`

```cpp
    // ZAЧЕМ + ловушки для caller'а:
    // Повторный Create() сначала уничтожит старое событие — безопасно вызывать
    // в горячем цикле без ручной очистки. НЕ thread-safe — один владелец.

    /**
     * @brief Создать hipEvent_t (повторный вызов уничтожает старое).
     * @return hipError_t из hipEventCreate (hipSuccess при успехе).
     */
    hipError_t Create();
```

- Смысловой `//` блок над методом — только если `@brief` сам не покрывает «почему».
- Простые геттеры (`get()`, `valid()`) — можно без блока, только `///` после поля или однострочный `@brief`.

#### A.3. Свободная функция / namespace-утилита

Тот же формат: `// ЗАЧЕМ` → `/** @brief @param @return */`. Шапку файла-ниже ставим в виде `// ============ namespace_utils — [роль]` (как для класса).

### B. `.hpp` чисто-технический (forward decl / private detail / typedef-only)

Если в файле нет публичного API (нет классов, функций, шаблонов с публичной семантикой) — допустим **минимум**:

```cpp
#pragma once

/**
 * @file detail_internal.hpp
 * @brief Forward declarations для core/services. Внутреннее использование.
 */

namespace drv_gpu_lib::detail {
    class Worker;
}
```

Без `// ====` человеческой шапки. Indexer таких файлов в RAG почти не встречает.

### C. `.cpp` файлы реализации — смысл + dividers, БЕЗ дублирования doxygen

```cpp
#include "core/services/scoped_hip_event.hpp"

namespace drv_gpu_lib {

// ════════════════════════════════════════════════════════════════════════════
// Создание / уничтожение событий
// ════════════════════════════════════════════════════════════════════════════

// Повторный вызов: сначала уничтожаем старое (если valid), потом создаём новое.
// Это намеренно — упрощает использование в hot-loop без ручной очистки.
hipError_t ScopedHipEvent::Create() {
    if (event_) {
        hipEventDestroy(event_);
        event_ = nullptr;
    }
    return hipEventCreate(&event_);
}

}  // namespace drv_gpu_lib
```

**Жёсткие правила для `.cpp`:**

- ❌ **НЕ дублировать** `/** @brief @param @return */` блоки — они уже в `.hpp`.
- ✅ Над impl каждого нетривиального метода — короткий `//` блок: «почему так, ловушки, порядок».
- ✅ Section dividers `// ════════` перед группой логически связанных методов.
- ✅ Inline-комменты внутри тела — только где код не объясняет «почему».
- Простые методы (1–3 строки) — без блока, читаются сами.

### D. Inline-комменты внутри функций

**Критерий:** если убрать коммент, поймёт ли senior через 3 месяца **почему** так? Если да → не пишем. Если нет → пишем 1–3 строки.

❌ НЕ комментировать (тривиально):
```cpp
int n = data.size();           // размер data
for (int i = 0; i < n; ++i) {  // цикл по i
    result[i] = data[i] * 2;   // умножаем на 2
}
```

✅ Комментировать (порядок / единицы / ловушки / магия):
```cpp
// ROCm освобождаем ПЕРВЫМ — намеренный порядок:
// ZeroCopyBridge держит cl_mem импортированным в HIP. Если сначала разрушить
// OpenCL — HIP получит dangling pointer → use-after-free в драйвере.
rocm_->Cleanup();
opencl_->Cleanup();

// delay_us — МИКРОСЕКУНДЫ (не секунды!): API контракт со стороны Python.
float tau_sec = delay_us * 1e-6f;

// 256 threads/block — оптимум для warp=64 на RDNA4:
// < 256 → idle threads, > 256 → register spill.
constexpr int kBlockSize = 256;

// hipfftExecC2C может бросить — события созданы выше через ScopedHipEvent,
// RAII освободит при stack unwind. НЕ ставить голый hipEventDestroy.
hipfftExecC2C(plan, in, out, HIPFFT_FORWARD);
```

### E. Поля класса

```cpp
private:
    hipEvent_t event_ = nullptr;  ///< Владеемое событие; nullptr = invalid (после move/Release).
```

Trivial поля без особого смысла — без коммента.

---

## 🚫 Что НЕ делать

- ❌ Не дублировать doxygen в `.cpp` (он один раз в `.hpp`).
- ❌ Не писать `@author` / `@date` / `@file` в шапке класса (избыточно).
- ❌ Не вести milestone-историю в шапке (только `Создан` + `Изменён`).
- ❌ Не комментировать каждую строку — только нетривиальные.
- ❌ Не менять сам код — только комменты.
- ❌ Не оставлять старые шапки в перемешанном формате (либо весь блок по новому формату, либо не трогаем).

## ✅ Что трогать / что нет

| | Трогать |
|--|--|
| ✅ | `.hpp` публичные классы/структуры/template/функции — переписать шапку и Doxygen-блок целиком |
| ✅ | `.cpp` — добавить section dividers + смысловые `//` блоки над сложными методами + inline где «почему» неочевидно |
| ✅ | Дополнить существующие комменты если поверхностные |
| ✅ | Исправить устаревшие комменты если не соответствуют коду |
| ❌ | Менять сам код |
| ❌ | Doxyfile / HTML-генерацию (это `doxygen-maintainer`) |
| ❌ | Markdown-доки `Doc/Full.md` / `Quick.md` (это `module-doc-writer`) |
| ❌ | Python docstrings (отдельная спека после Phase E) |

---

## 📤 После работы

Кратко сообщи:

- Сколько файлов обработано (`.hpp` / `.cpp`).
- Если переписывал старые шапки — какие.
- Самые важные нюансы которые добавил (ловушки, порядки, единицы).
- Готов к review Alex'ом.
