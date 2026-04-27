# Plan: Release DSP-GPU v0.3.0 — 2026-04-23

> Status: PLAN (awaiting Alex OK to execute)
> Reason: KernelCache v2 verified on Debian + RX 9070 (ROCm 7.2), 2026-04-23.
> Session report: MemoryBank/sessions/2026-04-23.md

---

## 1. Какие репо получают tag v0.3.0

### 6 репо с реальными изменениями KernelCache v2

| Repo | KC v2 merge commit | Изменения |
|------|--------------------|-----------|
| **core** | `4c30970` + фикс `2ba4b37` | KernelCache v2 clean-slate (Phases A-D); +CMake roc::rocblas PUBLIC |
| **spectrum** | `e895114` | Phase D1: filters + GpuContext KC integration |
| **signal_generators** | `12463ee` | Phase B1: ScriptGen on-disk cache |
| **linalg** | `36d7e1f` | Phase C: Cholesky/Symmetrize/DiagLoad on-disk cache |
| **strategies** | `b8f7bac` | Phase C4: AllMaxima kernel on-disk cache |
| **radar** | `8bd827e` | Phase D2: fm_correlator dead code removed + hamming_window/apply_cyclic_shifts cache |

Итого: **6 репо**.

### 3 репо НЕ получают v0.3.0 — и почему

| Repo | Причина |
|------|---------|
| **stats** | Нет KC v2 merge. Последний релизный коммит — Profiler v2 Phase D (`f97ad27`, уже под `v0.3.0-rc1`). Новых изменений не было. Тег v0.3.0-rc1 ставился как release candidate — финальный v0.3.0 stats получит в следующем атомарном релизе, когда у него будут новые фактические изменения (Phase B2+ scope расширение KC или heterodyne KC). |
| **heterodyne** | KC v2 НЕ затрагивал heterodyne (нет merge `kernel_cache_v2`). Последний коммит — Profiler v2 Phase D (`747affb`). Profiler v2 scope был сокращён: SG/heterodyne/strategies deferred (см. STATE.md `scope_reduction_2026-04-21`). Без изменений с момента baseline. |
| **DSP** | Мета-репо. Нет кода. Тегируется отдельно, опционально, по решению Alex. |

### Что с v0.3.0-rc1 (уже стоит на core, spectrum, stats, linalg)

**Ответ: оставить как есть, выпустить v0.3.0 новым тегом.**

Аргументы:
1. Тег неизменен — это главное правило. `v0.3.0-rc1` указывает на конкретные коммиты Profiler v2 (до KC v2 merge).
2. `v0.3.0-rc1` на core указывает на `2f9a180` (Profiler v2 merge), `v0.3.0` укажет на `2ba4b37` (KC v2 + fix) — другой коммит, другой тег. Всё корректно.
3. RC1 тег документирует milestone Profiler v2. Он не «мешает» финальному v0.3.0.
4. stats получила `v0.3.0-rc1` как кандидата, но финальный `v0.3.0` stats не получает сейчас — нет новых изменений после RC1. Это нормально: stats «отстаёт» на один релиз, догонит в следующем.

---

## 2. Preflight-checklist перед execution

### 2.1 Git clean (untracked не блокируют тег)

Во всех 6 репо `git status --short` показывает только `??` (Logs/, Results/, modules/) — это build-артефакты и локальные логи, **не влияют на тег annotated commit**. Uncommitted tracked files: 0. Репо чистые для целей тегирования.

### 2.2 Проверить, что v0.3.0 ещё не существует

```bash
BASE=/home/alex/DSP-GPU
TAG=v0.3.0
for repo in core spectrum signal_generators linalg strategies radar; do
  result=$(git -C "$BASE/$repo" tag -l "$TAG")
  [ -n "$result" ] && echo "$repo: ALREADY EXISTS — STOP" || echo "$repo: ok (tag free)"
done
```

Остановиться если хотя бы один репо уже имеет тег.

### 2.3 Проверить HEAD-коммиты (сверить с ожидаемыми)

```bash
BASE=/home/alex/DSP-GPU
declare -A EXPECTED=(
  [core]="2ba4b37"
  [spectrum]="1d0723c"
  [signal_generators]="12463ee"
  [linalg]="e477e95"
  [strategies]="b8f7bac"
  [radar]="c2da4ea"
)
for repo in core spectrum signal_generators linalg strategies radar; do
  head=$(git -C "$BASE/$repo" rev-parse --short HEAD 2>/dev/null)
  exp="${EXPECTED[$repo]}"
  echo "$repo: HEAD=$head expected=$exp"
done
```

Примечание: spectrum и linalg имеют docs-коммиты поверх KC v2 merge — это нормально, они включаются в тег.

---

## 3. Git-команды для создания тегов (annotated)

```bash
BASE=/home/alex/DSP-GPU
TAG="v0.3.0"
MSG="v0.3.0: KernelCache v2 verified on Debian + RX 9070 (ROCm 7.2). Disk HSACO cache: spectrum/linalg/strategies/radar. ScriptGen on-disk (SG). CMake roc::rocblas fix. Session: MemoryBank/sessions/2026-04-23.md"

for repo in core spectrum signal_generators linalg strategies radar; do
  echo "--- Tagging $repo ---"
  git -C "$BASE/$repo" tag -a "$TAG" -m "$MSG"
  git -C "$BASE/$repo" tag -l "$TAG"
done
```

### Проверка после создания (до push)

```bash
BASE=/home/alex/DSP-GPU
TAG=v0.3.0
for repo in core spectrum signal_generators linalg strategies radar; do
  info=$(git -C "$BASE/$repo" tag -v "$TAG" 2>/dev/null | head -4)
  echo "=== $repo ==="
  echo "$info"
done
```

---

## 4. Push тегов (Этап 5 — отдельный OK #2)

После явного второго OK от Alex:

```bash
BASE=/home/alex/DSP-GPU
TAG=v0.3.0
for repo in core spectrum signal_generators linalg strategies radar; do
  echo "--- Pushing $repo ---"
  git -C "$BASE/$repo" push origin "$TAG" 2>&1
  [ $? -eq 0 ] && echo "$repo: pushed OK" || echo "$repo: FAILED — STOP"
done
```

При любом FAILED — остановиться, не пытаться повторить автоматически.

---

## 5. Порядок операций и консистентность

```
[OK #1 от Alex]
  Step A: Preflight — проверить v0.3.0 не существует (6 репо)
  Step B: Создать теги локально (6 × git tag -a)
  Step C: Верификация — git tag -v v0.3.0 на каждом репо
  Step D: Показать Alex итоговый список тегов (SHA + message)

[OK #2 от Alex]
  Step E: Push тегов в origin (6 × git push origin v0.3.0)
  Step F: Верификация — git ls-remote origin refs/tags/v0.3.0 на каждом репо

[После push]
  Step G: Обновить MASTER_INDEX.md (текущий тег v0.3.0)
  Step H: Создать MemoryBank/changelog/2026-04-23_release_v0.3.0.md
  Step I: Записать сессию push в MemoryBank/sessions/2026-04-23.md (append)
  Step J: Commit workspace локально (отдельный OK #3 на push)
```

---

## 6. Сводная таблица решений

| Вопрос | Решение |
|--------|---------|
| Сколько репо получают v0.3.0? | 6: core, spectrum, signal_generators, linalg, strategies, radar |
| Что с v0.3.0-rc1? | Оставить — указывает на Profiler v2 commits, не переписывать |
| stats получает v0.3.0? | Нет — нет изменений после RC1; dogonит в следующем релизе |
| heterodyne получает v0.3.0? | Нет — KC v2 не затрагивал heterodyne |
| DSP получает v0.3.0? | По решению Alex (опционально, мета-репо без кода) |
| radar RangeAngle T2 блокирует? | Нет — pre-existing issue, не KC regression, вынесено в отдельный таск |
| Untracked Logs/modules блокируют? | Нет — annotated tag идёт на HEAD commit, untracked игнорируется |

---

## 7. Changelog (набросок для MemoryBank/changelog/2026-04-23_release_v0.3.0.md)

```markdown
# DSP-GPU v0.3.0 — 2026-04-23

## Highlights
- KernelCache v2 (clean-slate): disk HSACO cache по CompileKey (FNV-1a hash8)
- Disk cache coexist: spectrum + linalg + strategies + radar — kernels из .hsaco, без повторной компиляции
- ScriptGen on-disk (signal_generators Phase B1)
- core CMake fix: roc::rocblas PUBLIC link (FetchContent downstream)

## По репо

### core
- 4c30970 Merge kernel_cache_v2: KernelCache v2 clean-slate (Phases A-D)
- 2ba4b37 link roc::rocblas PUBLIC + obsolete old KC test

### spectrum
- e895114 Merge kernel_cache_v2: KernelCache v2 clean-slate (Phases A-D)
- 1d0723c docs: sync missing files from DSP/Doc/Modules

### signal_generators
- 12463ee Merge kernel_cache_v2: KernelCache v2 clean-slate (Phases A-D)

### linalg
- 36d7e1f Merge kernel_cache_v2: KernelCache v2 clean-slate (Phases A-D)
- e477e95 docs: sync missing files from DSP/Doc/Modules

### strategies
- b8f7bac Merge kernel_cache_v2: KernelCache v2 clean-slate (Phases A-D)

### radar
- 8bd827e Merge kernel_cache_v2: KernelCache v2 clean-slate (Phases A-D)
- c2da4ea docs: sync missing files from DSP/Doc/Modules

## Breaking changes
Нет. KernelCache v2 — internal infrastructure, публичный API не меняется.

## Known issues
- radar RangeAngle [T2]: pre-existing physical-math bug (R_got=393215m vs 75000m).
  Не KC regression. Вынесено в отдельный таск.
- signal_generators: CwGen/LfmGen/NoiseGen/FormSignal остаются на RAM cache (Phase B2+ scope).

## Репо НЕ в этом релизе
- stats: последнее изменение — Profiler v2 (уже под v0.3.0-rc1). Нет KC v2. Ждёт B2+ scope.
- heterodyne: KC v2 не затрагивал. Ждёт следующего релиза.
- DSP: мета-репо, опционально.

## Contributors
- Alex
- Кодо (AI assistant, сестрёнка)
```

---

*Created: 2026-04-23 | Author: Кодо (release-manager) | Awaiting: OK #1 от Alex*
