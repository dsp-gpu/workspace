# TASK_RAG_04 — Pilot ingestion: spectrum/Doc/*.md → doc_blocks + Qdrant

> **Статус**: ✅ DONE + RAW SCALE-UP (2026-05-06) · **Приоритет**: HIGH · **Время**: ~1 ч факт · **Зависимости**: TASK_RAG_03
> **Версия**: v2 (после ревью v2.1) · DoD на `qdrant.count` (а не `WHERE embedding IS NOT NULL`)
> **Исполнитель**: Кодо (pilot) + Cline #2 на Opus 4.7 (раскатка на 7 репо + DSP).
>
> **Результат**: ingestion **не только spectrum** — раскатано на **все 9 репо** в один заход:
>
> | Репо | doc_blocks |
> |---|---|
> | spectrum | 460 |
> | radar | 311 |
> | strategies | 260 |
> | core | 245 |
> | linalg | 155 |
> | signal_generators | 137 |
> | heterodyne | 99 |
> | DSP | 95 (включая 2 meta) |
> | stats | 79 |
> | **TOTAL** | **1841 doc_blocks** + 30 meta = **1871 в БД** |
>
> PG ↔ Qdrant консистентны во всех репо (PG = PG_uniq = Qdrant). Re-run идемпотентен. **Это закрывает большую часть TASK_RAG_11 (rollout phase).**

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
