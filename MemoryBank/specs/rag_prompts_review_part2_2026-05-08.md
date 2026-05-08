# Ревью 2 промптов RAG context_fuel (часть 2: C8 + C9) — 2026-05-08

> **Ревьюер:** Кодо (само-ревью)
> **Объект:** `MemoryBank/prompts/rag_{code_embeddings, late_chunking}_2026-05-08.md`
> **Метод:** sequential проверка против реального кода `c:/finetune-env/dsp_assistant/`

---

## Вердикт: **PASS-WITH-FIXES**

2 промпта самодостаточны, корректнее исходных TASK'ов в части схемы БД и архитектуры. Найдены
3 уточнения уже учтены в промптах + 4 warnings для сестрёнки.

---

## 🔴 CRITICAL (что я уже исправила в промптах vs исходный TASK)

### CR1. `code_embeddings`: TASK предлагает `ALTER TABLE rag_dsp.embeddings ADD COLUMN vec_code` — это ломает существующий поток

**Реальность** (`vector_store.py:107`):
```sql
INSERT INTO embeddings (symbol_id, collection, embedding) ...
ON CONFLICT (symbol_id) DO UPDATE
    SET embedding = EXCLUDED.embedding, ...
```
- Таблица в `public.embeddings` (НЕ `rag_dsp.`)
- **PK = `symbol_id`** (не композитный) → нельзя хранить два вектора одновременно

**В промпте предложено:** `CREATE TABLE embeddings_code (symbol_id PK, embedding vector(768))` —
отдельная таблица. Не ломает BGE upsert. Откат тривиален.

### CR2. `code_embeddings`: гибрид BGE+Nomic должен быть в `pipeline.py`, не `rag_hybrid.py`

`rag_hybrid.py` обслуживает `doc_blocks/use_cases/pipelines` (1024d Qdrant). Nomic-Embed
индексирует **symbols** (классы/методы) — это область `pipeline.py` (`SymbolRetriever` через
pgvector). Промпт явно указывает корректное место + предупреждение «не путать».

### CR3. `late_chunking`: `BGEM3FlagModel.encode()` НЕ отдаёт hidden_states

Late Chunking требует `last_hidden_state` для mean-pool по token-span'ам. `BGEM3FlagModel` это не
эспонит. **В промпте предложено:** отдельный `transformers.AutoModel` (тот же XLM-RoBERTa) — параллельно
с FlagEmbedding. Память: ~2.5 GB GPU, на 2080 Ti влезает.

---

## 🟡 WARNINGS (для сестрёнки — учесть при реализации)

### W1. `CppSymbol` НЕ хранит body/code_text

`chunker_cpp.py:30-31` — есть только `line_start, line_end`. Для code_embeddings (C8):
- **Решение:** читать тело метода через `Path(file).read_text()` + slice по line range.
- В промпте C8 §4.4 это уже отмечено как «отдельный mini-step».

### W2. `_reciprocal_rank_fusion` уже существует в `pipeline.py:163`

В промпте C8 §4.5 я написал `_rrf_merge(...)` — но в `pipeline.py` уже есть готовая функция
`_reciprocal_rank_fusion`. **Сестрёнка должна переиспользовать**, не плодить.

**Минор-правка для сестрёнки** (отметить в момент реализации):
```python
# вместо _rrf_merge — использовать существующую:
from dsp_assistant.retrieval.pipeline import _reciprocal_rank_fusion
merged = _reciprocal_rank_fusion(
    [bge_hits, code_hits],
    weights=[bge_weight, nomic_weight],  # если функция поддерживает
)
```
Если `_reciprocal_rank_fusion` без весов — добавить `weights` параметр (минимально).

### W3. `late_chunking`: tokenizer fast vs slow

`offset_mapping` доступен только в fast tokenizer'е. Промпт упоминает это в §4.1, но **не явно**
прокидывает `use_fast=True` в `AutoTokenizer.from_pretrained`. Сестрёнка должна добавить:
```python
self.tok = AutoTokenizer.from_pretrained(model_name, use_fast=True)
```
Default уже True для большинства моделей, но лучше зафиксировать.

### W4. `late_chunking`: `chunks_with_truncated_end` теряются молча

Если файл >8192 токенов — последние символы попадут в `tok_end == len(offsets)` и chunk
получит частичный embedding. Промпт упоминает риск (§9), но в коде §4.1 нет fallback'а.

**Правка для сестрёнки:**
```python
# в embed_file, после tokenize:
if len(offsets) >= MAX_TOKENS - 1:
    log.warning("file truncated to %d tokens; last chunks may be incomplete", MAX_TOKENS)
    # вариант: для затронутых chunks вернуть None → fallback на стандартный per-chunk encoding
```

---

## 🟢 NOTES (наблюдения)

### N1. C8 и C9 можно делать **параллельно** разными сестрёнками

Файлы не пересекаются:
- C8: `embedder_nomic.py`, `code_vector_store.py`, `pipeline.py`
- C9: `embedder_bge_late.py`, `build.py`

Только `cli/main.py` общий — добавятся 2 разных флага (`--model nomic-code` / `--late-chunking`),
конфликта нет.

### N2. Память GPU при одновременном запуске

Если C8 и C9 запускаются параллельно на одной 2080 Ti:
- BGE-M3 (FlagEmbedding) ~1.2 GB
- Nomic-Embed-Code ~1 GB
- AutoModel BGE для late chunking ~1.2 GB
- **Итого ~3.5 GB + батчи** = OK на 11 GB, но **eval-прогоны разнести во времени**.

### N3. Eval-отчёты должны включать сравнение с baseline

Оба промпта требуют eval — но baseline зафиксирован в `_eval_rerank_2026-05-06.md`. Сестрёнка
должна явно скопировать те же golden_set + категории, иначе сравнение невалидно.

### N4. `dsp-asst rag embed` CLI может не существовать с нужными флагами

Текущий `cli/main.py` — не проверяла на наличие `rag embed --model X` / `--late-chunking`. **Сестрёнка
должна:**
1. `dsp-asst rag --help`
2. Если флага нет — расширить `cli/main.py` минимально (sub-команда `rag embed`).

---

## Чек-лист для сестрёнки (что учесть при имплементации)

- [ ] W1: для C8 читать тело метода из файла по `(file_path, line_start, line_end)`
- [ ] W2: переиспользовать `_reciprocal_rank_fusion` из `pipeline.py:163` (не плодить `_rrf_merge`)
- [ ] W3: явно `AutoTokenizer.from_pretrained(..., use_fast=True)` в late chunking
- [ ] W4: warning + fallback при truncation файла >8192 токенов
- [ ] N4: проверить `cli/main.py` flags ДО написания CLI — расширить только если не хватает

---

## Что в промптах хорошо (оставить)

- ✅ Каждый промпт self-contained: пути, DoD, smoke, риски, артефакты
- ✅ Жёсткие правила (worktree / pytest / CMake / git push) повторены
- ✅ Архитектурные отклонения от исходного TASK обоснованы (CR1, CR2, CR3)
- ✅ Feature flags (`--no-nomic`, `--late-chunking` default off) — для отката
- ✅ Eval-отчёты с конкретными именами файлов в `MemoryBank/specs/LLM_and_RAG/`

---

*Maintained by: Кодо · 2026-05-08 · self-review двух промптов C8+C9*
