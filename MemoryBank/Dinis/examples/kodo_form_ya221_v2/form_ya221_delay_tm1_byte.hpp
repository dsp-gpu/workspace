#pragma once

// ============================================================================
// FormYA221DelayTm1Byte — таблица «режим имитации → команда задержки Tm1».
//
// Заменяет цепочку `if / else if` из исходника заказчика
// (FormYA221DelayTm1Bite) data-driven подходом: режимы и команды лежат в
// `kSource`, а runtime-доступ — через одну `std::unordered_map`.
//
// Инварианты `kSource` (непустой, нет cmd == kDefault, нет дубликатов mode)
// проверяются `static_assert`'ами поверх constexpr-функций с ручными циклами —
// без `<algorithm>`, потому что в C++17 он не constexpr.
// ============================================================================

#include <cstddef>
#include <cstdint>
#include <iterator>
#include <type_traits>
#include <unordered_map>

namespace Sau::Drv {

// Состояние режима имитации ЯА221 (по ТУ ЯА221).
// IMITYA221Pp / IMITYA221Pi взяты из исходника заказчика; остальные значения
// добавляются по ТУ как «строка в kSource + строка в enum (опционально)».
enum class YA221Param3State : std::uint16_t {
    IMITYA221Pp = 1,
    IMITYA221Pi = 2,
    // ... добавляются по ТУ ЯА221.
};

// Управляющие настройки ЯА221 — повторяют ABI исходника заказчика.
struct YA221CtrlSettings {
    YA221Param3State m_imitMode;
};

namespace detail {

// Команда «не найдено» (как в исходнике cmd = 0x00 при default-ветке).
// kSource не должен содержать этот код в качестве полезного значения,
// иначе lookup не сможет отличить «найдено» от «не найдено».
inline constexpr std::uint8_t kDefault = 0x00;

// Пара «режим → команда задержки Tm1» в исходных данных.
struct ModeCmd {
    YA221Param3State mode;
    std::uint8_t     cmd;
};

// Источник правды для таблицы. Добавление режима = одна строка.
// Ключи специально оставлены РАЗРЕЖЁННЫМИ — это нормальный кейс для ТУ.
inline constexpr ModeCmd kSource[] = {
    { YA221Param3State::IMITYA221Pp,            0x01 }, // <ТУ ЯА221, режим Pp>
    { YA221Param3State::IMITYA221Pi,            0x02 }, // <ТУ ЯА221, режим Pi>
    { static_cast<YA221Param3State>(  100),     0x04 }, // <ТУ ЯА221.100, placeholder>
    { static_cast<YA221Param3State>(  220),     0x05 }, // <ТУ ЯА221.220, placeholder>
    { static_cast<YA221Param3State>( 1501),     0x07 }, // <ТУ ЯА221.1501, placeholder>
    // ... до ~2000 записей по ТУ ЯА221.
};

// --- Compile-time проверки инвариантов kSource --------------------------------
// Ручные циклы вместо `<algorithm>`: в C++17 std::find_if / std::adjacent_find
// не constexpr. Все три функции вызываются только в static_assert ниже,
// в runtime не попадают.

// Инвариант 1: таблица не пуста (иначе модуль ничего не умеет).
constexpr bool kSourceNonEmpty() noexcept {
    return std::size(kSource) > 0;
}

// Инвариант 2: ни одна запись не имеет cmd == kDefault. Иначе при lookup
// «нашли запись со значением 0x00» совпадает с «не нашли вовсе».
constexpr bool kSourceNoDefaultCmd() noexcept {
    for (std::size_t i = 0; i < std::size(kSource); ++i) {
        if (kSource[i].cmd == kDefault) {
            return false;
        }
    }
    return true;
}

// Инвариант 3: все mode уникальны. Иначе порядок вставки в unordered_map
// решает, какая команда «победит», что превращает таблицу в недетерминизм.
constexpr bool kSourceUniqueModes() noexcept {
    for (std::size_t i = 0; i < std::size(kSource); ++i) {
        for (std::size_t j = i + 1; j < std::size(kSource); ++j) {
            if (kSource[i].mode == kSource[j].mode) {
                return false;
            }
        }
    }
    return true;
}

static_assert(kSourceNonEmpty(),
              "kSource must be non-empty");
static_assert(kSourceNoDefaultCmd(),
              "kSource: cmd == kDefault collides with 'not found' branch");
static_assert(kSourceUniqueModes(),
              "kSource: duplicate mode keys break deterministic lookup");

// --- Runtime lookup-таблица ---------------------------------------------------

using ModeCmdMap = std::unordered_map<YA221Param3State, std::uint8_t>;

// Сборка таблицы из kSource. Никаких runtime `if` при заполнении: инварианты
// уже отрезаны static_assert'ом, значит emplace всегда уникален и cmd != 0x00.
inline ModeCmdMap BuildModeCmdMap() {
    ModeCmdMap m;
    m.reserve(std::size(kSource));
    for (const auto & e : kSource) {
        m.emplace(e.mode, e.cmd);
    }
    return m;
}

// Глобальная неизменяемая таблица. `inline const` — одна копия на программу,
// безопасно для header-only в нескольких TU.
inline const ModeCmdMap kModeCmd = BuildModeCmdMap();

} // namespace detail

// ----------------------------------------------------------------------------
// Публичное API
// ----------------------------------------------------------------------------

// Возвращает команду задержки Tm1 для заданного режима имитации ЯА221.
// Неизвестный режим → kDefault (0x00), как и в исходнике заказчика.
//
// noexcept: единственный возможный источник исключения — аллокация в
// хэш-функции, но std::hash<enum> сводится к hash<integral> и аллокаций не
// делает; std::unordered_map::find на const-таблице тоже не бросает.
[[nodiscard]]
inline std::uint8_t FormYA221DelayTm1Byte(const YA221CtrlSettings & ctrlYA221) noexcept {
    const auto it = detail::kModeCmd.find(ctrlYA221.m_imitMode);
    return (it != detail::kModeCmd.end()) ? it->second : detail::kDefault;
}

// Старое имя из исходника заказчика (опечатка Bite вместо Byte). Оставлен
// исключительно для совместимости с уже написанным вызывающим кодом.
[[deprecated("FormYA221DelayTm1Bite is a typo, use FormYA221DelayTm1Byte instead")]]
[[nodiscard]]
inline std::uint8_t FormYA221DelayTm1Bite(const YA221CtrlSettings & ctrlYA221) noexcept {
    return FormYA221DelayTm1Byte(ctrlYA221);
}

} // namespace Sau::Drv
