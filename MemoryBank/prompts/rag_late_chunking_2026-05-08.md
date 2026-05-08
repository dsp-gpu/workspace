# Промпт для subagent / сестрёнки: TASK_RAG_late_chunking (C9)

> **Создан:** 2026-05-08 · **Целевой TASK:** `MemoryBank/tasks/TASK_RAG_late_chunking_2026-05-08.md`
> **Effort:** ~2 ч · **Приоритет:** 🟡 P2 · **Зависимости:** none
> **Координатор:** `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`
> **Парный (можно параллельно):** `TASK_RAG_code_embeddings_2026-05-08.md`
> **Источник метода:** [arXiv 2409.04701 Late Chunking](https://arxiv.org/abs/2409.04701)

---

## 0. Прочитать ПЕРЕД началом

1. `MemoryBank/tasks/TASK_RAG_late_chunking_2026-05-08.md` — DoD (источник истины)
2. arXiv 2409.04701 — описание Late Chunking (Jina 2024)
3. `MemoryBank/specs/LLM_and_RAG/RAG_deep_analysis_2026-05-08.md` — общий контекст RAG-стека
4. `MemoryBank/.claude/rules/03-worktree-safety.md` — писать только в `e:/DSP-GPU/`

## 1. Цель

Применить **Late Chunking** к BGE-M3 для длинных файлов:

- **Сейчас:** один символ = один эмбеддинг (encode только текст символа без контекста файла)
- **После:** один проход transformer'а на весь файл (до 8192 ctx) → mean-pool по token-span'у
  каждого chunk → каждый chunk-vec **знает контекст всего файла**

**Зачем:** метод `ProcessReal` находится по «реальный FFT» точнее, потому что embedding включает
«класс — обёртка hipFFT». Ожидаемый прирост: **+5-10% R@5** на длинных классах
(`FFTProcessorROCm` ~600 строк, `CaponProcessor` ~400 строк).

## 2. Где живёт код (изученная инфраструктура)

```
c:/finetune-env/dsp_assistant/
├── retrieval/
│   ├── embedder.py             ← BGE-M3 через FlagEmbedding/BGEM3FlagModel (1024d)
│   └── vector_store.py         ← embeddings(symbol_id, collection, embedding) pgvector
├── indexer/
│   ├── build.py                ← entry-point индексации
│   ├── chunker_cpp.py          ← parse_cpp_file → list[CppSymbol] (line_start, line_end)
│   ├── chunker_python.py       ← аналогично для py
│   └── persister.py            ← upsert_symbol
└── cli/main.py                 ← `dsp-asst rag embed`
```

**Критические факты:**

- BGE-M3 живёт через **`BGEM3FlagModel`** (FlagEmbedding) — обёртка над `transformers`.
  `.encode()` возвращает только `dense_vecs`, **не отдаёт hidden_states** напрямую.
- Для Late Chunking нужны **hidden_states последнего слоя** на токены файла → нужен **прямой
  доступ** к `transformers.AutoModel` (XLM-RoBERTa под капотом BGE-M3).
- `BGEM3FlagModel._model.model` или `BGEM3FlagModel.model` — может дать прямой доступ к HF model.
  **Проверить через `dir()`** ДО написания.
- `CppSymbol` имеет `line_start, line_end` — для span'а нужна конверсия `line → token offset`.

## 3. Архитектурное решение (важное уточнение)

**Late Chunking требует прямой `transformers.AutoModel`**, не `BGEM3FlagModel`. Решение:

**Вариант A — отдельный загрузчик (РЕКОМЕНДУЕТСЯ для MVP):**
```python
from transformers import AutoTokenizer, AutoModel
import torch

class LateChunkEmbedder:
    """Прямой transformers для late chunking. Использует тот же XLM-RoBERTa что и BGE-M3."""

    def __init__(self, model_name="BAAI/bge-m3", device="cuda"):
        self.tok = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModel.from_pretrained(model_name, torch_dtype=torch.float16).to(device)
        self.model.eval()
```

**Вариант B — переиспользовать `BGEM3FlagModel`:**
- Доступ к `_model.model` (внутренний HF) — НЕ документировано, может сломаться при обновлении
- Не делаем без OK

**Решение:** Вариант A. Память: 2 копии XLM-RoBERTa (BGE через FlagEmbedding + наш AutoModel) ≈
~2× ~1.2 GB ≈ 2.5 GB на GPU. На 2080 Ti (11 GB) — OK.

> ⚠️ **Альтернатива** — выгрузить `_default_embedder` из `embedder.py` перед late-chunking
> прогоном. Но это усложняет — оставим как future optimization.

## 4. Подэтапы

### 4.1 Pooling-патч (~1 ч)

`dsp_assistant/indexer/embedder_bge_late.py`:
```python
from __future__ import annotations
import logging
import numpy as np
import torch
from pathlib import Path
from dataclasses import dataclass
from transformers import AutoTokenizer, AutoModel

log = logging.getLogger(__name__)

DEFAULT_MODEL = "BAAI/bge-m3"
MAX_TOKENS = 8192
BGE_DIM = 1024


@dataclass
class ChunkSpan:
    """Span чанка в символах файла. Конвертируется в token-offsets через offset_mapping."""
    name: str          # FQN символа
    char_start: int    # offset в файле (символы)
    char_end: int


class LateChunkEmbedder:
    def __init__(self, model_name: str = DEFAULT_MODEL, device: str = "cuda"):
        self.tok = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModel.from_pretrained(
            model_name, torch_dtype=torch.float16
        ).to(device)
        self.model.eval()
        self.device = device

    @torch.no_grad()
    def embed_file(
        self,
        file_text: str,
        chunks: list[ChunkSpan],
    ) -> dict[str, np.ndarray]:
        """Один проход на файл → mean-pool по token-span'у каждого chunk.
        Возврат: {chunk.name: ndarray(1024,)}"""
        # Tokenize с offset_mapping (нужен для char→token map)
        enc = self.tok(
            file_text,
            return_tensors="pt",
            return_offsets_mapping=True,
            truncation=True,
            max_length=MAX_TOKENS,
            padding=False,
        )
        offsets = enc.pop("offset_mapping")[0].tolist()  # [(char_start, char_end), ...]
        enc = {k: v.to(self.device) for k, v in enc.items()}

        out = self.model(**enc)
        hidden = out.last_hidden_state[0]  # (T, 1024)

        result: dict[str, np.ndarray] = {}
        for c in chunks:
            tok_start, tok_end = self._char_span_to_token_span(
                offsets, c.char_start, c.char_end
            )
            if tok_end <= tok_start:
                log.warning("chunk %s out of token range (truncated)", c.name)
                continue
            # mean pool с нормализацией (как в BGE-M3)
            chunk_vec = hidden[tok_start:tok_end].mean(dim=0)
            chunk_vec = torch.nn.functional.normalize(chunk_vec, p=2, dim=-1)
            result[c.name] = chunk_vec.float().cpu().numpy()
        return result

    @staticmethod
    def _char_span_to_token_span(
        offsets: list[tuple[int, int]], char_start: int, char_end: int
    ) -> tuple[int, int]:
        """Линейный поиск (offsets ≤ 8192 — быстро)."""
        tok_start = next(
            (i for i, (a, b) in enumerate(offsets) if b > char_start), len(offsets)
        )
        tok_end = next(
            (i for i, (a, b) in enumerate(offsets) if a >= char_end), len(offsets)
        )
        return tok_start, tok_end
```

> ⚠️ **`offset_mapping`** работает только для fast-tokenizer'а. Если `AutoTokenizer` загрузил slow —
> добавить `use_fast=True`. Для BGE-M3 fast tokenizer есть.

### 4.2 Конверсия `line → char` (~30 мин)

`CppSymbol` имеет `line_start, line_end` (1-based). Для `ChunkSpan.char_start/end` нужна функция:

```python
def line_span_to_char_span(file_text: str, line_start: int, line_end: int) -> tuple[int, int]:
    """1-based line numbers → char offsets. line_end inclusive."""
    lines = file_text.splitlines(keepends=True)
    char_start = sum(len(l) for l in lines[: line_start - 1])
    char_end = char_start + sum(len(l) for l in lines[line_start - 1 : line_end])
    return char_start, char_end
```

### 4.3 Интеграция в indexer (~30 мин)

В `dsp_assistant/indexer/build.py` — для файлов **>3 chunks** включать late chunking:

```python
def _embed_file_with_late_chunking(
    db, late_emb: LateChunkEmbedder, file_path: Path, syms: list[CppSymbol]
) -> int:
    file_text = file_path.read_text(encoding="utf-8", errors="ignore")
    spans = []
    for s in syms:
        cs, ce = line_span_to_char_span(file_text, s.line_start, s.line_end)
        spans.append(ChunkSpan(name=s.fqn, char_start=cs, char_end=ce))
    chunk_vecs = late_emb.embed_file(file_text, spans)

    # UPSERT в embeddings (collection='bge-late')
    symbol_ids, vectors = [], []
    for s in syms:
        if s.fqn in chunk_vecs:
            symbol_ids.append(db_resolve_symbol_id(s.fqn))
            vectors.append(chunk_vecs[s.fqn])
    return pg_store.upsert(symbol_ids, np.stack(vectors), collection="bge-late")
```

CLI флаг: `dsp-asst rag embed --late-chunking [--threshold 3]`.

> ⚠️ **collection name `bge-late`** — отдельная от `public_api` (BGE стандартного). На уровне SQL
> можно или (a) перезаписать `public_api` (риск регресса), или (b) хранить параллельно и
> переключать в search через флаг. **Безопаснее (b) для MVP** + после eval решаем.

### 4.4 Eval (~30 мин)

Прогон golden-set v1 на длинных классах (`fft_processor::FFTProcessorROCm` ~600 строк,
`linalg::CaponProcessor` ~400 строк):

```bash
dsp-asst eval golden_set --collection public_api --output /tmp/_eval_bge.json
dsp-asst eval golden_set --collection bge-late   --output /tmp/_eval_bge_late.json
```

Сравнение R@5 / MRR@10 — особенно на запросах про методы внутри длинных классов.

Отчёт → `MemoryBank/specs/LLM_and_RAG/_eval_late_chunking_2026-05-XX.md`.

## 5. DoD

- [ ] `embedder_bge_late.py` работает на 1 файле (`spectrum/include/spectrum/fft_processor_rocm.hpp`)
- [ ] 6+ chunks из этого файла имеют **разные** эмбеддинги (cosine sim < 0.95 — не дубликаты)
- [ ] Re-embed длинных файлов через `--late-chunking` → `embeddings(collection='bge-late')` заполнен
- [ ] R@5 на golden-set длинных классов ≥ baseline + 5%
- [ ] Eval-отчёт записан
- [ ] Feature flag `--late-chunking` (default off) — для совместимости

## 6. Smoke

```bash
# 1. Проверка работы на одном файле
python - <<'PY'
from pathlib import Path
from dsp_assistant.indexer.embedder_bge_late import LateChunkEmbedder, ChunkSpan
e = LateChunkEmbedder(device="cuda")
text = Path("e:/DSP-GPU/spectrum/include/spectrum/fft_processor_rocm.hpp").read_text()
# spans вручную для теста
spans = [
    ChunkSpan("class", 0, len(text) // 6),
    ChunkSpan("ProcessReal", len(text)//6, 2*len(text)//6),
    # ...
]
vecs = e.embed_file(text, spans)
import numpy as np
v1, v2 = vecs["class"], vecs["ProcessReal"]
print("cos:", float(v1 @ v2 / (np.linalg.norm(v1) * np.linalg.norm(v2))))
# должно быть < 0.95
PY

# 2. Re-embed длинного файла
dsp-asst rag embed --late-chunking --repo spectrum --kinds class,method --limit 50

# 3. Counts
psql -d rag_dsp -c "SELECT collection, count(*) FROM embeddings GROUP BY collection;"

# 4. Eval
dsp-asst eval golden_set --collection bge-late --output /tmp/late.json
```

## 7. Жёсткие правила

- ❌ **`pytest` запрещён** → `common.runner.TestRunner` + `SkipTest` (правило 04)
- ❌ **CMake** не трогать (правило 12). SQL-миграции — OK
- ❌ **Worktree:** только `e:/DSP-GPU/` (правило 03)
- ❌ **Git push/tag** — только OK Alex (правило 02)
- ❌ **Не менять `embedder.py`** — BGE стандартного потока не трогаем
- ✅ **Не плодить:** `LateChunkEmbedder` — отдельный класс, не тянет в `Embedder`
- ✅ **Feature flag `--late-chunking`** обязательно (default off)

## 8. Артефакты

| Файл | Действие |
|------|----------|
| `dsp_assistant/indexer/embedder_bge_late.py` | НОВЫЙ |
| `dsp_assistant/indexer/build.py` | расширить — auto-switch при `--late-chunking` + threshold |
| `dsp_assistant/cli/main.py` | +`--late-chunking [--threshold N]` |
| `MemoryBank/specs/LLM_and_RAG/_eval_late_chunking_2026-05-XX.md` | Eval-отчёт |

## 9. Риски

- **Память GPU**: BGEM3FlagModel + AutoModel = ~2.5 GB. На 2080 Ti (11 GB) OK,
  но если запускается параллельно с Nomic (C8) — может OOM. Разделить во времени
- **Tokenizer fast vs slow**: `offset_mapping` доступен только в fast. Гарантировать `use_fast=True`
- **Mean-pool примитивен**: если качество слабое — попробовать attention-weighted pool (future)
- **Файл >8192 токенов**: усечётся → последние chunks потеряются. Логировать warning + fallback
  на стандартный per-chunk encoding для таких файлов

## 10. По завершении

1. Пометить DoD ✅ в `MemoryBank/tasks/TASK_RAG_late_chunking_2026-05-08.md`
2. Обновить `MemoryBank/tasks/IN_PROGRESS.md`
3. Сессионный отчёт → `MemoryBank/sessions/YYYY-MM-DD.md`
4. Eval-отчёт обязателен
5. **НЕ** делать git push/tag без OK

---

*Maintained by: Кодо · 2026-05-08*
