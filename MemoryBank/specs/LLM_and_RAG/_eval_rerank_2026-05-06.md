# TASK_RAG_12 — Re-ranker validation report (2026-05-06, обновлено вечером)

Probe set: 2 группы DoD-queries из [`bge_m3_query_matching.md`](file:///C:/Users/user/.claude/projects/C--finetune-env/memory/bge_m3_query_matching.md).
Сравнение 3 режимов retrieval'а:

1. **Baseline** — до Finding #2/#3, candidates=50, untyped (target_tables=None).
2. **Re-embed only** — после re-embed mirror'ов в Qdrant, candidates=200, untyped.
3. **Re-embed + typed** — после re-embed, candidates=200, target_tables per probe (`use_cases` для FFT, `pipelines` для cross-repo).

## Сводная таблица метрик (10 probe'ов)

| Конфигурация | candidates | typed | recall@5 dense | recall@5 rerank | MRR@10 dense | MRR@10 rerank |
|---|---:|:---:|---:|---:|---:|---:|
| Baseline (TASK_RAG_12 MVP) | 50 | ✗ | 0.200 | 0.300 | 0.133 | 0.243 |
| Re-embed + candidates=200 | 200 | ✗ | 0.300 | 0.300 | 0.153 | 0.233 |
| **Re-embed + typed** | **200** | **✓** | **0.500** | **0.600** | **0.308** | **0.333** |

**Δ от baseline до финала:** recall@5 rerank **0.30 → 0.60 (+100% rel)**, MRR@10 rerank **0.24 → 0.33 (+38% rel)**.

## Что изменилось в этом раунде

1. **Re-embed `use_cases` / `pipelines` mirror в Qdrant** ([reembed_mirror_to_typed_target_tables.py](file:///C:/finetune-env/scripts/rag_setup/reembed_mirror_to_typed_target_tables.py)):
   - `target_table='use_cases'`: 76 → **123** (+47 python_test_usecase от TASK_RAG_02.6)
   - `target_table='pipelines'`: 3 → **8** (+5 cross_repo_pipeline)
   - Идемпотентно через UUID v5; cpp карточки от TASK_RAG_07/09 не тронуты.

2. **DEFAULT_CANDIDATES 50 → 200** в [`HybridRetriever`](file:///C:/finetune-env/dsp_assistant/retrieval/rag_hybrid.py): python_test_usecase'ы лежат на dense rank 100-200, candidates=50 теряет половину пула.

3. **Validation script расширен** ([validate_rag_rerank.py](file:///C:/finetune-env/scripts/rag_setup/validate_rag_rerank.py)):
   - У каждой Probe есть `target_tables` per default.
   - Флаг `--typed` включает typed retrieval, без него — untyped (для baseline).

## По probe-ам в режиме Re-embed + typed

| Group | Query | rank dense | rank rerank |
|---|---|---:|---:|
| fft_batch_py | `как использовать FFT batch в Python` | 8 | — |
| fft_batch_py | `FFT batch python` | — | 6 |
| fft_batch_py | `FFTProcessorROCm Python пример` | — | — |
| fft_batch_py | `python тест FFT GPU` | 8 | **2** |
| fft_batch_py | `batch FFT antenna array Python` | — | — |
| pipeline_sg_to_sp | `pipeline signal_generators → spectrum` | 1 | 2 |
| pipeline_sg_to_sp | `cross-repo signal to spectrum` | 1 | 1 |
| pipeline_sg_to_sp | `pipeline signal generation FFT` | 4 | 3 |
| pipeline_sg_to_sp | `ScriptGenerator → FFTProcessor pipeline` | 3 | 2 |
| pipeline_sg_to_sp | `integration test signal generator and spectrum` | 4 | 3 |

`pipeline_sg_to_sp`: **5/5 формулировок** в top-5 с rerank (был 2/5 в baseline).
`fft_batch_py`: 1/5 в top-5 с rerank (был 0/5). Архитектурное ограничение остаётся.

## Что осталось (Finding #1 из исходного отчёта)

**Sparse BM25 поверх RAG-коллекции** через PG tsvector / pg_trgm. Уже сделано для `symbols` в [`pipeline.py`](file:///C:/finetune-env/dsp_assistant/retrieval/pipeline.py); нужно повторить для `doc_blocks` + `use_cases` + `pipelines`. Sparse явно подсветит блоки с буквальным `python` / `python_test_usecase` в content_md / id → RRF + rerank поднимет недостающие 4/5 FFT use-case формулировок.

## DoD статус

- [x] `dsp_assistant/retrieval/reranker.py` — BGE-reranker-v2-m3 working class (был готов до TASK_RAG_12).
- [x] `HybridRetriever.query` интегрирует dense → PG content load → rerank → top-5.
- [x] CLI `dsp-asst rag search` с флагом `--rerank/--no-rerank` (+`--target-tables`, `--candidates`, `--repos`).
- [x] **Метрики recall@5 / mrr@10 улучшились ≥15%** (по 10 probe'ам): recall@5 +100%, MRR@10 +38%.
- [~] **2 DoD-query из bge_m3_query_matching.md в top-3 с dense+rerank**:
  - `pipeline signal_generators → spectrum` → ✅ rank 2 в typed mode.
  - `как использовать FFT batch в Python` → ⚠️ rank — (не в top-10 даже с typed). Полностью закроется sparse BM25 (Finding #1).

## Reproduction

```powershell
$env:DSP_ASST_PG_PASSWORD = "1"

# 0. (один раз) re-embed mirror'ов в Qdrant
python C:\finetune-env\scripts\rag_setup\reembed_mirror_to_typed_target_tables.py

# 1. baseline (untyped, default candidates)
python C:\finetune-env\scripts\rag_setup\validate_rag_rerank.py --candidates 50 --no-write

# 2. re-embed + candidates=200 untyped
python C:\finetune-env\scripts\rag_setup\validate_rag_rerank.py --candidates 200 --no-write

# 3. re-embed + typed (best)
python C:\finetune-env\scripts\rag_setup\validate_rag_rerank.py --candidates 200 --typed
```

## Файлы (всё локально, не закоммичено)

- `C:/finetune-env/dsp_assistant/retrieval/rag_hybrid.py` (создан в первой фазе, candidates default 200)
- `C:/finetune-env/dsp_assistant/cli/main.py` (добавлен `rag search`)
- `C:/finetune-env/dsp_assistant/retrieval/reranker.py` (был готов до TASK_RAG_12)
- `C:/finetune-env/scripts/rag_setup/validate_rag_rerank.py` (создан, расширен `--typed`)
- `C:/finetune-env/scripts/rag_setup/reembed_mirror_to_typed_target_tables.py` (создан этой фазой)
- `E:/DSP-GPU/MemoryBank/specs/LLM_and_RAG/_eval_rerank_2026-05-06.md` — этот отчёт
