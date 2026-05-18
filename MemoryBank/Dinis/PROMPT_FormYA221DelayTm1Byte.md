# PROMPT — `FormYA221DelayTm1Byte`

C++17 header-only, `std::unordered_map`, **минимум runtime `if`**.
Все комментарии и сообщения диагностики (`static_assert`, `[[deprecated]]`) —
на русском.

---

## Что есть (исходник заказчика)

```cpp
unsigned char FormYA221DelayTm1Bite( const YA221CtrlSettings & ctrlYA221 )
{
    unsigned char cmd = 0x00; //!< Default state.

    if ( YA221Param3State::IMITYA221Pp == ctrlYA221.m_imitMode )      cmd = 0x01;
    else if ( YA221Param3State::IMITYA221Pi == ctrlYA221.m_imitMode ) cmd = 0x02;

    return cmd;
}
```

Цепочка `if / else if` растёт линейно с числом режимов (план — до ~2000),
ключи и значения вшиты в код, имя содержит опечатку (`Bite`), нет защиты
от дубликатов и `cmd == 0x00`.

---

## Что нужно

Сигнатура:

```cpp
[[nodiscard]]
std::uint8_t FormYA221DelayTm1Byte(const YA221CtrlSettings & ctrlYA221) noexcept;
```

Те же два режима + типичная разрежённость переезжают **как данные** в
`kSource`:

```cpp
inline constexpr ModeCmd kSource[] = {
    { YA221Param3State::IMITYA221Pp,            0x01 }, // <ТУ ЯА221, режим Pp>
    { YA221Param3State::IMITYA221Pi,            0x02 }, // <ТУ ЯА221, режим Pi>
    { static_cast<YA221Param3State>(  100),     0x04 }, // placeholder, ключи РАЗРЕЖЁННЫЕ
    { static_cast<YA221Param3State>(  220),     0x05 },
    { static_cast<YA221Param3State>( 1501),     0x07 },
    // ... до ~2000 записей, добавление = одна строка.
};
```

Типы (заданы, `IMITYA221Pp/Pi` — из исходника, остальные — по ТУ):

```cpp
enum class YA221Param3State : std::uint16_t {
    IMITYA221Pp = 1,
    IMITYA221Pi = 2,
    // ... добавляются по ТУ ЯА221.
};
struct YA221CtrlSettings { YA221Param3State m_imitMode; };
```

---

## Требования

1. **Контейнер** — `std::unordered_map<YA221Param3State, std::uint8_t>`,
   глобальный `inline const`-объект в `namespace Sau::Drv::detail`,
   заполняется из `kSource` (с `reserve(std::size(kSource))` до вставок).
2. **0 runtime `if` при инициализации**: три инварианта `kSource`
   (непустота, `cmd != kDefault`, уникальность `mode`) проверяются
   `static_assert`'ами поверх `constexpr`-функций с ручными циклами
   (`<algorithm>` в C++17 не `constexpr`).
3. **Lookup — ровно 1 `if`**: `find()` + тернарник на `end()`.
   Никаких `count + at`, `try / catch`, повторных поисков.
4. Функция: `[[nodiscard]]`, `noexcept` (рядом комментарий, почему не
   бросает); **без** `constexpr` (`std::unordered_map` не constexpr).
5. `[[deprecated("…")]] FormYA221DelayTm1Bite(...)` — алиас, делегирует
   в новое имя. Сообщение указывает на `Byte`.
6. Namespace `Sau::Drv`; `kSource`, `kDefault = 0x00`, lookup-таблица,
   helper'ы валидации — в `Sau::Drv::detail`. Каждая запись `kSource`
   снабжена комментарием со ссылкой на спеку (`<ТУ ЯА221.xxx, …>`).
7. Сборка с `-std=c++17 -O3 -Wall -Wextra -Wpedantic` — без warning'ов.

---

## Запрещено

- `try / catch / throw`, RTTI, `#define` (кроме `#pragma once`).
- `std::map` / любой другой ассоциативный контейнер.
- Защитный `if (e.cmd != kDefault)` или `if (!ok) abort()` при заполнении
  таблицы — инварианты уже отрезаны `static_assert`'ом.
- `count + at`, `try / catch` в lookup.
- `<algorithm>` в `constexpr`-проверках.
- `std::cout` / `std::cerr` в production-коде.

---

## Сдать

1. `form_ya221_delay_tm1_byte.hpp` — реализация.
2. `README.md` — сборка + заполненный чек-лист (13 пунктов из требований
   и запрещённого выше, формат «✅ / ❌ / N/A» + строка обоснования при
   `❌`).
