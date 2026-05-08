# TASK_RAG_code_embeddings — Nomic-Embed-Code как 2-я коллекция

> **Этап:** CONTEXT-FUEL (C8) · **Приоритет:** 🟡 P2 · **Effort:** ~5-6 ч · **Зависимости:** none
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`

## 🎯 Цель

Добавить **вторую** коллекцию эмбеддингов на `nomic-ai/CodeRankEmbed` (специализированная для кода) поверх существующей BGE-M3. Гибрид `0.6*BGE + 0.4*Nomic` в RRF на cpp/hip/python чанках.

**Зачем:** BGE-M3 общий (MTEB ~71); Nomic-Embed-Code специализирован на коде (MTEB ~78). Ожидаемый прирост: **+5-15% R@5 на cpp/hip-запросах**.

## 📋 Подэтапы

### 1. Установка модели (~30 мин)

```bash
# на dsp-asst машине
pip install sentence-transformers>=3.0
huggingface-cli download nomic-ai/CodeRankEmbed --local-dir ~/.cache/models/nomic-code
```

Конфиг в `dsp_assistant/config/loader.py`:
```python
NOMIC_CODE_PATH = "~/.cache/models/nomic-code"
NOMIC_CODE_DIM = 768
```

### 2. Schema + Qdrant collection (~1 ч)

```sql
-- pgvector: вторая колонка для Nomic
ALTER TABLE rag_dsp.embeddings ADD COLUMN vec_code vector(768);
CREATE INDEX idx_embeddings_vec_code ON rag_dsp.embeddings
  USING hnsw (vec_code vector_cosine_ops);
```

Qdrant: новая коллекция `dsp_gpu_code_v1`, dim=768, payload включает `symbol_id`.

### 3. Re-embed cpp/hip/python чанков (~2 ч)

`dsp_assistant/indexer/embedder_nomic.py`:
```python
def embed_code_chunks(chunks: list[Chunk]) -> list[ndarray]:
    """Только code-chunks (kind ∈ {class, method, function, hpp_header, hip_kernel})."""
    # batch=32, fp16 на CUDA если есть
    return model.encode([c.text for c in chunks], batch_size=32, ...)
```

CLI: `dsp-asst rag embed --model nomic-code --kinds class,method,function,hpp_header,hip_kernel`.

Время на 2080 Ti: ~9 мин compute (5432 чанков × ~10/сек).

### 4. Гибрид BGE+Nomic в `rag_hybrid.py` (~1.5 ч)

```python
def hybrid_search(query, top_k=5):
    # dense_bge   = bge_search(query, top=200)            # vec(1024)
    # dense_nomic = nomic_search(query, top=200)          # vec(768) на code-chunks
    # sparse_tsv  = tsv_search(query, top=50)             # tsvector

    # RRF слияние с весами:
    #   bge_weight = 0.6 (универсальный, для рус-запросов)
    #   nomic_weight = 0.4 (boost для code-chunks)
    #   sparse_weight = 0.4 (после C3)

    return rerank(merged_top_50)
```

**Важно:** на `category=exact_name` не должно быть регресса (R@5=0.88 → ≥0.85). Добавить feature flag `--no-nomic` для отката.

### 5. Eval (~1 ч)

- Прогон golden-set v1 на 4 конфигах: `bge-only`, `bge+sparse`, `bge+nomic`, `bge+nomic+sparse`
- Замер R@5/MRR на каждой `category` отдельно
- Запись в `_eval_code_embeddings_2026-05-XX.md`
- Принятие решения: оставлять Nomic или нет

## ✅ DoD

- [ ] `nomic-ai/CodeRankEmbed` установлен, `embedder_nomic.py` работает
- [ ] `rag_dsp.embeddings.vec_code` заполнен на ≥80% code-chunks
- [ ] Qdrant `dsp_gpu_code_v1` существует и наполнен
- [ ] `rag_hybrid.py` поддерживает гибрид с feature flag `--no-nomic`
- [ ] R@5 на `category=semantic_*` (cpp/hip-запросы) ≥ baseline + 5%
- [ ] R@5 на `category=exact_name` не упал ниже 0.85
- [ ] Eval-отчёт в `MemoryBank/specs/LLM_and_RAG/_eval_code_embeddings_2026-05-XX.md`

## ⚠️ Риски

- Re-embed 5432 чанков на 2080 Ti — ~9 мин, но если CUDA OOM на batch=32 → fallback на CPU (медленно: ~30 мин)
- Гибрид может ухудшить русские/markdown-запросы (BGE их понимает лучше) → веса `0.6/0.4` подобраны эмпирически, может потребовать tune

## Артефакты

- `dsp_assistant/indexer/embedder_nomic.py`
- `dsp_assistant/migrations/2026-05-08_nomic_code_column.sql`
- `dsp_assistant/retrieval/rag_hybrid.py` — расширение
- `MemoryBank/specs/LLM_and_RAG/_eval_code_embeddings_2026-05-XX.md`

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Парный: `TASK_RAG_late_chunking_2026-05-08.md` (другой подход — улучшить BGE без смены модели)
- Spec 13 §3.11 — Code-specific embeddings

*Maintained by: Кодо · 2026-05-08*
