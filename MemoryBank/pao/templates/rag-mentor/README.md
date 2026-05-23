# rag-mentor — Oracle для dual-RAG (mentor ↔ pao)

> **Назначение**: Claude-based «оракул» который формирует априорный эталон ответа для C++ doxygen + tests, сравнивает с тем что генерирует Qwen в rag-pao, правит промпт через critic.
> **Платформа**: Debian Linux (laptop) + Anthropic API.

---

## Quick Start (5 шагов)

```bash
# 1. Клонировать
git clone git@github.com:rag-mentor/rag-mentor.git
cd rag-mentor

# 2. Скопировать secrets
cp config/secrets.env.example config/secrets.env
vim config/secrets.env       # заполнить ANTHROPIC_API_KEY / POSTGRES_PASSWORD / ...

# 3. Bootstrap (Phase 01)
bash scripts/bootstrap.sh    # mentor_db init + 7 MCP servers start

# 4. Открыть в Claude Code
# → Кодо подхватит CLAUDE.md + 17 rules + 7 MCP

# 5. Команда «делай Phase 00 Bootstrap» (если первый запуск)
#    ИЛИ «прогнать на классе X из pao_contrib» (если инфра уже готова)
```

---

## Что внутри

| Каталог | Что |
|---------|-----|
| `MemoryBank/` | spec'и + rules + tasks + prompts + sessions + changelog |
| `rag_mentor/` | Python пакет (orchestrator, prompt_builder, oracle, reviewer, comparator, critic, ...) |
| `mentor_db/` | PG schema `rag_mentor` + Qdrant `mentor_v1` (свой RAG про методику) |
| `mcp_servers/` | 7 локальных MCP-серверов для Кодо (postgres_mcp, qdrant_mcp, ...) |
| `tests/` | тесты harness'а (NO pytest — TestRunner) |
| `scripts/` | bootstrap.sh, sync_prompts_to_pao.sh, eval_run.sh |
| `config/` | targets.yaml, stack.{dev,prod}.json, mcp_servers.yaml, secrets.env |

---

## Связь с rag-pao

```
rag-mentor (laptop, Debian)            rag-pao (server, Ubuntu 10.10.4.105)
─────────────────────────              ──────────────────────────────────────
Claude + mentor_db (oracle)            Qwen-Coder-14B + Qwen-35B + pao_db
                  │                                          │
                  └────── REST (порт 8080, SSH tunnel) ──────┘
                  │                                          │
                  └────── git push/pull через bare remote ───┘
                          (/srv/git-remotes/rag-pao.git)
```

**Доступ Кодо к pao** — 2 режима (см. `MemoryBank/specs/04_policies §E`):
- `debug`: полный REST доступ
- `production`: только safe-endpoints (для NDA-drops)

---

## Архитектура

См. `MemoryBank/specs/`:
- `INDEX.md` — карта документов
- `01_architecture_v0.3.md` — обзор + dual-RAG диаграмма
- `02_structure_v0.3.md` — структура каталогов
- `03_phases_v0.3.md` — порядок работ (11 фаз)
- `04_policies_v0.3.md` — критические правила
- `05_dataset_v8_reference.md` — collectors для QLoRA

---

## License

Apache-2.0. См. `LICENSE`.

---

## Status

🟡 Phase 00 Bootstrap — в процессе. См. `MemoryBank/tasks/IN_PROGRESS.md`.
