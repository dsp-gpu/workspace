# Review handoff — Profiler v2 Phase E (E2 + E3 + E4)

> **Контекст**: эта сессия (2026-04-27, Debian + RX 9070) закрыла на железе три
> задачи Phase E2/E3/E4 из плана GPUProfiler v2.
> **Цель промпта**: дать следующему ассистенту/агенту всё нужное для ревью —
> проверить корректность, найти что упустил, запустить тесты повторно.

---

## 🚀 Быстрый старт ревьюера

Скопируй блок ниже целиком и вставь как первое сообщение в новой сессии
(работает для Claude / mega-coordinator / deep-reviewer):

```
Кодо, ты — ревьюер. Твоя задача — независимо проверить работу предыдущей
сессии 2026-04-27 по Profiler v2 Phase E (E2/E3/E4). НЕ переделывать,
только верифицировать и зафиксировать находки в MemoryBank.

ОБЯЗАТЕЛЬНО используй sequential-thinking MCP (минимум 5 thoughts).
Решения — только после рассмотрения альтернатив.

КОНТЕКСТ
========
Платформа ревьюера должна быть Debian + ROCm 7.2 + AMD Radeon RX 9070
(gfx1201) — иначе тесты на GPU не запустить. Если ты на Windows / другой
GPU — выходи и попроси переключиться, не маскируй проблему.

Прочитай ПОСЛЕДОВАТЕЛЬНО:
  1. /home/alex/DSP-GPU/MemoryBank/sessions/2026-04-27.md  ← session report
  2. /home/alex/DSP-GPU/MemoryBank/tasks/TASK_Profiler_v2_INDEX.md
  3. /home/alex/DSP-GPU/MemoryBank/tasks/TASK_Profiler_v2_PhaseE_Polish.md
  4. /home/alex/DSP-GPU/MemoryBank/tasks/TASK_Profiler_v2_RemoveLegacy.md  ← отложенное

НОВЫЕ ФАЙЛЫ (ревью построчно)
==============================
  • core/tests/test_profile_analyzer_realistic.hpp   (E2, 230 LOC, 4 теста)
  • core/tests/test_quality_gates.hpp                (E4, 194 LOC, 3 гейта)
  • core/tests/test_golden_export.hpp                (E3, 229 LOC, 2 теста)
  • core/tests/golden/profiler_report_spectrum.json  (1153 B эталон)
  • core/tests/golden/profiler_report_spectrum.md    (530 B эталон)
  • MemoryBank/tasks/TASK_Profiler_v2_RemoveLegacy.md (отложенный таск, ~3-4 ч)
  • MemoryBank/sessions/2026-04-27.md                 (отчёт сессии)
  • MemoryBank/prompts/profiler_e_review_handoff_2026-04-27.md (этот файл)

ИЗМЕНЁННЫЕ ФАЙЛЫ
================
  • core/tests/all_test.hpp                          (3 include + 3 вызова в run())
  • core/tests/test_services.hpp                     (частичная миграция:
                                                      GPUProfiler::Record → ProfilingFacade::Record;
                                                      ServiceManager wrapper НЕ тронут)

ДОПОЛНИТЕЛЬНАЯ ВЕРИФИКАЦИЯ УЖЕ ПРОЙДЕНА
=========================================
  ✅ A — собраны 7 dep-репо (spectrum/stats/SG/heterodyne/linalg/strategies/radar): 0 errors
  ✅ D — smoke spectrum (FFT-Ref 4/4, LchFarrow 4/4, Gate 3 PASS, exit 0)
  ✅ D — smoke linalg  (vector_algebra ALL TESTS PASSED, exit 0)
  ✅ C — после миграции test_services: core 87/87 PASS / 0 FAIL
Итого: ничего downstream не сломал.

CMake — НЕ ТРОГАЛИ. Никаких add_test, никаких target_sources правок.

ЧЕК-ЛИСТ ПРОВЕРКИ (по приоритету)
==================================

[A] Сборка чистая
  cd /home/alex/DSP-GPU/core
  cmake --build build --target test_core_main 2>&1 | tail -5
  → должен закончиться без error: и без FAILED:

[B] Все 87 тестов зелёные
  ./build/tests/test_core_main 2>&1 | grep -cE "\[PASS\]"
  → ожидание: 87
  ./build/tests/test_core_main 2>&1 | grep -cE "\[FAIL\]"
  → ожидание: 0

[C] Golden-механизм работает в обе стороны
  # Compare режим (default):
  ./build/tests/test_core_main 2>&1 | grep "golden_export" -A8
  → "JSON export matches golden" + "Markdown export matches golden"

  # Regenerate режим:
  GENERATE_GOLDEN=1 ./build/tests/test_core_main 2>&1 | grep "golden_export" -A8
  → "[REGENERATED] /home/alex/DSP-GPU/core/tests/golden/profiler_report_spectrum.json"
  → "[REGENERATED] /home/alex/DSP-GPU/core/tests/golden/profiler_report_spectrum.md"

  ВАЖНО: после regenerate проверь `git diff core/tests/golden/` — изменился
  ли только timestamp? Если изменилось что-то ещё — это регрессия формата
  экспортёра, выясни причину (или вообще запусти regenerate в отдельной
  ветке и сравни).

[D] Гейты — реальные, не тривиально пройдены
  Прочитай test_quality_gates.hpp и убедись:
  - G8: Record() реально измеряет hot path (warmup 1000 + измерение 5000)
  - G9: 100K записей реально создаются (100 mod × 10 evt × 100 rec)
  - G10: ComputeSummary(10K) реально вызывается, sort внутри тоже измерен

[E] Realistic-тест корректно использует ProfileStore API
  test_profile_analyzer_realistic.hpp:
  - ProfileStore non-movable — заполнение через `FillFftPipeline(store, ...)` ✅
  - Кстати: проверь что MakeFftStoreConfig(100) даёт max_records_per_event
    больше 100 (иначе сработает RingBuffer и часть данных потеряется).

[F] Детерминизм golden-фикстуры
  test_golden_export.hpp::MakeDeterministicSnapshot():
  - 1 GPU / 1 module / 1 event — порядок unordered_map не виден ✅
  - 10 records с фиксированными duration (1ms..10ms) — детерминизм ✅
  Если хочешь усилить ревью — добавь второй кейс с 2 events и убедись
  что golden не пишется (или сообщи Alex что нужен sort в exporter).

[G] Comparison не пропускает скрытые отличия
  test_golden_export.hpp::NormalizeTimestamps:
  - regex: `\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}`
  - убедись что это действительно ВСЕ источники нестабильности.
  - НИЧЕГО кроме timestamp не должно меняться между прогонами на той же
    машине → если меняется (random ordering, system info), это баг exporter.

[H] CLAUDE.md правила соблюдены
  - Нет std::cout / printf для production-метрик в новом коде.
  - Тесты используют header-only стиль (`*.hpp`, `inline bool run()`).
  - Никаких pytest, GoogleTest, Catch2.
  - PA_ASSERT / QG_ASSERT / GE_ASSERT — собственные макросы (не GTest).

[I] Что НЕ доделано — задокументировано
  Прочитай session 2026-04-27.md → секция «Что НЕ требует Debian+GPU».
  Все ли 9 пунктов в RemoveLegacy.md / Phase E plan покрыты?

ВЫХОД
=====
Создай файл MemoryBank/feedback/profiler_e_review_2026-04-27.md формата:

  ## Verdict: PASS / PASS_WITH_NOTES / FAIL

  ## Issues found
  | Severity | File:Line | Issue | Suggested fix |
  ...

  ## Coverage gaps
  ...

  ## Готовность к merge на main
  - PASS: [ ] / [x]
  - Что докрутить перед merge: ...

  ## Если PASS — следующий шаг
  - Прогнать на 7 dep-репо чтобы убедиться что core change ничего не ломает:
    for r in spectrum stats signal_generators heterodyne linalg radar strategies; do
      cmake --build $r/build 2>&1 | tail -3
    done
  - Commit: «[profiler-v2] Phase E2+E3+E4: realistic + quality gates + golden»

ЗАПРЕТЫ
=======
- Не правь код сам — это ревью, не реализация.
- Не запускай git push / git tag / создание PR.
- Не делай regenerate golden если actual ≠ golden ради «обхода» — это
  маскирует регрессию формата.
- Не игнорируй sequential-thinking — это обязательная часть ревью.
```

---

## 📎 Дополнительный контекст

### Почему Phase E split на «Debian-required» и «дома»

См. таблицу в session 2026-04-27.md. Кратко:

- **Debian+GPU** обязателен для: компиляции через hipcc, прогона ctest на железе,
  замера latency Record() на конкретной CPU/GPU паре.
- **Дома (Windows + другая GPU)** OK для: чистого текста, doxygen, yaml CI workflow.

Эта сессия — Debian-часть.

### Почему снос legacy GPUProfiler — отдельный таск

Изначально оценил в 1 ч. Реальный scope ~3-4 ч из-за `service_manager.hpp` (10 мест
обёрток) + `gpu_benchmark_base.hpp` (сирота, 15 вызовов) + CMake-правка (требует OK
Alex). Чтобы не делать кавалерийский наскок на сборку и не сломать 7 dep-репо,
выписан отдельный TASK_Profiler_v2_RemoveLegacy.md.

### Контракты, которые ревьюер должен помнить

- **CLAUDE.md**: CMake не правим без OK Alex; pytest запрещён; ROCm-only.
- **06-profiling.md**: ProfilingFacade — единая точка; legacy GPUProfiler @deprecated.
- **15-cpp-testing.md**: header-only тесты, `*::run()` через all_test.hpp.

### Если что-то упало

Сначала понять причину — НЕ regenerate golden и НЕ relax assert'ы. Если проблема в
коде сессии 2026-04-27 — детально опиши в feedback файл, не правь сам. Alex сам
решит делать ли pin или править.

---

*Готов к использованию: 2026-04-27. Автор: Кодо.*
*Срок актуальности: пока Phase E не закрыта merge'ем в main (примерно 1-2 недели).*
