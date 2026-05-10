# TASK_RAG_dataset_patterns_md — `<repo>/Doc/Patterns.md` × 8 + cleanup `_RAG.md tags`

> **Создан:** 2026-05-10 · **Шаг 3** из [TASK_DATASET_v4_cleanup](TASK_DATASET_v4_cleanup_2026-05-10.md)
> **Effort:** ~1 ч (вместо «1 ч руками Alex'a»)

---

## 🎯 Цель

Сделать draft `<repo>/Doc/Patterns.md` для всех 8 C++ репо с архитектурными паттернами (RAII / Singleton / Bridge / Facade / Strategy / Operation / ...) — для лечения `Singleton vs Bridge` галлюцинаций, выявленных smoke 2080 Ti.

`collect_doc_deep.py` подхватит `Doc/Patterns.md` как обычный rich block → попадёт в `dataset_v4` без отдельного collector'а.

---

## 📋 Что сделано

### A. Очистка `_RAG.md tags:` (5 удалений)

| Репо | Удалённый тег | Причина |
|------|---------------|---------|
| core | `#pattern:Singleton:BatchManager` | brief: «Stateless утилита» — не Singleton |
| spectrum | `#pattern:Pipeline:SpectrumProcessorFactory` | Это Factory, дубль |
| heterodyne | `#pattern:Bridge:IBackend` | IBackend живёт в core |
| strategies | `#pattern:Pipeline:AllMaximaPipelineROCm` | Живёт в spectrum |
| strategies | `#pattern:Pipeline:AntennaProcessorTest` | Test-класс, шум |

### B. Добавление канонiчных тегов (+62)

Per-repo gap-анализ через `analyze_patterns_coverage.py` → patch `_RAG.md tags:` через `patch_rag_tags.py`:

| Репо | +tags | Типы |
|------|-------|------|
| core | +20 | Resource × 5, Singleton × 6, Bridge × 3, Facade × 1, Factory × 1, Operation × 1, Template Method × 3 |
| spectrum | +8 | Facade × 2, Operation × 6 |
| stats | +8 | Facade × 1, Operation × 7 |
| signal_generators | +3 | Facade × 2, Strategy × 1 |
| heterodyne | +3 | Facade × 2, Strategy × 1 |
| linalg | +8 | Facade × 2, Strategy × 1, Operation × 5 |
| radar | +7 | Facade × 2, Operation × 5 |
| strategies | +5 | Pipeline × 2, Strategy × 2, Builder × 1 |

### C. Скрипт `gen_patterns_drafts.py` v3

3-уровневый fallback для brief'ов:
1. `key_classes:` секция `_RAG.md` (canonical)
2. БД `rag_dsp.symbols.doxy_brief`
3. Header file — парсит `/** */` или `///` блок прямо перед `class X` (по `path:line` из БД)

Очистка brief: убраны `===` шапки + структурные блоки `ЧТО:/WHAT:/КРАТКО:` извлекаются правильно.

### D. Результат

| Репо | Entries | Δ от v2 |
|------|---------|---------|
| core | **27** | +19 |
| spectrum | **12** | +7 |
| stats | **10** | +8 |
| signal_generators | **4** | +3 |
| heterodyne | **5** | +2 |
| linalg | **10** | +8 |
| radar | **10** | +7 |
| strategies | **11** | +3 |
| **Итого** | **89** | **+57** |

---

## ✅ DoD

- [x] 8 `<repo>/Doc/Patterns.md` сгенерированы (всего 89 entries, 0 «не найдено»)
- [x] 8 `<repo>/.rag/_RAG.md` пропатчены (+62 tags / -5 noise)
- [x] 3 скрипта в `C:/finetune-env/`: `gen_patterns_drafts.py`, `analyze_patterns_coverage.py`, `patch_rag_tags.py`
- [x] Brief'ы из header fallback заработали (strategies был 100% TODO → теперь реальные описания)
- [ ] **Push после OK Alex'a** — 8 репо + workspace (commit-блоки готовы)
- [ ] Опционально: Alex редактирует руками `MagnitudeOp` brief в spectrum (один TODO остался — реально нет doxygen в header'е)
- [ ] Опционально: rebuild `dataset_v4` (когда сестра закроет T1.1 + T2 + P0)

---

## Связано

- Coordinator: [TASK_DATASET_v4_cleanup_2026-05-10.md](TASK_DATASET_v4_cleanup_2026-05-10.md) — шаг 3
- Smoke анализ: `MemoryBank/specs/LLM_and_RAG/smoke_2080ti_2026-05-10_PASSED.md`
- Sister parallel: T1.1 (`sister_inheritance_test_filter_*.md`) + T2 (`sister_namespace_correction_*.md`) + P0 negative_lookup × 5

---

*Created: 2026-05-10 · Кодо main*
