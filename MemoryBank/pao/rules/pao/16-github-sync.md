# 16 — Git Sync (rag-pao через bare remote, D29)

> rag-pao = **локальный git** (D18). Sync через bare remote `/srv/git-remotes/rag-pao.git`. **НЕТ github push**.

## Триггерные фразы

- «запушь pao»
- «обнови pao»
- «sync rag-pao»

## Алгоритм

### Шаг 1 — переспросить (один раз)

```
Запушу rag-pao в bare remote:
  git fetch origin --prune
  git pull --ff-only
  если M/?? → git add → git commit → git push origin main

Делаю? (да/нет)
```

### Шаг 2 — выполнить

```bash
cd /srv/rag-pao         # или /home/alex/rag-pao-shadow (laptop debug)
git fetch origin --prune
git pull --ff-only
# если M/??:
git add -A
git commit -m "..."
git push origin main           # → /srv/git-remotes/rag-pao.git
```

### Шаг 3 — auto-pull на сервере

`/srv/git-remotes/rag-pao.git/hooks/post-receive`:
```bash
#!/bin/bash
cd /srv/rag-pao && git pull --ff-only
```

→ после `git push` с laptop сервер автоматически синхронизируется.

### Шаг 4 — Post-push verify (D38, R-RES-2)

Hook может **silent fail**. Обязательно сверить HEAD после push:

```bash
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(ssh alex@10.10.4.105 'cd /srv/rag-pao && git rev-parse HEAD')

if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
    echo "❌ Post-receive hook failed! Server at $REMOTE_HEAD, local at $LOCAL_HEAD"
    exit 1
fi
echo "✅ Sync verified: $LOCAL_HEAD"
```

Внести в `scripts/sync_prompts_to_pao.sh` + `scripts/git_push_with_verify.sh`.

## Setup bare remote (Phase 01)

```bash
sudo mkdir -p /srv/git-remotes
sudo chown alex /srv/git-remotes
git init --bare /srv/git-remotes/rag-pao.git

# На laptop (rag-pao-shadow для подготовки):
mkdir -p /home/alex/rag-pao-shadow
cd /home/alex/rag-pao-shadow
git init -b main
git remote add origin ssh://alex@10.10.4.105:/srv/git-remotes/rag-pao.git
```

## Что коммитим в rag-pao

| Path | Коммит? |
|------|---------|
| `rag_pao/` Python код | ✅ |
| `pipelines/<name>_vN/` frozen + WIP | ✅ (артефакты ценные, D18) |
| `current/` | ✅ (журнал активной разработки) |
| `.rag/<target>/` | ✅ (per-target артефакты) |
| `_logs/L*_distillation.jsonl` | ✅ (для воспроизводимого QLoRA train) |
| `pao_db/migrations/` | ✅ alembic |
| `config/targets.yaml` | ✅ (без secrets) |
| `pao_db/data/` | ❌ binary blob БД |
| `qdrant_storage/` | ❌ |
| `.env`, `config/secrets.env` | ❌ secrets |
| `targets/<name>/` | ❌ — это symlink наружу, target данные коммитятся в pao_<name>/.git |

## Sync from rag-mentor (промпты)

`rag-mentor/MemoryBank/prompts/for_rag_pao/v1/` копируется в `rag-pao/MemoryBank/prompts/v1/` через:

```bash
# rag-mentor side:
bash scripts/sync_prompts_to_pao.sh
# что делает:
rsync -avz MemoryBank/prompts/for_rag_pao/v1/ \
       alex@10.10.4.105:/srv/rag-pao/MemoryBank/prompts/v1/
ssh alex@10.10.4.105 'cd /srv/rag-pao && git add MemoryBank/prompts/v1 && git commit -m "sync prompts v1 from mentor" && git push'
```

## Запреты

- НЕ push в github (rag-pao = локальный + bare)
- НЕ force push без OK Alex'а
- НЕ удалять `pipelines/<name>_v1/` (даже если WIP давно) без OK
- НЕ skip hooks без OK
- НЕ коммитить файлы из `targets/<name>/` (они принадлежат другому репо)
