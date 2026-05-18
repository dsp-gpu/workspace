// =============================================================================
//  ya221_demo.cpp  --  версия с std::unordered_map (по запросу пользователя)
//
//  ВНИМАНИЕ: это регрессия по сравнению с sorted+binary версией:
//    Память     : 12 байт .rodata   ->  ~250-400 байт heap
//    Lookup     : ~9 ns             ->  ~25-30 ns
//    constexpr  : да                 ->  нет (heap allocator несовместим)
//    static_assert проверки: да      ->  заменены на runtime abort()
//    Embedded   : OK                 ->  ТРЕБУЕТ heap (часто запрещено)
//    Static init fiasco: нет         ->  есть риск при cross-TU зависимостях
//
//  Сборка:
//    g++ -std=c++17 -O3 -march=native -DNDEBUG ya221_demo.cpp -o ya221_demo
// =============================================================================
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <iterator>
#include <random>
#include <unordered_map>
#include <vector>

// --- Моки объявлений проекта ------------------------------------------------
enum class YA221Param3State : std::uint16_t {};
struct YA221CtrlSettings { YA221Param3State m_imitMode; };

// =============================================================================
//  Реальный код функции
// =============================================================================
namespace Sau::Drv {
namespace detail {

struct YA221ImitToCmd { YA221Param3State mode; std::uint8_t cmd; };

// Источник истины. Остаётся constexpr -- инструментально пригоден,
// и в kMap копируется только при инициализации.
inline constexpr YA221ImitToCmd kSource[] = {
    { static_cast<YA221Param3State>(1),     0x01 },
    { static_cast<YA221Param3State>(100),   0x04 },
    { static_cast<YA221Param3State>(10000), 0x09 },
    // ... остальные ваши записи
};
inline constexpr std::uint8_t kDefault = 0x00;

// std::unordered_map не может быть constexpr (heap allocator).
// Конструируется при инициализации программы (до main()).
// Если эта переменная читается из другого global initializer'а в чужом TU,
// есть риск static initialization order fiasco -- используйте Meyers'
// singleton в таком случае.
inline const std::unordered_map<YA221Param3State, std::uint8_t> kMap = []{
    std::unordered_map<YA221Param3State, std::uint8_t> m;
    m.reserve(std::size(kSource));     // избегаем rehash при заполнении
    for (const auto& e : kSource) {
        // Те проверки, что раньше были static_assert, теперь -- runtime abort
        if (e.cmd == kDefault)             std::abort();   // value == default
        auto [it, ok] = m.emplace(e.mode, e.cmd);
        (void)it;
        if (!ok)                           std::abort();   // duplicate key
    }
    if (m.empty())                         std::abort();   // empty source
    return m;
}();

} // namespace detail

// noexcept здесь -- контракт "если бросит, программа завершится".
// std::unordered_map::find не noexcept, но для enum-ключа с std::hash
// (тривиальный hash) и без аллокаций на чтение -- фактически не бросает.
[[nodiscard]]
std::uint8_t FormYA221DelayTm1Byte(const YA221CtrlSettings & ctrlYA221) noexcept {
    const auto it = detail::kMap.find(ctrlYA221.m_imitMode);
    return (it != detail::kMap.end()) ? it->second : detail::kDefault;
}

[[deprecated("Typo: use FormYA221DelayTm1Byte (Bite -> Byte)")]]
std::uint8_t FormYA221DelayTm1Bite(const YA221CtrlSettings & c) noexcept {
    return FormYA221DelayTm1Byte(c);
}

} // namespace Sau::Drv


// =============================================================================
//  Демонстрация
// =============================================================================
using Sau::Drv::FormYA221DelayTm1Byte;
using Sau::Drv::detail::kSource;
using Sau::Drv::detail::kMap;

static void print_lookup(std::uint16_t mode_val, const char * tag) {
    YA221CtrlSettings s{ static_cast<YA221Param3State>(mode_val) };
    auto cmd = FormYA221DelayTm1Byte(s);
    std::printf("  mode = %5u  ->  cmd = 0x%02X  (%u)  [%s]\n",
                mode_val, cmd, cmd, tag);
}

int main() {
    std::printf("===========================================================\n");
    std::printf("  YA221 std::unordered_map lookup demo\n");
    std::printf("===========================================================\n\n");

    std::printf("Память:\n");
    std::printf("  Количество записей      : %zu\n", std::size(kSource));
    std::printf("  Размер kSource (.rodata): %zu байт\n", sizeof(kSource));
    std::printf("  Объект kMap (заголовок) : %zu байт\n", sizeof(kMap));
    std::printf("  Bucket count            : %zu\n", kMap.bucket_count());
    std::printf("  Load factor             : %.3f\n", kMap.load_factor());
    std::printf("  Оценка heap-памяти      : ~%zu байт\n\n",
                kMap.bucket_count() * sizeof(void*)
              + kMap.size() * (sizeof(void*) + sizeof(YA221Param3State)
                              + sizeof(std::uint8_t) + sizeof(std::size_t)));

    std::printf("--- Точки из таблицы ---\n");
    print_lookup(    1, "из таблицы, ожидали 0x01");
    print_lookup(  100, "из таблицы, ожидали 0x04");
    print_lookup(10000, "из таблицы, ожидали 0x09");

    std::printf("\n--- Разрывы (должен быть дефолт 0x00) ---\n");
    print_lookup(    0, "до первой записи");
    print_lookup(   50, "между 1 и 100");
    print_lookup(  500, "между 100 и 10000");
    print_lookup( 9999, "ровно перед 10000");
    print_lookup(50000, "за пределами таблицы");

    // --- Бенчмарк -----------------------------------------------------------
    std::printf("\n--- Бенчмарк (10^6 случайных lookup'ов из таблицы) ---\n");
    std::mt19937 rng(42);
    const std::uint16_t keys[] = {1, 100, 10000};
    std::uniform_int_distribution<int> dist(0, 2);

    constexpr std::size_t kQ = 1'000'000;
    std::vector<YA221CtrlSettings> queries; queries.reserve(kQ);
    for (std::size_t i = 0; i < kQ; ++i)
        queries.push_back({ static_cast<YA221Param3State>(keys[dist(rng)]) });

    std::uint64_t sum = 0;
    double best_ns = 1e18;
    for (int r = 0; r < 50; ++r) {
        auto t0 = std::chrono::steady_clock::now();
        for (auto q : queries) sum += FormYA221DelayTm1Byte(q);
        auto t1 = std::chrono::steady_clock::now();
        double ns = std::chrono::duration<double, std::nano>(t1 - t0).count() / kQ;
        if (ns < best_ns) best_ns = ns;
    }
    std::printf("  Время lookup            : %.2f ns  (best of 50 runs)\n", best_ns);
    std::printf("  Контрольная сумма       : %llu\n",
                static_cast<unsigned long long>(sum));

    std::printf("\n--- Compile-time evaluation ---\n");
    std::printf("  constexpr FormYA221DelayTm1Byte(...) -- НЕ ПОДДЕРЖИВАЕТСЯ\n");
    std::printf("  (std::unordered_map не constexpr; lookup всегда runtime)\n");

    std::printf("\n===========================================================\n");
    std::printf("  OK\n");
    std::printf("===========================================================\n");
    return 0;
}
