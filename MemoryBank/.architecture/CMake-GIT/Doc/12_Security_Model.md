# 12 · Security Model — кто что может

> **Кто это читает**: админ SMI100, Alex, security-офицер / auditor, техлиды LP-команд.
> **Цель**: явная модель безопасности pipeline — роли, права, guardrails, процедуры при компрометации.

---

## 🎯 Принципы

1. **Least privilege**: каждая роль имеет **минимум** прав для своей работы
2. **Defense in depth**: несколько уровней защиты, даже если один упал — остальные держат
3. **Audit trail**: кто / что / когда — логируется, immutable
4. **No trust in network**: SMI100 и LP **не** имеют интернета, LAN шифруется SSH

---

## 👥 Четыре роли

| Роль | Физ. лицо | Где работает | Что может | Что НЕ может |
|------|-----------|--------------|-----------|--------------|
| **Alex** | Alex (владелец проекта) | ПК Alex (Windows) | Всё на Zone 0. Промотирование в Zone 1. Merge patches. Ротация ключей. | Прямой доступ к Zone 2 (LP) — только через их админа |
| **SMI100 admin** | Алекс или выделенный админ | SMI100 (Debian) | Админ сервера. Setup pre-receive hooks. Backup. Ротация user-ключей. | Не пушит код. Не промотирует. |
| **LP-разработчик** | Инженеры LP-команд | LP_x-сервер | Read из SMI100. Write в incoming/LP_X/. Работа с LP_x-репо. | Write в основные `smi100_*.git`. Доступ к другим LP. |
| **Клиент** | Конечный пользователь | Изолированный ПК | Собирать LP из tar-архива. Запускать. | Никакого доступа к SMI100 / LAN проекта |

---

## 🔐 Аутентификация

### SSH-ключи

Все доступы — **только по SSH с ключами**. Паролей нет.

**Алгоритм**: `ed25519` (современный, компактный, быстрый).

```bash
# Генерация нового ключа на ПК пользователя:
ssh-keygen -t ed25519 -C "alex@dsp-gpu.local" -f ~/.ssh/id_ed25519_dsp
```

### На SMI100 `authorized_keys` — что где

```
/srv/smi100/.ssh/authorized_keys:

# ── Alex (полный write на smi100_*.git + read на incoming/*) ──
command="git-shell -c \"$SSH_ORIGINAL_COMMAND\"",no-port-forwarding,\
no-X11-forwarding,no-agent-forwarding,no-pty \
ssh-ed25519 AAAA...pubkey_alex alex@desktop

# ── LP_A команда (write incoming/LP_A/*, read smi100_*) ──
command="git-shell -c \"$SSH_ORIGINAL_COMMAND\"",no-port-forwarding,\
no-X11-forwarding,no-agent-forwarding,no-pty \
ssh-ed25519 AAAA...pubkey_lp_a_user_1 lp_a@server

command="git-shell -c \"$SSH_ORIGINAL_COMMAND\"",no-port-forwarding,\
no-X11-forwarding,no-agent-forwarding,no-pty \
ssh-ed25519 AAAA...pubkey_lp_a_user_2 lp_a@workstation

# ── LP_B команда ──
# ... аналогично с другими ключами
```

Критические параметры:
- `command="git-shell -c \"$SSH_ORIGINAL_COMMAND\""` — **обязательно**, ограничивает shell только git-командами
- `no-port-forwarding` — нельзя туннелировать
- `no-X11-forwarding` — нельзя графику
- `no-agent-forwarding` — нельзя передавать ssh-agent
- `no-pty` — нельзя интерактивный терминал

**Результат**: даже если ключ украли — злоумышленник получит только git-операции, не shell.

### Разграничение прав на уровне путей

Отдельный SSH key не даёт никаких прав сам по себе — только pre-receive hook-и проверяют что делает пользователь. В hook-ах:

```bash
# Пример: в pre-receive hook для smi100_*.git
# Определяем пушащего по SSH key fingerprint (через SSH_USER или custom env)

REMOTE_USER="$SSH_CONNECTION_USER"  # или через custom logic
if [ "$REMOTE_USER" = "alex" ]; then
    # разрешаем push тегов
    ...
else
    # других — отклоняем
    echo "ERROR: только Alex может push-ить в smi100_*.git"
    exit 1
fi
```

В реальности proще сделать **отдельного system-user-а** для каждой роли, и права на уровне filesystem (chmod/chown).

---

## 🛡 Guardrails — защитные механизмы

### G1 — Pre-receive hooks (основная защита)

На каждом `smi100_*.git`:
- Запрет push в `refs/heads/*` (только теги)
- Запрет force-push / delete тегов (immutable)
- Запрет push тегов не формата `vX.Y.Z`

На каждом `incoming/LP_X/*.git`:
- Запрет push в `main`/`master`
- Запрет push тегов
- Разрешено только `refs/heads/(breaking|fix|feature)/*`

Примеры hook-ов — [03_Zone1_SMI100_Setup.md](03_Zone1_SMI100_Setup.md#pre-receive-hooks).

### G2 — Git-shell (ограниченный shell)

Пользователь `gitsrv` имеет `shell=/usr/bin/git-shell` (не bash/sh):

```bash
# Проверка:
getent passwd gitsrv
# gitsrv:x:998:998::/srv/smi100:/usr/bin/git-shell
```

Если кто-то с украденным ключом попытается `ssh gitsrv@smi100 "bash"`:
```
fatal: 'bash' is not a valid git command
Connection to smi100 closed.
```

### G3 — Network isolation

SMI100 и LP:
- ❌ Интернет — **запрещён** firewall-ом (iptables / pf / corporate firewall)
- ✅ Локальная сеть — только между ПК Alex, SMI100 и LP-серверами
- ✅ SSH-порт (22) — открыт только для этих ПК

Проверка на SMI100:
```bash
# Нет интернета (должно падать):
curl https://github.com -m 5
# curl: (28) Connection timed out after 5000 milliseconds

# LAN к Alex работает:
ping alex-pc.local
# 64 bytes from alex-pc.local: icmp_seq=1 ttl=64 time=0.5 ms
```

### G4 — Backup & audit (детекция)

- **Nightly backup** (см. [03_Zone1_SMI100_Setup.md](03_Zone1_SMI100_Setup.md#backup--recovery)) — сохраняет состояние, можно восстановить при атаке
- **`promotions.log.json`** (см. [02_Zone0_Alex_Setup.md](02_Zone0_Alex_Setup.md#promotionslogjson)) — аудит промотирований
- **SSH logs** (`/var/log/auth.log` на SMI100) — кто когда заходил
- **Git reflog** на основных репо — если кто-то force-push запретили, но кто пытался — видно

### G5 — CI release-gate (качество релизов)

CI на LP проверяет что `vendor/` консистентный перед tag release. Нельзя отдать клиенту сломанное. Подробно — [08_CI_And_Integrity.md](08_CI_And_Integrity.md).

---

## 🚨 Реагирование на инциденты

### Инцидент 1 — Скомпрометирован SSH-ключ LP-разработчика

**Что произошло**: ноутбук LP_A-инженера украли, SSH-ключ был без passphrase.

**Последствия (чего ожидать)**:
- Атакующий может push в `incoming/LP_A/*.git` (запрещён push в main/master)
- **Не может** push в основные `smi100_*.git` (pre-receive запрещает)
- **Не может** прочитать `incoming/LP_B/*.git` (ACL другой команды)
- **Не может** получить shell (git-shell)
- **Может** прочитать исходники всех `smi100_*.git` (это read-only для всех LP)

**Реакция (≤ 1 час)**:

```bash
# 1. На SMI100 — удалить скомпрометированный ключ:
ssh smi100-admin@smi100.local
sudo -u gitsrv bash
cd /srv/smi100/.ssh
# Открыть authorized_keys, удалить строку с ssh-ed25519 ...pubkey_compromised

# 2. Проверить логи на предмет подозрительной активности:
sudo grep "pubkey_compromised" /var/log/auth.log | tail -50

# 3. Проверить git reflog на incoming/LP_A/*:
for repo in /srv/smi100/incoming/LP_A/*.git; do
    git -C "$repo" reflog | head -20
done

# 4. Если есть подозрительные ветки — удалить их:
git -C /srv/smi100/incoming/LP_A/core.git branch -D suspicious-branch

# 5. Уведомить LP_A-команду: «перегенерируйте свои ключи»
```

**Восстановление**:
- LP_A-user генерирует новый ключ: `ssh-keygen -t ed25519 ...`
- Отправляет pubkey Alex-у / admin-у SMI100
- Admin добавляет в `authorized_keys`
- LP_A работает дальше

---

### Инцидент 2 — Скомпрометирован ключ Alex-а

**Последствия (gravissimo)**:
- Атакующий **может** промотировать произвольные теги в `smi100_*.git`
- **Не может** force-push или удалить существующие теги (pre-receive hook)
- **Не может** получить shell (git-shell)
- Может внести вредоносный код в систему через промотирование поддельного тега

**Реакция (≤ 15 минут)**:

```bash
# 1. ТЕРЖИТЬ отключить ключ Alex-а на SMI100:
# (через другого admin-а или физический доступ к SMI100)
sudo -u gitsrv sed -i '/pubkey_alex/d' /srv/smi100/.ssh/authorized_keys

# 2. Проверить promotions.log.json на аномальные записи за последнее время:
cat /srv/smi100/_release_git/promotions.log.json | jq '.promotions[-20:]'
# Выделить все записи с подозрительным timestamp / note

# 3. Проверить все новые теги на smi100_*.git:
for repo in /srv/smi100/smi100_*.git; do
    echo "=== $repo ==="
    git -C "$repo" log --since="24 hours ago" --all
done

# 4. Если обнаружены вредоносные теги — НЕЛЬЗЯ их удалить (immutable),
#   но можно промотировать правильные версии поверх (через запасной ключ)
# 5. Уведомить всех LP-команд "не обновляйте vendor/ пока не разберёмся"
```

**Восстановление**:
- Alex генерирует новый ключ **на чистом устройстве**
- Добавляет admin-SMI100 новый pubkey в authorized_keys
- Проводит полный аудит всех недавно промотированных версий (diff vs `_release_git` на ПК Alex)
- При обнаружении инъекции — промотировать ПРАВИЛЬНУЮ версию поверх → LP автоматически получат через refresh

---

### Инцидент 3 — SMI100-сервер взломан

**Последствия (catastrophico)**:
- Атакующий имеет root-доступ к SMI100
- **Может** подделать любой pre-receive hook, обойти ACL
- **Может** подделать backup
- LP при refresh получат malicious vendor/

**Реакция**:

```bash
# 1. ФИЗИЧЕСКИ отключить SMI100 от сети
# (отрезать кабель / отключить питание)

# 2. Уведомить всех LP-команд:
#    «НЕ ДЕЛАЙТЕ git add vendor/ ДО ВЫЯСНЕНИЯ»

# 3. Отрезать SMI100-remote из LP-репо:
# на каждом LP_x-сервере:
python3 scripts/update_dsp.py --status
# убедиться что pinned-флаги помогут пока разбираемся
python3 scripts/update_dsp.py --pin-all --reason "SMI100 incident"

# 4. Криминалистика SMI100 (admin):
#    - logs (/var/log/, journalctl)
#    - установленные пакеты vs expected
#    - /srv/smi100/ checksums vs ПК Alex _release_git/

# 5. Восстановление — полностью перестроить SMI100:
#    - Развернуть чистый Debian
#    - Восстановить из backup (если ему можно доверять) или
#      пере-промотировать с ПК Alex все релизы
#    - Новые SSH-ключи для всех
#    - Сменить пароль root-а, физ. доступы проверить

# 6. Snanptshot LP_x-репо — сверить vendor/ с тем что _ДОЛЖНО_ быть по deps_state.json
#    (для каждой записи проверить что vendor/<mod>/.git/HEAD == sha)
```

---

## ✅ Checklist безопасной конфигурации

### Zone 0 (ПК Alex)

- [ ] SSH-ключ с passphrase (не пустой)
- [ ] `~/.ssh` имеет chmod 700
- [ ] `_release_git/promotions.log.json` регулярно бэкапится
- [ ] Full-disk encryption на ноутбуке Alex
- [ ] 2FA на GitHub-аккаунте

### Zone 1 (SMI100)

- [ ] Только SSH-доступ, паролей нет (sshd_config: `PasswordAuthentication no`)
- [ ] gitsrv имеет shell=/usr/bin/git-shell
- [ ] Pre-receive hooks установлены на все `smi100_*.git` и `incoming/*/*.git`
- [ ] Nightly backup работает и проверен восстановлением
- [ ] Intent-log (auth.log, /var/log/gitsrv.log) ротируется и архивируется
- [ ] Firewall: интернет закрыт, LAN — только к известным IP

### Zone 2 (LP-серверы)

- [ ] CI на main с build+test
- [ ] Protected branches
- [ ] LP-user пароль на сервер — не тот же что SSH passphrase
- [ ] scripts/update_dsp.py — не модифицирован от эталона (либо с явной обоснованной причиной)

---

## 🧭 Дальше

- [03_Zone1_SMI100_Setup.md](03_Zone1_SMI100_Setup.md) — настройка SMI100
- [08_CI_And_Integrity.md](08_CI_And_Integrity.md) — защита целостности кода
- [11_Troubleshooting.md](11_Troubleshooting.md) — проблемы с доступом

---

*12_Security_Model.md · 2026-04-19 · Кодо + Alex*
