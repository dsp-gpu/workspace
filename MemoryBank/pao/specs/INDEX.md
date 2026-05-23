# specs/ — карта документов rag-mentor / rag-pao

> **Версия пакета**: v0.3 (финальная после раундов 1-5 обсуждения)
> **Дата**: 2026-05-23

## Порядок чтения

| # | Файл | О чём | Зачем |
|---|------|-------|-------|
| 1 | [01_architecture_v0.3.md](01_architecture_v0.3.md) | overview + dual-RAG диаграмма + принятые решения D1-D33 + risks | Понять что строим |
| 2 | [02_structure_v0.3.md](02_structure_v0.3.md) | структура rag-mentor + rag-pao + pao_<name> + 3 слоя rag-pao | Понять где что лежит |
| 3 | [03_phases_v0.3.md](03_phases_v0.3.md) | HI-RAG L0-L5 + 11 фаз 00→09 + 09.A collectors + cycle of self-correction | Понять порядок работ |
| 4 | [04_policies_v0.3.md](04_policies_v0.3.md) | anti-hallucination + 2 режима доступа Кодо + журнал + контракт REST+MCP | Понять критические правила |
| 5 | [05_dataset_v8_reference.md](05_dataset_v8_reference.md) | 10 коллекторов для QLoRA dataset (от сестры Sonnet 4.6, 21.05) | Источник `pipelines/_template/collectors/` |

## Граф зависимостей

```
01_architecture (foundation)
       ↓
02_structure ─────┐
       ↓          │
03_phases ────────┼──→ 04_policies (cross-cutting)
       ↓          │
05_dataset_v8 ←──┘  (referenced from 03 §10 Phase 09.A)
```

## Связь с DSP-GPU родителями

Эти 5 файлов = **финальный слой** поверх:
- `MemoryBank/specs/rag_mentor_{architecture,structure,phases,policies}_2026-05-20.md` (v0.2 родители)
- `MemoryBank/specs/rag_mentor_structure_dopolnenie_2026-05-23.md` v1.1 (правки 23.05)
- `MemoryBank/specs/rag_mentor_review_2026-05-23.md` v1.0 (deep review)
- `MemoryBank/specs_Linux_Radion_9070/dataset_v8_plan_2026-05-21.md` (collectors source)

Здесь — **сводная, без истории обсуждения**. Для деталей раундов 1-5 смотри родителей.

## Принятые решения (D1-D33)

Все 33 решения собраны в `01_architecture_v0.3.md §3` единой таблицей.

## Открытое

| # | Вопрос |
|---|--------|
| **Q-D8** | Когда стартуем Phase 00 Bootstrap? Команда Alex'а «делай Phase 00» |

---

*Maintained by: Кодо*
