# Промпт для subagent / сестрёнки: TASK_RAG_code_embeddings (C8 — Nomic-Embed-Code)

> **Создан:** 2026-05-08 · **Целевой TASK:** `MemoryBank/tasks/TASK_RAG_code_embeddings_2026-05-08.md`
> **Effort:** ~5-6 ч · **Приоритет:** 🟡 P2 · **Зависимости:** none (полностью независимая задача)
> **Координатор:** `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`
> **Парный таск (можно делать параллельно):** `TASK_RAG_late_chunking_2026-05-08.md`

---

## 0. Прочитать ПЕРЕД началом

1. `MemoryBank/tasks/TASK_RAG_code_embeddings_2026-05-08.md` — DoD (источник истины)
2. `MemoryBank/specs/LLM_and_RAG/RAG_deep_analysis_2026-05-08.md` §3.11 — Code-specific embeddings
3. `MemoryBank/specs/LLM_and_RAG/_eval_rerank_2026-05-06.md` — текущий baseline R@5/MRR
4. `MemoryBank/.claude/rules/03-worktree-safety.md` — писать только в `e:/DSP-GPU/`
5. **HuggingFace card:** `nomic-ai/CodeRankEmbed` (через WebFetch если есть доступ — иначе локальная карточка модели)

## 1. Цель

Добавить **вторую** коллекцию эмбеддингов на `nomic-ai/CodeRankEmbed` (768d, специализирована на коде)
поверх существующей BGE-M3 (1024d). Гибрид через RRF: `0.6*BGE + 0.4*Nomic` на code-chunks.

**Зачем:** BGE-M3 общий (MTEB ~71); Nomic-Embed-Code на коде ~78 → ожидаем **+5-15% R@5** на cpp/hip-запросах
без регресса на `category=exact_name` (≥ 0.85).

## 2. Где живёт код (изученная инфраструктура)

```
c:/finetune-env/dsp_assistant/
├── retrieval/
│   ├── embedder.py             ← Embedder через FlagEmbedding/BGEM3FlagModel (1024d)
│   ├── vector_store.py         ← PgVectorStore: embeddings(symbol_id PK, collection, embedding vector)
│   ├── rag_vector_store.py     ← Qdrant `dsp_gpu_rag_v1` для doc_blocks/use_cases/pipelines (1024d)
│   ├── rag_hybrid.py           ← HybridRetriever (340 строк) — расширяем
│   └── pipeline.py             ← retrieval по symbols (pgvector)
├── indexer/
│   └── build.py                ← entry-point индексации
├── config/loader.py            ← StackConfig / EmbedderConfig
└── migrations/                 ← SQL-миграции
```

**Критические факты (после ревью):**

- **Таблица `embeddings`** (без `rag_dsp.` префикса — в `public`!) с `PRIMARY KEY (symbol_id)`.
  Текущий UPSERT — `ON CONFLICT (symbol_id) DO UPDATE` → одна запись на символ.
- BGE-M3 живёт через **`BGEM3FlagModel`** (FlagEmbedding) — НЕ raw `transformers`. Есть `.encode()`.
- `VECTOR_SIZE = 1024` хардкод в `rag_vector_store.py:37` — для Nomic 768 нужна **отдельная Qdrant
  коллекция** (нельзя смешивать).
- Nomic-Embed-Code работает через `sentence-transformers>=3.0` (или `transformers` напрямую).

## 3. Архитектурное решение (важно — отличается от текущего таска)

**TASK предлагает:** `ALTER TABLE rag_dsp.embeddings ADD COLUMN vec_code vector(768)`.
**Реальность:** таблица в `public.embeddings` с PK по `symbol_id`, ON CONFLICT update'ит запись.

**Решение — отдельная таблица `embeddings_code`:**

```sql
-- 2026-05-XX_nomic_code_embeddings.sql
CREATE TABLE IF NOT EXISTS embeddings_code (
    symbol_id   INTEGER     PRIMARY KEY REFERENCES symbols(id) ON DELETE CASCADE,
    collection  TEXT        NOT NULL DEFAULT 'nomic-code',
    embedding   vector(768) NOT NULL,
    indexed_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_code_hnsw
    ON embeddings_code USING hnsw (embedding vector_cosine_ops);
```

**Преимущества:**
- Не трогаем существующий `vector_store.py` upsert (BGE поток не ломаем)
- Параллельный поиск через JOIN или 2 query
- Откат тривиальный — `DROP TABLE embeddings_code`

## 4. Подэтапы

### 4.1 Установка модели (~30 мин)

```bash
pip install "sentence-transformers>=3.0"
huggingface-cli download nomic-ai/CodeRankEmbed --local-dir ~/.cache/models/nomic-code
```

В `dsp_assistant/config/loader.py` (`EmbedderConfig` / новый `CodeEmbedderConfig`):
```python
@dataclass
class CodeEmbedderConfig:
    model_name: str = "nomic-ai/CodeRankEmbed"
    local_path: str = "~/.cache/models/nomic-code"
    dim: int = 768
    batch_size: int = 32
    max_length: int = 8192
    use_fp16: bool = True
    device: str | None = None  # auto
```

> ⚠️ **Не плодить env vars без OK** — если уже есть `EmbedderConfig.device`, переиспользовать.

### 4.2 Schema + Qdrant collection (~1 ч)

**SQL миграция** (см. §3 — `embeddings_code`).

**Qdrant — новая коллекция `dsp_gpu_code_v1`:**

`dsp_assistant/retrieval/code_vector_store.py` (НОВЫЙ — копируем pattern из `rag_vector_store.py`,
но dim=768, collection name другая):
```python
DEFAULT_CODE_COLLECTION = "dsp_gpu_code_v1"
CODE_VECTOR_SIZE = 768
NS_CODE = uuid.UUID("a1b2c3d4-...")  # СВОЙ namespace, не NS_RAG!

class CodeQdrantStore:
    """Qdrant `dsp_gpu_code_v1` для code-chunks (Nomic 768d)."""
    def upsert(self, points: list[CodeVectorPoint]) -> int: ...
    def search(self, qvec, top_k, kinds=None, repos=None) -> list[CodeHit]: ...
```

> ⚠️ **NS_CODE — НОВЫЙ UUID** (сгенерировать через `uuid.uuid4()` ОДИН РАЗ и зафиксировать
> константой). Использовать NS_RAG нельзя — UUID v5 коллизий не будет, но семантика разная.

### 4.3 Embedder Nomic (~1 ч)

`dsp_assistant/indexer/embedder_nomic.py`:
```python
from __future__ import annotations
import numpy as np
from sentence_transformers import SentenceTransformer
from dsp_assistant.config.loader import CodeEmbedderConfig

class CodeEmbedder:
    """Wrapper для Nomic-Embed-Code (768d). По API похож на retrieval/embedder.Embedder."""

    QUERY_PREFIX = "Represent this query for searching relevant code: "
    # NOMIC docs: code-chunks без префикса; query — с префиксом

    def __init__(self, cfg: CodeEmbedderConfig | None = None):
        self.cfg = cfg or CodeEmbedderConfig()
        self._model = None

    def _ensure_model(self):
        if self._model is None:
            self._model = SentenceTransformer(
                self.cfg.local_path,
                trust_remote_code=True,
                device=self.cfg.device,
            )

    def encode_code(self, texts: list[str], batch_size: int | None = None) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.cfg.dim), dtype=np.float32)
        self._ensure_model()
        bs = batch_size or self.cfg.batch_size
        return self._model.encode(
            texts, batch_size=bs, normalize_embeddings=True,
        ).astype(np.float32)

    def encode_query(self, query: str) -> np.ndarray:
        return self.encode_code([self.QUERY_PREFIX + query])[0]


_default: CodeEmbedder | None = None
def get_code_embedder() -> CodeEmbedder:
    global _default
    if _default is None:
        _default = CodeEmbedder()
    return _default
```

> ⚠️ **Nomic-Embed-Code требует префикс на query** (по карточке). Пометить в коде явно.

### 4.4 Re-embed code chunks (~2 ч)

CLI команда (расширение `cli/main.py`):
```
dsp-asst rag embed --model nomic-code \
    --kinds class,method,function,hpp_header,hip_kernel \
    [--repo X] [--limit N]
```

Логика:
1. SELECT из `symbols` где `kind IN (...)` — получаем `symbol_id, fqn, code_text` (или подгрузить из файла)
2. `CodeEmbedder.encode_code(texts, batch_size=32)`
3. UPSERT в `embeddings_code` + Qdrant `dsp_gpu_code_v1`
4. Прогресс-бар (логи каждые 500 чанков)

**Замечание про `code_text`:** в `symbols` пока хранится doxy_brief, не полный код метода.
Нужно либо прочитать файл по `(file_id → path, line_start, line_end)`, либо использовать
существующее поле (см. `chunker_cpp.py:CppSymbol` — есть ли `body_text`).

> ⚠️ **Проверить `chunker_cpp.py`** — что именно индексируется. Если только signature/doxy —
> нужен дополнительный шаг чтения тела метода через `read_file(path, line_start, line_end)`.

### 4.5 Гибрид BGE+Nomic в `rag_hybrid.py` (~1.5 ч)

Расширить `HybridRetriever.query()` (или сделать отдельный `CodeHybridRetriever` для symbols
поиска — НЕ путать с RAG-документным retriever'ом, который сейчас в `rag_hybrid.py`).

**Ключевое замечание:** `rag_hybrid.py` сейчас работает с **doc_blocks/use_cases/pipelines**,
а Nomic-Embed индексирует **symbols** (классы/методы/функции). Это **разные** retrieval-сценарии:

- `rag_hybrid.py` → концептуальный поиск (use_case, pipeline)
- `pipeline.py` (`SymbolRetriever`) → поиск конкретных классов/методов

**Правильное место для гибрида BGE+Nomic — `pipeline.py`**, не `rag_hybrid.py`.

```python
# retrieval/pipeline.py — добавляем _code_search

def hybrid_search_symbols(
    self,
    query: str,
    *,
    top_k: int = 5,
    use_nomic: bool = True,   # feature flag
    bge_weight: float = 0.6,
    nomic_weight: float = 0.4,
) -> list[SymbolHit]:
    bge_q   = self.bge_embedder.encode_query(query)
    bge_hits = self.pgvector.search(bge_q, top_k=200, collection="public_api")

    if not use_nomic:
        return self._rerank_and_topk(query, bge_hits, top_k)

    nomic_q = self.code_embedder.encode_query(query)
    code_hits = self.code_store.search(nomic_q, top_k=200)  # Qdrant dsp_gpu_code_v1

    merged = _rrf_merge(
        [(bge_hits, bge_weight), (code_hits, nomic_weight)],
        k=60,  # RRF constant
    )
    return self._rerank_and_topk(query, merged, top_k)
```

**Feature flag** `--no-nomic` в CLI и `use_nomic=False` в API — обязательно (для отката).

### 4.6 Eval (~1 ч)

```bash
# 4 конфига:
dsp-asst eval golden_set --config bge-only       --output _eval_bge.json
dsp-asst eval golden_set --config bge+sparse     --output _eval_bge_sparse.json
dsp-asst eval golden_set --config bge+nomic      --output _eval_bge_nomic.json
dsp-asst eval golden_set --config bge+nomic+sparse --output _eval_full.json
```

Замер: R@5 / MRR@10 на каждой `category` отдельно (`exact_name`, `semantic_cpp`, `semantic_hip`,
`semantic_python`, `pipeline`, `use_case`).

Отчёт → `MemoryBank/specs/LLM_and_RAG/_eval_code_embeddings_2026-05-XX.md`.

## 5. DoD (cопия из таска + уточнения)

- [ ] `nomic-ai/CodeRankEmbed` установлен, `embedder_nomic.py` работает
- [ ] **`embeddings_code`** таблица создана (НЕ `vec_code` колонка в существующей)
- [ ] `embeddings_code` заполнен на ≥80% code-chunks (`kind ∈ {class, method, function, hpp_header, hip_kernel}`)
- [ ] Qdrant `dsp_gpu_code_v1` существует и наполнен (count == count в pg)
- [ ] `pipeline.py` (или новый `code_hybrid.py`) поддерживает `use_nomic` flag
- [ ] R@5 на `category=semantic_cpp/semantic_hip` ≥ baseline + 5%
- [ ] R@5 на `category=exact_name` не упал ниже **0.85**
- [ ] Eval-отчёт записан

## 6. Smoke-команды

```bash
# 1. Установка модели
huggingface-cli download nomic-ai/CodeRankEmbed --local-dir ~/.cache/models/nomic-code
python -c "from dsp_assistant.indexer.embedder_nomic import get_code_embedder; \
  e = get_code_embedder(); v = e.encode_query('FFT batch'); print(v.shape)"
# (768,)

# 2. Миграция
dsp-asst migrate apply

# 3. Re-embed (small dry run)
dsp-asst rag embed --model nomic-code --kinds class --repo spectrum --limit 50

# 4. Counts
psql -d rag_dsp -c "SELECT count(*) FROM embeddings_code;"

# 5. Search smoke
dsp-asst search "функция БПФ для комплексного сигнала" --use-nomic
dsp-asst search "функция БПФ для комплексного сигнала" --no-nomic   # отключение

# 6. Eval
dsp-asst eval golden_set --config bge+nomic --output /tmp/_eval_bge_nomic.json
```

## 7. Жёсткие правила

- ❌ **`pytest` запрещён** → `common.runner.TestRunner` + `SkipTest` (правило 04)
- ❌ **CMake** не трогать (правило 12). SQL-миграции — OK
- ❌ **Worktree:** только `e:/DSP-GPU/` (правило 03)
- ❌ **Git push/tag** — только OK Alex (правило 02)
- ❌ **Не менять `vector_store.py:upsert`** — BGE поток не трогаем
- ✅ **Не плодить:** `CodeEmbedder` — НЕ копия `Embedder`. Используется отдельно (sentence-transformers, не FlagEmbedding)
- ✅ **Feature flag `--no-nomic`** обязательно — для отката

## 8. Артефакты

| Файл | Действие |
|------|----------|
| `dsp_assistant/indexer/embedder_nomic.py` | НОВЫЙ |
| `dsp_assistant/retrieval/code_vector_store.py` | НОВЫЙ (Qdrant `dsp_gpu_code_v1`) |
| `dsp_assistant/migrations/2026-05-XX_nomic_code_embeddings.sql` | НОВЫЙ — `CREATE TABLE embeddings_code` |
| `dsp_assistant/retrieval/pipeline.py` | расширить — `hybrid_search_symbols(use_nomic=...)` |
| `dsp_assistant/cli/main.py` | +`rag embed --model nomic-code`, +`--no-nomic` flag |
| `dsp_assistant/config/loader.py` | +`CodeEmbedderConfig` |
| `MemoryBank/specs/LLM_and_RAG/_eval_code_embeddings_2026-05-XX.md` | Eval-отчёт |

## 9. Риски

- **CUDA OOM** на batch=32 → fallback batch=8 на CPU (медленно — ~30 мин на 5432 чанка)
- **Nomic offline mode** — требует HF cache; если `DSP_ASST_OFFLINE_HF=1` без cache — упадёт
- **Body text для symbols** — может не индексироваться сейчас. Если так — отдельный mini-step:
  читать файл по `(file_id, line_start, line_end)` через `read_file`
- **Веса 0.6/0.4** — эмпирические, могут потребовать tuning после eval

## 10. По завершении

1. Пометить DoD ✅ в `MemoryBank/tasks/TASK_RAG_code_embeddings_2026-05-08.md`
2. Обновить `MemoryBank/tasks/IN_PROGRESS.md`
3. Сессионный отчёт → `MemoryBank/sessions/YYYY-MM-DD.md`
4. Eval-отчёт обязателен — без него нельзя оценить эффект
5. **НЕ** делать git push/tag без OK

---

*Maintained by: Кодо · 2026-05-08*
