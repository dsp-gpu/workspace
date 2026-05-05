---
schema_version: 1
kind: pipelines
repo: strategies                          # для composer-репо имеет смысл больше всего
ai_generated: false
human_verified: true
updated_at: 2026-05-01
---

# Pipelines — готовые цепочки обработки

> Список реальных production-pipeline'ов и их компонентов.
> Используется агентом для ответов вида «как сделать X end-to-end».

---

## Pipeline: AntennaCovariance (полный анализ антенного массива)

**Назначение**: из IQ-сигнала с антенного массива получить угловой спектр Capon.

**Цепочка**:
```
raw_iq [beam, n_point] complex<float>
   │
   ▼  spectrum::PadDataOp                   ← zero-padding до nFFT=2^n
   ▼
[beam, nFFT] complex<float>
   │
   ▼  fft_processor::FFTProcessorROCm::ProcessComplex
   ▼
spectrum [beam, nFFT] complex<float>
   │
   ▼  spectrum::ComputeMagnitudesOp        ← опционально, |X|² для отбора пика
   ▼
[beam, nFFT] float
   │
   ▼  linalg::CovarianceMatrixOp           ← пер-частотная ков. матрица
   ▼
[nFFT, beam, beam] complex<float>
   │
   ▼  capon::CaponProcessor               ← угловой спектр
   ▼
angular_spectrum [nFFT, n_angles] float
```

**Используемые классы**:
- `spectrum::PadDataOp` (Layer 5) — `spectrum`
- `fft_processor::FFTProcessorROCm` (Layer 6 facade) — `spectrum`
- `spectrum::ComputeMagnitudesOp` (Layer 5) — `spectrum`
- `linalg::CovarianceMatrixOp` — `linalg`
- `capon::CaponProcessor` (Layer 6) — `linalg`

**Композитор**: `strategies::AntennaCovariancePipeline` (Layer 7).

**Параметры (умные дефолты для радара)**:
```yaml
beam_count: 128
n_point: 6000
sample_rate: 10e6
n_angles: 181              # -90°..+90° с шагом 1°
window: Hann
```

**Граничные случаи**:
- `beam_count > 256` — VRAM upper bound на 11 GB карте
- ковариация требует Hermitian → внутри pipeline проверяется

---

## Pipeline: SnrEstimation (быстрая оценка SNR)

**Назначение**: оценить SNR на каждой частоте без D2H copy.

**Цепочка**:
```
raw_iq [beam, n_point] complex<float>
   │
   ▼  fft_processor::FFTProcessorROCm::ProcessMagnitudesToGPU(window=Hann, squared=true)
   ▼
magnitudes_squared [beam, nFFT] float          ← на GPU
   │
   ▼  statistics::SnrEstimatorOp::ExecuteOnGPU
   ▼
snr_db [beam, nFFT] float                       ← на GPU
   │
   ▼  опциональный D2H
   ▼
result [beam, nFFT] float
```

**Используемые классы**:
- `fft_processor::FFTProcessorROCm::ProcessMagnitudesToGPU` — `spectrum`
- `statistics::SnrEstimatorOp` — `stats`

**Зачем `ProcessMagnitudesToGPU`**: избегаем D2H roundtrip. Вход для SnrEstimator
сразу на GPU, экономим ~2 ms на 128×8192.

---

## Pipeline: LfmDechirp (демодуляция ЛЧМ)

**Назначение**: dechirp ЛЧМ-сигнала, получение пика дальности.

**Цепочка**:
```
raw_iq [beam, n_samples] complex<float>
   │
   ▼  signal_gen::LfmConjugateGeneratorROCm   ← опорный сигнал
   ▼
ref_lfm [n_samples] complex<float>
   │
   ▼  drv_gpu_lib::HeterodyneDechirp          ← смешение
   ▼
dechirped [beam, n_samples] complex<float>
   │
   ▼  fft_processor::FFTProcessorROCm::ProcessComplex
   ▼
range_spectrum [beam, nFFT]
   │
   ▼  argmax (CPU или statistics::MedianRadixSortOp)
   ▼
range_index [beam] int
```

**Используемые классы**:
- `signal_gen::LfmConjugateGeneratorROCm` — `signal_generators`
- `drv_gpu_lib::HeterodyneDechirp` — `heterodyne`
- `fft_processor::FFTProcessorROCm` — `spectrum`
- `statistics::MedianRadixSortOp` — `stats` (опционально)

---

## Соглашение

Каждый pipeline — отдельная секция `## Pipeline: <Name>` со схемой потока
данных, списком классов, параметрами и граничными случаями. Не меньше 3 секций
на репо `strategies`. На compute-репо (spectrum, stats, ...) обычно 1-3 типичных.
