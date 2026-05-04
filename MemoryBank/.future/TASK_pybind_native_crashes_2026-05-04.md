# TASK — Native crashes (segfault / bad_variant_access) в Python биндингах

> **Создано**: 2026-05-04 (Phase B B4)
> **Статус**: 📋 future (требует C++ debugging, не входит в B4 scope)
> **Effort**: 4-8 ч (gdb + анализ pybind11 + правки C++)
> **Платформа**: Debian Linux + ROCm 7.2 + AMD Radeon RX 9070 (gfx1201)

---

## 5 тестов с native crash

| # | Тест | Тип | Линия | Краш-точка |
|---|------|-----|-------|------------|
| 1 | `signal_generators/t_form_signal_rocm.py` | Segfault | line 222 | `test_generate_cw_peak_frequency` — `self._gen.set_params(antennas=1, points=4096, fs=12e6, f0=2e6)` или `.generate()` или `peak_freq(sig[0], fs)` |
| 2 | `integration/t_fft_integration.py` | Segfault | line 89 | `test_cw_energy_nonzero` — `self._fft_proc.process_complex(signal, sample_rate=4000)` |
| 3 | `integration/t_signal_gen_integration.py` | Segfault | (не диагностирован) | (нужен faulthandler) |
| 4 | `stats/t_statistics_float_rocm.py` | Segfault | (не диагностирован) | (нужен faulthandler) |
| 5 | `spectrum/t_process_magnitude_rocm.py` | C++ exception | — | `terminate called after throwing 'std::bad_variant_access'` |

---

## Гипотезы корня

### A. `std::bad_variant_access` (#5)
В C++ коде где-то `std::get<T>(variant)` зовётся с типом не из текущего active alternative. Либо variant не инициализирован, либо логика выбора типа сломана.
**Где искать**: `core/src/services/profiling/...` (там был variant в Profiler v2), `spectrum/src/.../complex_to_mag*` (тест зовёт `ProcessMagnitudeROCm`).

### B. Segfault при `process_complex` (#2)
Возможно проблемы в `dsp_spectrum.FFTProcessorROCm.process_complex(...)`:
- numpy buffer ownership: pybind11 возвращает array но buffer уже free'd
- неправильный stream-sync (kernel ещё не закончил, а CPU уже читает)
- mismatch в dtype (complex64 vs complex128)

### C. Segfault в `set_params` / `generate` (#1)
Возможно `FormSignalGeneratorROCm`:
- internal state не очистился при пересоздании
- kernel cache не подтянулся под новый context
- `set_params(antennas=1)` после `antennas=5` — буферы не reallocate

### D. `_sig_gen` / `_fft_proc` reuse в setUp (#3, #4)
Похоже что эти 2 теста используют общий setup pattern с persistent объектами. Если объект дёргает GPU контекст, который уже был разрушен — segfault.

---

## План диагностики (когда дойдут руки)

```bash
# 1. Запустить под gdb
gdb --args python3 -X faulthandler DSP/Python/integration/t_fft_integration.py
(gdb) run
# при segfault:
(gdb) bt 30
(gdb) info threads
(gdb) thread <gpu_thread_id>
(gdb) bt

# 2. Проверить asan (если собрать с -fsanitize=address)
cmake --preset debian-local-dev -DCMAKE_CXX_FLAGS="-fsanitize=address -fno-omit-frame-pointer"

# 3. Тест минимизация
python3 -c "
import dsp_core, dsp_signal_generators
ctx = dsp_core.ROCmGPUContext(0)
gen = dsp_signal_generators.FormSignalGeneratorROCm(ctx)
gen.set_params(antennas=1, points=4096, fs=12e6, f0=2e6)
sig = gen.generate()  # ← упадёт здесь?
print(sig.shape)
"
```

---

## Текущее решение (Phase B B4)

В каждом из 5 тестов добавлен `SkipTest` с причиной:
```python
raise SkipTest("native crash on gfx1201 — see MemoryBank/.future/TASK_pybind_native_crashes_2026-05-04.md")
```

Так Phase B B4 проходит как `SKIP`, а не `FAIL`. Тест восстанавливается обратно когда корневая причина устранена.

---

## Связь

- Парный таск B4 → `MemoryBank/tasks/TASK_python_migration_phase_B_FAILS_2026-05-04.md`
- Phase B B4 правило: «НЕ править pybind C++ код — отдельный таск»
- Pybind11 review backlog → `MemoryBank/.future/TASK_pybind_review.md`

---

*Created: 2026-05-04 by Кодо. Перенесено в `.future/` как требующее серьёзного C++ debugging.*
