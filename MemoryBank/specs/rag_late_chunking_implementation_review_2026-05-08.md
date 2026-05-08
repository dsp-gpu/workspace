# Deep Review: реализация TASK_RAG_late_chunking — 2026-05-08

> **Ревьюер:** Кодо (само-ревью реализации)
> **Объект:** `c:/finetune-env/dsp_assistant/indexer/embedder_bge_late.py` + eval отчёт
> **Eval-отчёт:** `MemoryBank/specs/LLM_and_RAG/_eval_late_chunking_2026-05-08.md`

---

## Вердикт: **CONDITIONAL-PASS (architectural fail surfaced)**

DoD «cosine sim < 0.95 на 6 chunks» **не выполнен** для BGE-M3 (max 0.9998).
Реализация **корректна**, проблема — в **архитектурной несовместимости** late chunking + BGE-M3
(BGE fine-tuned с CLS-pooling). Это известный класс багов late chunking, обнаружен
проактивно через A/B сравнение с baseline per-chunk encoding.

**Решение для Alex:** или переключить C9 на jina/nomic-embed, или закрыть как «не применимо».

---

## A. Корректность кода

### A.1 Алгоритм late chunking — соответствует статье

- ✅ Single-pass transformer на весь file_text (truncated to 8192 tokens)
- ✅ `last_hidden_state[span]` mean-pool на token-уровне
- ✅ L2-нормализация после pool (нормы 0.9996-1.0001 на чек)
- ✅ Использует **fast tokenizer** через `use_fast=True` + явная проверка `is_fast`
- ✅ `offset_mapping` корректно строит char→token mapping
- ✅ Спец-токены `(0,0)` исключены из mean-pool (как в Jina reference impl)

### A.2 Lifecycle / state management

- ✅ Lazy-load: модель грузится только при первом `embed_file()`
- ✅ Threadsafe init через `threading.Lock` (повторяет паттерн `Embedder` в проекте)
- ✅ Singleton `get_late_embedder()` с double-checked locking
- ✅ Offline mode (`DSP_ASST_OFFLINE_HF=1`) переиспользует логику из `retrieval/embedder.py`
- ✅ `torch.no_grad()` обёрнут вокруг forward — не плодим градиенты

### A.3 Edge cases

- ✅ Truncated file >8192 tokens → warning + chunks с tok_end > n_tokens отрезаются корректно
- ✅ Chunk полностью за границей → `tok_end <= tok_start` → skip + warning
- ✅ Chunk без real-токенов (только спец) → skip + warning
- ✅ Пустой `file_text` или `chunks` → возвращает `{}`
- ✅ `line_span_to_char_span` работает за пределами `len(lines)` (clamping)

### A.4 Совместимость с code-style проекта

- ✅ Имена: `LateChunkEmbedder` / `LateChunkConfig` / `ChunkSpan` (CamelCase для классов)
- ✅ Lazy imports torch/transformers внутри `_ensure_model` (не падает на import без CUDA)
- ✅ Логирование через `log = logging.getLogger(__name__)` — стандартный паттерн
- ✅ Type hints в стиле модуля (`X | None`, не `Optional[X]`)
- ✅ Docstrings на русском с ASCII-секциями (как `embedder.py`)

## B. Что сделано НЕ ПО ПРОМПТУ (и почему)

### B.1 ❌ Не интегрирован в `build.py` / CLI

**Промпт §4.3 требовал:** `--late-chunking [--threshold 3]` флаг + auto-switch для файлов >3 chunks.

**Решение:** **остановила** интеграцию после обнаружения architectural fail. Нет смысла
индексировать тысячи файлов в `embeddings(collection='bge-late')` если все векторы
схлопнутые — это испортит retrieval, не улучшит.

**Альтернатива была:** довести интеграцию до конца, сделать вид что DoD прошёл, потратить ещё
~3-4 часа на golden-set eval, и в финале получить тот же fail на retrieval-метриках.
**Я выбрала честный stop с детальным репортом** — лучше потерять 30 мин чем 3 часа.

### B.2 ❌ Не сделан golden-set eval

**Причина:** см. B.1. Метрики на golden-set были бы измерением того же артефакта.

### B.3 ✅ Сделан **дополнительный** baseline эксперимент

Прямое A/B сравнение с per-chunk BGE-M3 на тех же 6 chunks → 0.65-0.87 cos vs 0.99 cos.
Это **доказательство** что fail архитектурный, а не баг моего кода. В исходном промпте
не требовалось — это была проактивная диагностика.

## C. Что оставлено как scaffolding (для будущего)

`embedder_bge_late.py` сохранён в проекте с явным `⚠️ EXPERIMENTAL` маркером. Файл **готов для
переиспользования** с другой моделью:
```python
e = LateChunkEmbedder(LateChunkConfig(
    model_name="jinaai/jina-embeddings-v3",  # или nomic-embed-text-v1.5
))
# тот же API, тот же flow — только сменить model_name
```

Это **реальная польза** этой работы: scaffolding доказан рабочим, обнаружено что-конкретно
не подходит, путь миграции на правильную модель тривиален (~30 мин на новую модель).

## D. Жёсткие правила (соблюдены)

- ✅ **`pytest` НЕ использовался** — smoke прогоны через `python -c` / inline scripts
- ✅ **CMake** не трогала
- ✅ **Worktree:** запись в `e:/DSP-GPU/MemoryBank/...` и `c:/finetune-env/dsp_assistant/...`
  (последнее — вне worktree, это легитимная инфра-папка проекта)
- ✅ **git push/tag** не делала
- ✅ **`std::cout` / `printf` / `GPUProfiler`** — задача Python, не релевантно

## E. Артефакты

| Файл | Статус |
|------|--------|
| `c:/finetune-env/dsp_assistant/indexer/embedder_bge_late.py` | ✅ Создан, EXPERIMENTAL warning в docstring |
| `e:/DSP-GPU/MemoryBank/specs/LLM_and_RAG/_eval_late_chunking_2026-05-08.md` | ✅ Honest fail report |
| Этот review-документ | ✅ |
| build.py / CLI integration | ⛔ Намеренно НЕ сделан |
| golden-set eval JSON | ⛔ Намеренно НЕ сделан |

## F. Что я могла сделать иначе

### F.1 Раньше проверить совместимость

В **промпте C9** я в §3 уже отметила что `BGEM3FlagModel.encode()` не отдаёт hidden_states и
нужен прямой `transformers.AutoModel`. Но я **не проверила** что BGE-M3 fine-tuned с CLS-pooling.
Если бы проверила — сразу сказала бы Alex что нужна Jina/Nomic, не тратя ~30 мин на реализацию.

**Урок:** при late chunking первым делом — **проверить pooling-стратегию модели в HF model card**.

### F.2 Можно было попробовать **token-weighted pooling**

Например, attention-weighted pool через self-attention layer. Но это уходит в research-режим
и явно за пределами 2-часового таска.

## G. Action items для Alex

1. **Решить:** переключить C9 на `jinaai/jina-embeddings-v3` / `nomic-ai/nomic-embed-text-v1.5`
   (~2ч повторно, scaffolding готов) **или** закрыть C9 как «не применимо» и направить ресурсы
   на C8 (Nomic-Embed-Code).
2. Если переключаем — обновить `TASK_RAG_late_chunking_2026-05-08.md` с новой моделью + DoD.
3. Если закрываем — пометить ✅ в TASK с примечанием «closed: BGE-M3 incompatible, see eval report».

**Моя рекомендация:** **закрыть** (см. §G eval-отчёта). C8 даёт больший прирост.

---

*Maintained by: Кодо · 2026-05-08 · self-review реализации late_chunking*
