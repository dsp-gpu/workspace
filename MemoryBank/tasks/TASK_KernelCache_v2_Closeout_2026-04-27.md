# TASK: KernelCache v2 — Closeout (2026-04-27)

> **Дата создания**: 2026-04-27 утро (после deep review + 12 fixes + 7 репо зелёные)
> **Статус**: code DONE на 100%, осталась документация + git + опц. acceptance проверки
> **Effort оценка**: 3-5 ч (без опц.) / 5-8 ч (с опц.)
> **Старые TASK-файлы** (Phase A-E + INDEX + HANDOFF) → перенесены в
> `MemoryBank/archive/kernel_cache_v2_2026-04-27/`. Сюда сведены **только
> остатки** — то что реально осталось делать.

---

## ✅ Что уже сделано (для контекста)

| Phase | Что | Где зафиксировано |
|-------|-----|-------------------|
| A1, A2 | CompileKey + KernelCacheService v2 + GpuContext | в main (ветка `kernel_cache_v2` мержена) |
| B1 | signal_generators ScriptGen disk cache | в main |
| B2 | spectrum AllMaxima | в main |
| C1-C3 | linalg (Cholesky / Symmetrize / DiagLoad) | в main |
| C4 | strategies split hpp→cpp | в main |
| D1 | spectrum filters cleanup | в main |
| D2 | radar dead code −141 LOC | в main |
| **E1** | `dsp-cache-list` CLI tool + CMake wire (`option(DSP_BUILD_CLI_TOOLS OFF)`) | сегодня, не закоммичено |
| **REVIEW** | 12 fix-issues (deep-reviewer 2026-04-27) + Golden hash regression test | сегодня, не закоммичено |
| **BUILD/TEST** | 7 репо зелёные на Debian + RX 9070 (gfx1201) | сегодня, в логах /tmp/ |

### 12 fix-issues — детали

| Sev | Issue | Файл |
|-----|-------|------|
| HIGH | Idempotent Save: размер→byte-compare | `core/src/services/kernel_cache_service.cpp` |
| HIGH | `CompileModule` race → `compile_mutex_` | `core/{src,include}/.../gpu_context.{cpp,hpp}` |
| MED  | Q7 violation: `hipModuleUnload` removed | `core/src/gpu_context.cpp:281` |
| MED  | Corrupted log: ConsoleOutput→`DRVGPU_LOG_WARNING` | `core/src/services/kernel_cache_service.cpp` |
| MED  | Битый .hsaco не удалялся → новый `Invalidate()` | `core/{src,include}/.../kernel_cache_service.{cpp,hpp}` |
| MED  | Tmp filename collision multi-process → `+pid` | `core/src/services/kernel_cache_service.cpp` |
| MED  | std::cout в CLI — whitelist-комментарий | `core/tools/dsp_cache_list.cpp` |
| MED  | G3 Gate — golden hash regression test | `core/tests/test_compile_key.hpp` |
| LOW  | `static int g_failures` → `inline` | `core/tests/test_kernel_cache_service.hpp:60` |
| LOW  | Tmp cleanup при throw → `TmpFileGuard` RAII | `core/src/services/kernel_cache_service.cpp` |
| LOW  | `[[nodiscard]]` на `Hash()` / `HashHex()` | `core/include/core/services/compile_key.hpp` |
| LOW  | Противоречивые комментарии в resolver | `core/src/services/cache_dir_resolver.cpp` |

---

## 🎯 Что осталось (Closeout)

### 1. MemoryBank sync (~30 мин)

- [ ] `MemoryBank/sessions/2026-04-27.md` — добавить секцию "KernelCache v2 closeout" (review + 12 fixes + Phase E1 wire + 7 репо зелёные)
- [ ] `MemoryBank/changelog/2026-04.md` — одна строчка: "KernelCache v2 deep review + 12 fixes + CLI wire + acceptance G3/G5 PASS"
- [ ] `MemoryBank/tasks/IN_PROGRESS.md` — убрать ложное "KernelCache v2 — DONE", указать на этот Closeout
- [ ] `MemoryBank/MASTER_INDEX.md` — если упоминает KernelCache v2 фазы как незакрытые — поправить

### 2. Документация модулей (~1-1.5 ч)

- [ ] `core/Doc/Services/Full.md` — обновить секцию `KernelCacheService`:
  - убрать примеры со старым name-only API
  - добавить пример с `CompileKey`
  - показать структуру `<module>/<arch>/<kernel>_<hash8>.hsaco`
  - секция "Cache invalidation" — как hash защищает от stale binaries
  - упомянуть новый метод `Invalidate(kernel, key)` (добавлен в Closeout review)
  - упомянуть Q7 (hipModuleUnload deferred)
- [ ] (опц.) `DSP/Doc/Python/core_api.md` — если там упоминается KernelCache, синхронизировать

### 3. Acceptance проверки (опц., ~30-60 мин)

Из `TASK_KernelCache_v2_HANDOFF_2026-04-22.md` (handoff):
- [x] **G3** (hash stability) — закрыто `TestFnv1aGoldenRegression` в `test_compile_key.hpp`
- [x] **G5** (cold/warm cache) — проверено эмпирически: cold создаёт .hsaco, warm даёт `kernels loaded from cache (HSACO)` в логах всех 7 репо
- [ ] **handoff E** (rocm-smi leak test): `rocm-smi --showmeminfo vram` до/после прогона теста с `--iterations 1000`. Q7 — известный leak, проверка что в реальных значениях не растёт
- [ ] **DSP Python smoke**: после KernelCache v2 биндинги не должны ломаться. Запустить `python3 -c "import dsp_core; ..."` через `DSP/Python/` тесты (через `common.runner.TestRunner`, **НЕ pytest**)

### 4. Git workflow (~1 ч, ⚠️ требует OK Alex на каждом шаге)

> **Контекст**: ветки `kernel_cache_v2` уже **смержены в main** во всех 5 репо
> (см. handoff коммиты `7bc06a5 / 2f314c0 / 2e367bf / ee84729 / 4b6681c / e30ebe0`).
> Поэтому E3 PR-step из старого Phase E **не нужен**. Остался коммит сегодняшних
> правок + опц. tag.

#### 4.1 Коммит 12 fixes + E1 (CLI wire)

Затронутые файлы (только в `core/`, остальные репо без правок):
```
core/include/core/services/compile_key.hpp           # [[nodiscard]]
core/include/core/services/kernel_cache_service.hpp  # +Invalidate()
core/src/services/kernel_cache_service.cpp           # rewrite (RAII, byte-compare, pid, logger)
core/include/core/interface/gpu_context.hpp          # compile_mutex_, ReleaseModule doc
core/src/gpu_context.cpp                             # mutex, Invalidate call, no hipModuleUnload
core/src/services/cache_dir_resolver.cpp             # comment fix
core/tests/test_compile_key.hpp                      # +TestFnv1aGoldenRegression
core/tests/test_kernel_cache_service.hpp             # inline g_failures
core/tools/dsp_cache_list.cpp                        # WHITELIST comment
core/CMakeLists.txt                                  # +DSP_BUILD_CLI_TOOLS option
```
Предлагаемое сообщение коммита:
```
[kernel-cache-v2] Closeout: deep review fixes + CLI wire

12 issues from deep review (2 HIGH / 6 MED / 4 LOW):
- byte-compare in idempotent Save (was size-only — collision risk)
- compile_mutex_ in GpuContext::CompileModule (race fix)
- Q7: hipModuleUnload removed from ReleaseModule (known ROCm leak)
- DRVGPU_LOG_WARNING for corrupted HSACO (was ConsoleOutput::Print)
- new Invalidate() — remove HSACO when GPU rejects via hipModuleLoadData
- pid suffix in tmp filename (multi-process collision)
- TmpFileGuard RAII (cleanup on throw from f.write)
- TestFnv1aGoldenRegression (G3 Gate: 0x937e8a99cd37b6dbULL locked)
- inline g_failures, [[nodiscard]] on Hash/HashHex, comment fixes

E1: dsp-cache-list wired in CMake under DSP_BUILD_CLI_TOOLS=OFF.
Tested on Debian + Radeon RX 9070 (gfx1201): all 7 repos green.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

- [ ] `git -C core add -A`
- [ ] `git -C core commit -m "..."` (см. выше)
- [ ] `git -C core push origin main` — **ТОЛЬКО** с явным OK Alex (rule 02-workflow:38, rule 16-github-sync)

#### 4.2 Опц. — synced tag `v0.3.0`

Из старого Phase E4. Требует OK Alex.
```
for repo in core spectrum signal_generators linalg strategies; do
  git -C $repo tag -a v0.3.0 -m "Kernel Cache v2 — composite hash, unified GpuContext"
  # git push origin v0.3.0 — ТОЛЬКО с OK ALEX
done
```
- [ ] OK Alex по тегу
- [ ] tag + push (по 02-workflow + 16-github-sync)

#### 4.3 Опц. — radar v0.2.1 (отдельный, cleanup-релиз)

```
git -C radar tag -a v0.2.1 -m "Cleanup: remove FM Correlator legacy dead code"
```

---

## 📂 Где что лежит

| Что | Где |
|-----|-----|
| Этот Closeout | `MemoryBank/tasks/TASK_KernelCache_v2_Closeout_2026-04-27.md` |
| Архив старых тасков | `MemoryBank/archive/kernel_cache_v2_2026-04-27/` |
| Spec (исходник) | `MemoryBank/specs/KernelCache_v2_Proposal_2026-04-16.md` (оставлен на месте — это спека, а не план) |
| Логи прогона | `/tmp/linalg_test.log`, `/tmp/spectrum.log` (Alex решил оставить до завтра) |
| Ревью-фидбек | прямой чат сессии 2026-04-27 утро + sessions/2026-04-27.md (после п.1) |

---

## 🚫 Чего НЕ делаем в этом Closeout

- Phase A-E содержательная работа — **уже сделана**, в main, протестирована.
- E3 PR-операции (создавать PR из ветки в main) — ветки **уже смержены**, PR-стадия пропущена. Нужен только коммит сегодняшних правок.
- Удалять/двигать `MemoryBank/specs/KernelCache_v2_Proposal_2026-04-16.md` — спека остаётся источником истины.

---

## 🔚 Definition of Done

- [ ] Все пункты из секции "1. MemoryBank sync" выполнены и закоммичены
- [ ] `core/Doc/Services/Full.md` обновлён (KernelCacheService v2 секция)
- [ ] `git push origin main` для core (с OK Alex) — изменения в github
- [ ] (опц.) tag v0.3.0 на 5 репо (с OK Alex)
- [ ] Этот файл переехал в `MemoryBank/archive/kernel_cache_v2_2026-04-27/` после закрытия
