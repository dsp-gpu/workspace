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
| **G14** 🆕 | `common/anti_hallucination/` git submodule подключён (D34) | `git submodule status` показывает common/ + `pip show rag-anti-hallucination` |
| **G15** 🆕 | `access_policy.yaml` загружается через `AccessPolicy.load()` (D35) | unit test `tests/test_policy_loader.py` PASS |
| **G16** 🆕 | `validate_targets_config()` падает на bad config (D39) | unit test bad-config FAIL with `InvalidConfig` |
| **G17** 🆕 | Prometheus + Grafana запущены (R-OBS-1) | `curl localhost:9090/-/healthy` + `curl localhost:3000/api/health` |
| **G18** 🆕 | FastAPI `/metrics` endpoint отвечает (Prometheus instrument) | `curl localhost:8080/metrics` показывает `http_requests_total` |
| **G19** 🆕 | Idempotency для `/save_rag` (D37) — unit test | `tests/test_save_rag_idempotency.py` PASS |

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

### 01-11 — Shared `common/anti_hallucination/` submodule (D34, was C1)

```bash
# Создать отдельный репо (или git init локально + добавить submodule):
mkdir -p /srv/git-remotes/common.git
git init --bare /srv/git-remotes/common.git

# Скелет common/
mkdir -p ~/common/anti_hallucination/tests
cd ~/common
git init && git remote add origin /srv/git-remotes/common.git
# написать name_validator.py / schema_lint.py / doxygen_lint.py / forbidden_terms_loader.py
git add -A && git commit -m "init shared anti_hallucination" && git push -u origin main

# Подключить в rag-mentor:
cd ~/rag-mentor && git submodule add /srv/git-remotes/common.git common
# Подключить в rag-pao:
cd /srv/rag-pao && git submodule add /srv/git-remotes/common.git common

# pyproject.toml уже имеет:
# "rag-anti-hallucination @ file://../common"
```

### 01-12 — `access_policy.yaml` + `AccessPolicy.load()` (D35, was C3)

```bash
# Файл уже в templates/rag-pao/config/access_policy.yaml
cp templates/rag-pao/config/access_policy.yaml /srv/rag-pao/config/

# Реализовать loader:
# rag_pao/core/access_control/policy_loader.py
# rag_pao/core/access_control/nda_guard.py с DI AccessPolicy + TargetsConfig

# Unit tests:
python tests/test_policy_loader.py
python tests/test_nda_guard.py
```

### 01-13 — Bootstrap validators (D39, was SEC-1)

```bash
# rag_pao/core/access_control/validators.py
# validate_targets_config() — raise InvalidConfig если nda_level != open && codo_access == full

# Интеграция:
# 1. scripts/bootstrap.sh    — вызывает validator
# 2. scripts/add_target.sh   — вызывает validator
# 3. infra/systemd/rag-pao-api.service — добавить:
#    ExecStartPre=/srv/rag-pao/venv/bin/python -m rag_pao.core.access_control.validators
```

### 01-14 — Prometheus + Grafana (R-OBS-1)

```yaml
# infra/docker-compose.prod.yml — добавить services:
prometheus:
  image: prom/prometheus:v2.51.0
  ports: ["9090:9090"]
  volumes: ["./infra/prometheus.yml:/etc/prometheus/prometheus.yml"]

grafana:
  image: grafana/grafana:10.4.0
  ports: ["3000:3000"]
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
  volumes: ["grafana_data:/var/lib/grafana"]
```

```python
# rag_pao/core/api/rest/server.py — добавить:
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app, endpoint="/metrics")
```

Готовые dashboards для Grafana (импортировать):
- HTTP latency P50/P95/P99 per endpoint
- Qwen filler/judge throughput
- VRAM / CPU / disk I/O
- `access_denials` count (R-NDA-1 visibility)

### 01-15 — Idempotency для `/save_rag` (D37)

```python
# pao_db/postgres_init.sql — добавить:
CREATE TABLE rag_pao_<target>.idempotency_keys (
    key CHAR(64) PRIMARY KEY,           -- sha256 hex
    result_json JSONB NOT NULL,
    ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

# Cleanup job (cron):
# DELETE FROM idempotency_keys WHERE ts < now() - INTERVAL '30 days';
```

```python
# rag_pao/core/api/rest/save_rag.py
@app.post("/save_rag")
def save_rag(req: SaveRagRequest):
    cached = pg.fetchone("SELECT result_json FROM idempotency_keys WHERE key=%s", req.idempotency_key)
    if cached:
        return cached.result_json
    result = persist(req)
    pg.execute("INSERT INTO idempotency_keys(key, result_json) VALUES(%s, %s)",
               req.idempotency_key, result.json())
    return result
```

---

## ⏭️ Next phase preview

**Phase 02 L0 corpus + collectors P0** (2-3 дня):
- crawler external_corpus (boost_selected, fmt, spdlog, nlohmann)
- indexer `pao_contrib` (L0 на base of customer code в `/srv/pao_contrib/`)
- 🆕 запустить 3 P0 коллектора (`reverse_patterns`, `synonym_pairs`, `confusion_negatives`) на DSP-GPU pilot (как референс), потом адаптация для `pao_contrib`
- 🆕 **OpenTelemetry tracing**: spans `process_class` → `oracle.build_etalon` → `pao.search` → `pao.run_filler` (Jaeger / Tempo backend)
- 🆕 **API versioning**: ввести `/v1/...` prefix для всех REST endpoints (R-EVO-1 fix)

---

*v0.1 preview. Полная версия — после Phase 00 DONE.*
