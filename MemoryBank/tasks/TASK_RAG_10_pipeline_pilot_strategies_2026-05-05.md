# TASK_RAG_10 — Pilot: 3 pipelines на strategies

> **Статус**: pending · **Приоритет**: HIGH · **Время**: ~2 ч · **Зависимости**: TASK_RAG_09

## Цель

Сгенерировать 3 pipeline-карточки на strategies через агент 3, ≥2 — `human_verified`.

## Кандидаты (черновик)

| Slug | Title | Composer класс |
|---|---|---|
| `antenna_covariance` | Полный анализ антенного массива | AntennaCovariancePipeline |
| `farrow_resampling` | LCH+Farrow с дробной задержкой | FarrowPipeline |
| `lfm_dechirp` | Дешермпинг ЛЧМ-сигнала | LfmDechirpPipeline |

## DoD

- [ ] `strategies/.rag/pipelines.md` (или папка `pipelines/`) создан.
- [ ] 3 секции `## Pipeline: <Name>` со схемой data flow + классами + параметрами + edge cases.
- [ ] ≥2 `human_verified=true` в `rag_dsp.pipelines`.
- [ ] Cross-repo классы корректно идентифицированы (`spectrum::PadDataOp`, `linalg::CovarianceMatrixOp` ✅ существует в `linalg/include/linalg/operations/covariance_matrix_op.hpp`).
- [ ] **`qdrant.count("dsp_gpu_rag_v1", filter={"target_table":"pipelines","repo":"strategies"}) ≥ 3`** (vectors залиты в Qdrant).
- [ ] PG count == Qdrant count для `target_table='pipelines'`, `repo='strategies'`.

## Связано с

- План: §13 Phase 2
- Ревью v2.1: §«Таски → TASK_RAG_09» (re-use BaseGenerator + RagQdrantStore)
- Блокирует: TASK_RAG_11
