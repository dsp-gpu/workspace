# Archive — KernelCache v2 (2026-04-17 → 2026-04-27)

Старые TASK-файлы по миграции на clean-slate KernelCache v2. Все фазы
выполнены и смержены в `main` всех 5 затронутых репо. Активные остатки
(документация + git + опц. acceptance) перенесены в:

→ **`MemoryBank/tasks/TASK_KernelCache_v2_Closeout_2026-04-27.md`**

## Что внутри

| Файл | Roleorit |
|------|------|
| `TASK_KernelCache_v2_INDEX.md` | Master plan фаз A→E с финальными решениями Q1-Q10 |
| `TASK_KernelCache_v2_HANDOFF_2026-04-22.md` | Handoff на Debian-сборку (2026-04-23 утро) |
| `TASK_KernelCache_v2_PhaseA_CoreNewApi.md` | A1 CompileKey + A2 KernelCacheService v2 + GpuContext |
| `TASK_KernelCache_v2_PhaseB_CriticalFixes.md` | B1 signal_generators (ScriptGen) + B2 spectrum (AllMaxima) |
| `TASK_KernelCache_v2_PhaseC_LinalgStrategies.md` | C1-C3 linalg (Cholesky/Symmetrize/DiagLoad), C4 strategies split |
| `TASK_KernelCache_v2_PhaseD_Cleanup.md` | D1 spectrum filters cleanup + D2 radar dead code (−141 LOC) |
| `TASK_KernelCache_v2_PhaseE_Polish.md` | E1 dsp-cache-list (DONE 2026-04-27) + E2-E5 (→ Closeout) |

## История

- **2026-04-16** — спецификация v3 clean-slate (`MemoryBank/specs/KernelCache_v2_Proposal_2026-04-16.md` — оставлена на месте, **не** в архив)
- **2026-04-17** — INDEX + Phase A-E таски созданы
- **2026-04-22 вечер** — весь код написан + смержен в main + handoff
- **2026-04-27 утро** — Build/test на Debian (RX 9070), deep review + 12 fixes,
  Phase E1 (CLI wire) — все детали в Closeout-таске

## Spec остаётся

`MemoryBank/specs/KernelCache_v2_Proposal_2026-04-16.md` — это **спецификация**
(источник истины, не план), поэтому в архив не переезжает. Закрытие фаз
не отменяет валидность спеки.

## Политика архива

См. `MemoryBank/archive/README.md`. Не удалять без OK Alex — это история решений.
