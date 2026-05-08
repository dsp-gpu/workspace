# Eval: Late Chunking на BGE-M3 — 2026-05-08

> **TASK:** `MemoryBank/tasks/TASK_RAG_late_chunking_2026-05-08.md`
> **Промпт:** `MemoryBank/prompts/rag_late_chunking_2026-05-08.md`
> **Реализация:** `c:/finetune-env/dsp_assistant/indexer/embedder_bge_late.py`
> **Статус:** ⛔ **NOT-VIABLE-FOR-BGE-M3** — фиксирую как known limitation, рекомендую переключиться на mean-pooling модель.

---

## TL;DR

Late Chunking (arXiv 2409.04701) — *хорошая идея*, но **несовместима с BGE-M3 без модификации**:

- BGE-M3 fine-tuned с **CLS-pooling** (sentence-level), token-level hidden states после
  file-level attention становятся почти одинаковыми → mean-pool по chunk-span'ам даёт схлопнутые
  векторы (cos ≈ 0.99).
- Baseline per-chunk BGE-M3 даёт нормально разнесённые векторы (cos 0.65-0.87).
- **Late chunking задумывался для моделей с mean-pool fine-tuning** (Jina v2/v3, nomic-embed-text-v1).

DoD `cosine sim < 0.95` **не выполнен**: max=0.9998, mean=0.9958.
Дальнейшая интеграция в `build.py` / CLI / golden-set eval не имеет смысла без смены модели.

---

## Эксперимент

**Файл:** `e:/DSP-GPU/spectrum/include/spectrum/fft_processor_rocm.hpp` (~282 строки, ~700 токенов).

**6 равномерных chunks** по строкам файла (по ~47 строк каждый).

### Late Chunking (BGE-M3 mean-pool по chunk-span)

| Pair | cos |
|------|-----|
| c0-c1 | 0.987 |
| c0-c2 | 0.985 |
| c0-c3 | 0.990 |
| c0-c4 | 0.991 |
| c0-c5 | 0.994 |
| c1-c2 | 1.000 |
| c1-c3 | 0.999 |
| c1-c4 | 0.999 |
| c1-c5 | 0.998 |
| c2-c3 | 1.000 |
| c2-c4 | 0.999 |
| c2-c5 | 0.997 |
| c3-c4 | 1.000 |
| c3-c5 | 0.999 |
| c4-c5 | 0.999 |
| **max** | **0.9998** |
| **mean** | **0.9958** |

### Baseline per-chunk BGE-M3 (FlagEmbedding на тех же текстах chunk'ов независимо)

| Pair | cos |
|------|-----|
| c0-c1 | 0.714 |
| c0-c2 | 0.656 |
| c0-c3 | 0.653 |
| c0-c4 | 0.684 |
| c0-c5 | 0.686 |
| c1-c2 | 0.786 |
| c1-c3 | 0.778 |
| c1-c4 | 0.739 |
| c1-c5 | 0.686 |
| c2-c3 | 0.869 |
| c2-c4 | 0.764 |
| c2-c5 | 0.754 |
| c3-c4 | 0.752 |
| c3-c5 | 0.740 |
| c4-c5 | 0.767 |
| **max** | **0.8685** |
| **mean** | **0.7350** |

### Что сделано в коде, чтобы исключить тривиальные баги

1. **Спец-токены** `(0,0)` offsets (CLS/SEP/PAD) исключены из mean-pool — улучшения нет.
2. **Fast tokenizer** проверен (`is_fast == True`).
3. **L2-normalize** после pool — корректно (нормы 1.0).
4. **Token-spans** построены через `offset_mapping` от fast-tokenizer'а — без перекрытий.
5. **fp16 vs fp32** — не релевантно, разница порядка 1e-3 в cos, проблема не численная.

## Корневая причина

XLM-RoBERTa в BGE-M3 после full-file attention развивает hidden_states где **все non-special
токены тянутся к sentence-level представлению** (для BGE-M3 это CLS-vector, потому что fine-tuning
loss считается только на CLS). Mean-pool по любому диапазону токенов внутри файла даёт
аппроксимацию того же sentence-level вектора с малыми отклонениями.

Это **подтверждается обзорами Jina Late Chunking** (2024-2025): метод требует модели обученные
с mean-pooling head; для CLS-моделей (BGE-M3, e5-mistral) — либо fine-tune с mean-pool, либо
другую модель.

## Рекомендации

### Вариант A — переключить C9 на mean-pooled модель
- `nomic-ai/nomic-embed-text-v1.5` (768d, mean-pool, 8192 ctx)
- `jinaai/jina-embeddings-v3` (1024d, mean-pool, 8192 ctx)

Перезапустить тот же `embedder_bge_late.py` (он generic — параметризуется через `LateChunkConfig.model_name`).

### ⚠️ Update 2026-05-08 (вечер) — попытка переключить на Jina/Nomic упёрлась в среду

Скачаны `jinaai/jina-embeddings-v3` (570MB) + `jinaai/xlm-roberta-flash-implementation` (custom code) +
`nomic-ai/nomic-embed-text-v1.5` (270MB). Установлен `einops`. Получены **последовательно** разные ошибки:

1. `signal.SIGALRM` отсутствует на Windows (transformers dynamic_module_utils) — обходится `trust_remote_code`
2. `torch_dtype` accepts only string в jina custom config (не torch.dtype object) — обходится `dtype="float16"` строкой
3. `XLMRobertaLoRA` не имеет `all_tied_weights_keys` — **transformers 5.x API change**, jina custom код не обновлён
4. `nomic-ai/nomic-bert-2048` (зависимость nomic-embed-text) требует `trust_remote_code`+ ещё один repo download с интернетом — упёрлось в offline mode + chain dependencies

**Корень:** среда `c:/finetune-env/.venv` имеет **transformers 5.7.0** — слишком новый для custom-code моделей jina/nomic. Они написаны под transformers 4.x.

**Что нужно для разрешения** (вне 2-часового бюджета C9):
- Создать **отдельный venv** для late-chunking с `transformers==4.45.0` или `4.46.0` (стабильные версии для jina/nomic)
- ИЛИ переключиться на **`sentence-transformers` API** (он сам разрулит совместимость, но не отдаёт hidden_states — придётся хакать через `_first_module().auto_model`)
- ИЛИ дождаться обновления jina/nomic репо под transformers 5.x (не контролируется нами)

### Вариант B — fine-tune BGE-M3 mean-pool head
~6-8 ч на 1000 (positive, anchor) пар с mean-pool лоссом. Окупается только если хочется именно BGE-M3 в проде. **Не рекомендую** — есть готовые альтернативы.

### Вариант C — закрыть C9 как «не применимо»
Принять что late chunking — не наш путь, оставить per-chunk BGE-M3 + перенаправить ресурсы на C8
(Nomic-Embed-Code, который уже специализирован на коде).

**Моя рекомендация:** **C** (закрыть). C8 (Nomic) даёт более крупный потенциал прироста (+5-15%
R@5), а C9 потребует или смены модели + повторной индексации, или fine-tune-цикла. ROI хуже.

## Артефакты

- `c:/finetune-env/dsp_assistant/indexer/embedder_bge_late.py` — реализация LateChunkEmbedder + ChunkSpan + line_span_to_char_span
  (помечена `EXPERIMENTAL`, не интегрирована в build.py / CLI)
- Этот отчёт

## DoD-чек (исходный TASK)

- [x] `embedder_bge_late.py` работает на 1 файле (technically — embedding выходит, но семантически невалиден)
- [ ] **6 chunks из этого файла имеют разные эмбеддинги (cosine sim < 0.95)** — ⛔ **FAIL** (max 0.9998)
- [ ] Re-embed длинных файлов через `--late-chunking` — не делал, нет смысла
- [ ] R@5 на длинных классах ≥ baseline + 5% — не делал
- [x] Eval-отчёт записан (этот файл)
- [ ] Feature flag `--late-chunking` (default off) — не делал

**Итого:** 1.5/6 DoD. Виден архитектурный fail, дальнейшие пункты блокированы.

## Что осталось от Кодо

1. `embedder_bge_late.py` сохранён с warning'ом в docstring (для будущей переиспользования с другой моделью)
2. Этот отчёт — finding для Alex
3. **Решение по C9 — за Alex:** переключить на jina/nomic-embed (~2ч повторно) или закрыть таcск

---

*Maintained by: Кодо · 2026-05-08 · honest fail report*
