# Промпт для subagent / сестрёнки: TASK_RAG_code_embeddings (C8 — Nomic-Embed-Code)

> **Создан:** 2026-05-08 · **Ревью:** `MemoryBank/specs/rag_prompts_review_part2_2026-05-08.md` (CR1-CR2 учтены)
> **Мета-ревью + правки 8.05 вечер (Кодо main):** schema=`rag_dsp.embeddings_code` (не `public`), NS_CODE зафиксирован, CTX3-граница добавлена, RRF честно (вариант B), CLI `rag embed nomic-code` subgroup, VRAM с reranker'ом
> **Целевой TASK:** `MemoryBank/tasks/TASK_RAG_code_embeddings_2026-05-08.md`
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

**Критические факты (после ревью + мета-ревью 8.05 вечер):**

- **Таблица `embeddings`** живёт в **схеме `rag_dsp`** (`03_Database_Schema:43-46` —
  `CREATE SCHEMA rag_dsp; SET search_path TO rag_dsp, public;`). В SQL-запросах префикс часто
  опущен потому что `search_path` маскирует — но имя полное это `rag_dsp.embeddings`.
- На таблице **UNIQUE constraint** по `symbol_id` (`embeddings.symbol_id INT UNIQUE NOT NULL
  REFERENCES symbols(id)`, `03_Database_Schema:351`). Технический PK = `id SERIAL`. Один вектор
  на символ — да, но формулировать строго: `UNIQUE (symbol_id)`, не `PK = symbol_id`.
- Текущий UPSERT — `ON CONFLICT (symbol_id) DO UPDATE` (`vector_store.py:107-115`).
- BGE-M3 живёт через **`BGEM3FlagModel`** (FlagEmbedding) — НЕ raw `transformers`. Есть `.encode()`.
- `VECTOR_SIZE = 1024` хардкод в `rag_vector_store.py:37` — для Nomic 768 нужна **отдельная Qdrant
  коллекция** (нельзя смешивать).
- Nomic-Embed-Code работает через `sentence-transformers>=3.0` (или `transformers` напрямую).
  **Решение:** идём через **HF transformers + sentence-transformers**, НЕ через gguf/llama.cpp —
  для production-стабильности и CUDA fp16. Зафиксировано в §4.3.

## 3. Архитектурное решение (отличается от исходного TASK'а — обосновано)

**TASK предлагает:** `ALTER TABLE rag_dsp.embeddings ADD COLUMN vec_code vector(768)`.
**Проблема НЕ в имени схемы** (TASK был прав — таблица в `rag_dsp`), а в том что:
1. UNIQUE constraint по `symbol_id` → один вектор на символ. ALTER + новая колонка = смешение
   двух эмбеддеров в одной строке (грязно для bookkeeping и backfill'а).
2. dim различается (1024 vs 768) — нельзя одну hnsw-индекс делить.

**Решение — отдельная таблица `rag_dsp.embeddings_code` (явно с префиксом схемы):**

```sql
-- 2026-05-XX_nomic_code_embeddings.sql
SET search_path TO rag_dsp, public;

CREATE TABLE IF NOT EXISTS rag_dsp.embeddings_code (
    symbol_id   INTEGER     PRIMARY KEY REFERENCES rag_dsp.symbols(id) ON DELETE CASCADE,
    collection  TEXT        NOT NULL DEFAULT 'nomic-code',
    embedding   vector(768) NOT NULL,
    indexed_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_code_hnsw
    ON rag_dsp.embeddings_code USING hnsw (embedding vector_cosine_ops);
```

**Преимущества:**
- Не трогаем существующий `vector_store.py` upsert (BGE поток не ломаем)
- Параллельный поиск через JOIN или 2 query
- Откат тривиальный — `DROP TABLE rag_dsp.embeddings_code`

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
# NS_CODE — зафиксированный UUID v4 для UUID v5 namespace (как NS_RAG в rag_vector_store.py:34).
# Сгенерирован один раз 2026-05-08 через `python -c "import uuid; print(uuid.uuid4())"`.
# НЕ менять — иначе все point_id рассыпятся при следующей индексации.
NS_CODE = uuid.UUID("26fe9d67-f0bd-46fd-bc5a-100694e24004")

class CodeQdrantStore:
    """Qdrant `dsp_gpu_code_v1` для code-chunks (Nomic 768d)."""
    def upsert(self, points: list[CodeVectorPoint]) -> int: ...
    def search(self, qvec, top_k, kinds=None, repos=None) -> list[CodeHit]: ...
```

> ✅ **NS_CODE зафиксирован** (см. код выше). Использовать NS_RAG нельзя — отдельная коллекция
> требует своего namespace для UUID v5, иначе при пересечении target_id может быть коллизия.

### 4.3 Embedder Nomic (~1 ч)

> **Стек загрузки модели — фиксирован:** `sentence-transformers>=3.0` поверх `transformers`,
> `trust_remote_code=True`, `torch_dtype=torch.float16` на CUDA. **НЕ** через `gguf`/`llama.cpp`
> — для production-стабильности и единого CUDA fp16 пути. На Win и Debian — одинаково.

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

**CLI — где добавлять:** `cli/main.py:1060` определена группа `rag_group`, в ней уже есть
подгруппы `rag blocks` (строка ~1065) и `rag python` (строка ~1196). Команды `rag embed` **сейчас
нет** — добавить как новую subgroup рядом с `rag blocks`:

```python
@rag_group.group("embed")
def rag_embed_group():
    """Embed symbols / code-chunks через выбранную модель."""

@rag_embed_group.command("nomic-code")
@click.option("--kinds", default="class,method,function,hpp_header,hip_kernel")
@click.option("--repo", default=None)
@click.option("--limit", type=int, default=None)
@click.option("--no-nomic", is_flag=True, help="Отключить Nomic (для отката)")
def rag_embed_nomic_code(kinds, repo, limit, no_nomic):
    ...
```

**НЕ модифицировать `index embeddings`** (`cli/main.py:145`) — это legacy entry-point для BGE.

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

### 4.5 Гибрид BGE+Nomic в `pipeline.py` (~1.5 ч)

**Архитектурная граница (важно — НЕ путать code-search vs doc-RAG):**

| Сценарий | Что ищет | Где живёт | Embedder | Storage |
|---|---|---|---|---|
| **Code-search** | `symbols` (class/method/function/HIP-kernel) | `pipeline.py` | BGE-M3 1024d ⊕ **Nomic 768d (новое)** | pgvector `embeddings` + `embeddings_code` |
| **Doc-RAG** | `doc_blocks` / `use_cases` / `pipelines` | `rag_hybrid.py` (CTX3) | BGE-M3 1024d + **sparse PG** + **HyDE** (CTX3 коммиты ec006b3+5aa92bd) | Qdrant `dsp_gpu_rag_v1` |

→ **C8 правит ТОЛЬКО `pipeline.py`**. `rag_hybrid.HybridRetriever` НЕ трогаем — он уже завершён
в CTX3 и работает на 1024d Qdrant. Объединение двух путей (когда юзер задаёт code-вопрос через
HybridRetriever) — **отдельная задача (C10+ context_pack)**, не часть C8.

**Реализация в `pipeline.py`:**

```python
# retrieval/pipeline.py — расширяем существующий query() или добавляем _code_search

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

    merged = _weighted_rrf_merge(  # см. ниже — НЕ существующий _reciprocal_rank_fusion
        [(bge_hits, bge_weight), (code_hits, nomic_weight)],
        k=60,
    )
    return self._rerank_and_topk(query, merged, top_k)
```

**RRF-функция — честно (поправка к W2 первичного ревью):**

Существующая `pipeline.py:163` `_reciprocal_rank_fusion(dense, sparse, k_rrf=60)` принимает
**ровно 2 списка БЕЗ весов** и без N-way merge. Просто `weights=` параметр туда не передать.

Два пути — выбрать один:

- **(A) Расширить существующую** до N-way + опционального `weights`:
  `_reciprocal_rank_fusion(*ranked_lists: list[Hit], weights: list[float] | None = None, k_rrf: int = 60)`.
  Backward compat — старые вызовы `_reciprocal_rank_fusion(dense, sparse)` работают.
- **(B) Написать новую `_weighted_rrf_merge`** в `pipeline.py` рядом с существующей.
  Меньше риска регресса, минор-дублирование (~25 строк).

**Рекомендация:** B для C8 (минимум поверхности изменений), A — отдельной задачей рефакторинга
если ещё кто-то захочет N-way RRF.

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
| `dsp_assistant/migrations/2026-05-XX_nomic_code_embeddings.sql` | НОВЫЙ — `CREATE TABLE rag_dsp.embeddings_code` |
| `dsp_assistant/retrieval/pipeline.py` | расширить — `hybrid_search_symbols(use_nomic=...)` + `_weighted_rrf_merge` (вариант B из §4.5) |
| `dsp_assistant/cli/main.py` | +subgroup `rag_embed_group` (внутри `rag_group:1060`), команда `rag embed nomic-code [--no-nomic]` |
| `dsp_assistant/config/loader.py` | +`CodeEmbedderConfig` |
| `MemoryBank/specs/LLM_and_RAG/_eval_code_embeddings_2026-05-XX.md` | Eval-отчёт |

## 9. Риски

- **CUDA OOM** на batch=32 → fallback batch=8 на CPU (медленно — ~30 мин на 5432 чанка)
- **Nomic offline mode** — требует HF cache; если `DSP_ASST_OFFLINE_HF=1` без cache — упадёт
- **Body text для symbols** — может не индексироваться сейчас. Если так — отдельный mini-step:
  читать файл по `(file_id, line_start, line_end)` через `read_file`
- **Веса 0.6/0.4** — эмпирические, могут потребовать tuning после eval
- **VRAM budget на 2080 Ti (11 GB) с reranker'ом**: BGE-M3 (~1.1 GB) + Nomic-Embed-Code (~0.6-1.0 GB)
  + bge-reranker-v2-m3 (~1.1 GB, грузится через `get_reranker()` в `pipeline.py:301`) + KV-cache + batch
  ≈ **~4-5 GB** для C8 один. Параллельный запуск с C9 (LateChunkEmbedder ~1.1 GB) → ~6-8 GB —
  тонко. **НЕ запускать C8 и C9 параллельно** на одной 2080 Ti. Sequential.

## 10. По завершении

1. Пометить DoD ✅ в `MemoryBank/tasks/TASK_RAG_code_embeddings_2026-05-08.md`
2. Обновить `MemoryBank/tasks/IN_PROGRESS.md`
3. Сессионный отчёт → `MemoryBank/sessions/YYYY-MM-DD.md`
4. Eval-отчёт обязателен — без него нельзя оценить эффект
5. **НЕ** делать git push/tag без OK

---

*Maintained by: Кодо · 2026-05-08*
