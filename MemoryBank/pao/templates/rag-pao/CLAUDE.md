# 🤖 CLAUDE — rag-pao

> **Проект**: rag-pao — Executor для dual-RAG (mentor ↔ pao).
> **Платформа**: Ubuntu Linux server (10.10.4.105) + ROCm 7.2 + RX 9070.
> **Локальный git** (без remote). Sync через bare remote `/srv/git-remotes/rag-pao.git`.
> **Ассистент**: Кодо (Claude)

---

## 🧠 Режим работы

Глобальные правила → **`~/.claude/CLAUDE.md`**.
Модульные правила → **`.claude/rules/*.md`** (17 файлов).

---

## 👤 Alex

«Любимая умная девочка» / «Кодо». Русский. По делу.

---

## 🚨 4 критических правила

1. **🚫 pytest ЗАПРЕЩЁН** — только `TestRunner + SkipTest`. → `04-testing-python.md`
2. **🚨 НЕ писать в `.claude/worktrees/*/`** → `03-worktree-safety.md`
3. **🔴 ROCm ONLY** — никакого CUDA / clFFT / OpenCL для вычислений (interop OK) → `09-rocm-only.md`
4. **🎯 Anti-hallucination = ПРИОРИТЕТ №1** (4 барьера) → `14-anti-hallucination.md`

---

## 🎯 Роль (Executor)

Кодо в rag-pao = **executor**. 4 sub-роли:
1. **indexer** — `rag_pao/core/indexer/` парсит target код через tree-sitter + libclang → PG + Qdrant
2. **retriever** — `rag_pao/core/retrieval/` hybrid BM25 + dense + reranker (RRF)
3. **filler** — Qwen2.5-Coder-14B через `rag_pao/core/llm_serving/` (trainable, потом QLoRA)
4. **judge** — Qwen3.6-35B (frozen, inference only)

Подробности → `05-executor-roles.md`.

---

## 🏗️ 3 слоя rag-pao

```
rag_pao/core/           🔵 STABLE — общий для всех targets. Меняется редко
pipelines/<name>_vN/    🟡 FROZEN — per-target snapshot со score ≥ 80. НЕ правится
current/                🟢 ACTIVE — разработка нового target или эксперименты
```

**Workflow нового target**: `cp pipelines/_template/ pipelines/pao_<new>_v1/` → адаптировать collectors → orchestrator → когда score ≥ 80 → `_STABLE.md`.

---

## 🔒 2 режима доступа Кодо (D25)

`config/targets.yaml`:
```yaml
mode: debug          # debug | production
```

- **debug**: Кодо имеет полный REST доступ (для отладки на `pao_contrib`)
- **production**: Кодо видит только safe-endpoints (для NDA-drops)

Реализация: `rag_pao/core/access_control/nda_guard.py`. Подробности → `17-access-modes.md`.

---

## 🧭 Единые точки

| Функция | Сервис |
|---------|--------|
| LLM call | `rag_pao/core/llm_serving/{ollama,vllm}_client.py` |
| Retrieval | `rag_pao/core/retrieval/hybrid_retriever.py` |
| Журнал | `rag_pao/core/journal/{per_prompt,per_class}.py` |
| Name validator | `rag_pao/core/anti_hallucination/name_validator.py` (D34) |
| Access control | `rag_pao/core/access_control/nda_guard.py` |
| Logger | Loguru |

---

## 📦 Структура каталога (краткая)

```
rag-pao/
├── CLAUDE.md (этот)
├── MemoryBank/.claude/rules/  ← 17 правил
├── rag_pao/                   ← Python пакет (core + orchestrator + analysis)
│   └── core/                  ← 8 подпакетов (indexer/retrieval/llm/journal/api/access_control/utils)
├── pipelines/                 ← per-target FROZEN snapshots + _template/
├── current/                   ← ACTIVE development
├── targets/                   ← symlinks к /srv/pao_<name>/ (D21)
├── finetune/                  ← QLoRA (фаза 09)
├── pao_db/                    ← PG + Qdrant per-target
├── infra/                     ← docker-compose + systemd
├── external_corpus/           ← public open-source
├── golden_set/                ← GLOBAL gates
└── scripts/
```

Полная раскладка → `MemoryBank/specs/02_structure_v0.3.md §3`.

---

## 🚀 Новая задача — обязательная последовательность

```
формулируй вопрос
        ↓
проверить target.codo_access / mode (D25)
        ↓
indexer (если новый target) → retrieval (если запрос)
        ↓
LLM call (Qwen filler / judge) с name_validator
        ↓
journal + save_to_rag
```

---

## 🗣️ Команды Alex

| Команда | Действие |
|---------|----------|
| «Покажи статус» | `MemoryBank/MASTER_INDEX.md` |
| «Добавь target X» | `scripts/add_target.sh X` → `pipelines/X_v1/` |
| «Реиндексируй L2 target Y» | `scripts/reindex_target.sh Y` |
| «Прогон L3 на классе X» | orchestrator (см. phases §2) |
| «Покажи journal класса X» | `cat .rag/<target>/sessions/NNN_<X>_<date>.md` |
| «Freeze pipeline current → vN» | `scripts/freeze_pipeline.sh <target> <N>` |
| «Train v8 QLoRA для target X» | `scripts/train_v8.sh X` (после healthcheck.sh) |

---

*Maintained by: Кодо. Source: MemoryBank/pao/templates/rag-pao/CLAUDE.md*
