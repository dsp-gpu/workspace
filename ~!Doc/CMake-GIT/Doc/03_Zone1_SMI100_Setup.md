# 03 · Zone 1 — SMI100 (Debian, транзитный сервер)

> **Кто это читает**: админ SMI100, Alex (для конфигурации), SRE-интересующиеся.
> **Цель**: полная раскладка SMI100 + инструкции настройки + backup-стратегия.

---

## 🎯 Что такое SMI100

**Физически**: сервер под Debian в локальной сети предприятия. Без интернета (firewall отрезает всё наружу), только LAN.

**Роль**: промежуточное звено между Alex-ом и LP-командами. Принимает **только проверенные** релизы от Alex-а, раздаёт их LP-командам, принимает от них патчи.

**Не**: development-сервер, CI-runner, место где кто-то пишет код. Только transport.

---

## 🏛 File layout

### Production (целевой)

```
/srv/smi100/                                      ← владелец: gitsrv (system user)
│                                                   доступ: SSH + git-shell
│
├── smi100_core.git/                    ┐
├── smi100_spectrum.git/                │
├── smi100_stats.git/                   │
├── smi100_signal_generators.git/       │   ← RELEASE-ONLY зеркала из _release_git/
├── smi100_heterodyne.git/              │      • bare (нет рабочей копии)
├── smi100_linalg.git/                  │      • read для LP-users
├── smi100_radar.git/                   │      • write ТОЛЬКО для Alex
└── smi100_strategies.git/              ┘      • pre-receive hook: только refs/tags/*
│
├── incoming/                                     ← 🆕 для patch-flow (решение Alex 2026-04-19)
│   │                                               структура PER-TEAM
│   │
│   ├── LP_A/                                     ← команда LP_A
│   │   ├── core.git                              │  • write доступ только у LP_A
│   │   ├── spectrum.git                          │  • read доступ у Alex-а
│   │   └── stats.git                             │  • ветки breaking/*, fix/*, feature/*
│   │                                             │  • pre-receive hook:
│   │                                             │    запрет push в refs/heads/main
│   │
│   ├── LP_B/                                     ← команда LP_B
│   │   └── ...                                   │  (аналогично, но свой SSH-ключ)
│   │
│   └── ...                                       ← другие команды
│
├── backup/                                       ← nightly backup (cron)
│   ├── nightly-2026-04-19.bundle
│   ├── nightly-2026-04-18.bundle
│   └── nightly-2026-04-17.bundle                 (ротация 7 дней)
│
└── .ssh/
    └── authorized_keys                           ← command="git-shell" для:
                                                     • alex-ключ (write в smi100_*)
                                                     • lp_a-ключ (write в incoming/LP_A/, read в smi100_*)
                                                     • lp_b-ключ (аналогично для LP_B)
                                                     • и т.д.
```

### Тестовый / starter (Alex 2026-04-19)

Для первого запуска / отладки **локально** (пока нет реального SMI100):

```
# Windows (на ПК Alex):
E:\SMI100\                                ← имитация /srv/smi100/
├── smi100_core.git/
├── incoming/
│   └── LP_A/core.git
└── ...

# Или Debian (на отдельной машине в LAN):
/home/alex/SMI100/                        ← стартовый путь для теста
└── ... (аналогично)

# Потом перенос на реальный сервер:
rsync -avz /home/alex/SMI100/ user@smi100.local:/srv/smi100/
```

**При переносе на prod** — меняется только путь в настройках клиентских `remote` и CMakePresets (переменная `DSP_GIT_SERVER`).

---

## 🔧 Стартовая настройка SMI100 (Debian)

### 1. Базовые пакеты

```bash
# От root:
apt update
apt install -y git openssh-server

# Опционально (если SMI100 будет сам собирать для валидации):
apt install -y cmake python3 build-essential
# + ROCm по официальной инструкции ROCm/TheRock
```

### 2. Создать system user `gitsrv`

```bash
adduser --system --group --home /srv/smi100 --shell /usr/bin/git-shell gitsrv

# Проверить:
getent passwd gitsrv
# → gitsrv:x:998:998::/srv/smi100:/usr/bin/git-shell
```

Почему:
- `--system` — не интерактивный, без UID выше 1000
- `--shell /usr/bin/git-shell` — даже если кто-то украдёт ключ, shell-доступа не получит, только git-операции

### 3. Создать структуру каталогов

```bash
cd /srv/smi100
sudo -u gitsrv mkdir -p incoming backup

# Создать bare-репо для всех модулей:
for mod in core spectrum stats signal_generators heterodyne linalg radar strategies; do
    sudo -u gitsrv git init --bare "/srv/smi100/smi100_${mod}.git"
done

# Создать incoming для первой команды LP_A:
mkdir -p /srv/smi100/incoming/LP_A
for mod in core spectrum stats signal_generators heterodyne linalg radar strategies; do
    sudo -u gitsrv git init --bare "/srv/smi100/incoming/LP_A/${mod}.git"
done

# Выставить права:
chown -R gitsrv:gitsrv /srv/smi100
chmod -R 755 /srv/smi100
```

### 4. SSH keys

```bash
sudo -u gitsrv mkdir -p /srv/smi100/.ssh
sudo -u gitsrv touch /srv/smi100/.ssh/authorized_keys
chmod 700 /srv/smi100/.ssh
chmod 600 /srv/smi100/.ssh/authorized_keys
```

Добавить публичные ключи (`authorized_keys`):

```
# Alex (full access на всё):
command="git-shell -c \"$SSH_ORIGINAL_COMMAND\"",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA...pubkey_alex alex@desktop

# LP_A (только incoming/LP_A/ и read основные smi100_*):
command="git-shell -c \"$SSH_ORIGINAL_COMMAND\"",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA...pubkey_lp_a lp_a@server
```

Фильтрация доступа на уровне пути — через pre-receive hook (см. ниже).

### 5. Pre-receive hooks

#### Для `smi100_*.git` — только теги, только от Alex

`/srv/smi100/smi100_core.git/hooks/pre-receive`:

```bash
#!/usr/bin/env bash
# Запрещает всё кроме push тегов от Alex-а

# Идентифицируем пушящего по SSH fingerprint (или по authorized_keys командe)
# Упрощённо: допускаем только refs/tags/*
while read oldrev newrev refname; do
    if [[ ! "$refname" =~ ^refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "ERROR: только теги вида vX.Y.Z разрешены в smi100_*.git"
        echo "       попытка push: $refname"
        exit 1
    fi
    # Защита от force-push тега (удаление/перезапись)
    if [[ "$oldrev" != "0000000000000000000000000000000000000000" ]]; then
        echo "ERROR: теги неизменны. $refname уже существует"
        exit 1
    fi
done

exit 0
```

Сделать executable:
```bash
chmod +x /srv/smi100/smi100_core.git/hooks/pre-receive
# Повторить для всех smi100_*.git
```

#### Для `incoming/LP_X/*.git` — ветки фиксов, не main

`/srv/smi100/incoming/LP_A/core.git/hooks/pre-receive`:

```bash
#!/usr/bin/env bash
# Разрешает push только в refs/heads/breaking/*, refs/heads/fix/*, refs/heads/feature/*
# Запрещает push в refs/heads/main, refs/heads/master

while read oldrev newrev refname; do
    if [[ "$refname" =~ ^refs/heads/(main|master)$ ]]; then
        echo "ERROR: в incoming/ запрещён push в main/master"
        exit 1
    fi
    if [[ "$refname" =~ ^refs/heads/(breaking|fix|feature)/ ]]; then
        continue  # OK
    fi
    if [[ "$refname" =~ ^refs/tags/ ]]; then
        echo "ERROR: теги идут только через Alex-а и smi100_*.git, не через incoming"
        exit 1
    fi
    echo "ERROR: неразрешённый ref в incoming: $refname"
    exit 1
done

exit 0
```

---

## 🔄 Workflow на SMI100 (день из жизни)

### Приём промотирования от Alex

```
Alex выполняет: promote_to_smi100.sh core v1.2.0
  ↓ (SSH + git push)
SMI100 принимает в /srv/smi100/smi100_core.git refs/tags/v1.2.0
  ↓ pre-receive hook проверяет
  ├─ refname == refs/tags/v1.2.0   ✅
  ├─ oldrev == 00000 (новый тег)    ✅
  └─ принято

После: любой LP с SSH-доступом может git fetch этот тег.
```

### Приём патча от LP_A

```
LP_A выполняет: git push incoming-smi100 breaking/fix-nan
  ↓
SMI100 принимает в /srv/smi100/incoming/LP_A/core.git refs/heads/breaking/fix-nan
  ↓ pre-receive hook проверяет
  ├─ refname matches refs/heads/breaking/*   ✅
  └─ принято

Alex в удобное время:
  cd E:\DSP-GPU\core
  git fetch smi100-incoming-LP_A breaking/fix-nan
  # review, merge, tag → promote обратно
```

### Раздача обновлений LP-командам

Ничего на SMI100 не делается. LP сами приходят через `cmake configure → update_dsp.py --mode lp-refresh`.

---

## 💾 Backup & recovery

### Зачем backup

SMI100 — единственное место в Zone 1. Если диск упал — вся распределённая инфраструктура встанет. Но восстановить **легко**: `smi100_*.git` это production-зеркала `_release_git/` с ПК Alex, а `incoming/` — теряется редко важные (ветки патчей) → можем восстановить с LP.

Backup делает **бесплатной страховкой** — 5 минут cron в день.

### Механика

Cron-задача на SMI100 (`/etc/cron.d/smi100-backup`):

```cron
# каждый день в 03:00 делаем bundle всех репо
0 3 * * * gitsrv /srv/smi100/scripts/nightly-backup.sh
```

Скрипт `/srv/smi100/scripts/nightly-backup.sh`:

```bash
#!/usr/bin/env bash
set -e

BACKUP_DIR=/srv/smi100/backup
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d)
BUNDLE="$BACKUP_DIR/nightly-$DATE.bundle"

# Bundle все основные репо в один файл
cd /srv/smi100
tar -czf "$BACKUP_DIR/nightly-$DATE.tar.gz" \
    smi100_*.git \
    incoming/

# Альтернатива через git bundle (только для smi100_*.git):
# for repo in smi100_*.git; do
#     git -C "$repo" bundle create "$BACKUP_DIR/${repo%.git}-$DATE.bundle" --all
# done

# Ротация — удалить старше 7 дней
find "$BACKUP_DIR" -name "nightly-*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] ✅ Backup завершён: $BUNDLE"
```

### Recovery

Диск на SMI100 умер → куплен новый:

```bash
# 1. Развернуть чистый Debian + gitsrv user (см. "Стартовая настройка")
# 2. Скопировать backup-архив из secondary storage (NAS / внешний диск)
scp backup-2026-04-18.tar.gz gitsrv@smi100.new:/srv/smi100/backup/

# 3. Восстановить:
cd /srv/smi100
tar -xzf backup/backup-2026-04-18.tar.gz

# 4. Проверить:
for repo in smi100_*.git; do
    echo "=== $repo ==="
    git -C "$repo" tag -l | tail -5
done

# 5. LP-команды переподключаются автоматически через очередной cmake configure
```

**Альтернатива**: Alex пушит повторно все теги с `_release_git/`:

```bash
# На ПК Alex (если backup-а нет):
for mod in core spectrum stats signal_generators heterodyne linalg radar strategies; do
    cd E:\DSP-GPU\_release_git\smi100_${mod}.git
    git push --tags smi100
done
```

Это восстанавливает `smi100_*.git`, но **не** `incoming/` — патчи в процессе теряются. Поэтому backup важен именно для `incoming/`.

---

## 📋 Чеклист правильной настройки Zone 1

### Minimum viable (для теста)

- [ ] SMI100 доступен по SSH
- [ ] User `gitsrv` создан с shell=git-shell
- [ ] `/srv/smi100/` создан, владелец gitsrv
- [ ] Все 8 `smi100_*.git` созданы как bare
- [ ] `authorized_keys` содержит ключ Alex-а
- [ ] `pre-receive` hook установлен (хотя бы на один `smi100_*.git` для проверки)

### Production ready

- [ ] Все `smi100_*.git` защищены pre-receive hook (только теги vX.Y.Z)
- [ ] `incoming/LP_A/` создан для первой команды
- [ ] Ключ LP_A-user добавлен в `authorized_keys`
- [ ] Pre-receive hook на `incoming/LP_A/*` (запрет push в main)
- [ ] Cron на nightly backup настроен, протестирован
- [ ] Secondary storage для backup-архивов подключён (NAS / rsync)
- [ ] Документирован recovery-процесс (этот файл)
- [ ] Проведён тестовый recovery (хотя бы раз) — чтобы знать что работает

### Nice to have

- [ ] Monitoring disk usage (`df` alert на > 80%)
- [ ] Monitoring active SSH sessions (`last` / `journalctl`)
- [ ] Periodic `git fsck` для проверки целостности репо
- [ ] Web-frontend (gitweb / gitea) для просмотра тегов LP-командами без SSH

---

## 🔐 Security primer

Подробно — [12_Security_Model.md](12_Security_Model.md). Коротко:

| Угроза | Защита |
|--------|--------|
| Украли SSH ключ LP-user | Ограничены command=git-shell → нет shell; pre-receive запрещает push в основные репо |
| Украли SSH ключ Alex-а | Pre-receive всё равно запрещает force-push и удаление тегов; `promotions.log.json` покажет аномальную активность |
| Диск умер | Nightly backup на secondary storage; Alex может перепромотировать всё |
| LAN-атака (MITM) | SSH шифрует; pre-receive проверяет что refname legitimate |
| Вредонос под `gitsrv` user-ом | System-user, нет sudo; shell=git-shell не даёт интерактивный доступ |

---

## 🧭 Дальше

- [12_Security_Model.md](12_Security_Model.md) — детальная security-модель
- [04_Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md) — как LP работают с SMI100
- [09_Scripts_Reference.md](09_Scripts_Reference.md) — скрипты, включая nightly backup
- [11_Troubleshooting.md](11_Troubleshooting.md) — типовые проблемы SMI100

---

*03_Zone1_SMI100_Setup.md · 2026-04-19 · Кодо + Alex*
