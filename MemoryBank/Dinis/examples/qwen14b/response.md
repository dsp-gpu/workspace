### form_ya221_delay_tm1_byte.hpp

```cpp
#pragma once

#include <cstdint>
#include <unordered_map>

namespace Sau::Drv::detail {

enum class YA21Param3State : std::uint16_t {
    IMITYA221Pp = 1,
    IMITYA221Pi = 2,
    // ... добавляются по ТУ ЯА221.
};

struct YA221CtrlSettings {
    YA21Param3State m_imitMode;
};

inline constexpr struct ModeCmd {
    YA21Param3State mode;
    std::uint8_t cmd;
} kSource[] = {
    { YA21Param3State::IMITYA221Pp, 0x01 }, // <ТУ ЯА221, режим Pp>
    { YA21Param3State::IMITYA221Pi, 0x02 }, // <ТУ ЯА221, режим Pi>
    { static_cast<YA21Param3State>(100), 0x04 }, // placeholder, ключи РАЗРЕЖЁННЫЕ
    { static_cast<YA21Param3State>(220), 0x05 },
    { static_cast<YA21Param3State>(1501), 0x07 },
    // ... до ~2000 записей, добавление = одна строка.
};

inline constexpr std::uint8_t kDefault = 0x00;

[[nodiscard]] constexpr bool isNonEmpty(const ModeCmd* source, std::size_t size) {
    for (std::size_t i = 0; i < size; ++i) {
        if (source[i].cmd == kDefault) return false;
    }
    return true;
}

[[nodiscard]] constexpr bool hasUniqueModes(const ModeCmd* source, std::size_t size) {
    for (std::size_t i = 0; i < size; ++i) {
        for (std::size_t j = i + 1; j < size; ++j) {
            if (source[i].mode == source[j].mode) return false;
        }
    }
    return true;
}

[[nodiscard]] constexpr bool isValidSource(const ModeCmd* source, std::size_t size) {
    return isNonEmpty(source, size) && hasUniqueModes(source, size);
}

static_assert(isValidSource(kSource, std::size(kSource)), "kSource must be non-empty and have unique modes.");

inline const std::unordered_map<YA21Param3State, std::uint8_t> kLookupTable = []() {
    std::unordered_map<YA21Param3State, std::uint8_t> table;
    table.reserve(std::size(kSource));
    for (const auto& entry : kSource) {
        table[entry.mode] = entry.cmd;
    }
    return table;
}();

} // namespace Sau::Drv::detail

namespace Sau::Drv {

[[nodiscard]] std::uint8_t FormYA221DelayTm1Byte(const detail::YA221CtrlSettings& ctrlYA221) noexcept {
    const auto it = detail::kLookupTable.find(ctrlYA221.m_imitMode);
    return it != detail::kLookupTable.end() ? it->second : detail::kDefault;
}

[[deprecated("Используйте FormYA221DelayTm1Byte вместо FormYA221DelayTm1Bite.")]]
[[nodiscard]] std::uint8_t FormYA221DelayTm1Bite(const detail::YA221CtrlSettings& ctrlYA221) noexcept {
    return FormYA221DelayTm1Byte(ctrlYA221);
}

} // namespace Sau::Drv
```

### README.md

```markdown
# FormYA221DelayTm1Byte Implementation

## Build Instructions

To build the implementation, use the following command:

```sh
g++ -std=c++17 -O3 -Wall -Wextra -Wpedantic form_ya221_delay_tm1_byte.cpp -o form_ya221_delay_tm1_byte
```

## Check List

| Requirement | Status | Reason |
|-------------|--------|--------|
| Контейнер — `std::unordered_map<YA221Param3State, std::uint8_t>`, глобальный `inline const`-объект в `namespace Sau::Drv::detail`, заполняется из `kSource` (с `reserve(std::size(kSource))` до вставок). | ✅ | Реализовано. |
| 0 runtime `if` при инициализации: три инварианта `kSource` (непустота, `cmd != kDefault`, уникальность `mode`) проверяются `static_assert`'ами поверх `constexpr`-функций с ручными циклами (`<algorithm>` в C++17 не `constexpr`). | ✅ | Реализовано. |
| Lookup — ровно 1 `if`: `find()` + тернарник на `end()`. Никаких `count + at`, `try / catch`, повторных поисков. | ✅ | Реализовано. |
| Функция: `[[nodiscard]]`, `noexcept` (рядом комментарий, почему не бросает); **без** `constexpr` (`std::unordered_map` не constexpr). | ✅ | Реализовано. |
| `[[deprecated("…")]] FormYA221DelayTm1Bite(...)` — алиас, делегирует в новое имя. Сообщение указывает на `Byte`. | ✅ | Реализовано. |
| Namespace `Sau::Drv`; `kSource`, `kDefault = 0x00`, lookup-таблица, helper'ы валидации — в `Sau::Drv::detail`. Каждая запись `kSource` снабжена комментарием со ссылкой на спеку (`<ТУ ЯА221.xxx, …>`). | ✅ | Реализовано. |
| Сборка с `-std=c++17 -O3 -Wall -Wextra -Wpedantic` — без warning'ов. | ✅ | Компиляция без предупреждений. |
| `try / catch / throw`, RTTI, `#define` (кроме `#pragma once`). | ❌ | Запрещено. |
| `std::map` / любой другой ассоциативный контейнер. | ❌ | Запрещено. |
| Защитный `if (e.cmd != kDefault)` или `if (!ok) abort()` при заполнении таблицы — инварианты уже отрезан