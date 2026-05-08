# TASK_RAG_late_chunking — Late Chunking patch для BGE-M3

> **Этап:** CONTEXT-FUEL (C9) · **Приоритет:** 🟡 P2 · **Effort:** ~2 ч · **Зависимости:** none
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`
>
> ## ⏸️ ОТЛОЖЕН до 12.05.26 (AMD Radeon RX 9070)
>
> **Статус 2026-05-08:** попытка реализации показала 2 блокера:
> 1. **BGE-M3 архитектурно не подходит** — cos 0.99 на 6 chunks (нужен mean-pool fine-tune; BGE-M3 = CLS pool)
> 2. **Jina-v3 / Nomic-v1.5 несовместимы с transformers 5.7.0** на текущем Win venv (custom-code модели рассчитаны на transformers 4.x)
>
> **План перезапуска (Debian + AMD Radeon RX 9070, 12.05.26):**
> - Свежий venv с `transformers==4.46.0` (стабильная для jina/nomic custom code)
> - `embedder_bge_late.py` уже параметризован — сменить `DEFAULT_MODEL` → `jinaai/jina-embeddings-v3`
> - Прогнать тот же smoke `cos < 0.95` — если PASS, продолжить интеграцию в build.py + golden eval
>
> **Артефакты готовы для следующей сессии:**
> - `c:/finetune-env/dsp_assistant/indexer/embedder_bge_late.py` — scaffolding
> - `MemoryBank/specs/LLM_and_RAG/_eval_late_chunking_2026-05-08.md` — eval + список блокеров
> - `MemoryBank/specs/rag_late_chunking_implementation_review_2026-05-08.md` — self-review

## 🎯 Цель

Применить **Late Chunking** (Jina 2024) к BGE-M3 для длинных файлов:
- Сейчас: один символ = один эмбеддинг → класс на 600 строк теряет внутреннюю структуру
- После: pooling **после** трансформера, каждый chunk «знает» контекст всего файла

**Зачем:** метод `ProcessReal` находится по запросу «реальный FFT» точнее, потому что его embedding включает контекст «класс — обёртка hipFFT».

**Альтернатива/парный:** `TASK_RAG_code_embeddings` (C8 — Nomic). Late Chunking — другой подход: улучшить **BGE без смены модели**. Можно делать параллельно с C8.

## 📋 Подэтапы

### 1. Pooling-патч для BGE-M3 (~1 ч)

Стандартный flow: `tokenize → trans → pool(per-text) → vec(1024)`.
Late Chunking flow: `tokenize(full_file_8192_ctx) → trans → pool(per-chunk) → vec[N](1024)`.

`dsp_assistant/indexer/embedder_bge_late.py`:
```python
def embed_late_chunked(file_path: str, chunks: list[ChunkSpan]) -> list[ndarray]:
    """
    Один проход трансформера на весь файл (до 8192 токенов),
    затем mean-pool по token-spans каждого chunk.
    Каждый chunk-vec включает контекст всего файла.
    """
    tokens = tokenizer(read_file(file_path), max_length=8192, ...)
    hidden = model(tokens, output_hidden_states=True).last_hidden_state
    return [mean_pool(hidden[span.start:span.end]) for span in chunks]
```

### 2. Интеграция в indexer (~30 мин)

В `dsp_assistant/indexer/build.py` — для файлов **>3 chunks** включать late chunking
(оптимизация: маленькие файлы остаются на стандартном per-chunk encoding).

CLI флаг: `dsp-asst rag embed --late-chunking [--threshold 3]`.

### 3. Eval (~30 мин)

- Прогон golden-set v1 на длинных классах (`fft_processor::FFTProcessorROCm` ~600 строк, `linalg::CaponProcessor` ~400 строк)
- Замер R@5 до и после late chunking
- Ожидаемый прирост: **+5-10%** на длинных классах

## ✅ DoD

- [ ] `embedder_bge_late.py` работает на 1 файле (`spectrum/include/spectrum/fft_processor_rocm.hpp`)
- [ ] 6 chunks из этого файла имеют разные эмбеддинги (cosine sim < 0.95 — не дубликаты)
- [ ] Re-embed длинных файлов через `--late-chunking`
- [ ] R@5 на длинных классах ≥ baseline + 5%
- [ ] Eval-отчёт в `MemoryBank/specs/LLM_and_RAG/_eval_late_chunking_2026-05-XX.md`
- [ ] Feature flag `--late-chunking` (default off для совместимости)

## ⚠️ Риски

- BGE-M3 формально поддерживает 8192 ctx, но память при single-pass на 8192 токенов: ~2 GB на 2080 Ti — должно влезть, но проверить
- Mean-pool по span'у — простейший вариант. Если качество слабое — попробовать attention-weighted pool

## Артефакты

- `dsp_assistant/indexer/embedder_bge_late.py`
- `dsp_assistant/indexer/build.py` — расширение с auto-switch
- `MemoryBank/specs/LLM_and_RAG/_eval_late_chunking_2026-05-XX.md`

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Парный: `TASK_RAG_code_embeddings_2026-05-08.md` (другая стратегия)
- Источник: [arXiv 2409.04701 Late Chunking](https://arxiv.org/abs/2409.04701)

*Maintained by: Кодо · 2026-05-08*
