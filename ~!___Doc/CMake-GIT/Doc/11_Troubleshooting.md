# 11 · Troubleshooting — частые проблемы и их решения

> **Кто это читает**: любой, у кого что-то не работает.
> **Цель**: быстро диагностировать и исправить типовую проблему. Если здесь нет твоего случая — напиши Alex-у / Кодо.

---

## 🚑 Индекс проблем

- [CMake configure падает с «SMI100 unreachable»](#cmake-configure--smi100-unreachable)
- [cmake configure: «update_dsp.py: command not found»](#update_dsppy-command-not-found)
- [vendor/ не обновляется хотя на SMI100 новая версия](#vendor-не-обновляется)
- [Pin не сработал — обновление всё равно произошло](#pin-не-сработал)
- [«git commit vendor/» — огромный diff, много времени](#огромный-diff-vendor)
- [git clone LP_x — сильно долгий / большой](#git-clone-большой)
- [Dev-overlay: правки игнорируются при cmake --build](#dev-overlay-правки-игнорируются)
- [Push в incoming/LP_X отклоняется pre-receive hook](#pre-receive-hook-отклоняет)
- [CI падает «vendor/ drift detected»](#ci-vendor-drift)
- [Target-ПК собирает, но работает неправильно](#target-pc-работает-неправильно)
- [После `rm -rf build` пропали мои правки в build/_deps/](#потерял-правки-в-build_deps)
- [deps_state.json повреждён / невалидный JSON](#deps_statejson-повреждён)

---

## <a name="cmake-configure--smi100-unreachable"></a>🔌 CMake configure: «SMI100 unreachable»

**Симптом**:
```
-- [DSP] Running update_dsp.py --mode lp-refresh
-- update_dsp.py failed (rc=2): using cached vendor/ as-is
WARN: SMI100 unreachable, using cached vendor/
```

**Причины и решения**:

1. **SMI100 выключен / в перезагрузке**
   ```bash
   ping smi100.local
   # Если не отвечает — спросить админа, когда поднимется
   ```

2. **Сеть LAN не настроена на вашем ПК**
   ```bash
   ssh gitsrv@smi100.local "echo OK"
   # Если «Connection refused / timeout» — проверьте маршрутизацию к локалке
   ```

3. **SSH-ключ LP_A не добавлен в authorized_keys SMI100**
   ```bash
   ssh gitsrv@smi100.local "echo OK"
   # Если «Permission denied (publickey)» — попросить админа SMI100 добавить ваш ~/.ssh/id_ed25519.pub
   ```

4. **Это норм — сеть временно упала**
   - сборка идёт из кешированного `vendor/` — **работает**, просто не тянется новое
   - когда восстановится → следующий `cmake configure` подтянет

---

## <a name="update_dsppy-command-not-found"></a>🐍 update_dsp.py: command not found

**Симптом**:
```
CMake Error: /usr/bin/python3: can't open file 'scripts/update_dsp.py': [Errno 2] No such file or directory
```

**Причины и решения**:

1. **Скрипт не скопирован в LP_x**
   ```bash
   ls scripts/update_dsp.py
   # Если нет — скопировать из workspace:
   cp /path/to/DSP-GPU/scripts/update_dsp.py scripts/
   ```

2. **Python не установлен** (редко)
   ```bash
   python3 --version
   # Если нет — apt install python3 (Debian) / скачать python.org (Windows)
   ```

3. **В CMakeLists.txt неправильный путь**
   ```cmake
   # Проверить в CMakeLists.txt:
   execute_process(COMMAND python3 ${CMAKE_SOURCE_DIR}/scripts/update_dsp.py ...)
   #                              ↑ должно быть CMAKE_SOURCE_DIR, не CMAKE_BINARY_DIR
   ```

---

## <a name="vendor-не-обновляется"></a>🔄 vendor/ не обновляется хотя на SMI100 новая версия

**Симптом**: Alex сказал «я промотировал core v1.3.0», но у LP всё ещё v1.2.0 в `vendor/core/`.

**Диагностика**:

```bash
# 1. Проверить что cmake configure вообще идёт:
rm -rf build
cmake --preset zone2 2>&1 | grep -A 5 "update_dsp"
# Должно быть: "Running update_dsp.py --mode lp-refresh"

# 2. Проверить что скрипт видит новую версию:
python3 scripts/update_dsp.py --mode lp-refresh --dry-run --verbose
# Должно показать: "core: would update abc... → def..."

# 3. Проверить что модуль не pinned:
python3 scripts/update_dsp.py --status
# Если core показан как "pinned" — вот и причина
```

**Причины и решения**:

1. **Модуль pinned**
   ```bash
   python3 scripts/update_dsp.py --unpin core
   git add deps_state.json
   git commit -m "unpin core after RC release"
   ```

2. **Используется `zone2-offline` preset** — он явно запрещает сеть
   ```bash
   # Переключиться на обычный zone2
   cmake --preset zone2
   ```

3. **SMI100 недоступен** — см. раздел [SMI100 unreachable](#cmake-configure--smi100-unreachable)

4. **Версия на SMI100 реально не та — Alex не промотировал**
   ```bash
   # Проверить что реально на SMI100:
   git ls-remote ssh://gitsrv@smi100.local/srv/smi100/smi100_core.git | grep v1.3
   # Если ничего — Alex не промотировал, пинговать его
   ```

---

## <a name="pin-не-сработал"></a>🧊 Pin не сработал — обновление произошло

**Симптом**: поставили pin на core v1.2.0, после `cmake configure` vendor/core обновился до v1.3.0.

**Причины**:

1. **Pin не закоммичен**
   ```bash
   python3 scripts/update_dsp.py --pin core v1.2.0 --reason "RC"
   # Проверить:
   git status
   # deps_state.json должен быть изменён
   git add deps_state.json
   git commit -m "pin core@v1.2.0"
   # Теперь pull + configure у других разработчиков будет правильно работать
   ```

2. **`--pin` прошёл, но кто-то сделал `git checkout` на старый коммит без pin**
   ```bash
   # Проверить:
   cat deps_state.json | jq '.repos.core'
   # Должно быть "pinned": true
   ```

3. **Версия update_dsp.py старая, не понимает pin**
   ```bash
   python3 scripts/update_dsp.py --version
   # Должно быть ≥ 2.0 (с поддержкой pin)
   ```

---

## <a name="огромный-diff-vendor"></a>💾 Огромный diff vendor/ — долго коммитится

**Симптом**: `git add vendor/` работает минуты, `git commit` тоже. Push долгий.

**Причины и решения**:

1. **Реально много изменений**: несколько модулей обновились одновременно — норма
   - Ожидание: обновление одного модуля = ~50-200 файлов = несколько секунд
   - Обновление 5 модулей = может быть ~1000 файлов = 20-30 секунд
   - Если >> — см. следующий пункт

2. **Что-то необычное**: файлы CRLF vs LF конфликт (Windows vs Linux)
   ```bash
   git diff --stat vendor/ | head
   # Если видно много «mode change 100644→100755» или line-ending changes — это оно
   # Решение: добавить .gitattributes в корень LP_x:
   echo "* text=auto" > .gitattributes
   echo "vendor/**/*.cpp text eol=lf" >> .gitattributes
   ```

3. **Размер репо LP_x растёт больше ожидаемого (>1 GB)**
   ```bash
   du -sh .git
   git count-objects -v
   # Если размер огромный — запустить:
   git gc --aggressive
   ```

4. **Если размер становится реально проблемой**: рассмотреть Git LFS для vendor/
   - **Решение Alex**: пока не нужен, места хватает
   - При росте: добавить LFS — см. [10_Decisions_Log.md](10_Decisions_Log.md) (потом обновим)

---

## <a name="git-clone-большой"></a>🐘 git clone LP_x — сильно долгий / большой

**Симптом**: новый разработчик делает `git clone LP_x`, качает 2+ GB, 30+ минут.

**Это нормально** — `vendor/` в git. Но есть оптимизации:

```bash
# Клонировать только нужную ветку + без полной истории (shallow)
git clone --branch main --depth 1 ssh://lp-server/LP_x.git
# → только последний коммит, без history

# Если нужен git log потом — можно добавить историю:
cd LP_x
git fetch --unshallow
```

Для **transfer на флешку** — используй `git archive` (без `.git/`), см. [07_Transfer_To_Offline_PC.md](07_Transfer_To_Offline_PC.md).

---

## <a name="dev-overlay-правки-игнорируются"></a>🛠 Dev-overlay: правки игнорируются при cmake --build

**Симптом**: правишь файл в `dev-overlays/stats-dev/src/welford.cpp`, делаешь `cmake --build build`, а сборка идёт со старой версией.

**Причины и решения**:

1. **Не активирован правильный preset**
   ```bash
   # Проверить текущий preset:
   cat build/CMakeCache.txt | grep FETCHCONTENT_SOURCE_DIR_DSPSTATS
   # Должно быть: ...=…/dev-overlays/stats-dev
   # Если путь указывает на vendor/stats — ты на неправильном preset
   
   # Переключиться:
   rm -rf build
   cmake --preset zone2-dev-stats
   cmake --build build
   ```

2. **Layer 2 не сработал — правки не закоммичены**
   ```bash
   cd dev-overlays/stats-dev
   git status
   # Если «changes not staged for commit» — правки есть, но Layer 2 их не видит
   git add .
   git commit -m "wip"
   cd ../..
   cmake --build build
   # Теперь Layer 2 заметит .git/index изменился → reconfigure
   ```

3. **Принудительный reconfigure**
   ```bash
   cmake -B build --preset zone2-dev-stats
   cmake --build build
   ```

---

## <a name="pre-receive-hook-отклоняет"></a>🚫 Push в incoming/LP_X отклоняется pre-receive

**Симптом**:
```
remote: ERROR: в incoming/ запрещён push в main/master
 ! [remote rejected] main -> main (pre-receive hook declined)
```

**Причины**:

- Имя ветки не `breaking/*`, `fix/*`, `feature/*`
- Пытаешься пушить тег (теги идут только через Alex-а)
- Пытаешься push в `main`/`master`

**Решение**:
```bash
# Переименовать ветку:
git branch -m breaking/fix-nan-handling   # из main/whatever
git push smi100-incoming breaking/fix-nan-handling
```

См. [06_Patch_Flow.md](06_Patch_Flow.md) — полный patch flow.

---

## <a name="ci-vendor-drift"></a>🔴 CI падает «vendor/ drift detected»

**Симптом**: CI release-gate на тег → красный с сообщением:
```
ERROR: vendor/ drift detected:
  core: deps_state.json says v1.3.0, but SMI100 has v1.3.1
```

**Причина**: перед тегированием не был сделан свежий refresh.

**Решение**:
```bash
# Убрать тег
git tag -d LP_x-v0.5
git push origin :LP_x-v0.5

# Свежий refresh + тест
rm -rf build
cmake --preset zone2
cmake --build build
ctest --test-dir build

# Если зелёное — заново commit + tag
git add vendor/ deps_state.json
git commit -m "sync before release v0.5"
git tag LP_x-v0.5
git push origin LP_x-v0.5
```

---

## <a name="target-pc-работает-неправильно"></a>🎒 Target-ПК собирает, но работает неправильно

**Симптом**: клиент распаковал архив, собрал, но pipeline даёт неправильные результаты / падает.

**Причины**:

1. **Не тот preset**:
   ```bash
   # Клиент должен использовать:
   cmake --preset zone2-offline
   # НЕ zone2 — этот режим идёт в SMI100, которого у клиента нет
   ```

2. **Архив собран из грязного состояния LP** (забыли полный цикл перед tar):
   ```
   Alex/команда: повторить ШАГИ A-C из 07_Transfer_To_Offline_PC.md
   ```

3. **Несовместимость toolchain** (у нас ROCm 7.2, у клиента 6.x):
   - Если клиент не может обновить — попробовать пересобрать LP_x с более старым ROCm
   - Это отдельная проблема (совместимость toolchain), не distribution

---

## <a name="потерял-правки-в-build_deps"></a>💔 Потерял правки в build/_deps/

**Симптом**: правил файл в `build/_deps/dspcore-src/`, сделал `rm -rf build` → правки пропали.

**Причина**: `build/_deps/` — transient зона (правило 3 в [04_Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md)).

**Урок**: **никогда не правь в build/_deps/**. Используй dev-overlay.

**Восстановление**: если есть `git reflog` в `build/_deps/dspcore-src/.git` — возможно. Но папка могла полностью пропасть.

---

## <a name="deps_statejson-повреждён"></a>💾 deps_state.json повреждён / невалидный JSON

**Симптом**:
```
update_dsp.py: ERROR: deps_state.json invalid JSON at line 5, col 12
```

**Восстановление**:

```bash
# Посмотреть git log — восстановить из прошлого коммита
git log --oneline -- deps_state.json
# Вернуть:
git checkout HEAD~1 -- deps_state.json

# Или если совсем сломалось — пересоздать пустой и заполнить:
python3 scripts/update_dsp.py --mode lp-refresh --force-reinit
# (этот флаг создаёт свежий deps_state.json с нуля, идя в SMI100)
```

---

## 📞 Если ничего не помогло

1. Проверить что твой LP-инженер-сосед может воспроизвести проблему
2. Описать проблему в чате команды с:
   - Версия LP_x (git rev-parse HEAD)
   - Вывод `python3 scripts/update_dsp.py --status`
   - Первые 50 строк вывода `cmake --preset zone2` (с --verbose если нужно)
   - `deps_state.json` (или его часть)
3. Написать Alex-у если блокирующе

---

## 🧭 Связанное

- [04_Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md) — правильный workflow
- [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md) — как именно работает refresh
- [09_Scripts_Reference.md](09_Scripts_Reference.md) — полный API скриптов

---

*11_Troubleshooting.md · 2026-04-19 · Кодо + Alex*
