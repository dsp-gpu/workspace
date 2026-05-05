# TASK_RAG_06 — Pilot: class-card на FFTProcessorROCm

> **Статус**: pending · **Приоритет**: HIGH · **Время**: ~1.5 ч · **Зависимости**: TASK_RAG_05
> **Версия**: v2 (после ревью v2.1) · убран «delta <10%», запись в test_params + doc_blocks

## Цель

Прогон агента 1 на FFTProcessorROCm. Сравнить структуру результата с `examples/fft_processor_FFTProcessorROCm_old.md` (baseline) **по чек-листу** (не по % delta — решение Alex'а #3).

## Шаги

1. `dsp-asst rag cards build --repo spectrum --class FFTProcessorROCm --dry-run`
2. Ревью diff Alex'ом
3. Реальная генерация → файл `spectrum/.rag/test_params/fft_processor_FFTProcessorROCm.md`
4. **Чек-лист структуры** (визуальное ревью Alex'а):
   - [ ] Frontmatter присутствует и корректен (id, repo, class, methods).
   - [ ] Все методы из `_old.md` перенесены (FFT, IFFT, ProcessComplex, ProcessMagnitude, ...).
   - [ ] Все @test теги перенесены (size, value, error_values где есть, pattern).
   - [ ] Параметры (`@param`) переданы в `test_params` записи.
   - [ ] @throws блоки сохранены.
   - [ ] `<!-- rag-block: id=... -->` маркеры на каждом блоке.
5. Если чек-лист зелёный → пометить `human_verified=true`, удалить `_old.md`.
6. Если нет — открыть багу в агенте 1, итерация.

## DoD

- [ ] Файл `spectrum/.rag/test_params/fft_processor_FFTProcessorROCm.md` создан.
- [ ] Запись в `rag_dsp.test_params` (одна на метод) **+** `rag_dsp.doc_blocks` (overview/usage блоки).
- [ ] **`rag_dsp.use_cases` НЕ изменилась** (count до = count после — class-card туда не пишет, решение #1).
- [ ] Точки в Qdrant `dsp_gpu_rag_v1` для всех новых `doc_blocks` записей (PG count == Qdrant count для `target_table='doc_blocks'`).
- [ ] Чек-лист структуры (см. шаг 4) пройден целиком (визуальное ревью Alex'а вместо «delta <10%»).
- [ ] AI-stubs (если были) — все имеют placeholder_tag (UNIQUE) в файле и запись в `ai_stubs`.
- [ ] `_old.md` удалён ИЛИ Alex просит итерацию.

## Связано с

- План: §13 шаг 10
- Ревью v2.1: §«Решения Alex'а» #1/#3, §«Таски → TASK_RAG_06»
- Блокирует: TASK_RAG_07
