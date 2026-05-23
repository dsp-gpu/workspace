# 05 — Executor Roles (4 роли внутри rag_pao/)

> Кодо в rag-pao = **executor**. 4 sub-роли.

## Роли

| # | Роль | Подпакет | LLM | Что делает |
|---|------|----------|-----|------------|
| 1 | **Indexer** | `rag_pao/core/indexer/` | — (детерминированно) | tree-sitter + libclang парсит target код → PG schema rag_pao_<t> + Qdrant <t>_v1. Поддерживает incremental (blake3 skip) |
| 2 | **Retriever** | `rag_pao/core/retrieval/` | — | hybrid: BM25 (sparse) + BGE-M3 (dense) → reranker (bge-reranker-v2-m3) → RRF merge |
| 3 | **Filler** | `rag_pao/core/llm_serving/clients/` | Qwen2.5-Coder-14B | трейнабельный (потом QLoRA), генерит doxygen + test_cases JSON по промпту от mentor |
| 4 | **Judge** | `rag_pao/core/llm_serving/clients/` | Qwen3.6-35B | frozen, inference only, оценивает Filler output 0-100 |

## Цикл (с точки зрения pao)

```
1. mentor → POST /search       → Retriever (BM25+dense+RRF+reranker)
2. mentor → POST /run_filler   → Filler (Qwen14B + name_validator на input)
3. mentor → POST /run_judge    → Judge (Qwen35B)
4. mentor → POST /save_rag     → save в .rag/<target>/Lx/
```

## Запреты по ролям

- **Indexer** НЕ модифицирует target код (`/srv/pao_<name>/`), только читает
- **Retriever** НЕ генерирует — только ранжирует
- **Filler** НЕ делает self-judgement (это Judge)
- **Judge** НЕ переписывает output (только score 0-100)

## Параметры

`config/stack.{dev,prod}.json`:
```json
"qwen_models": {
  "filler": { "name": "qwen2.5-coder:14b-q4_K_M", "backend": "ollama" },
  "judge":  { "name": "qwen3.6:35b-q4_K_M", "backend": "ollama", "queue_swap": true }
}
```

**Queue swap** для 35B: одновременно держим в VRAM только одну тяжёлую модель. Latency +5-10 сек на swap.

## Тесты

`tests/test_indexer.py`, `tests/test_retriever.py`, `tests/test_filler.py`, `tests/test_judge.py` — изолированно с mock-PG и mock-Qdrant.
