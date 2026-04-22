# 06 · Patch Flow — правки снизу вверх

> **Кто это читает**: инженер LP-команды, который нашёл баг в одном из модулей DSP-GPU (core/spectrum/stats/...) и хочет его пофиксить с возвратом в общую кодобазу.
> **Цель**: понять где править, куда пушить, как Alex это забирает.

---

## 🎯 Когда нужен Patch Flow

LP-инженер может:
- 🐛 Найти баг в `vendor/core/` (например, неправильный результат FFT на краевых случаях)
- 💡 Захотеть добавить feature в модуль, которая полезна всем LP
- ⚠️ Обнаружить security issue
- 🔨 Провести breaking change API (редко, координируется с Alex-ом)

**Чего НЕ нужно делать**:
- ❌ Править `vendor/<mod>/` напрямую и коммитить — `vendor/` должна быть зеркалом release-версий с SMI100, локальные правки «испортят витрину»
- ❌ Править `build/_deps/*-src/` — следующий `rm -rf build` всё снесёт
- ❌ Молча жить с патчем у себя и не отдавать Alex-у — следующее обновление через SMI100 твой патч затрёт

✅ **Правильно**: dev-overlay + push в `incoming/LP_X/`.

---

## 🔄 Полная схема Patch Flow (8 шагов)

```
   Zone 2 LP_A обнаружил баг           Zone 1 SMI100 incoming/       Zone 0 ПК Alex              Zone 0 GitHub
   в stats                                                                                      
                                                                                                 
   ┌──────────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐    ┌──────────────────────┐
   │ 1. git clone             │     │ /srv/smi100/         │     │ E:\DSP-GPU\stats\    │    │ github.com/          │
   │    smi100_stats.git      │     │   incoming/LP_A/     │     │   (live dev repo)    │    │     dsp-gpu/stats    │
   │    → dev-overlays/       │     │   stats.git          │     │                      │    │     new tag v1.3.0 ● │
   │      stats-dev/          │     │                      │     │   5. git fetch from  │    │                      │
   │                          │     │                      │     │   incoming/LP_A      │    └──────────┬───────────┘
   │ 2. cmake --preset        │     │                      │     │                      │               │
   │    zone2-dev-stats       │     │                      │     │   6. code review +   │               │
   │    (Layer 2 ловит git)   │     │                      │     │   merge/rebase в     │               │
   │                          │     │                      │     │   main → тест        │               │
   │ 3. git checkout -b       │     │                      │     │                      │               │
   │    breaking/sig-fix      │     │                      │     │   7. git tag v1.3.0  │               │
   │    → правим → тест       │     │                      │     │      git push github │───────────────┘
   │                          │     │                      │     │                      │
   │ 4. git push smi100-in    │     │   branch breaking/●──┼────►│   8. promote_to_     │
   │    breaking/sig-fix  ●───┼────►│         sig-fix      │     │   smi100.sh          │
   └──────────────────────────┘     └──────────────────────┘     │   stats v1.3.0 ●─────┘
         ▲                                                       └──────────┬───────────┘
         │ 9. обычный cmake configure на LP_A:                              │
         │    update_dsp.py увидит v1.3.0 на smi100_stats.git               │
         │    → обновит vendor/stats/ → deps_state.json → commit            │
         └──────────────────────────────────────────────────────────────────┘
```

---

## 📝 Пошагово

### ШАГ 1 — Клонируем модуль в `dev-overlays/`

```bash
cd ~/LP_A
mkdir -p dev-overlays
cd dev-overlays

# Клонируем release-версию из SMI100:
git clone ssh://gitsrv@smi100.local/srv/smi100/smi100_stats.git stats-dev
cd stats-dev

# Оказываемся на detached HEAD на последнем теге — переключаемся на main:
git checkout -B main
```

**Проверка**:
```bash
cd ~/LP_A
cat .gitignore | grep dev-overlays
# → dev-overlays/   ← убедиться что есть
```

---

### ШАГ 2 — Переключаем LP_A на dev-overlay preset

```bash
cd ~/LP_A
rm -rf build
cmake --preset zone2-dev-stats
```

Этот preset содержит (см. [04_Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md)):
```jsonc
{
  "name": "zone2-dev-stats",
  "inherits": "zone2",
  "cacheVariables": {
    "FETCHCONTENT_SOURCE_DIR_DSPSTATS": "${sourceDir}/dev-overlays/stats-dev"
  }
}
```

CMake теперь берёт `stats` не из `vendor/stats/`, а из `dev-overlays/stats-dev/`.

**Layer 2 магия**: при `git pull` / `git commit` в `dev-overlays/stats-dev/` → `cmake --build` **автоматически** реконфигурируется (Layer 2 сторожит `.git/index` и `.git/FETCH_HEAD`). Не нужно вручную `cmake -B build`.

---

### ШАГ 3 — Правим, тестируем

```bash
cd ~/LP_A/dev-overlays/stats-dev

# Создаём feature-ветку
git checkout -b breaking/fix-nan-handling

# Правим
vim src/welford.cpp
vim tests/test_welford.cpp

# Коммитим в ветке:
git add .
git commit -m "fix: handle NaN in Welford correctly"
```

**Тестируем** (из LP_A):
```bash
cd ~/LP_A
cmake --build build -j$(nproc)
# Layer 2 увидит git commit в stats-dev → реконфиг → ребилд
ctest --test-dir build
# прогон тестов как обычно — теперь с правкой
```

Если не всё гладко — возвращаемся в `dev-overlays/stats-dev/`, правим, снова тестируем.

---

### ШАГ 4 — Push в `incoming/LP_A/stats.git`

Сначала добавляем remote (один раз):
```bash
cd ~/LP_A/dev-overlays/stats-dev
git remote add smi100-incoming ssh://gitsrv@smi100.local/srv/smi100/incoming/LP_A/stats.git

# Проверка:
git remote -v
# smi100-incoming ssh://.../incoming/LP_A/stats.git (fetch)
# smi100-incoming ssh://.../incoming/LP_A/stats.git (push)
```

Пушим ветку:
```bash
git push smi100-incoming breaking/fix-nan-handling
```

SMI100 pre-receive hook проверит:
- ✅ `refs/heads/breaking/*` разрешено
- ✅ `main`/`master` — **запрещено**
- ✅ `tags/*` — запрещено (это канал только для патч-веток)

После успешного push — Alex может забрать.

---

### ШАГ 5 — Alex забирает ветку

На ПК Alex:
```bash
cd E:\DSP-GPU\stats

# Добавить remote для incoming (один раз):
git remote add smi100-incoming-LP_A ssh://gitsrv@smi100.local/srv/smi100/incoming/LP_A/stats.git

# Забрать:
git fetch smi100-incoming-LP_A
git log --oneline smi100-incoming-LP_A/breaking/fix-nan-handling
# → видит коммит от LP_A
```

---

### ШАГ 6 — Review + merge у Alex

```bash
cd E:\DSP-GPU\stats
git checkout main

# Опция 1 — merge с сохранением ветки
git merge --no-ff smi100-incoming-LP_A/breaking/fix-nan-handling

# Опция 2 — rebase + squash если коммитов много / хочется чистую историю
git rebase -i smi100-incoming-LP_A/breaking/fix-nan-handling

# Тестируем локально:
cd ~/DSP-GPU
# (запускаем свой master-test / пайплайн)
```

Если тесты зелёные → переходим к следующему шагу.

Если красные / замечания → коммуникация с LP_A (через Slack / Linear / почту) — «я поправил вот так, перепротестируй».

---

### ШАГ 7 — Новый tag + push в GitHub

```bash
cd E:\DSP-GPU\stats

# Новый patch-релиз
git tag -a v1.3.0 -m "fix: NaN handling in Welford (by LP_A)"
git push origin main
git push origin v1.3.0
```

---

### ШАГ 8 — Promote обратно на SMI100

```bash
bash E:\DSP-GPU\scripts\promote_to_smi100.sh stats v1.3.0
```

Скрипт:
- Пушит тег в `_release_git/smi100_stats.git`
- Пишет запись в `promotions.log.json` (со ссылкой на LP_A: `"note": "LP_A fix merge"` — это Alex опционально)
- Пушит на SMI100 по LAN

---

### ШАГ 9 — LP_A получает свой же фикс обратно

На LP_A-сервере в следующем цикле сборки:

```bash
cd ~/LP_A
rm -rf build
cmake --preset zone2
# → update_dsp.py --mode lp-refresh:
#   "stats: v1.2.0 → v1.3.0" (Alex промотировал)
#   → git fetch → git checkout в vendor/stats/ → deps_state.json обновлён
cmake --build build
# → теперь работает из обновлённой vendor/stats/, содержащей фикс LP_A
```

После успешного build+test:
```bash
# Можно удалить dev-overlay — правка уже в mainstream:
rm -rf dev-overlays/stats-dev

# Переключиться обратно на обычный preset:
cmake --preset zone2
cmake --build build

# Коммитим новое состояние:
git add vendor/ deps_state.json
git commit -m "sync: stats v1.2.0 → v1.3.0 (own fix merged)"
git push
```

🎉 Цикл замкнулся. Фикс пошёл через общий канал и доступен всем LP.

---

## 🔥 Breaking vs non-breaking

### Non-breaking patch (минорный фикс)

Пример: исправил багу в реализации, API не изменился.

Порядок: как выше, 8 шагов. Новый тег — **patch-версия** (`v1.2.0` → `v1.2.1`). Другие LP спокойно обновляются, ничего не ломая.

### Breaking change (изменение API)

Пример: изменил сигнатуру `Average(float*)` → `Average(const std::span<float>&)`.

Порядок немного другой:

1. ШАГ 1-4 как обычно, но ветка называется `breaking/new-average-signature`
2. ШАГ 5-6 — Alex не просто мерджит, а **координирует с другими LP-командами**:
   - Сообщает «в stats v2.0.0 меняется сигнатура Average, обновите свой код»
   - Ждёт подтверждения или сам вносит изменения в затронутые модули
3. ШАГ 7 — **major tag** (`v1.x.y` → `v2.0.0`), плюс новые теги затронутых модулей (radar v2.0.0, strategies v2.1.0)
4. ШАГ 8 — `promote_breaking_change.sh` с config.yaml (см. [02_Zone0_Alex_Setup.md](02_Zone0_Alex_Setup.md)) — атомарный push нескольких модулей
5. ШАГ 9 — LP-команды получают апдейт. Те, кто **не готов** — ставят `pin` (см. [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md#pin)) на старую версию пока адаптируются.

---

## 🚨 Частые ошибки и как избежать

### Ошибка: закоммитил в `vendor/` свои правки

```bash
# ❌ Неправильно
vim vendor/stats/src/welford.cpp
git add vendor/stats/
git commit -m "fix welford"

# Проблема: следующий cmake configure обновит vendor/stats/ с SMI100 → твои правки затрёт
```

**Как исправить**:
```bash
git revert HEAD   # откатываем коммит
# Делаем правильно — через dev-overlay (см. ШАГ 1)
```

---

### Ошибка: забыл отправить патч, а SMI100 обновила модуль

```bash
# LP_A ходит с локальным фиксом в dev-overlays/stats-dev/ на ветке breaking/fix-nan
# Но НЕ пушил в smi100-incoming

# Тем временем Alex промотировал stats v1.3.0 (с чьим-то другим фиксом)
# LP_A делает cmake configure:
# → update_dsp.py обновил vendor/stats/ до v1.3.0
# → но LP_A работает с preset zone2-dev-stats — берёт из dev-overlays
# → РАСХОЖДЕНИЕ: vendor/stats v1.3.0, dev-overlays/stats-dev на v1.2.x + свои правки
```

**Как исправить**:
```bash
cd ~/LP_A/dev-overlays/stats-dev
git fetch origin      # или smi100 — откуда клонировали
git rebase origin/main   # подтянуть v1.3.0 изменения
# Разрешить конфликты с своими правками вручную
git push smi100-incoming breaking/fix-nan-handling --force-with-lease
# (force-with-lease безопаснее чем просто --force)
```

---

### Ошибка: SMI100 pre-receive отклоняет push

```
remote: ERROR: в incoming/ запрещён push в main/master
To ssh://smi100.local/srv/smi100/incoming/LP_A/stats.git
 ! [remote rejected] main -> main (pre-receive hook declined)
```

**Причина**: пытаешься пушить в `main`, а разрешено только `breaking/*`, `fix/*`, `feature/*`.

**Как исправить**:
```bash
git checkout -b fix/my-fix
git push smi100-incoming fix/my-fix
```

---

### Ошибка: Layer 2 не сработал (CMake не заметил правку в dev-overlay)

**Симптомы**: правил в `dev-overlays/stats-dev/src/welford.cpp`, сделал `cmake --build` — **компилится старая версия**.

**Причины**:
- Забыл сделать `git commit` в `dev-overlays/stats-dev/` (Layer 2 смотрит `.git/index`, который меняется при `git add` + `git commit`)
- `git commit` был, но `.git/FETCH_HEAD` не изменился → Layer 2 считает что состояние не изменилось

**Как исправить**:
```bash
# Вариант 1 — коммит всегда заставляет reconfigure
cd dev-overlays/stats-dev
git add .
git commit -m "wip"
cd ../..
cmake --build build   # теперь reconfig + rebuild

# Вариант 2 — явный реконфиг
cmake -B build --preset zone2-dev-stats
cmake --build build
```

Подробности Layer 2 — в [00_Glossary.md#layer-2-v2-спеки](00_Glossary.md#layer-2-v2-спеки).

---

## ✅ Чеклист хорошего patch-флоу

- [ ] Правки делались в `dev-overlays/<mod>-dev/`, не в `vendor/`
- [ ] Ветка названа `breaking/*`, `fix/*` или `feature/*`
- [ ] Тесты LP_A зелёные с применённым патчем
- [ ] Push в `incoming/LP_X/<mod>.git`, не куда-то ещё
- [ ] Сообщение коммита понятно описывает **зачем** изменение
- [ ] Alex уведомлён (Slack / письмо) — иначе может не заметить ветку долго
- [ ] После merge у Alex — LP_A дождалась промотирования и сделала clean cycle с новой версии

---

## 🧭 Дальше

- [04_Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md) — общий workflow LP
- [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md) — механика обновления и pin
- [09_Scripts_Reference.md](09_Scripts_Reference.md) — справочник скриптов
- [11_Troubleshooting.md](11_Troubleshooting.md) — другие проблемы

---

*06_Patch_Flow.md · 2026-04-19 · Кодо + Alex*
