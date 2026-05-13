# TASK: Миграция legacy namespace → `dsp::<repo>::*`

**Создано**: 2026-05-03
**Статус**: 🟡 IN_PROGRESS — **spectrum + stats (2/7) выполнены** на Windows 2026-05-12 (spectrum pushed, stats local)
**Триггер реактивации**: ~~после стабилизации `doxytags`-агента + первого обучения локальной AI~~ — Alex решил начать с spectrum-пилота 12.05 на Windows (Phase B QLoRA ещё не сделана, идём в параллель).
**План**: `MemoryBank/specs/namespace_migration_spectrum_plan_2026-05-12.md`

---

## ✅ Прогресс 2026-05-12 — spectrum + stats (2 из 7 модулей)

### stats (выполнен после spectrum, тот же рецепт, локально)

| Коммит | Что | Статистика |
|--------|-----|------------|
| `stats Phase1+2` | namespace `statistics`/`snr_estimator`/`gpu_sort`/`snr_defaults` → `dsp::stats::*` + git mv include/stats → include/dsp/stats + 33 #include rewrites | 18 файлов |
| `stats Phase3` | Doc + .rag content + test_params rename (statistics_X.md → dsp_stats_X.md) | 12 файлов |
| `stats PhaseB` | structural cleanup + cross-repo refs fix (fft_processor::X → dsp::spectrum::X в snr_estimator_op + statistics_types + tests) + CMake target_sources + python/CMake | 8 файлов |

**Особенность stats**: модуль зависит от spectrum через `dsp::spectrum::FFTProcessorROCm`, `dsp::spectrum::WindowType`, `dsp::spectrum::MagPhaseParams`. После миграции spectrum stats ссылается на новые namespace — обновлено в PhaseB.

### spectrum (выполнен и запушен ранее)

### Сделано локально на Windows (НЕ запушено, НЕ собрано на Debian)

| Коммит | Что | Статистика |
|--------|-----|------------|
| `spectrum 675fa1e` | **Phase 1** — namespace replace (fft_processor/filters/lch_farrow → dsp::spectrum) + using namespace + closing comments + inline FQN | 78 файлов / 302 lines |
| `spectrum 00ace9c` | **Phase 2** — physical move `include/spectrum/` → `include/dsp/spectrum/` + 116 `#include` rewrites | 61 файл / 116 правок |
| `workspace 6bbe2bc` | spec плана миграции (319 строк) | 1 файл |

### Что ещё нужно сделать (Phase 3+, эта же сессия)

- [ ] **Doc/** — `Doc/API.md` + `Doc/filters_API.md` (legacy namespace в примерах кода)
- [ ] **.rag/** — `_RAG.md` fqn fields + `test_params/*.md` (renaming + content) + `use_cases/*.md` + `arch/{C3,C4}_code.md`
- [ ] **MemoryBank/golden_set/** — `qa_v{1,2}.jsonl` expected_fqn + 8 eval_reports/*.json
- [ ] **Структурная зачистка** (Phase B2):
  - Удалить legacy дубликаты тестов в `src/{fft_func,filters,lch_farrow}/tests/` (dead code, не подключаются в tests/CMakeLists.txt)
  - Удалить OpenCL `.cl` + manifest.json в `src/{fft_func,filters,lch_farrow}/kernels/` (правило 09 — только ROCm)
  - Удалить `.hip` дубликаты в `src/fft_func/kernels/` (diff = 0 с `kernels/rocm/`)
  - Выпрямить `src/{fft_func,filters,lch_farrow}/src/*.cpp` → `src/{fft_func,filters,lch_farrow}/*.cpp` (убрать лишний `/src/` слой)
  - CMake `target_sources` rewrite (11 строк)
- [ ] **`python/CMakeLists.txt`** — убрать dead include paths `${PROJECT_SOURCE_DIR}/src/X/include` (каталоги не существуют)

---

## 🐧 Что нужно протестировать на Debian (после переноса всех правок)

### 1. Сборка spectrum
```bash
cd /home/alex/DSP-GPU/spectrum
git pull --ff-only
cmake --preset debian-local-dev -B build
cmake --build build -j$(nproc) 2>&1 | tee /tmp/spectrum_build.log
# Acceptance: 0 errors, 0 warnings от dsp::spectrum namespace
```

**Что искать в логе**:
- `error: 'fft_processor' has not been declared` → пропущен FQN replace (откатить + найти)
- `fatal error: spectrum/X.hpp: No such file` → пропущен #include rewrite на `dsp/spectrum/`
- `undefined reference to 'dsp::spectrum::...'` → namespace внутри одного файла, FQN из другого — расхождение

### 2. C++ тесты
```bash
ctest --test-dir /home/alex/DSP-GPU/spectrum/build --output-on-failure
# Acceptance:
# - test_spectrum_main PASS
# - все namespace dsp::spectrum:: разрешаются
# - 0 segfault при компиляции (значит ABI совместим)
```

### 3. Python биндинги
```bash
# Auto-deploy сработал? .so в DSP/Python/libs/?
ls -la /home/alex/DSP-GPU/DSP/Python/libs/dsp_spectrum*.so

# Импорт работает?
python3 -c "import sys; sys.path.insert(0, '/home/alex/DSP-GPU/DSP/Python/libs'); import dsp_spectrum; print(dir(dsp_spectrum))"
# Acceptance:
# - модуль грузится без ImportError
# - dsp_spectrum.FFTProcessorROCm доступен
# - dsp_spectrum.FirFilterROCm доступен
# - dsp_spectrum.LchFarrowROCm доступен
```

### 4. Python integration тесты
```bash
cd /home/alex/DSP-GPU
python3 DSP/Python/integration/t_signal_to_spectrum.py
python3 DSP/Python/integration/t_hybrid_backend.py
python3 DSP/Python/spectrum/t_cpu_fft.py   # CPU smoke (без GPU)
# Acceptance: PASS / SKIP (если GPU не виден — SKIP норма), но НЕ FAIL
```

### 5. Зависимые репо (НЕ должны ломаться, т.к. ничего не используют из spectrum)
```bash
cd /home/alex/DSP-GPU/radar && cmake --preset debian-local-dev -B build && cmake --build build -j$(nproc)
cd /home/alex/DSP-GPU/strategies && cmake --preset debian-local-dev -B build && cmake --build build -j$(nproc)
# Acceptance: оба собираются БЕЗ правок (доказательство изолированности миграции)
```

### 6. Старые .rag индексы (RAG smoke, после Phase 3)
```bash
# Проверка что _RAG.md / test_params обновлены и валидны:
dsp-asst dsp_find FFTProcessorROCm   # должен вернуть fqn: dsp::spectrum::FFTProcessorROCm
dsp-asst dsp_show_symbol <id>        # FQN должно быть dsp::spectrum::*
```

### 7. Решение по push
После того как все 6 пунктов PASS на Debian:
- Push spectrum (3 commit'а: Phase 1 + Phase 2 + Phase 3 Doc/RAG/CMake)
- Push workspace (1 commit: spec)
- Tag spectrum как `v0.X.0-namespace-migration` (если Alex решит фиксировать veil)

---

## Зависимости

- ✅ Стабильный `doxytags`-агент (Phase A работает на legacy)
- ✅ Первое обучение AI (хотя бы baseline R@5)
- ⚠️ **Согласие Alex'а на каждую итерацию** — миграция модуля = breaking change для зависимых репо.
- ⚠️ Pybind должен пройти gate (Python тесты `t_*.py` зелёные на новом namespace).

---

## Зачем

Правило `10-modules.md` и каждый `<repo>/CLAUDE.md` говорят: namespace должен быть `dsp::<repo>::ClassName` (например `dsp::spectrum::FFTProcessorROCm`). Реальный код этого **не следует**:

| Класс | Реальный namespace | По правилу 10 |
|---|---|---|
| `FFTProcessorROCm` | `fft_processor::` | `dsp::spectrum::` |
| `FirFilterROCm`, `KalmanFilterROCm`, `MovingAverageFilterROCm` | `filters::` | `dsp::spectrum::filters::` или `dsp::spectrum::` |
| `LchFarrowROCm` | `lch_farrow::` | `dsp::spectrum::` |
| `MatrixOpsROCm`, `CaponProcessorROCm` | `vector_algebra::` / `capon::` | `dsp::linalg::` |
| `RangeAngleROCm`, `FmCorrelatorROCm` | `range_angle::` / `fm_correlator::` | `dsp::radar::` |
| `StatisticsProcessorROCm`, `SnrEstimator` | `statistics::` / `snr_estimator::` | `dsp::stats::` |
| `HeterodyneDechirpROCm` | `heterodyne::` | `dsp::heterodyne::` |
| `SignalGeneratorROCm`, `FormSignalGenerator` | `signal_gen::` / `form_signal::` | `dsp::signal_generators::` |

Также путь include: `include/<repo>/...` → `include/dsp/<repo>/...` (правило 10 + 05).

---

## План — последовательность миграции

### Фаза 1. Обучение AI на legacy (текущий пилот, 2026-05-Q2)
- doxytags расставляет doxygen + @test-теги на legacy namespace.
- RAG-индексер строит индекс по `fft_processor::FFTProcessorROCm`.
- Локальная AI учится на этом снапшоте.

### Фаза 2. Миграция (после стабилизации doxytags)
**Скоуп: один модуль за итерацию** (Вариант B + C, согласовано с Alex 2026-05-03):

| # | Репо | legacy ns | target ns | Estimate |
|---|---|---|---|---|
| 1 | `spectrum` | `fft_processor::`, `filters::`, `lch_farrow::` | `dsp::spectrum::` | 4-6 ч |
| 2 | `stats` | `statistics::`, `snr_estimator::` | `dsp::stats::` | 2-3 ч |
| 3 | `signal_generators` | `signal_gen::`, `form_signal::` | `dsp::signal_generators::` | 2-3 ч |
| 4 | `heterodyne` | `heterodyne::` | `dsp::heterodyne::` | 1-2 ч |
| 5 | `linalg` | `vector_algebra::`, `capon::` | `dsp::linalg::` | 3-4 ч |
| 6 | `radar` | `range_angle::`, `fm_correlator::` | `dsp::radar::` | 3-4 ч |
| 7 | `strategies` | `strategies::` (уже близко) | `dsp::strategies::` | 1-2 ч |

Каждая итерация = отдельный коммит/PR, чтобы можно было откатить.

**Что меняется в каждом репо**:
1. `include/<repo>/...` → `include/dsp/<repo>/...` (физический move).
2. `namespace fft_processor { ... }` → `namespace dsp::spectrum { ... }` (или nested).
3. Все `#include <spectrum/fft_processor_rocm.hpp>` → `#include <dsp/spectrum/fft_processor_rocm.hpp>` в **зависимых репо** (radar, strategies, тесты).
4. CMake `target_include_directories` обновить.
5. Pybind11: `dsp_spectrum_module.cpp` — Python имена уже `dsp_spectrum`, **не меняются**, но C++ `using` обновить.
6. Тесты: `using namespace fft_processor` → `using namespace dsp::spectrum`.

### Фаза 3. Переобучение AI
- Регенерация всех `.rag/_RAG.md` + `test_params/*.md` через `dsp-asst manifest refresh-all`.
- Re-index: `dsp-asst index build --root E:\DSP-GPU` (~10 мин).
- Re-embed: `dsp-asst index embeddings --re-embed`.
- QLoRA fine-tune (если был) — переобучить на новом снапшоте.

### Фаза 4. Verification
- Golden set Q&A — обновить expected_fqn (replace `fft_processor::` → `dsp::spectrum::`).
- R@5 на golden set должен остаться ≥ 0.64 (текущий baseline).
- AI-агент на запросе «найди FFT processor» возвращает `dsp::spectrum::FFTProcessorROCm`, не legacy.

---

## Зависимости

- ✅ Стабильный `doxytags`-агент (Phase A работает на legacy)
- ✅ Первое обучение AI (хотя бы baseline R@5)
- ⚠️ **Согласие Alex'а на каждую итерацию** — миграция модуля = breaking change для зависимых репо.
- ⚠️ Pybind должен пройти gate (Python тесты `t_*.py` зелёные на новом namespace).

---

## Что **НЕ** делаем

- ❌ Не мигрируем `core/` — там `drv_gpu_lib::*` зафиксирован как публичный API (правило 10 §"Namespace": «Старый `drv_gpu_lib::*` остаётся только в `core/`»).
- ❌ Не делаем «алиасы» (`namespace fft_processor = dsp::spectrum`) — это плодит сущности без пользы.
- ❌ Не мигрируем все 7 модулей одной итерацией — слишком большой diff.

---

## Связанные документы

- `MemoryBank/specs/Review_LLM_RAG_specs_2026-05-03.md` §3.1, §9.1 — контекст
- `MemoryBank/.claude/rules/10-modules.md` §"Namespace" — целевое состояние
- `MemoryBank/.claude/rules/05-architecture-ref03.md` §"Структура модуля" — целевые пути include
- `MemoryBank/specs/LLM_and_RAG/Session_Handoff_2026-05-01.md` §4.1 — текущая R@5 baseline (0.64)

---

## Acceptance criteria (per-iteration)

- [ ] Все `.cpp` / `.hpp` модуля используют `dsp::<repo>::` namespace
- [ ] `include/<repo>/` → `include/dsp/<repo>/` (физически)
- [ ] CMake собирается на Debian (`debian-local-dev` preset)
- [ ] Все C++ тесты (`<repo>/tests/`) — зелёные
- [ ] Все Python тесты (`DSP/Python/<module>/t_*.py`) — зелёные
- [ ] Зависимые репо (radar, strategies) пересобираются без ошибок
- [ ] `_RAG.md` + `test_params/` регенерированы через `manifest refresh --repo <X>`
- [ ] golden_set обновлён (expected_fqn новые)

*Maintained by: Кодо.*
