# TASK_Phase01_Infra (preview)

> **Версия**: 0.1 preview · **Дата**: 2026-05-23 · **Зависит от**: Phase 00 DONE
> **Estimate**: **2 дня**

---

## 🎯 Цель

Поднять инфру: docker-compose, PG schemas, Qdrant collections, Ollama, 7 локальных MCP-серверов — чтобы Кодо могла стартовать Phase 02 (L0 corpus).

---

## ✅ Acceptance criteria

| Gate | Как проверить |
|------|---------------|
| **G1** | `docker-compose up -d` в `rag-pao/infra/` → PG 16 + Qdrant 1.13 + Ollama + BGE-M3 запущены | `docker ps` показывает 4 контейнера |
| **G2** | PG schema `rag_mentor` создан + 5 таблиц | `psql -c '\dt rag_mentor.*'` показывает prompts/golden_sets/sessions/target_metadata/eval_runs |
| **G3** | PG schema `rag_pao_pao_contrib` создан + 7 таблиц | `psql -c '\dt rag_pao_pao_contrib.*'` |
| **G4** | Qdrant collections `mentor_v1` + `pao_contrib_v1` | `curl localhost:6333/collections` |
| **G5** | Ollama имеет `qwen2.5-coder:14b-q4_K_M` + `qwen3.6:35b-q4_K_M` | `ollama list` |
| **G6** | BGE-M3 embed_server на :8765 | `curl localhost:8765/health` |
| **G7** | 7 локальных MCP подключены к Claude Code | manual: `claude code mcp list` → 7 серверов |
| **G8** | postgres_mcp видит `rag_mentor` schema | manual: «покажи список таблиц mentor_db» |
| **G9** | qdrant_mcp видит `mentor_v1` collection | manual: «покажи список коллекций mentor» |
| **G10** | rag-pao FastAPI на :8080 запущен | `curl localhost:8080/health` |
| **G11** | `nda_guard.py` smoke-test (debug mode `pao_contrib`) | unit test `tests/test_nda_guard.py` PASS |
| **G12** | bare remote `/srv/git-remotes/rag-pao.git` создан | `git ls-remote /srv/git-remotes/rag-pao.git` отвечает |
| **G13** | Pre-flight `infra/healthcheck.sh` работает | bash run → returns 0 + «✅ Pre-flight OK» |

---

## 📋 Sub-tasks

### 01-1 — docker-compose

`rag-pao/infra/docker-compose.prod.yml`:
- postgres:16 (port 5432) — volume `postgres_data/` mounted
- qdrant:1.13 (port 6333) — volume `qdrant_storage/` mounted
- ollama:latest (port 11434, GPU passthrough для ROCm)
- bge-m3 (custom image, port 8765)

### 01-2 — PG init

- `mentor_db/postgres_init.sql` → `CREATE SCHEMA rag_mentor` + 5 таблиц
- `pao_db/postgres_init.sql` → `CREATE SCHEMA rag_pao_<target>` + 7 таблиц (см. template_rag_mcp_cpp §2.2)
- alembic init в обоих

### 01-3 — Qdrant bootstrap

- `mentor_db/qdrant_bootstrap.py` → `mentor_v1` (vector_size=1024, distance=Cosine)
- `pao_db/qdrant_bootstrap.py` → `<target>_v1`

### 01-4 — Ollama

```bash
ollama pull qwen2.5-coder:14b-q4_K_M
ollama pull qwen3.6:35b-q4_K_M
```

### 01-5 — BGE-M3 server

Custom uvicorn server на :8765 (как в DSP-GPU `embed_server.py`).

### 01-6 — 7 локальных MCP

Заполнить `rag-mentor/config/mcp_servers.yaml` реальными `command/args`:
- context7_local, sequential_thinking, filesystem, git_mcp
- **postgres_mcp** → подключение к `rag_mentor` schema
- **qdrant_mcp** → подключение к `mentor_v1` collection
- memory_mcp

### 01-7 — FastAPI rag-pao на :8080

Запустить `uvicorn rag_pao.core.api.rest.server:app` через systemd.

### 01-8 — access_control smoke

`tests/test_nda_guard.py`:
```python
def test_debug_full_allows_show_file():
    assert check_access("pao_contrib", "/show_file", "debug") == True

def test_debug_rest_only_blocks_show_file():
    assert check_access("pao_xxxx_acme", "/show_file", "debug") == False

def test_production_blocks_show_file_everywhere():
    assert check_access("pao_contrib", "/show_file", "production") == False
```

### 01-9 — Bare remote

```bash
sudo mkdir -p /srv/git-remotes
sudo chown alex /srv/git-remotes
git init --bare /srv/git-remotes/rag-pao.git
```

### 01-10 — healthcheck.sh

Pre-flight train hygiene (см. `04_policies_v0.3.md §H`).

---

## ⏭️ Next phase preview

**Phase 02 L0 corpus + collectors P0** (2-3 дня):
- crawler external_corpus (boost_selected, fmt, spdlog, nlohmann)
- indexer `pao_contrib` (L0 на base of customer code в `/srv/pao_contrib/`)
- 🆕 запустить 3 P0 коллектора (`reverse_patterns`, `synonym_pairs`, `confusion_negatives`) на DSP-GPU pilot (как референс), потом адаптация для `pao_contrib`

---

*v0.1 preview. Полная версия — после Phase 00 DONE.*
