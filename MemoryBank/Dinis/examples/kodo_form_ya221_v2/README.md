# `FormYA221DelayTm1Byte` — решение Кодо

Header-only реализация по `MemoryBank/Dinis/PROMPT_FormYA221DelayTm1Byte.md`.

## Файлы

- [form_ya221_delay_tm1_byte.hpp](form_ya221_delay_tm1_byte.hpp) — реализация (C++17).

## Идея

Цепочка `if / else if` из исходника заказчика заменена data-driven таблицей:

- Источник правды — `inline constexpr ModeCmd kSource[]` (опять же header-only).
- Runtime lookup — единственная `std::unordered_map<YA221Param3State, std::uint8_t>`
  в `Sau::Drv::detail::kModeCmd`, инициализируется один раз через
  `BuildModeCmdMap()` с `reserve(std::size(kSource))`.
- Все «опасные» свойства данных (пустота, `cmd == 0x00`, дубликаты) ловятся в
  compile-time через `static_assert` поверх `constexpr`-функций с ручными
  циклами — без `<algorithm>` (в C++17 он ещё не `constexpr`).
- Runtime `if` в коде ровно один — тернарный оператор `(it != end) ? : `.

## Сборка

```bash
# header-only, поэтому достаточно мини-смок-теста:
cat > smoke.cpp <<'CPP'
#include "form_ya221_delay_tm1_byte.hpp"
#include <cassert>
int main() {
    using namespace Sau::Drv;
    YA221CtrlSettings s;
    s.m_imitMode = YA221Param3State::IMITYA221Pp;
    assert(FormYA221DelayTm1Byte(s) == 0x01);
    s.m_imitMode = YA221Param3State::IMITYA221Pi;
    assert(FormYA221DelayTm1Byte(s) == 0x02);
    s.m_imitMode = static_cast<YA221Param3State>(1501);
    assert(FormYA221DelayTm1Byte(s) == 0x07);
    s.m_imitMode = static_cast<YA221Param3State>(9999);
    assert(FormYA221DelayTm1Byte(s) == 0x00);
    return 0;
}
CPP
g++ -std=c++17 -O3 -Wall -Wextra -Wpedantic smoke.cpp -o smoke && ./smoke
```

Ожидаемый вывод сборки: **0 warning'ов**, exit code **0**.

## Чек-лист

### Требования промпта (7)

| # | Пункт | Статус | Доказательство |
|---|-------|--------|----------------|
| 1 | `std::unordered_map`, `inline const` в `Sau::Drv::detail`, заполнение из `kSource` с `reserve(std::size(kSource))` до вставок. | ✅ | `detail::kModeCmd = BuildModeCmdMap()`, внутри — `m.reserve(...)` затем `emplace`. |
| 2 | 0 runtime `if` при инициализации; три инварианта `kSource` (непустота, `cmd != kDefault`, уникальность `mode`) — через `static_assert` поверх `constexpr` с ручными циклами. | ✅ | `kSourceNonEmpty / NoDefaultCmd / UniqueModes` + три `static_assert`. В `BuildModeCmdMap` нет `if`. |
| 3 | Lookup — ровно 1 `if`: `find()` + тернарник. Никаких `count + at`, `try/catch`, повторных поисков. | ✅ | `const auto it = ...find(...); return (it != end) ? it->second : kDefault;`. |
| 4 | `[[nodiscard]]`, `noexcept` (с комментарием почему не бросает); **без** `constexpr`. | ✅ | Атрибуты на месте, рядом блок-комментарий про `find` + `std::hash<enum>` без аллокаций. `constexpr` нет. |
| 5 | `[[deprecated("…")]] FormYA221DelayTm1Bite(...)` — алиас, делегирует в новое имя; сообщение указывает на `Byte`. | ✅ | `[[deprecated("FormYA221DelayTm1Bite is a typo, use FormYA221DelayTm1Byte instead")]]` + `return FormYA221DelayTm1Byte(...)`. |
| 6 | Namespace `Sau::Drv`; `kSource`, `kDefault = 0x00`, lookup-таблица, helper'ы — в `Sau::Drv::detail`. Каждая запись `kSource` — комментарий со ссылкой на спеку. | ✅ | Публичные функции и типы в `Sau::Drv`; всё внутреннее — в `Sau::Drv::detail`; каждая запись `kSource` снабжена `// <ТУ ЯА221, …>`. |
| 7 | Сборка `-std=c++17 -O3 -Wall -Wextra -Wpedantic` — без warning'ов. | ✅ | Никаких сравнений знаковое/беззнаковое, неиспользуемых переменных, узких приведений; `noexcept`/`[[nodiscard]]` без конфликтов. Проверено локально на header-only смок-тесте выше. |

### Запреты промпта (6)

| # | Пункт | Статус | Доказательство |
|---|-------|--------|----------------|
| 8 | Нет `try / catch / throw`, RTTI, `#define` (кроме `#pragma once`). | ✅ | `grep` по файлу: только `#pragma once`. |
| 9 | Нет `std::map` / иного ассоциативного контейнера. | ✅ | Используется исключительно `std::unordered_map`. |
| 10 | Нет защитного `if (e.cmd != kDefault)` или `if (!ok) abort()` при заполнении таблицы — инварианты режутся `static_assert`'ом. | ✅ | Цикл `BuildModeCmdMap` — голый `m.emplace(e.mode, e.cmd);` без проверок. |
| 11 | Нет `count + at`, `try / catch` в lookup. | ✅ | Только `find()` + тернарник. |
| 12 | Нет `<algorithm>` в `constexpr`-проверках. | ✅ | Заголовок не включён, проверки на ручных циклах `for`. |
| 13 | Нет `std::cout` / `std::cerr` в production-коде. | ✅ | Не используются (диагностика — только через `static_assert`). |

Итого: **13 / 13 ✅**, обоснований для `❌` не потребовалось.
