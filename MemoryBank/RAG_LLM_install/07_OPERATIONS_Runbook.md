# 🔧 07 — Operations Runbook (эксплуатация)

> Повседневное обслуживание развёрнутого стека: health · restart · backup · re-ingest · troubleshooting.

---

## 1. Health-check (весь стек одной пачкой)

```bash
# сервисы:
systemctl is-active postgresql qdrant ollama
systemctl --user is-active embed.service dsp-asst.service
# порты:
ss -tlnp | grep -E ':5432|:6333|:8765|:7821|:11434|:8080'
# API:
curl -s http://127.0.0.1:7821/health      # dsp-asst RAG
curl -s http://localhost:6333/healthz       # qdrant
curl -s http://127.0.0.1:8080/v1/models     # llama-server
# MCP:
claude mcp get dsp-asst                      # ✓ Connected
# счётчики RAG:
psql -h localhost -U dsp_asst -d gpu_rag_dsp -c \
  "SELECT 'symbols' t, count(*) FROM rag_dsp.symbols
   UNION ALL SELECT 'doc_blocks', count(*) FROM rag_dsp.doc_blocks
   UNION ALL SELECT 'test_params', count(*) FROM rag_dsp.test_params
   UNION ALL SELECT 'use_cases', count(*) FROM rag_dsp.use_cases;"
```

---

## 2. Restart / управление

```bash
# system:
sudo systemctl restart postgresql qdrant ollama
# user:
systemctl --user restart dsp-asst.service embed.service
systemctl --user status dsp-asst.service           # логи: journalctl --user -u dsp-asst -f
# LLM:
sudo llm-switch {14b|30b|mtp|status|stop}
# linger (если user-units не стартуют при boot):
sudo loginctl enable-linger alex && loginctl show-user alex | grep Linger
```

---

## 3. Re-ingest (при изменении кода)

```bash
export DSP_ASST_PG_PASSWORD=1 DSP_GPU_ROOT=/home/alex/DSP-GPU
cd /home/alex/finetune-env
dsp-asst --stage 1_home index build        # инкрементально (blake3_hash)
dsp-asst --stage 1_home index embeddings    # BGE-M3 (GPU)
./re_ingest_all.sh                          # doc_blocks/use_cases/pipelines
python ingest_test_tags.py --all            # @test* → test_params
# weekly (вт 09:00, cron): dsp-asst manifest refresh   # AI-секции _RAG.md
```

---

## 4. Backup

```bash
# Postgres:
pg_dump -h localhost -U dsp_asst gpu_rag_dsp > /tmp/gpu_rag_dsp_$(date +%F).sql
# Qdrant: snapshot
curl -X POST http://localhost:6333/collections/dsp_gpu_rag_v1/snapshots
# systemd-units: держать копии в DSP-GPU/scripts/debian_deploy/ (нельзя терять)
```

---

## 5. Troubleshooting (частые проблемы)

| Симптом | Причина | Решение |
|---------|---------|---------|
| dsp-asst не стартует при boot | linger выкл | `sudo loginctl enable-linger alex` |
| dsp-asst падает первые секунды boot | PG не успел (user-unit не видит system) | by design — RestartSec=10, встанет через 1-2 попытки |
| `psql: peer authentication failed` | socket-подключение | `-h localhost` (TCP) + password `1` |
| postgres не читает SQL из `/home/alex` | права | через `/tmp/` или `sudo -u postgres` |
| RAG-поиск не находит use-case | sparse не на doc_blocks (Finding) | tsvector+GIN на doc_blocks/use_cases/pipelines |
| генерация тестов «вслепую» | `test_params` пуст | `ingest_test_tags.py` + ручная верификация (нужны `@test*` теги) |
| LLM пустой ответ | thinking-trap / мало токенов | `--reasoning off` + `max_tokens ≥ 4000` |
| LLM зациклился (30B) | нет repeat_penalty | `repeat_penalty: 1.15` |
| speculative off | vocab mismatch 152064≠151936 | патч draft или `--spec-type ngram-*` |
| OOM при 2 больших LLM | VRAM 16 ГБ | `llm-switch stop` → start (одна за раз) |
| старый GGUF не грузится | апгрейд llama.cpp | зафиксировать commit llama.cpp |
| train: `hipErrorIllegalAddress` | bnb 0.49.2 NaN bug (AMD) | `pip install unsloth[amd]` (bnb ≥ 1.33.7) |
| train: OOM на 14B | swap + GUI + PEFT fp32 cast | `swapoff -a`, закрыть GUI, Plan-D патч (см. 05) |
| HF модель не грузится offline | stubs битые | `DSP_ASST_BGE_M3_PATH=...offline-debian-pack/1_models/bge-m3` |

---

## 6. Серверные gotchas (10.10.4.105 Ubuntu 24)

- **GLIBC** Debian 13 (2.41) ≠ Ubuntu 24 (2.39) → бинари не переносимы, собирать на сервере.
- **HIP-headers конфликт**: `libamdhip64-dev 5.7.1` (noble) vs `hip-dev 7.2` (radeon) → удалить старый.
- **Нет PyPI** → BGE-M3 заменён `nomic-embed-text` (Ollama); dsp-asst локально + БД сервера через tunnel.

---

## 7. Что НЕ автостартует (ручное / по событию)

- `re_ingest_all.sh`, `index build/embeddings` — ре-индекс при изменении кода
- `llm-switch` — переключение модели
- train (`run_with_resume.sh`) — только дом/работа, НЕ сервер
- weekly cron `manifest refresh`

---

*Maintained by: Кодо · 2026-06-01*
