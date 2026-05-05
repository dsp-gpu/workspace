# TASK_RAG_04 — Pilot ingestion: spectrum/Doc/*.md → doc_blocks + Qdrant

> **Статус**: pending · **Приоритет**: HIGH · **Время**: ~1 ч · **Зависимости**: TASK_RAG_03
> **Версия**: v2 (после ревью v2.1) · DoD на `qdrant.count` (а не `WHERE embedding IS NOT NULL`)

## Цель

Запустить `dsp-asst rag blocks ingest --repo spectrum`, проверить корректность парсинга и upload в Qdrant, дополнить ручные якоря где автомат не справился.

## Шаги

1. `dsp-asst rag blocks ingest --repo spectrum --dry-run` → вывод плана.
2. Alex смотрит вывод (10-15 мин), помечает блоки которые автомат разбил неправильно.
3. В Doc/-файлах spectrum'а добавить ручные якоря `<!-- rag-block: id=... -->...<!-- /rag-block -->` где нужно.
4. Реальный ingest (без `--dry-run`).
5. Проверка PG: `SELECT block_id, repo, class_or_module, concept FROM rag_dsp.doc_blocks WHERE repo='spectrum' ORDER BY block_id;`.
6. Проверка Qdrant консистентности: `qdrant.count("dsp_gpu_rag_v1", filter={"target_table":"doc_blocks","repo":"spectrum"})` должно равняться `SELECT count(*) FROM rag_dsp.doc_blocks WHERE repo='spectrum'`.

## DoD

- [ ] ≥30 блоков по spectrum в `rag_dsp.doc_blocks`.
- [ ] Распределение по классам осмысленное: fft_processor_rocm (~6-8), fir_filter_rocm (~3-4), iir/kalman/kaufman (~2-3 каждый), lch_farrow (~3), spectrum_maxima_finder (~2-3).
- [ ] Ручных якорей не более 5 (автомат справляется в 85%+ случаев — критерий из roadmap'а).
- [ ] **`qdrant.count("dsp_gpu_rag_v1", filter={"target_table":"doc_blocks","repo":"spectrum"}) ≥ 30`** (vectors залиты в Qdrant).
- [ ] **PG count == Qdrant count** для `repo='spectrum'`, `target_table='doc_blocks'` (консистентность).
- [ ] Smoke retrieval: `qdrant.search(qv_spectrum_query, top_k=5, filter={"target_table":"doc_blocks"})` возвращает релевантные блоки.

## Связано с

- План: §6, §13 шаги 5-6
- Ревью v2.1: §«Таски → TASK_RAG_04»
- Блокирует: TASK_RAG_05
