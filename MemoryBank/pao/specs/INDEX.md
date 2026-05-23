# specs/ — карта документов rag-mentor / rag-pao

> **Версия пакета**: v0.3 (финальная нормативная)
> **Дата**: 2026-05-23

## Порядок чтения

| # | Файл | О чём | Зачем |
|---|------|-------|-------|
| 1 | [01_architecture_v0.3.md](01_architecture_v0.3.md) | overview + ADR + 39 принятых решений D1-D39 + Risk Register | Понять что строим |
| 2 | [02_structure_v0.3.md](02_structure_v0.3.md) | структура rag-mentor + rag-pao + pao_<name> + 3 слоя rag-pao | Понять где что лежит |
| 3 | [03_phases_v0.3.md](03_phases_v0.3.md) | HI-RAG L0-L5 + 11 фаз 00→09 + 09.A collectors + cycle of self-correction | Понять порядок работ |
| 4 | [04_policies_v0.3.md](04_policies_v0.3.md) | anti-hallucination + 2 режима доступа + журнал + idempotency + validators | Понять критические правила |
| 5 | [05_dataset_v8_reference.md](05_dataset_v8_reference.md) | reference: 10 коллекторов для QLoRA dataset | Источник `pipelines/_template/collectors/` |
| 6 | [06_architecture_diagrams.md](06_architecture_diagrams.md) | C1-C4 model (Mermaid) + REST контракты + DDD Bounded Contexts | Визуальная карта системы |

## Граф зависимостей

```
01_architecture (foundation + ADR + Risks)
       ↓
02_structure ─────┐
       ↓          │
03_phases ────────┼──→ 04_policies (cross-cutting)
       ↓          │
05_dataset_v8 ←──┘  (referenced from 03 §10 Phase 09.A)

06_architecture_diagrams (visual companion к 01 + 02)
```

## Принятые решения (D1-D39)

Все 39 решений собраны в `01_architecture_v0.3.md §3` единой таблицей.

## Открытое

| # | Вопрос |
|---|--------|
| **Q-Start** | Команда Alex'а «делай Phase 00 Bootstrap» — единственный блокер для старта |

---

*Maintained by: Кодо*
