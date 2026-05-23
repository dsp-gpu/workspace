# rag-pao — Executor для dual-RAG (mentor ↔ pao)

> **Назначение**: оффлайн-исполнитель индексации customer drops, retrieval, генерации doxygen/tests через Qwen14B + judge через Qwen35B, накопления distillation logs для QLoRA.
> **Платформа**: Ubuntu Linux server (10.10.4.105) + ROCm 7.2 + RX 9070.

---

## Quick Start (5 шагов)

```bash
# 1. Скопировать репо на сервер (НЕ git clone — локальный)
mkdir -p /srv/rag-pao && cd $_
git init -b main

# 2. Скопировать шаблоны
# (на laptop)
rsync -avz /e/DSP-GPU/MemoryBank/pao/templates/rag-pao/ alex@10.10.4.105:/srv/rag-pao/

# 3. Скопировать secrets
cp config/secrets.env.example config/secrets.env
vim config/secrets.env

# 4. Скопировать config + добавить свои pao_<name>
cp config/targets.yaml.example config/targets.yaml
vim config/targets.yaml

# 5. Bootstrap (Phase 01)
bash scripts/bootstrap.sh    # PG schemas + Qdrant + Ollama + FastAPI + systemd
```

---

## 3 слоя

```
rag_pao/core/           🔵 STABLE — общий для всех targets
pipelines/<name>_vN/    🟡 FROZEN — per-target snapshot со score ≥ 80
current/                🟢 ACTIVE — разработка нового target
```

**Создать новый target**:
```bash
bash scripts/add_target.sh pao_xxxx_acme
# cp pipelines/_template/ → pipelines/pao_xxxx_acme_v1/
# adapt collectors / prompts_override / golden_set
# orchestrator --pipeline pao_xxxx_acme_v1
```

---

## Что внутри

| Каталог | Что |
|---------|-----|
| `MemoryBank/` | spec'и + rules + prompts (копии from mentor через bare remote) |
| `rag_pao/core/` | indexer + retrieval + llm_serving + journal + api + access_control |
| `pipelines/_template/` | шаблон для нового target (collectors + prompts_override + golden_set) |
| `pipelines/<name>_v1/` | frozen snapshots |
| `current/` | активная разработка |
| `targets/` | symlinks к `/srv/pao_<name>/` (D21) |
| `finetune/` | QLoRA — train + eval |
| `pao_db/` | PG + Qdrant per-target |
| `external_corpus/` | public open-source (boost_selected, fmt, spdlog, nlohmann) |
| `infra/` | docker-compose + systemd + healthcheck |

---

## Связь с rag-mentor

- **REST API** на :8080 — primary интерфейс для mentor
- **Git bare remote** `/srv/git-remotes/rag-pao.git` — sync промптов + журналов
- **MCP server** — для interactive Claude debugging (только в debug-mode)

---

## 2 режима доступа Кодо (D25)

| Mode | endpoint'ы |
|------|-----------|
| `debug` | полный REST (`/show_file`, `/run_filler`, ...) — для отладки на pao_contrib |
| `production` | только safe (`/show_signature`, `/show_symbols`, `/search`, `/run_filler` sanitized) — для NDA-drops |

Переключатель в `config/targets.yaml` (`mode: debug | production`) + per-target `codo_access`.

---

## Customer drops

**ВНЕ rag-pao** (D21): `/srv/pao_contrib/`, `/srv/pao_xxxx_acme/`, ...

```yaml
# config/targets.yaml
targets:
  - name: pao_contrib
    source: "/srv/pao_contrib"
    nda_level: open
    codo_access: full
    pipeline: pao_contrib_v1
```

Структура drop'а → `MemoryBank/specs/02_structure_v0.3.md §4`.

---

## Архитектура

См. `MemoryBank/specs/`:
- `INDEX.md` — карта документов
- `01_architecture_v0.3.md`
- `02_structure_v0.3.md §3-§6` (rag-pao + pao_<name>)
- `03_phases_v0.3.md`
- `04_policies_v0.3.md`
- `05_dataset_v8_reference.md` — collectors

---

## License

Apache-2.0.

---

## Status

🟡 Phase 00 — в процессе. См. `MemoryBank/MASTER_INDEX.md`.
