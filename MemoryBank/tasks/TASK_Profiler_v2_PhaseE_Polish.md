# TASK Phase E: Polish + Tests + Merge

> **Prerequisites**: Phase A-D выполнены, все 6 репо на `new_profiler`
> **Effort**: 3-5 часов
> **Scope**: core/ + meta DSP/ + финальные PR
> **Depends**: Phase D

---

## 🎯 Цель

1. Почистить SUPERSEDED секции спеки (R1)
2. Golden file тесты для JSON/MD (G3, G4)
3. CI workflow для ветки `new_profiler` (R8)
4. Создать PR из `new_profiler → main` для каждого репо
5. После OK Alex — tag `v0.3.0`

---

## 📋 Шаги

### E1. Архивировать SUPERSEDED секции (R1)

**Source**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md`
**Target**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_v1_archive.md` (новый)

Из спеки перенести (copy) в архив:
- Секции 3.2-3.6 (первоначальный дизайн aggregate-on-fly)
- Секции 5-6 (старый план миграции)
- Секция 10 (старые decision points)

В исходной спеке эти блоки заменить на ссылку:
```markdown
> **Архив**: секции 3.2-3.6, 5-6, 10 перенесены в
> `GPUProfiler_Rewrite_Proposal_v1_archive.md`.
> Актуальная архитектура — секции 14-19.
```

---

### E2. Тесты ProfileAnalyzer на realistic-данных

**Новый файл**: `core/tests/test_profile_analyzer_realistic.hpp`

Unit-тесты, которые имитируют реальный benchmark workload:

```cpp
inline void TestEndToEnd_SpectrumFftPipeline() {
    ProfileStore store;
    // 100 runs × 3 events (Upload, FFT, Download)
    for (int i = 0; i < 100; ++i) {
        store.Append(MakeRec(0, "spectrum", "Upload",    i*10000 + 100));
        store.Append(MakeRec(0, "spectrum", "FFT",       i*10000 + 1000));
        store.Append(MakeRec(0, "spectrum", "Download",  i*10000 + 500));
    }

    auto snap = store.GetSnapshot();
    auto pb = ProfileAnalyzer::ComputePipelineBreakdown("spectrum", snap[0]["spectrum"]);
    ASSERT_NEAR(pb.total_avg_ms, 1.6, 0.01);    // Upload=0.1 + FFT=1.0 + Download=0.5
    ASSERT_EQ(pb.entries.size(), 3u);
    // FFT должен быть сверху (самое тяжёлое)
    ASSERT_EQ(pb.entries[0].event_name, "FFT");
    ASSERT_NEAR(pb.entries[0].percent, 62.5, 1.0);   // 1.0/1.6 = 62.5%
}
```

---

### E3. Golden file тесты (G3, G4)

**Новые файлы**:
- `core/tests/golden/profiler_report_spectrum.json`
- `core/tests/golden/profiler_report_spectrum.md`
- `core/tests/test_golden_export.hpp`

Подход:
1. Генерируем фиксированный набор records (детерминированный: фиксированные ns)
2. Экспортируем в tmp-файл
3. Сравниваем с golden-файлом **без учёта timestamp** (timestamp фильтруется regex'ом)

```cpp
inline void TestGolden_JsonExport_MatchesReference() {
    auto records = MakeDeterministicFixture();   // 5 events × 10 runs
    ProfilingFacade& f = ProfilingFacade::GetInstance();
    f.Reset();
    for (const auto& r : records) f.Record(...);
    f.WaitEmpty();

    std::string actual_path = "/tmp/actual_spectrum.json";
    JsonExporter je;
    auto snap = f.GetSnapshot();
    GPUReportInfo info; info.device_name = "TEST_GPU";
    ASSERT_TRUE(je.Export(snap, info, actual_path));

    auto actual  = ReadFile(actual_path);
    auto golden  = ReadFile("tests/golden/profiler_report_spectrum.json");
    actual = std::regex_replace(actual, std::regex("\"timestamp\":\"[^\"]+\""), "\"timestamp\":\"<TIMESTAMP>\"");
    golden = std::regex_replace(golden, std::regex("\"timestamp\":\"[^\"]+\""), "\"timestamp\":\"<TIMESTAMP>\"");
    ASSERT_EQ(actual, golden);
}
```

**Генерация golden** (один раз):
```bash
cd E:/DSP-GPU/core
cmake --build build --target test_golden_export
# Первый запуск — НЕТ golden файла. Запустить так:
GENERATE_GOLDEN=1 ./build/tests/test_golden_export
# Проверить output глазами — если норм → git add tests/golden/
```

Тест должен поддерживать режим "regenerate" через env var.

> ⚠️ **RUN_SERIAL обязателен**: golden-тесты используют `ProfilingFacade::Reset()` + singleton. При параллельном `ctest -j` они могут race'иться с другими тестами, которые тоже используют ProfilingFacade. В `tests/CMakeLists.txt` добавить свойство:
> ```cmake
> set_tests_properties(test_golden_export PROPERTIES RUN_SERIAL TRUE)
> set_tests_properties(test_quality_gates PROPERTIES RUN_SERIAL TRUE)
> ```
> ⚠️ Это изменение в CMake — показать Alex DIFF, дождаться OK. Альтернатива: вынести golden-тесты в отдельный executable который ctest запускает через `ctest -L golden --serial` (без правки CMake свойств).

---

### E4. G8/G9/G10/G11 Quality Gates — enforcement tests

**Новый файл**: `core/tests/test_quality_gates.hpp`

```cpp
// G8: Record() latency < 1us (non-blocking)
inline void TestQG_RecordLatency_Under1us() { ... }

// G9: Memory < 200MB для 1000×10×10
inline void TestQG_MemoryBudget_Under200MB() {
    // уже есть в B2 — переиспользовать
}

// G10: Compute() < 500ms для 10K records
inline void TestQG_ComputeLatency_Under500ms() {
    std::vector<ProfilingRecord> recs;
    recs.reserve(10000);
    for (int i = 0; i < 10000; ++i) {
        ROCmProfilingData d{}; d.start_ns = i*100; d.end_ns = d.start_ns + 500;
        recs.push_back(record_from_rocm(d, 0, "m", "e"));
    }
    auto t0 = std::chrono::steady_clock::now();
    auto s = ProfileAnalyzer::ComputeSummary(recs);
    auto dt = std::chrono::duration_cast<std::chrono::milliseconds>(
                  std::chrono::steady_clock::now() - t0).count();
    ASSERT_TRUE(dt < 500);
}

// G11: record_from_rocm correctly converts all fields — уже в B1 тестах
```

---

### E5. Обновить спеку (добавить секцию "Реализация")

**Файл**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md`

Добавить в конец:

```markdown
---

## 22. Статус реализации (2026-04-17)

| Phase | Status | Commit in core/new_profiler | Notes |
|-------|--------|---------------------------|-------|
| A     | ✅ DONE | abc1234 | OpenCL removed |
| B1    | ✅ DONE | ... | ProfilingRecord |
| B2    | ✅ DONE | ... | ProfileStore |
| B3    | ✅ DONE | ... | ProfileAnalyzer |
| B4    | ✅ DONE | ... | ReportPrinter |
| C     | ✅ DONE | ... | Exporters + Facade |
| D     | ✅ DONE | ... | Cross-repo (6 repos, radar excluded) |
| E     | ✅ DONE | ... | Polish + PRs |

### Финальные решения
- counters: std::map (C3 Round 3 — scale 1-5K/test ОК)
- singleton: kept in benchmarks (W1 Round 3)
- radar: excluded (W6)
```

---

### E6. CI workflow для new_profiler (R8)

⚠️ **СПРОСИТЬ ALEX** — правка `.github/workflows/` может повлиять на CI billing и требует согласования.

Если OK — создать `workspace/.github/workflows/new_profiler_integration.yml`:

```yaml
name: new_profiler integration
on:
  push:
    branches: [new_profiler]
  pull_request:
    branches: [new_profiler]

jobs:
  build_all_repos:
    runs-on: [self-hosted, rocm, debian]
    steps:
      - uses: actions/checkout@v4
        with: { path: workspace }

      - name: Clone all repos on new_profiler
        run: |
          for repo in core spectrum stats signal_generators heterodyne linalg strategies DSP; do
            git clone --branch new_profiler --single-branch \
              https://github.com/dsp-gpu/$repo.git $repo || \
            git clone https://github.com/dsp-gpu/$repo.git $repo
            (cd $repo && git checkout new_profiler 2>/dev/null || git checkout main)
          done

      - name: Build DSP meta
        run: |
          cd DSP
          cmake --preset debian-local-dev
          cmake --build build -j

      - name: Run all tests
        run: ctest --test-dir DSP/build --output-on-failure
```

---

### E7. Создать PR для core (первым) + merge + tag

**КРИТИЧНО**: порядок имеет значение из-за FetchContent.

```bash
# core первым (остальные зависят)
cd E:/DSP-GPU/core
gh pr create --base main --head new_profiler --title "[profiler-v2] core rewrite" \
  --body-file ../DSP/docs/profiler_v2_pr_body.md

# Ждать merge core → main (Alex)
```

⚠️ **`gh pr create` и merge — ТОЛЬКО С OK ALEX.**

---

### E7.5. Tag core + обновить FetchContent в dep-репо (ДО merge dep PR)

**Почему это критично**: FetchContent в dep-репо обычно тянет `core` по GIT_TAG или main.  
Если dep-репо мёрджат в main пока `core/main` уже обновлён, **но тега ещё нет** — любой внешний клон (CI другого разработчика) увидит новый `core/main` + старые dep-репо с несовместимым API.

Решение: **пинуем core тегом до того как мёрджим dep-репо**.

```bash
# После того как Alex смёрджил core PR:
cd E:/DSP-GPU/core
git checkout main
git pull origin main
git tag v0.3.0-rc1 -m "profiler-v2: core rewrite ready, dep репо ещё мёрджатся"
git push origin v0.3.0-rc1    # ⚠️ OK Alex обязателен (CLAUDE.md: теги неизменяемы)
```

Затем в каждом dep-репо обновить FetchContent pin:

```bash
for repo in spectrum stats signal_generators heterodyne linalg strategies DSP; do
  cd E:/DSP-GPU/$repo
  git checkout new_profiler
  # Точечно заменить GIT_TAG в cmake/fetch_deps.cmake:
  # FetchContent_Declare(dsp_core ... GIT_TAG v0.3.0-rc1 ...)
  # ⚠️ CMake-правка — показать Alex DIFF, дождаться OK.
done
```

После OK Alex на CMake-правки:
```bash
for repo in spectrum stats signal_generators heterodyne linalg strategies DSP; do
  cd E:/DSP-GPU/$repo
  git add cmake/fetch_deps.cmake
  git commit -m "[profiler-v2] pin core to v0.3.0-rc1 for PR merge"
done
```

---

### E7.6. PR для dep-репо (после tag core)

```bash
for repo in spectrum stats signal_generators heterodyne linalg strategies; do
    cd E:/DSP-GPU/$repo
    gh pr create --base main --head new_profiler \
        --title "[profiler-v2] migrate $repo benchmarks" \
        --body "Migrate benchmarks to ProfilingFacade::BatchRecord API. Pinned to core v0.3.0-rc1."
done

# Последним — DSP meta-repo
cd E:/DSP-GPU/DSP
gh pr create --base main --head new_profiler --title "[profiler-v2] meta update"
```

---

### E8. Tag v0.3.0 после merge

После того как Alex мёрджит PR в main (каждый репо):

```bash
cd E:/DSP-GPU/<repo>
git checkout main
git pull
git tag v0.3.0
git push origin v0.3.0   # ⚠️ OK Alex
```

**Теги неизменяемы!** (CLAUDE.md) — если ошибка, тег `v0.3.1`, не перезаписывать.

---

### E8.5. Doxygen документация новых компонент (опционально)

После tag'а — обновить Doxygen через `doxygen-maintainer` агент:

```yaml
Agent(
  description: "update Doxygen for profiler v2",
  subagent_type: "doxygen-maintainer",
  prompt: |
    В core/ добавлены новые классы в namespace drv_gpu_lib::profiling:
      - ProfilingRecord, ProfileStore, ProfileAnalyzer, ReportPrinter,
        IProfileExporter, JsonExporter, MarkdownExporter, ConsoleExporter,
        ProfilingFacade, IProfilerRecorder, ScopedProfileTimer.

    Обнови Doxyfile (если нужны новые @group), пересобери HTML.
    НЕ трогай CMake — только Doc/Doxygen/Doxyfile.

    Проверь что cross-репо TAGFILES указывают на core.tag (новые структуры
    должны быть кликабельны из spectrum/Doc, heterodyne/Doc и т.д.).
)
```

Если Doxygen текущая фаза отложена (Alex сказал «пока не делаем» — см. temp-doc-verifier) — пропустить E8.5, сделать отдельной задачей.

---

### E9. Final commit + report

В `MemoryBank/sessions/profiler_v2_done_<date>.md`:

```markdown
# GPUProfiler v2 rewrite — DONE

- Phase A-E completed in 28-35 hours actual
- 6 repos migrated (radar excluded per W6 decision)
- All gates passed: G1-G11
- Golden files stable
- PRs merged: core#NN, spectrum#NN, ...

Baseline vs v2 perf (from A0.5 vs E4 measurements):
- Record() latency: 0.8 us → 0.9 us (acceptable, within G8)
- ExportJSON: 120 ms → 95 ms (parallel export bonus)
- libcore.so size: 2.1 MB → 2.3 MB (counters + L1/L2/L3 code)

Next: roctracer integration for full 5-field timing (see spec Q7).
```

---

## ✅ Acceptance Criteria

| # | Критерий | Проверка |
|---|----------|---------|
| 1 | SUPERSEDED архивированы | файл `v1_archive.md` существует |
| 2 | Golden files в репо | `ls core/tests/golden/*.json` непусто |
| 3 | Quality gates tests зелёные | `ctest -R test_quality_gates` green |
| 4 | CI workflow pushed | `.github/workflows/new_profiler_integration.yml` существует |
| 5 | 7 PRs открыты | gh pr list --state open |
| 6 | После merge — тег v0.3.0 | `git tag -l "v0.3.*"` |
| 7 | Sessions-отчёт написан | `ls MemoryBank/sessions/profiler_v2_done*.md` |

---

## 🚨 Action Items для Alex

После завершения E1-E5 (всё локально):
1. Ревью финального кода
2. OK на `git push origin new_profiler` (core first, потом остальные)
3. OK на `gh pr create` (каждый PR)
4. Ревью каждого PR
5. Merge → tag → push tag

---

## 📖 Замечания

- **Golden-тесты fragile** — если формат JSON меняется, нужно regenerate. Процедура:
  1. Убедиться что изменение интенциональное
  2. `GENERATE_GOLDEN=1 ./test_golden_export`
  3. Глазами проверить diff
  4. `git add tests/golden/`

- **CI может упасть** на первом запуске — self-hosted runner с ROCm нужен. Если нет — закоммитить workflow и задокументировать "CI TBD" в README.

- **v0.3.0** — произвольный номер. Согласовать с Alex, возможно он хочет v1.0.0.

---

*Task created: 2026-04-17 | Phase E | Status: READY (after D)*
