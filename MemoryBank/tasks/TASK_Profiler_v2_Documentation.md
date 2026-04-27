# TASK: Profiler v2 — Documentation Closeout

> **Дата создания**: 2026-04-27
> **Effort**: 4-6 часов
> **Scope**: `core/Doc/`, `MemoryBank/specs/`, `MemoryBank/sessions/`, doxygen-комментарии в `*_benchmark_rocm.hpp` 5 репо
> **Зависит от**: `TASK_Profiler_v2_RemoveLegacy DONE` (закрыт 2026-04-27)
> **GPU не нужен** — задача чисто бумажная, можно делать дома

---

## 🎯 Цель

Закрыть документационный долг по Profiler v2 после полной миграции:

- Описать **актуальный** API `ProfilingFacade` (legacy `GPUProfiler` уже удалён)
- Архивировать SUPERSEDED-секции спеки и зафиксировать «Status of implementation»
- Пересобрать Doxygen без ссылок на удалённые `gpu_profiler.{hpp,cpp}` / `test_gpu_profiler*.hpp`
- Подчистить Doxygen-комментарии в benchmark-файлах (косметика «GPUProfiler» → «ProfilingFacade»)
- Написать финальный `sessions/profiler_v2_done_*.md` — единая точка для будущих ревью

---

## 📋 Шаги (по порядку)

### D1. `core/Doc/Services/Profiling/Full.md` — описание API

**Файл**: `core/Doc/Services/Profiling/Full.md` (новый)

**Эталон формата**: см. `heterodyne/Doc/Full.md` или `linalg/Doc/Full.md`.

**Структура**:

```markdown
# ProfilingFacade — Full Documentation

## 1. Назначение
- Что делает (collect-then-compute, hot-path Record + worker → ProfileStore + lazy Compute)
- Чем заменяет (legacy GPUProfiler — удалён 2026-04-27)
- Публичные точки входа (ProfilingFacade, ScopedProfileTimer, GpuBenchmarkBase)

## 2. Архитектура (Mermaid C4 диаграмма)
- слой 1: ProfilingFacade (singleton, public API)
- слой 2: ProfilingFacade::Impl (AsyncServiceBase<ProfilingRecord>)
- слой 3: ProfileStore (thread-safe, ring buffer, 200 MB лимит)
- слой 4: ProfileAnalyzer (lazy compute L1/L2/L3)
- слой 5: IProfileExporter → JsonExporter / MarkdownExporter / ConsoleExporter

## 3. API Reference
### 3.1 Lifecycle / Config
- ProfilingFacade::GetInstance()
- Enable(bool) / IsEnabled()
- SetGpuInfo(gpu_id, GPUReportInfo) / GetGpuInfo
- SetConfig(ProfileStoreConfig) — soft hint, см. Phase C

### 3.2 Recording (hot path)
- Record(gpu, module, event, ROCmProfilingData)
- BatchRecord<EventsContainer>(gpu, module, events) — для bench-pipeline
- WaitEmpty() — обязательный барьер ПЕРЕД Export*

### 3.3 Analysis + Export
- Export(IProfileExporter&, destination)
- ExportJsonAndMarkdown(json_path, md_path, parallel=false)
- GetSnapshot() — для кастомных экспортёров / Jupyter
- PrintReport() — через ConsoleExporter + ConsoleOutput

### 3.4 RAII helpers
- ScopedProfileTimer(gpu, module, event) — для simple cases
- GpuBenchmarkBase (Template Method) — для benchmark-классов

## 4. Обязательный порядок вызовов
SetGpuInfo → Enable(true) → Record/BatchRecord → WaitEmpty() → Export*/PrintReport
+ диаграмма (Mermaid sequenceDiagram)
+ типичные ошибки: «Unknown GPU», потерянные записи

## 5. Thread-safety
- Hot path Record() — lock-free на стороне источника, Enqueue в lock-free очередь
- Worker thread читает очередь → ProfileStore::Append (внутренние shard-mutex'ы)
- Export* блокирует пока не WaitEmpty() — нет race'а Append vs GetSnapshot

## 6. Configuration (configGPU.json)
- is_prof — глобальный enable (per-GPU фильтр выродился в OR после Phase D)
- max_records_per_event / MaxRecordsPolicy (RingBuffer / RejectWithWarning / Abort)
- counters list (если включён rocprofiler)

## 7. Примеры
### 7.1 Простейший — ScopedProfileTimer
### 7.2 Benchmark — наследник GpuBenchmarkBase
### 7.3 Ручной BatchRecord (паттерн из spectrum/heterodyne)
### 7.4 Custom exporter (Jupyter / CSV)

## 8. Migration from GPUProfiler (2026-04-27 — для тех кто увидит старую ветку)
| Old GPUProfiler | New ProfilingFacade |
|-----------------|---------------------|
| GetInstance() / SetEnabled / SetGPUEnabled | GetInstance() / Enable(bool) |
| SetGPUInfo | SetGpuInfo (CamelCase!) |
| Start / Stop | (worker в ctor singleton'а — не нужны) |
| ExportJSON / ExportMarkdown | Export(JsonExporter, ...) / ExportJsonAndMarkdown |
| PrintSummary / PrintReport | PrintReport |
| GetStats(gpu_id) | GetSnapshot() + ручная агрегация |

## 9. Файлы / Headers (FYI)
- core/include/core/services/profiling/profiling_facade.hpp
- core/include/core/services/profiling/profile_store.hpp
- core/include/core/services/profiling/profile_analyzer.hpp
- core/include/core/services/profiling/i_profile_exporter.hpp
- core/include/core/services/profiling/json_exporter.hpp
- core/include/core/services/profiling/markdown_exporter.hpp
- core/include/core/services/profiling/console_exporter.hpp
- core/include/core/services/profiling/scoped_profile_timer.hpp
- core/include/core/services/profiling/report_printer.hpp
- core/include/core/services/profiling_types.hpp (ProfilingRecord)
- core/include/core/services/gpu_benchmark_base.hpp (Template Method)

## 10. См. также
- 06-profiling.md
- @MemoryBank/.claude/specs/ProfilingFacade_Usage.md
- @MemoryBank/.claude/specs/GPU_Profiling_Mechanism.md
- spec: GPUProfiler_Rewrite_Proposal_2026-04-16.md
```

**Acceptance**:
- Файл создан, ≥ 8 секций со всеми пунктами выше
- Все упомянутые header'ы реально существуют (grep по `core/include/core/services/profiling/`)
- Mermaid-диаграммы рендерятся в VSCode preview без ошибок
- Примеры кода — компилирующиеся (берём из реальных тестов, не пишем «from scratch»)

---

### D2. Спека `GPUProfiler_Rewrite_Proposal_2026-04-16.md` — секция «Status of implementation» + ссылка на архив

**Файл**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md`

**Что добавить (в самый конец спеки)**:

```markdown
---

## 22. Status of implementation (2026-04-27)

| Phase | Status | Финальные коммиты | Notes |
|-------|--------|-------------------|-------|
| A     | ✅ DONE | core/new_profiler → main | OpenCL profiling removed |
| B1    | ✅ DONE | ProfilingRecord + record_from_rocm | profiling_conversions.hpp |
| B2    | ✅ DONE | ProfileStore | ring buffer, 200 MB лимит, composite W4 |
| B3    | ✅ DONE | ProfileAnalyzer | lazy L1/L2/L3 |
| B4    | ✅ DONE | ReportPrinter | block-based |
| C     | ✅ DONE | Exporters + Facade + ScopedTimer | JSON / MD / Console |
| D     | ✅ DONE | spectrum/stats/SG/heterodyne/linalg/strategies | radar исключён |
| E2/E3/E4 | ✅ DONE | realistic + golden + quality gates | core 123 PASS |
| **RemoveLegacy** | **✅ DONE 2026-04-27** | core + spectrum + 5 radar тестов | gpu_profiler.{hpp,cpp} удалены |
| Q7 (roctracer) | ⏳ Backlog | TASK_Profiler_v2_Roctracer_Q7.md | 5-полевой timing |
| E6 (CI workflow) | ⏳ Backlog | — | при необходимости |
| RUN_SERIAL | ⏳ Mini-task | TASK_Profiler_v2_CI_RunSerial.md | golden / quality-gates |

### Финальные архитектурные решения (зафиксированы 2026-04-27)

- **counters** — `std::map<std::string, double>` (C3 Round 3): scale 1-5K records/test → memory копейки.
- **singleton** — оставляем в benchmarks (W1): `ProfilingFacade::GetInstance().BatchRecord(...)`.
- **per-GPU фильтр** — выродился в глобальный `Enable(bool)` после RemoveLegacy. Если понадобится восстановить — вводить `IProfilerRecorder` injection (W1 reservation).
- **radar** — исключён из Phase D, но `radar/tests/` мигрированы в RemoveLegacy. Production radar-pipeline пока не использует ProfilingFacade — это отдельная задача после roctracer (если есть смысл).
- **GpuBenchmarkBase** — оставлен и мигрирован вместо удаления (на нём ~14 benchmark-классов).

### Архив старых секций

> Секции 3.2-3.6, 5-6, 10 (первоначальный дизайн aggregate-on-fly + старый план миграции + Decision points до Round 3) перенесены в:
> **`MemoryBank/specs/GPUProfiler_Rewrite_Proposal_v1_archive.md`**
>
> Актуальная архитектура — секции 14-19 + текущая 22.
```

**Acceptance**:
- Секция 22 добавлена в основную спеку
- Создан `GPUProfiler_Rewrite_Proposal_v1_archive.md` (новый файл) с перенесёнными секциями
- В исходной спеке секции 3.2-3.6, 5-6, 10 заменены на ссылку на архив
- Markdown lint чист (заголовки, таблицы)

---

### D3. Архив SUPERSEDED секций спеки

**Источник**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md`
**Цель**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_v1_archive.md` (новый)

**Что переносим** (точные секции из исходной спеки):

| # | Секция | Тема | Почему SUPERSEDED |
|---|--------|------|-------------------|
| 1 | 3.2 | Старый дизайн `Record() → aggregate-on-fly` | Переписан в section 14+ collect-then-compute |
| 2 | 3.3 | Старая структура GPUProfiler 884 LOC | Заменено 5+ SOLID компонент |
| 3 | 3.4 | Старый ExportJSON монолит | → JsonExporter Strategy |
| 4 | 3.5 | Старый PrintSummary | → ConsoleExporter + ReportPrinter |
| 5 | 3.6 | Старая агрегация stats_ map | → ProfileStore + ProfileAnalyzer.Compute |
| 6 | 5   | Старый план миграции (1 PR на всё) | Заменён 8-фазным A→E |
| 7 | 6   | Старая стратегия теста (mock-only) | Заменена «mock + realistic + golden» в Phase E |
| 8 | 10  | Decision points до Round 3 | Заменены на section 21 (Round 3 recommendations) |

**Шаблон файла-архива**:

```markdown
# GPUProfiler v1 — ARCHIVE (SUPERSEDED 2026-04-27)

> Этот файл хранит первоначальные секции спеки, переписанные после Round 3 ревью
> и Phase A-E реализации. Сохранены для исторической трассируемости.
>
> Актуальная архитектура — `GPUProfiler_Rewrite_Proposal_2026-04-16.md` секции 14-22.

## Содержание

- [Раздел 3.2 — Старый дизайн aggregate-on-fly](#section-32)
- [Раздел 3.3 — Старая структура GPUProfiler 884 LOC](#section-33)
- ...

---

## <a name="section-32"></a> 3.2 (ARCHIVE) Old design — aggregate-on-fly

> **Status**: SUPERSEDED by section 14 (collect-then-compute)

[оригинальный текст]

---
...
```

**Acceptance**:
- Все 8 секций перенесены целиком (с примерами кода если есть)
- В исходной спеке на их месте — single-line `> [archived] см. v1_archive.md#section-X`
- Markdown lint чист
- TOC в архиве рабочий (anchor links)

---

### D4. Doxygen — пересобрать без ссылок на удалённые файлы

**Файл**: `core/Doc/Doxygen/Doxyfile` (или эквивалент в существующей структуре, проверить через `Glob`)

**Действия**:

1. **Проверить INPUT** в `Doxyfile` — он использует `RECURSIVE = YES` для `include/` и `src/` → автоматически перестанет находить удалённые `gpu_profiler.{hpp,cpp}` и `test_gpu_profiler*.hpp`. **Правка `Doxyfile` НЕ нужна**, если только нет хардкод-путей.

2. **Удалить кэш**:
   ```bash
   rm -rf core/Doc/Doxygen/html
   rm -rf core/Doc/Doxygen/xml   # если есть
   ```

3. **Пересборка**:
   ```bash
   cd core/Doc/Doxygen
   doxygen Doxyfile 2>&1 | tee doxygen.log
   ```

4. **Проверка**:
   ```bash
   # Не должно быть warning'ов про gpu_profiler / GPUProfiler:
   grep -i "gpu_profiler\|GPUProfiler" doxygen.log
   # Не должно быть «not documented» для ProfilingFacade-классов:
   grep -E "Warning.*ProfilingFacade|ProfileStore|ProfileAnalyzer" doxygen.log
   ```

5. **Посмотреть HTML**:
   ```bash
   xdg-open core/Doc/Doxygen/html/index.html
   ```
   - В навигации **нет** `class GPUProfiler` (был удалён)
   - **Есть** `namespace drv_gpu_lib::profiling` со всеми экспортёрами + Facade
   - `class GpuBenchmarkBase` присутствует с актуальным описанием

6. **Cross-repo TAGFILES** — проверить что `spectrum/Doc/Doxygen/Doxyfile` (и аналогичные в 6 dep-репо) ссылается на актуальный `core/Doc/Doxygen/html/core.tag` (не на удалённые символы).

**Acceptance**:
- HTML собран без ошибок (`doxygen.log` без `error:`)
- В HTML нет `class GPUProfiler` (удалён)
- В HTML есть `class drv_gpu_lib::profiling::ProfilingFacade` с полным API
- Cross-репо TAGFILES не сломаны (выборочно открыть `spectrum/Doc/Doxygen/html/index.html`)

---

### D5. Doxygen-комментарии в `*_benchmark_rocm.hpp` (косметика)

**Что**: в /** ... */ блоках 5 репо остались упоминания «GPUProfiler» — заменить на «ProfilingFacade».

**Файлы** (нашли grep'ом в RemoveLegacy сессии):

```
spectrum/tests/test_fft_benchmark_rocm.hpp
spectrum/tests/fft_maxima_benchmark_rocm.hpp
spectrum/tests/test_lch_farrow_benchmark_rocm.hpp
spectrum/tests/lch_farrow_benchmark_rocm.hpp
spectrum/tests/fft_processor_benchmark_rocm.hpp
spectrum/tests/filters_benchmark_rocm.hpp
spectrum/src/fft_func/tests/test_fft_benchmark_rocm.hpp
spectrum/src/fft_func/tests/fft_maxima_benchmark_rocm.hpp
spectrum/src/fft_func/tests/fft_processor_benchmark_rocm.hpp
spectrum/src/filters/tests/filters_benchmark_rocm.hpp
spectrum/src/lch_farrow/tests/test_lch_farrow_benchmark_rocm.hpp
spectrum/src/lch_farrow/tests/lch_farrow_benchmark_rocm.hpp
spectrum/include/spectrum/types/fft_results.hpp
spectrum/include/spectrum/types/spectrum_profiling.hpp
spectrum/include/spectrum/interface/i_spectrum_processor.hpp
stats/tests/snr_estimator_benchmark.hpp
stats/tests/test_statistics_compute_all_benchmark.hpp
signal_generators/tests/test_signal_generators_benchmark_rocm.hpp
signal_generators/tests/signal_generators_benchmark_rocm.hpp
linalg/tests/capon_benchmark.hpp
```

**Замены** (только в комментариях, **не** в коде):

| До | После |
|----|-------|
| `→ GPUProfiler` | `→ ProfilingFacade` |
| `через GPUProfiler` | `через ProfilingFacade` |
| `для GPUProfiler` | `для ProfilingFacade` |
| `GPUProfiler копит` | `ProfilingFacade копит` |
| `RecordROCmEvent → GPUProfiler` | `RecordROCmEvent → ProfilingFacade` |

**Скрипт** (одной командой через `sed -i` после визуальной проверки):

```bash
cd /home/alex/DSP-GPU
for f in <файлы из списка выше>; do
  sed -i 's/GPUProfiler/ProfilingFacade/g' "$f"
done
git diff --stat   # должны быть только комменты, ноль кода
```

**Acceptance**:
- `grep -rn "GPUProfiler" spectrum/ stats/ signal_generators/ linalg/ --include="*.hpp"` — пусто (или только Doc/, MemoryBank/)
- `git diff` — только комментарии, никаких изменений в `auto& profiler =` / `Record()` и т.п.
- Сборка после правки — зелёная (но это формальность, /** ... */ не влияет на компиляцию)

---

### D6. Финальный sessions-отчёт `profiler_v2_done_*.md`

**Файл**: `MemoryBank/sessions/profiler_v2_done_2026-XX-XX.md` (XX-XX = дата закрытия Closeout)

**Структура**:

```markdown
# Profiler v2 — DONE (closeout report)

## TL;DR
- Дата старта: 2026-04-17
- Дата финала: 2026-XX-XX
- Effort факт: ~XX часов (vs estimate 28-40 ч + 4-6 ч закрытие документации)
- Результат: ProfilingFacade — единственная точка профилирования, 9 репо зелёные

## Хронология
| Дата | Что |
|------|-----|
| 2026-04-17 | Phase A + A0.5 + B1 |
| 2026-04-18 | Phase B2 + B3 |
| 2026-04-19 | Phase B4 |
| 2026-04-20 | Phase C + Phase D (spectrum) |
| 2026-04-23 | Phase D × 5 + теги v0.3.0/v0.3.1 |
| 2026-04-27 (день) | Phase E2 + E3 + E4 |
| 2026-04-27 (вечер) | RemoveLegacy DONE |
| 2026-XX-XX | Documentation Closeout DONE |

## Метрики

### Performance
- Record() avg latency: 307 ns (G8 норма < 1000 ns) — × 3.3 запас
- Memory budget (100K records): 23.65 MB (G9 норма < 200 MB) — × 8.5 запас
- ComputeSummary(10K records): 0 ms (G10 норма < 500 ms) — sub-millisecond

### Architecture
- Legacy GPUProfiler: 884 LOC (1 класс) → удалён
- ProfilingFacade: ~5+ SOLID-компонент, ~XXXX LOC всего

### Coverage
- core: 123 PASS / 0 FAIL
- spectrum: 10 / 0
- stats: 110 / 0
- signal_generators: 44 / 0
- heterodyne: 56 / 0
- linalg: 26 / 0
- strategies: 3 / 0
- radar: 6 / 0

## Артефакты
- Спека: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md` (актуализирована)
- Архив v1: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_v1_archive.md`
- Doc: `core/Doc/Services/Profiling/Full.md`
- Doxygen: `core/Doc/Doxygen/html/`
- Правило: `MemoryBank/.claude/rules/06-profiling.md`

## Что осталось в backlog
- **Q7 (roctracer integration)** — `TASK_Profiler_v2_Roctracer_Q7.md`. 5-полевой GPU-clock timing. Effort 16-24 ч. Тянуть когда упрёмся в микро-оптимизацию.
- **E6 CI workflow** — `TASK_Profiler_v2_CI_RunSerial.md`. По решению Alex (дополнительные runner-минуты).
```

**Acceptance**:
- Файл создан в `MemoryBank/sessions/`
- Все метрики и даты — из реальных коммитов (`git log --oneline | grep profiler`)
- Ссылки на артефакты — рабочие (relative paths)

---

## ✅ Acceptance Criteria для всего таска

| # | Критерий | Проверка |
|---|----------|----------|
| 1 | `core/Doc/Services/Profiling/Full.md` создан | `ls core/Doc/Services/Profiling/Full.md` |
| 2 | Спека имеет секцию 22 «Status of implementation» | `grep -n "Status of implementation" MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md` |
| 3 | Архив v1 создан, секции 3.2-3.6/5-6/10 перенесены | `ls MemoryBank/specs/GPUProfiler_Rewrite_Proposal_v1_archive.md` |
| 4 | Doxygen html пересобран без ошибок | `doxygen.log` без `error:` |
| 5 | Doxygen-комменты в *_benchmark_rocm.hpp обновлены | `grep -rn "GPUProfiler" spectrum/ stats/ SG/ linalg/ --include="*.hpp"` пусто (вне Doc/) |
| 6 | `sessions/profiler_v2_done_*.md` создан | `ls MemoryBank/sessions/profiler_v2_done_*.md` |
| 7 | Сборка core + spectrum зелёная (после комментарий-правок) | `cmake --build core/build && cmake --build spectrum/build` |

---

## 🚦 Порядок выполнения (рекомендуется)

```
D5 (комменты sed-правки)  ← быстро, минимальный риск, открывает чистый grep
   ↓
D1 (Full.md)               ← пишется по реальному коду
   ↓
D2 + D3 (спека + архив)    ← вместе, переносим секции
   ↓
D4 (doxygen rebuild)       ← после D5+D1 чтобы получить полный набор
   ↓
D6 (sessions/_done.md)     ← финал, агрегирует всё
```

---

## 🚫 Запреты

- **CMake не трогать** — все правки уже сделаны (RemoveLegacy).
- **Не пересоздавать** теги v0.3.0/v0.3.1 — они валидны.
- **Не удалять** `GPUProfiler_Rewrite_Proposal_2026-04-16.md` — только дополнить и заархивировать секции.
- **Doxygen** — не менять `Doxyfile` без OK Alex (только пересборка html).

---

*Created: 2026-04-27 by Кодо. Owner: следующая сессия (можно дома, без GPU).*
