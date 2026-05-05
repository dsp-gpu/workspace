# TASK_RAG_08 — Pilot: 6 use_cases на spectrum

> **Статус**: pending · **Приоритет**: HIGH · **Время**: ~2 ч · **Зависимости**: TASK_RAG_07

## Цель

Сгенерировать 6 use_cases на spectrum через агент 2, ревью Alex'ом ≥4 как `human_verified`.

## Список use-case'ов (черновик, утончняется в ходе)

| Slug | Title | Primary class |
|---|---|---|
| `fft_batch_signal` | Прямой FFT для batch-сигнала с антенного массива | FFTProcessorROCm |
| `fft_batch_to_magnitudes` | FFT + амплитуды на GPU без D2H | FFTProcessorROCm |
| `fft_mag_phase` | FFT с возвратом mag+phase+freq | FFTProcessorROCm |
| `filter_apply_fir` | FIR-фильтр для batch-сигнала | FirFilterROCm |
| `lch_farrow_fractional_delay` | LCH+Farrow дробная задержка | LchFarrowROCm |
| `find_spectrum_maxima` | Поиск пиков (1/2/all) в FFT-спектре | SpectrumMaximaFinder |

## Шаги

1. `dsp-asst rag usecases build --repo spectrum --suggest-via-ai --dry-run` — увидеть AI-предложения.
2. Alex отбирает 6-7 (из списка выше + AI), помечает galочками.
3. Реальная генерация по каждой.
4. Ревью каждого .md: правки → `human_verified=true`.

## DoD

- [ ] 6+ файлов в `spectrum/.rag/use_cases/*.md`.
- [ ] ≥4 помечены `human_verified=true` в `rag_dsp.use_cases`.
- [ ] **`qdrant.count("dsp_gpu_rag_v1", filter={"target_table":"use_cases","repo":"spectrum"}) ≥ 6`** (vectors залиты в Qdrant).
- [ ] **PG count == Qdrant count** для `target_table='use_cases'`, `repo='spectrum'` (консистентность).
- [ ] Re-run skip 100% (по `md_hash` + source_hash).
- [ ] Smoke retrieval: `qdrant.search(qv="прямой FFT для антенного массива", filter={"target_table":"use_cases"}, top_k=3)` возвращает `fft_batch_signal` в топ-3.

## Связано с

- План: §13 шаги 11-13
- Ревью v2.1: §«Таски → TASK_RAG_08»
- Блокирует: TASK_RAG_09
