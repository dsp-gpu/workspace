# TASK: Миграция legacy namespace → `dsp::<repo>::*`

**Создано**: 2026-05-03
**Статус**: 📌 perspective (не запланировано сейчас)
**Триггер реактивации**: после стабилизации `doxytags`-агента + первого обучения локальной AI на текущем коде

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
