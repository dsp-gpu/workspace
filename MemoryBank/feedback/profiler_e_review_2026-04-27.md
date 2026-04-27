# Profiler v2 Phase E — Independent Review (2026-04-27)

> **Reviewer**: deep-reviewer (Кодо)
> **Платформа**: Debian + AMD Radeon RX 9070 (gfx1201) + ROCm 7.2.0
> **Sequential-thinking applied**: 7 thoughts
> **Branch**: `main` (3 локальных коммита, не push'нуты)
> **Commits under review**:
>   - core: `74f16da` Phase E2+E3+E4 (realistic + quality gates + golden tests)
>   - core: `9562b58` migrate test_services.hpp Record path → ProfilingFacade
>   - workspace: `b93fbda` MemoryBank artifacts (sessions/tasks/prompts)

---

## Verdict: **PASS_WITH_NOTES**

4 Low-severity замечаний (потенциальные pitfalls, не блокеры). 0 High/Critical.
Коммиты готовы к `git push origin main` после явного OK Alex.

---

## Обязательные проверки

| # | Проверка | Команда | Результат |
|---|----------|---------|-----------|
| **A** | Сборка чистая | `cmake --build core/build --target test_core_main` | ✅ exit=0, нет `error:` / `FAILED:` |
| **B** | 87/87 PASS | `core/build/tests/test_core_main` | ✅ `[PASS]=87`, `[FAIL]=0`, `exit=0` |
| **C** | Golden compare работает | default → `[PASS] JSON/Markdown matches golden` | ✅ |
| **C** | Golden regenerate работает | `GENERATE_GOLDEN=1` → `[REGENERATED]` обоих файлов | ✅ |
| **C** | После regen — diff только timestamp | `git diff core/tests/golden/` | ✅ JSON: 1 строка timestamp; MD: 1 строка timestamp; больше ничего |
| **D** | 7 dep-репо собираются | `cmake --build {repo}/build` × 7 | ✅ spectrum=0, stats=0, signal_generators=0, heterodyne=0, linalg=0, strategies=0, radar=0 |

После [C] — `git checkout tests/golden/` восстановил оригинальные файлы.

---

## Замеры Quality Gates (из живого прогона)

| Gate | Замер | Норма | Запас |
|------|------:|------:|-------|
| **G8** Record() avg latency | **212 ns** (5000 iter) | < 1000 ns | ×4.7 |
| **G9** TotalBytesEstimate(100K) | **24.8 MB** | < 200 MB | ×8 |
| **G10** ComputeSummary(10K) | **< 1 ms** | < 500 ms | ×500 |

Все три гейта зелёные с двойным/большим запасом. Никакой деградации
относительно baseline (Phase A0.5: 307 ns G8) — наоборот, чуть лучше.

---

## Issues найденные (все Low)

| Severity | Commit | File:Line | Issue | Suggested fix |
|----------|--------|-----------|-------|---------------|
| Low | 74f16da | `core/tests/test_golden_export.hpp:58-65` | `GoldenPath()` через `__FILE__` работает только при in-source билде. Если когда-то будет out-of-tree / installed header — путь к golden сломается. | Документировано в комментарии, но при упаковке `core/` в installable package — заменить на CMake-define `-DCORE_TESTS_GOLDEN_DIR=...`. Не сейчас. |
| Low | 74f16da | `core/tests/test_quality_gates.hpp:60-86` | После `TestQG_RecordLatency_Under1us()` `Facade.Reset()` вызывается, но `Enable(true)` не парится с `Enable(false)`. В пределах функции безопасно. | Опционально: добавить `f.Enable(false)` перед `Reset()` чтобы быть defensive против будущих расширений. |
| Low | 74f16da | `core/tests/test_golden_export.hpp:96-117` | Det-фикстура содержит **1 event**. Если кто-то добавит 2-й event в golden — порядок `std::unordered_map` в JsonExporter сделает тест flaky. | Явно зафиксировать «1 event — намеренное упрощение для детерминизма» в spec / комментарии (уже частично сделано на line 19-23). Долгосрочно: sort keys в JsonExporter. |
| Low | b93fbda | `MemoryBank/tasks/TASK_Profiler_v2_RemoveLegacy.md` | В списке «🟡 Edit» не упомянут точечно `core/include/core/gpu_manager.hpp:721` (`GPUProfiler::GetInstance().SetGPUInfo(device_index, ...)`). Косвенно покрывается «миграция ServiceManager». | Добавить отдельной строкой в таблицу — иначе при сносе `gpu_profiler.hpp` сломается включение `gpu_manager.hpp` в downstream. |

Severity-distribution: **Critical 0 · High 0 · Medium 0 · Low 4**.

---

## Coverage gaps (что не покрыто тестами/проверками)

- **Golden detalising** — текущая фикстура (1×1×1×10) проверяет только базовый формат. Отсутствует кейс с 2+ модулями/событиями, который бы поймал регрессию `unordered_map`-порядка в exporter (см. Issue #3). Альтернатива — добавить sort в exporter и расширить fixture.
- **G11** (record_from_rocm field-by-field) — не отдельный гейт, но покрыт в `test_profiling_conversions.hpp` (B1). OK, но в `test_quality_gates::run()` нет даже упоминания «G11 покрыт здесь». Документация improvement.
- **Bandwidth для Download** в realistic-тесте проверена только для Upload (`TestEndToEnd_BandwidthFromBytes`). Download также имеет `bytes=4'000'000ULL`, но не проверен. Симметрии нет — но не блокер.
- **No-op Disable() путь** — не проверено, что `Record()` при `Enable(false)` действительно не пишет. Но это покрыто в `test_profiling_facade.hpp` (Phase C).

---

## Соответствие CLAUDE.md

- [x] Header-only тесты (`*.hpp`)
- [x] Нет `pytest` / `GoogleTest` / `Catch2` (свои макросы PAR_/QG_/GE_ASSERT с `#undef` в конце)
- [x] CMake **не тронут** ни в одном из 3 коммитов (verified `git show --stat`)
- [x] `ProfilingFacade` — единая точка профилирования в новом коде (правило `06-profiling.md`)
- [x] `WaitEmpty()` перед `Reset()` / `Export*()` — соблюдён (test_quality_gates:85, test_services:65)
- [x] Никаких `std::cout` для production-метрик (cout только в test framework output, как и в существующих `test_*.hpp`)
- [x] Никаких `printf` / `std::cerr` / `#ifdef _WIN32` в новом коде
- [x] Worktree-safety: все файлы в корне `/home/alex/DSP-GPU/`, нет `.claude/worktrees/`
- [x] ROCm-only: новый код CPU-only (тесты), `ROCmProfilingData` как чистая struct, никакого OpenCL/cuFFT
- [x] Стиль 14-cpp-style.md: snake_case methods, CamelCase типы, namespace per test, `#undef` приватных макросов

---

## Готовность к merge на main

- [x] core 87/87 PASS (включая legacy `test_gpu_profiler` — никаких регрессий)
- [x] 7 dep-репо собираются с этими core-изменениями (0 errors)
- [x] golden compare + regenerate работают в обе стороны
- [x] никаких неучтённых регрессий (size, perf, format)
- [x] CMake не тронут, теги не созданы, push не сделан
- [x] RemoveLegacy task реалистичный (3-4 ч), acceptance измеримые

---

## Соответствие плану Phase E

| Пункт плана | Статус | Комментарий |
|-------------|:------:|-------------|
| E1 — архив SUPERSEDED | 🟡 deferred | bookwork, отложено на «дома» (не Debian-required) |
| E2 — realistic тесты ProfileAnalyzer | ✅ DONE | 4 теста, расширено vs план (kernel/copy + bandwidth) |
| E3 — golden file тесты | ✅ DONE | 1 event фикстура (упрощение vs план — обосновано детерминизмом) |
| E4 — G8/G9/G10 quality gates | ✅ DONE | все три зелёные с большим запасом |
| E5 — секция «Реализация» в спеку | 🟡 deferred | bookwork |
| E6 — CI workflow | 🟡 deferred | требует OK Alex на CI billing |
| E7-E8 — PR + tag | ❌ blocked | требует push, OK Alex |
| E8.5 — Doxygen | 🟡 deferred | bookwork |
| E9 — sessions/profiler_v2_done | 🟡 deferred | bookwork |
| RUN_SERIAL CMake правка | ❌ blocked | требует OK Alex на CMake |

Debian-required Phase E часть **CLOSED**. Остаток — bookwork «дома» + RemoveLegacy.

---

## Если PASS_WITH_NOTES — следующий шаг

Сообщить Alex:

> Коммиты `74f16da`, `9562b58`, `b93fbda` готовы к `git push`. Найдены 4 Low-severity
> замечания (см. таблицу выше) — не блокеры, можно закрыть в следующей сессии
> (RemoveLegacy / docs). Push требует **явного OK Alex** (CLAUDE.md `02-workflow.md:38`).

**НЕ делать push самостоятельно.**

Опционально перед push можно:
- Добавить `core/include/core/gpu_manager.hpp:721` в RemoveLegacy task (Low-issue #4) — 1-минутная правка.
- Усилить комментарий о «1 event — намеренное упрощение» в `test_golden_export.hpp:97-99` (Low-issue #3).

Оба пункта — косметика, не требуют пере-ревью.

---

*Reviewer: Кодо (deep-reviewer mode), 2026-04-27.*
*Sequential-thinking: 7 thoughts (≥ 5 required).*
