# 09 · Scripts Reference

> **Кто это читает**: Alex, инженеры LP, админ SMI100 — когда нужно точно знать какой флаг у какого скрипта.
> **Цель**: справочник по всем скриптам pipeline: Synopsis / Usage / Examples / Exit codes.

---

## 📋 Полный список

| Скрипт | Живёт | Кто запускает | Что делает |
|--------|-------|---------------|-----------|
| [`init_release_repos.sh`](#init_release_repossh) | `E:\DSP-GPU\scripts\` | Alex (один раз) | Создаёт `_release_git/smi100_*.git` |
| [`promote_to_smi100.sh`](#promote_to_smi100sh) | `E:\DSP-GPU\scripts\` | Alex | Промотирование одного тега Zone 0 → Zone 1 |
| [`promote_breaking_change.sh`](#promote_breaking_changesh) | `E:\DSP-GPU\scripts\` | Alex | Атомарное промотирование нескольких модулей |
| [`update_dsp.py`](#update_dsppy) | `LP_x/scripts/` (копия из workspace) | CMake + LP-инженер | Zone 2: обновление vendor/ + pin |
| [`generate_cmake_deps.py`](#generate_cmake_depspy) | `E:\DSP-GPU\scripts\` | Alex | Генерация `fetch_deps.cmake` из `dsp_modules.json` |
| [`topo_sort.py`](#topo_sortpy) | `E:\DSP-GPU\scripts\` | вспомогательный | Топологическая сортировка модулей |
| [`nightly-backup.sh`](#nightly-backupsh) | `/srv/smi100/scripts/` на SMI100 | cron | Nightly backup SMI100 |
| [`freeze_for_transfer.sh`](#freeze_for_transfersh) | `E:\DSP-GPU\scripts\` | опционально | R-offline snapshot (V11) |
| [`hooks/pre-commit`](#hookspre-commit) | `LP_x/scripts/hooks/` → `.git/hooks/` | git на клиенте | Локальная защита commit |

---

## <a name="init_release_repossh"></a>🔧 `init_release_repos.sh`

**Назначение**: создаёт пустые bare-репо `smi100_*.git` в `E:\DSP-GPU\_release_git\` для всех модулей из `dsp_modules.json`.

### Synopsis

```bash
bash scripts/init_release_repos.sh [--force]
```

### Parameters

- `--force` — пересоздать, если уже существуют (⚠️ удалит историю). По умолчанию — skip существующие.

### Examples

```bash
# Первый запуск (свежая установка)
cd E:\DSP-GPU
bash scripts/init_release_repos.sh
# → Created E:\DSP-GPU\_release_git\smi100_core.git
# → Created E:\DSP-GPU\_release_git\smi100_spectrum.git
# ...
# → Initialized E:\DSP-GPU\_release_git\promotions.log.json

# Повторный запуск (идемпотентно)
bash scripts/init_release_repos.sh
# → [SKIP] E:\DSP-GPU\_release_git\smi100_core.git already exists
# ...

# Пересоздать (⚠️ удалит всё)
bash scripts/init_release_repos.sh --force
```

### Exit codes
- `0` — успех
- `1` — `dsp_modules.json` отсутствует или повреждён
- `2` — нет прав записи в `_release_git/`

---

## <a name="promote_to_smi100sh"></a>🚀 `promote_to_smi100.sh`

**Назначение**: промотирует один тег модуля из public github → `_release_git/smi100_<mod>.git` → SMI100.

### Synopsis

```bash
bash scripts/promote_to_smi100.sh <module> <tag> [--note "..."] [--dry-run]
```

### Parameters

- `<module>` — имя модуля (из `dsp_modules.json`): `core`, `spectrum`, `stats`, ...
- `<tag>` — release-тег формата `vX.Y.Z` (например, `v1.2.0`)
- `--note "<text>"` — комментарий для `promotions.log.json`
- `--dry-run` — показать что сделал бы, не менять ничего

### Под капотом

1. Валидация: тег существует в `E:\DSP-GPU\<module>\`
2. `git push _release_git/smi100_<module>.git refs/tags/<tag>`
3. Append в `_release_git/promotions.log.json`
4. `git push smi100 refs/tags/<tag>` (если remote `smi100` настроен)

### Examples

```bash
# Обычное промотирование
bash scripts/promote_to_smi100.sh core v1.2.0
# [2026-04-19 14:32:10] ✅ core@v1.2.0 → _release_git/smi100_core.git
# [2026-04-19 14:32:11] ✅ core@v1.2.0 → smi100 (LAN)
# [2026-04-19 14:32:11] 📝 promotions.log.json обновлён

# С комментарием для аудита
bash scripts/promote_to_smi100.sh core v1.2.0 --note "LFM fix, from LP_A"

# Проверить что сделает (без побочных эффектов)
bash scripts/promote_to_smi100.sh core v1.2.0 --dry-run
# [DRY-RUN] would push refs/tags/v1.2.0 to _release_git/smi100_core.git
# [DRY-RUN] would append to promotions.log.json
# [DRY-RUN] would push refs/tags/v1.2.0 to smi100
```

### Exit codes
- `0` — успех
- `1` — модуль неизвестен (нет в manifest)
- `2` — тег не существует в live checkout
- `3` — push в `_release_git/` fail-нул
- `4` — push в SMI100 fail-нул (остальное прошло, лог обновлён)

---

## <a name="promote_breaking_changesh"></a>💥 `promote_breaking_change.sh`

**Назначение**: атомарное промотирование нескольких модулей (для breaking change в API — нужен синхронный release зависимых модулей).

### Synopsis

```bash
bash scripts/promote_breaking_change.sh <config.yaml> [--dry-run]
```

### Формат `config.yaml`

```yaml
reason: "Breaking API change in stats v2.0 — migration of radar/strategies"
modules:
  - name: stats
    tag:  v2.0.0
  - name: radar
    tag:  v2.0.0
  - name: strategies
    tag:  v2.1.0
```

### Под капотом

1. Топо-сортировка модулей (через `topo_sort.py` + `dsp_modules.json`):
   - Сначала независимые (`stats`)
   - Потом зависящие (`radar` → зависит от `stats`)
   - Потом top-level (`strategies` → зависит от radar)
2. Последовательный вызов `promote_to_smi100.sh` для каждого в порядке
3. **Fail-fast**: если один fail-нул — остальные не запускаются, сообщение «partial promotion, manual rollback may be needed»

### Examples

```bash
bash scripts/promote_breaking_change.sh config.yaml
# [1/3] Promoting stats @ v2.0.0 ...
# [1/3] ✅ OK
# [2/3] Promoting radar @ v2.0.0 ...
# [2/3] ✅ OK
# [3/3] Promoting strategies @ v2.1.0 ...
# [3/3] ✅ OK
# 🎉 All 3 modules promoted atomically
```

### Exit codes
- `0` — все успешно
- `N` (1-∞) — на модуле N произошёл fail (остальные не запускались)

---

## <a name="update_dsppy"></a>🔄 `update_dsp.py`

**Назначение**: для LP_x — обновление `vendor/` из SMI100 + pin-логика. Вызывается из CMake configure + вручную.

### Synopsis

```bash
python3 scripts/update_dsp.py --mode <MODE> [OPTIONS]
```

### Modes

- `lp-refresh` — основной: обновить vendor/ и deps_state.json из SMI100
- `verify` — проверить консистентность vendor/ vs deps_state.json (для CI)

### Pin commands (shortcut, не через --mode)

- `--pin <mod> <tag> [--reason "..."]` — заморозить версию
- `--unpin <mod>` — снять pin
- `--pin-all [--reason "..."]` — заморозить все модули
- `--unpin-all` — снять все
- `--status` — показать что замороженно

### Options

- `--smi100-remote <url>` — URL SMI100 (по умолчанию из `CMakePresets.json` cache)
- `--vendor-dir <path>` — путь к vendor/ (по умолчанию `./vendor`)
- `--state-file <path>` — путь к deps_state.json (по умолчанию `./deps_state.json`)
- `--manifest <path>` — путь к dsp_modules.json (по умолчанию `./cmake/dsp_modules.json`)
- `--dry-run` — не менять файлы, показать diff
- `--no-network` — не ходить в SMI100 (для CI в offline-среде)
- `--fail-if-drift` — вернуть rc≠0 если есть рассинхрон (для release-gate в CI)
- `--fail-if-stale-pin` — вернуть rc≠0 если pin существует без reason
- `--verbose` — детальный вывод
- `--json` — output в JSON (для CI)

### Examples

```bash
# Обычный refresh (из CMake configure)
python3 scripts/update_dsp.py --mode lp-refresh
# 🔄 core: abc12345 → def67890 (v1.2.0 → v1.3.0)
# ✓  spectrum: up-to-date (fed45623)
# ⏸  stats: pinned (RC stab), skip

# Refresh с dry-run — посмотреть что будет
python3 scripts/update_dsp.py --mode lp-refresh --dry-run
# [DRY-RUN] would update vendor/core: v1.2.0 → v1.3.0

# Заморозить core
python3 scripts/update_dsp.py --pin core v1.2.0 --reason "RC2 stabilization"
# ✓ Pinned core @ v1.2.0

# Статус заморозок
python3 scripts/update_dsp.py --status
# ⏸  core:     pinned @ v1.2.0    (reason: RC2 stabilization, since 2026-04-18)
# 🟢 spectrum: free @ v1.1.0
# 🟢 stats:    free @ v1.3.0

# Снять все pin (после релиза)
python3 scripts/update_dsp.py --unpin-all

# Для CI release-gate
python3 scripts/update_dsp.py --mode lp-refresh --dry-run --fail-if-drift
# (exit 0 если vendor/ свежий, exit 1 если устарел)

# Проверка консистентности (для CI verify stage)
python3 scripts/update_dsp.py --mode verify
# Checks SHA in deps_state.json matches actual vendor/<mod>/.git/HEAD

# Offline build: не ходить в сеть вообще
python3 scripts/update_dsp.py --mode lp-refresh --no-network
# (используется в CI где сеть к SMI100 не настроена)
```

### Exit codes
- `0` — успех (в режиме `--dry-run --fail-if-drift`: vendor/ консистентен)
- `1` — общая ошибка
- `2` — SMI100 unreachable (с `--no-network` — OK, без него — warning но rc=0)
- `3` — `--fail-if-drift` обнаружил расхождение
- `4` — `--fail-if-stale-pin` обнаружил забытый pin
- `5` — deps_state.json повреждён

---

## <a name="generate_cmake_depspy"></a>🧱 `generate_cmake_deps.py`

**Назначение**: генерирует `cmake/fetch_deps.cmake` в каждом модуле и в workspace, на основе `dsp_modules.json`.

### Synopsis

```bash
python3 scripts/generate_cmake_deps.py [--manifest <path>] [--output-dir <path>]
```

### Options

- `--manifest` — путь к `dsp_modules.json` (по умолчанию `./dsp_modules.json`)
- `--output-dir` — куда писать `fetch_deps.cmake` (по умолчанию рядом с `CMakeLists.txt` каждого модуля)
- `--check` — не писать, только проверить что текущее состояние соответствует manifest (для pre-commit / CI)

### Examples

```bash
# Сгенерировать для всех модулей
python3 scripts/generate_cmake_deps.py

# Только проверить (для CI)
python3 scripts/generate_cmake_deps.py --check
# ✅ fetch_deps.cmake up-to-date in all modules

# ❌ drift detected in core/cmake/fetch_deps.cmake
# (exit 1)
```

### Exit codes
- `0` — успех (или check: всё актуально)
- `1` — manifest повреждён
- `2` — `--check`: есть drift

---

## <a name="topo_sortpy"></a>🧮 `topo_sort.py`

**Назначение**: вспомогательный — топологическая сортировка модулей по зависимостям из `dsp_modules.json`.

### Synopsis

```bash
python3 scripts/topo_sort.py [<config.yaml>]
```

### Examples

```bash
# Вся система в правильном порядке
python3 scripts/topo_sort.py
# core
# spectrum
# stats
# signal_generators
# linalg
# heterodyne
# radar
# strategies

# С фильтром из config.yaml (модули которые в config)
python3 scripts/topo_sort.py breaking_change_config.yaml
# stats
# radar
# strategies
```

### Exit codes
- `0` — успех
- `1` — цикл в зависимостях обнаружен (невозможно отсортировать)

---

## <a name="nightly-backupsh"></a>💾 `nightly-backup.sh`

**Назначение**: на SMI100, запускается cron-ом, создаёт бэкап всех bare-репо.

### Synopsis

```bash
bash /srv/smi100/scripts/nightly-backup.sh
```

Вызывается из cron:
```cron
0 3 * * * gitsrv /srv/smi100/scripts/nightly-backup.sh >> /var/log/smi100-backup.log 2>&1
```

### Параметры (в скрипте константами)

- `BACKUP_DIR=/srv/smi100/backup`
- `RETENTION_DAYS=7` — сколько дней хранить

### Что делает

1. Create tar.gz всех `smi100_*.git` + `incoming/`
2. Rotate — удаляет архивы старше `RETENTION_DAYS`
3. Логирует в stderr / log

Подробно — [03_Zone1_SMI100_Setup.md](03_Zone1_SMI100_Setup.md#backup--recovery).

---

## <a name="freeze_for_transfersh"></a>🎒 `freeze_for_transfer.sh` (опционально)

**Назначение**: создаёт самодостаточный transfer-артефакт LP_x (tarball без git / git bundle). Для R-offline (когда target без LAN к SMI100).

### Synopsis

```bash
bash scripts/freeze_for_transfer.sh <lp-path> [--format <bundle|tar-with-git|tar-archive>] [--output <file>]
```

### Examples

```bash
# Git bundle (компактно + история)
bash scripts/freeze_for_transfer.sh ~/LP_A --format bundle --output /tmp/LP_A.bundle

# Tar с .git/ (универсально)
bash scripts/freeze_for_transfer.sh ~/LP_A --format tar-with-git --output /tmp/LP_A.tar.gz

# Tar без .git/ (для клиента без git)
bash scripts/freeze_for_transfer.sh ~/LP_A --format tar-archive --output /tmp/LP_A.tar.gz
```

Подробно — [07_Transfer_To_Offline_PC.md](07_Transfer_To_Offline_PC.md).

---

## <a name="hookspre-commit"></a>🪝 `scripts/hooks/pre-commit`

**Назначение**: шаблон git hook, устанавливается разработчиком LP в `.git/hooks/pre-commit`. Запускает build+test перед commit.

### Synopsis

Hook запускается автоматически `git commit`-ом. Не вызывается напрямую.

### Установка

```bash
cd ~/LP_x
cp scripts/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### Обход (когда нужно срочно коммитить)

```bash
git commit --no-verify -m "emergency commit"
```

⚠️ `--no-verify` — не злоупотреблять. CI на сервере всё равно проверит.

Полный пример скрипта — [08_CI_And_Integrity.md#pre-commit-hook-опционально](08_CI_And_Integrity.md#pre-commit-hook-опционально).

---

## 📦 Обзор зависимостей между скриптами

```
dsp_modules.json (SSOT)
      │
      ├─► generate_cmake_deps.py ─────► cmake/fetch_deps.cmake (в каждом модуле)
      │
      ├─► topo_sort.py ────────────────┐
      │                                │
      │                                ▼
      │                     promote_breaking_change.sh
      │                                │
      │                                └─► promote_to_smi100.sh × N
      │                                          │
      │                                          └─► записывает
      │                                               promotions.log.json
      │
      └─► update_dsp.py (в LP) ──► деплой vendor/ из SMI100
                  │
                  ├─ запускается CMake (lp-refresh)
                  ├─ запускается LP-юзером (pin/unpin/status)
                  └─ запускается CI (verify / --fail-if-drift)
```

---

## ✅ Чеклист скриптов

### На ПК Alex

- [ ] `scripts/init_release_repos.sh`
- [ ] `scripts/promote_to_smi100.sh`
- [ ] `scripts/promote_breaking_change.sh`
- [ ] `scripts/generate_cmake_deps.py`
- [ ] `scripts/topo_sort.py`
- [ ] `scripts/update_dsp.py` (эталон, копируется в каждый LP)

### На SMI100

- [ ] `/srv/smi100/scripts/nightly-backup.sh`

### На LP_x

- [ ] `scripts/update_dsp.py` (копия из workspace)
- [ ] `scripts/hooks/pre-commit` (шаблон)
- [ ] Опционально: `scripts/freeze_for_transfer.sh`

---

## 🧭 Дальше

- [02_Zone0_Alex_Setup.md](02_Zone0_Alex_Setup.md) — как использовать Alex-скрипты
- [04_Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md) — как LP использует update_dsp.py
- [08_CI_And_Integrity.md](08_CI_And_Integrity.md) — интеграция update_dsp.py в CI

---

*09_Scripts_Reference.md · 2026-04-19 · Кодо + Alex*
