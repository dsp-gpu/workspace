# 16 — GitHub Sync (rag-mentor)

> **Приоритет**: выше `02-workflow.md:38` — триггерные фразы Alex'а сами И ЕСТЬ запрос. Но переспрос обязателен.

## Триггерные фразы

Для **rag-mentor** (push в github):
- «запушь mentor»
- «обнови репо mentor»
- «синхронизуй mentor»

Для **rag-pao** (sync через bare remote):
- «запушь pao»
- «обнови pao»
- «sync rag-pao»

## Алгоритм mentor (push в github)

### Шаг 1 — переспросить

```
Запушу rag-mentor:
  git fetch origin --prune
  git pull --ff-only
  если M/?? → git add → git commit → git push origin main

Делаю? (да/нет)
```

### Шаг 2 — дождаться явного «да» / «делай» / «ок»

Молчание ≠ согласие. Злой мат ≠ согласие.

### Шаг 3 — выполнить

```bash
cd /home/alex/rag-mentor
git fetch origin --prune
git pull --ff-only
# если M или ??:
git add -A
git commit -m "<осмысленное сообщение>"
git push origin main
```

### Шаг 4 — верификация

```bash
git log origin/main..HEAD       # должно быть ПУСТО
git status -sb                  # "## main...origin/main" БЕЗ M/??
```

## Алгоритм pao (через bare remote, D29)

### Шаг 1 — переспросить (тот же формат)

### Шаг 2 — выполнить

```bash
# На laptop (Кодо работает в rag-pao-shadow для подготовки изменений):
cd /home/alex/rag-pao-shadow
git add -A
git commit -m "..."
git push origin main                    # в /srv/git-remotes/rag-pao.git

# На сервере (автомат через post-receive hook):
# git pull в /srv/rag-pao автоматически после push
```

### Шаг 3 — верификация

```bash
ssh alex@10.10.4.105 'cd /srv/rag-pao && git log -1 --oneline'   # совпадает с laptop?
```

## Запрещено

- Push без переспроса (Шаг 1-2)
- Push в feature-ветки / tag релизы без отдельного OK
- Force push на `main` (warn Alex'а)
- Skip hooks (`--no-verify`, `--no-gpg-sign`) — кроме явного запроса
- Удаление файлов БЕЗ явного OK

## Особенности

| Репо | Remote | git push? |
|------|--------|-----------|
| rag-mentor | `github.com/rag-mentor/rag-mentor` | ✅ да (после OK) |
| rag-pao | `/srv/git-remotes/rag-pao.git` (bare, на сервере) | ✅ да (после OK) |
| pao_<name> | разный (заказчик / отдельный) | ❌ — это код заказчика, mentor НЕ пушит в них |

## Secrets

- `.env`, `config/secrets.env`, `*.key`, `*.pem` — **никогда не коммитить**
- `.gitignore` ловит, но при сомнении — спросить Alex'а
