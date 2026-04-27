# TASK: Profiler v2 — Closeout (что осталось после RemoveLegacy)

> **Статус**: 🟡 Active — закрываем последние документационные хвосты + Q7 backlog
> **Дата обновления**: 2026-04-27 (после `TASK_Profiler_v2_RemoveLegacy DONE`)
> **Источник спеки**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md`
> **Ветка**: `main` (всё мёрджено, теги `v0.3.0` / `v0.3.1` стоят)

---

## ✅ Сделано (для истории — детальные TASK-файлы УДАЛЕНЫ как мусор)

| Phase | Когда | Что |
|-------|-------|-----|
| A     | 2026-04-17 | Branch `new_profiler` + удаление OpenCL profiling |
| A0.5  | 2026-04-17 | Baseline `Record()` latency |
| B1    | 2026-04-18 | `ProfilingRecord` (unified type) + `record_from_rocm` |
| B2    | 2026-04-18 | `ProfileStore` (collect-only, ring buffer, 200 MB лимит) |
| B3    | 2026-04-19 | `ProfileAnalyzer` (L1/L2/L3, lazy compute) |
| B4    | 2026-04-19 | `ReportPrinter` (block-based console output) |
| C     | 2026-04-20 | `JsonExporter` / `MarkdownExporter` / `ConsoleExporter` + `ProfilingFacade` + `ScopedProfileTimer` |
| D     | 2026-04-20…23 | Cross-repo benchmark migration (spectrum / stats / SG / heterodyne / linalg / strategies — 6 репо) |
| E2    | 2026-04-27 | `test_profile_analyzer_realistic.hpp` |
| E3    | 2026-04-27 | Golden file тесты (`profiler_report_spectrum.{json,md}`) |
| E4    | 2026-04-27 | Quality Gates (G8 Record<1µs, G9 Mem<200MB, G10 Compute<500ms) |
| E7+E8 | 2026-04-23 | PR'ы + merge `new_profiler → main` × 7 репо, теги `v0.3.0` / `v0.3.1` |
| **RemoveLegacy** | **2026-04-27** | **Снос `@deprecated GPUProfiler` + миграция ServiceManager + 5 radar тестов + spectrum stale includes. core 123 PASS / 0 FAIL, все 7 dep-репо зелёными.** |

---

## 🟡 Что осталось (3 таска)

| # | Файл | Effort | Зависимости |
|---|------|-------:|-------------|
| 1 | [TASK_Profiler_v2_Documentation.md](TASK_Profiler_v2_Documentation.md) | 4-6 ч | — (можно дома, без GPU) |
| 2 | [TASK_Profiler_v2_CI_RunSerial.md](TASK_Profiler_v2_CI_RunSerial.md) | 1-2 ч | OK Alex на CMake + CI |
| 3 | [TASK_Profiler_v2_Roctracer_Q7.md](TASK_Profiler_v2_Roctracer_Q7.md) | 16-24 ч | core зелёный + ROCm 7.2 + GPU |

**Итог по effort**: ~21–32 ч, причём ~6 ч можно дома без GPU (Documentation), а Q7 — отдельная большая инициатива.

---

## 🎯 Цель Closeout-фазы

После того как код Profiler v2 стабилизирован и legacy снесён, остаются **только**:

1. **Документация** — описать API ProfilingFacade в `core/Doc/`, добавить секцию «Реализация» в спеку, прибраться в Doxygen-комментариях бенчмарков, архивировать SUPERSEDED-секции спеки, написать финальный `sessions/profiler_v2_done_*.md`.
2. **CI / build polish** — workflow `new_profiler_integration.yml` (если ещё актуально) + RUN_SERIAL для golden/quality-gates тестов.
3. **Q7 — roctracer integration** — реальный 5-полевой тайминг (`queued_ns/submit_ns/start_ns/end_ns/complete_ns`) из GPU-clock через roctracer activity domain. Сейчас 3 из 5 полей либо нули, либо приближение от host clock.

Без Q7 профайлер уже **полнофункционален** для production-бенчмарков — даёт latency / median / p95 / bandwidth / outliers по hipEvent. Q7 нужен когда упрёмся в микро-оптимизацию hot-path и понадобится «настоящий queue-delay».

---

## 🎯 Definition of Done — Closeout

Closeout считается закрытым когда:

1. ✅ Все 3 таска (Documentation / CI_RunSerial / Roctracer_Q7) — DONE
2. ✅ `core/Doc/Services/Profiling/Full.md` существует и описывает текущий API
3. ✅ Doxygen `core/Doc/Doxygen/html/` пересобран после удаления legacy
4. ✅ Спека `GPUProfiler_Rewrite_Proposal_2026-04-16.md` имеет секцию «Status of implementation»
5. ✅ `MemoryBank/sessions/profiler_v2_done_2026-XX-XX.md` — финальный отчёт
6. ✅ Q7 — либо мёрджен в main, либо переведён в долгосрочный backlog с пометкой «выйти за рамки v0.3.X».

---

## 🚫 Запреты

1. **CMake / CI** — без OK Alex (правило `12-cmake-build.md`).
2. **Не трогать тэги v0.3.0/v0.3.1** — они уже стоят (правило `02-workflow.md`).
3. **Q7 НЕ начинать** пока не закрыт Documentation таск (важно иметь стабильный baseline перед переписыванием collector'а).

---

## 📞 Когда спрашивать Alex

- **Перед** началом каждого таска — короткий статус «начинаю Documentation, scope X».
- **Перед** любой CMake / .github правкой — DIFF + ожидание OK.
- **Перед** началом Q7 — подтверждение что хотим тянуть в production (не просто «потрогать»).

---

*Created: 2026-04-27 by Кодо (Closeout фаза). Заменяет старый INDEX от 2026-04-17.*
