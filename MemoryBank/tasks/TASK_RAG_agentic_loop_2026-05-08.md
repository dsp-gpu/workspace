# TASK_RAG_agentic_loop — CRAG + Self-RAG + feedback + G-calls (Phase C+)

> **Этап:** AGENTIC RAG · **Приоритет:** 🟢 P3 · **Effort:** ~9-11 ч · **Зависимости:** Phase B QLoRA завершён + CONTEXT-FUEL/GRAPH/EVAL зелёные
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`

## 🎯 Цель

Превратить RAG из **pull**-системы (LLM запрашивает) в **agentic loop** — LLM сама проверяет качество retrieval'а, переформулирует запрос, накапливает feedback в БД для следующего fine-tune.

**Делается ПОСЛЕ Phase B (12.05+):**
- Phase B QLoRA на 9070 → новая модель `qwen3-X-dsp:r16` в Ollama
- На ней пилотим agentic loop
- В процессе копится `rag_logs.user_correction` → SFT-корпус
- Phase C QLoRA = тренировка на этом корпусе

## 📋 Подэтапы

### A1 — CRAG-loop (~3 ч)

`dsp_assistant/retrieval/agentic.py`:
```python
async def crag_search(query: str, max_iterations: int = 5) -> list[Hit]:
    """
    1. retrieval → если top-1 score < 0.6 → relevance evaluator говорит "doubt"
    2. query-rewriter промпт: "запрос вернул X,Y,Z но они не похожи на ответ. Переформулируй"
    3. retrieval повторно
    4. итераций ≤ 5; на финальной — generation
    5. логируем каждую итерацию в rag_logs.retrieval_iterations (JSONB)
    """
```

Threshold по rerank-score (0.6) + по семантической дистанции к use-case (если найденный класс не в `linked_use_cases` → флаг "doubt").

Промпт `prompts/015_query_rewriter.md` — переформулировка на C++ DSP-сленге.

MCP: `dsp_search(query, mode="agentic")` — opt-in.

### A2 — Self-RAG reflection tokens (опц., ~2 ч)

В DSL Qwen3-dsp fine-tuned: модель генерирует **reflection tokens**:
- `[Retrieve]` — нужен ли retrieval для следующего шага?
- `[Relevant]` / `[Irrelevant]` — оценка retrieved chunks
- `[Supported]` / `[NotSupported]` — обоснован ли ответ?

Требует **fine-tune на reflection-corpus** → Phase C задача.

### A3 — Feedback-loop CLI (~2 ч)

`dsp_assistant/cli/test_gen.py` — после генерации тест-кода:
```
[A]ccept / [E]dit / [R]eject:
```

- `A` → `INSERT INTO rag_logs (..., user_rating='accept')`
- `E` → запросить причину + diff → `user_correction` JSONB
- `R` → запросить причину → `user_rating='reject'`, `user_correction`

Накапливаем 100-500 пар `(query, retrieved_chunks, llm_response, correction)`.

### A4 — SFT-корпус генератор (~2 ч)

`dsp_assistant/cli/sft_corpus.py`:
```python
def build_sft_corpus(min_rating='accept', output: Path) -> int:
    """
    SELECT из rag_logs где user_rating='accept' OR user_correction IS NOT NULL
    Формат вывода: JSONL с {instruction, input, output} (Alpaca-style для Phase C QLoRA).
    """
```

CLI: `dsp-asst rag sft-corpus --output ~/finetune-env/dataset_phase_c.jsonl --min-rating accept`.

### G-calls — call-graph через clangd (~1-2 ч, на Debian)

После 12.05 на Debian:
```bash
clangd --background-index --log=verbose ...
# JSON-dump → парсер → rag_dsp.deps(kind='calls')
```

Это даёт ответ на: «что вызывает ProfilingFacade::Record()», «что вызывает hipFFT_C2C».

Tool `dsp_graph_neighbors(edge_types=["calls"])` начинает работать полноценно.

## ✅ DoD

- [ ] CRAG-loop: на 5 «сложных» запросах из golden_set v2 (которые baseline даёт top-1 score <0.6) делает корректирующий цикл, итоговый score выше
- [ ] `dsp_search(mode="agentic")` opt-in работает
- [ ] Feedback-loop CLI собрал ≥50 SFT пар за неделю использования
- [ ] G-calls: `dsp_graph_neighbors(edge_types=["calls"])` возвращает результаты на Debian
- [ ] SFT-корпус v1 готов для Phase C QLoRA

## Артефакты

- `dsp_assistant/retrieval/agentic.py`
- `dsp_assistant/cli/test_gen.py` — feedback-loop
- `dsp_assistant/cli/sft_corpus.py`
- `MemoryBank/specs/LLM_and_RAG/prompts/015_query_rewriter.md`
- На Debian: `dsp_assistant/indexer/clangd_call_graph.py`

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Зависимости: `TASK_FINETUNE_phase_B_2026-05-12` (Phase B завершён) + все CONTEXT-FUEL/GRAPH/EVAL
- Кормит: Phase C QLoRA (TBD — после Phase B результатов)
- Spec 13 §AGENTIC RAG

*Maintained by: Кодо · 2026-05-08*
