# 07 · Перенос LP на изолированный ПК

> **Кто это читает**: инженер, который должен отдать LP клиенту / развернуть на ПК без LAN к SMI100 / подготовить snapshot для release.
> **Цель**: знать как сделать так, чтобы `git clone` / tar-архив LP работал **полностью автономно** на целевой машине.

---

## 🎯 Два сценария переноса

### Сценарий A — Target ПК имеет git

Клиент / внутренний сервер без интернета, но с установленным git-ом. Передача через сеть (SFTP / rsync / внутренний git-server).

**Способ**: `git clone` / `git bundle` / tarball с `.git/`.

### Сценарий B — Target ПК без git

Например, самая простая сборочная машина клиента или embedded-стенд. Только архив с файлами.

**Способ**: `git archive` + `tar.gz` без `.git/`.

---

## 📦 Основной принцип

> **LP_x clone = полный самодостаточный комплект.**
> `vendor/` в git → исходники всех зависимостей едут вместе с LP_x.
> На target-ПК нужен только CMake + toolchain (ROCm/HIP для нашего кейса). Никаких сетевых запросов.

**Условие**: перед переносом LP_x должен быть в состоянии «собирается + тесты зелёные». Иначе клиенту приедет сборка которая не работает.

---

## 🛡 Обязательный цикл перед переносом

```
┌── ШАГ A: полный цикл сборки + тест на LP-сервере ───────────────────────┐
│                                                                          │
│   cd ~/LP_x                                                              │
│   rm -rf build                                                           │
│   cmake --preset zone2                                                   │
│   # ↑ configure автоматически обновит vendor/ из SMI100                  │
│   cmake --build build -j$(nproc)                                         │
│   ctest --test-dir build --output-on-failure                             │
│                                                                          │
│   → должны быть зелёные.                                                 │
└──────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌── ШАГ B: коммит vendor/ и deps_state.json ──────────────────────────────┐
│                                                                          │
│   git add vendor/ deps_state.json                                        │
│   git status                                                             │
│   # проверяем что других неожиданных изменений нет                       │
│   git commit -m "transfer candidate: $(date +%Y-%m-%d)"                  │
│   git tag LP_x-transfer-$(date +%Y%m%d)                                  │
└──────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌── ШАГ C: создаём transfer-артефакт (см. ниже) ──────────────────────────┐
│   Формат на выбор: git bundle / tarball с .git / tarball без git        │
└──────────────────────────────────────────────────────────────────────────┘
```

**Это правило** — не обсуждается. Пропуск ШАГА A = клиент получит неисправную сборку.

---

## 🎁 Три формата transfer-артефакта

### Формат 1 — `git bundle` (максимально компактно, сохраняет историю)

Создание:
```bash
cd ~/LP_x
git bundle create /tmp/LP_x-$(date +%Y%m%d).bundle --all
# --all = все ветки + теги
```

Размер: обычно 30-70% от размера полного `.git/` (бинарные дельты).

Передача: `scp` / SFTP / USB / любой способ.

Применение на target:
```bash
git clone /path/to/LP_x-20260419.bundle my-lp
cd my-lp
cmake --preset zone2-offline
cmake --build build
```

✅ Полная git-история сохранена — можно `git log`, `git blame`, `git checkout <old-tag>`.
⚠️ На target нужен git.

---

### Формат 2 — Tarball с `.git/` (tar весь репо)

Создание:
```bash
cd ~
tar --exclude='LP_x/build' \
    --exclude='LP_x/dev-overlays' \
    -czf /tmp/LP_x-$(date +%Y%m%d).tar.gz \
    LP_x/
```

Что включает:
- `LP_x/.git/` — полная history
- `LP_x/src/`, `include/`, `tests/`
- `LP_x/vendor/` — все исходники зависимостей
- `LP_x/deps_state.json`, `CMakeLists.txt`, `CMakePresets.json`

Применение на target:
```bash
tar -xzf LP_x-20260419.tar.gz
cd LP_x
cmake --preset zone2-offline
cmake --build build
```

✅ Универсально, всегда работает.
⚠️ Размер больше чем bundle (нет delta-оптимизации).
✅ На target не нужен git (можно `cmake --build` просто).

---

### Формат 3 — `git archive` (без истории, самый простой для клиента)

Создание:
```bash
cd ~/LP_x
git archive --format=tar.gz \
            --prefix=LP_x-v0.5/ \
            -o /tmp/LP_x-v0.5.tar.gz \
            HEAD
```

Что включает: **только файлы на момент HEAD**. Никакого `.git/`, никакой истории, ничего лишнего.

Применение на target:
```bash
tar -xzf LP_x-v0.5.tar.gz
cd LP_x-v0.5
cmake --preset zone2-offline
cmake --build build
```

✅ Самый простой для клиента: «вот архив, распакуй и собирай».
✅ На target не нужен ни git, ни SSH-ключи.
❌ Нет истории — нельзя сделать `git log`, но клиенту это обычно и не нужно.

---

## 🧪 `zone2-offline` preset — как он работает

Ключевая идея: preset заставляет CMake **не ходить** в SMI100, использовать `vendor/` как единственный источник.

```jsonc
{
  "name": "zone2-offline",
  "inherits": "zone2",
  "displayName": "Offline mode — без обращений к SMI100",
  "cacheVariables": {
    "DSP_OFFLINE_MODE": "ON",
    "FETCHCONTENT_SOURCE_DIR_DSPCORE":             "${sourceDir}/vendor/core",
    "FETCHCONTENT_SOURCE_DIR_DSPSPECTRUM":         "${sourceDir}/vendor/spectrum",
    "FETCHCONTENT_SOURCE_DIR_DSPSTATS":            "${sourceDir}/vendor/stats",
    "FETCHCONTENT_SOURCE_DIR_DSPSIGNAL_GENERATORS":"${sourceDir}/vendor/signal_generators",
    "FETCHCONTENT_SOURCE_DIR_DSPHETERODYNE":       "${sourceDir}/vendor/heterodyne",
    "FETCHCONTENT_SOURCE_DIR_DSPLINALG":           "${sourceDir}/vendor/linalg",
    "FETCHCONTENT_SOURCE_DIR_DSPRADAR":            "${sourceDir}/vendor/radar",
    "FETCHCONTENT_SOURCE_DIR_DSPSTRATEGIES":       "${sourceDir}/vendor/strategies"
  }
}
```

В `CMakeLists.txt` LP_x должна быть проверка:
```cmake
if(DSP_OFFLINE_MODE)
    message(STATUS "[DSP] Offline mode: skipping SMI100 refresh")
else()
    execute_process(COMMAND python3 ${CMAKE_SOURCE_DIR}/scripts/update_dsp.py
                            --mode lp-refresh ...)
endif()
```

**Результат**: при `zone2-offline` — никаких `execute_process`, никаких git-запросов, только чтение vendor/ с диска.

---

## 🧾 Что передать клиенту (инструкция)

Если отдаёшь клиенту tar-архив, приложи **README_client.txt** в корне:

```
# LP_x offline build — инструкция для клиента

Вам передан архив LP_x-<дата>.tar.gz. Внутри — полный самодостаточный комплект
для сборки DSP-pipeline на вашем изолированном стенде.

## Требования к target-машине

- ОС: Debian 12+ / Ubuntu 22.04+ (или Windows 10+)
- CMake ≥ 3.24
- Компилятор C++20
- ROCm 7.2+ (если GPU AMD) или CUDA 12+ (если NVIDIA) или CPU-only режим
- ≥ 4 GB RAM для сборки

## Сборка (3 команды)

```bash
tar -xzf LP_x-20260419.tar.gz
cd LP_x-20260419
cmake --preset zone2-offline
cmake --build build -j$(nproc)
```

## Запуск

```bash
./build/bin/pipeline --config config.yaml
```

## Если что-то не так

Документация: `Doc/` в корне архива. Начните с `Doc/README.md` → `Doc/11_Troubleshooting.md`.

Контакт: <ваш email / чат>
```

---

## 🔄 Periodic transfer — обновление версии у клиента

Если клиент хочет обновление:

```bash
# На LP-сервере:
cd ~/LP_A
git pull                          # свежая работа команды
rm -rf build
cmake --preset zone2              # refresh vendor/ из SMI100
cmake --build build
ctest --test-dir build

# Если зелёное:
git add vendor/ deps_state.json
git commit -m "client-release: 2026-04-19"
git tag LP_A-client-20260419

# Создаём архив:
git archive --format=tar.gz --prefix=LP_A-20260419/ \
            -o /tmp/LP_A-20260419.tar.gz HEAD
```

Клиент:
```bash
tar -xzf LP_A-20260419.tar.gz
cd LP_A-20260419
cmake --preset zone2-offline
cmake --build build
```

---

## ✅ Чеклист перед transfer

- [ ] Свежий `git pull` от команды
- [ ] `rm -rf build && cmake --preset zone2` — configure зелёный
- [ ] `cmake --build build` — без ошибок
- [ ] `ctest --test-dir build` — все тесты зелёные
- [ ] `vendor/` и `deps_state.json` закоммичены
- [ ] Git tag поставлен (`LP_x-transfer-YYYYMMDD`)
- [ ] Архив создан **из HEAD** (не из грязного WD)
- [ ] Проверили размер архива (подозрительно большой / маленький — разобрались)
- [ ] На тестовой чистой машине протестирован unpack + build
- [ ] Клиенту приложен README_client.txt + контакт поддержки

---

## 🚨 Частые ошибки

### Ошибка: клиент не может собрать — «missing dependencies»

**Причина**: перед `git add vendor/` забыли сделать `rm -rf build && cmake --preset zone2`, и vendor/ остался неполным.

**Как проверить**:
```bash
ls vendor/
# Должно быть всё из dsp_modules.json
cat deps_state.json | jq '.repos | keys'
# Список должен совпасть с папками в vendor/
```

---

### Ошибка: архив огромный (несколько ГБ)

**Причина**: случайно включили `build/`, `dev-overlays/`, или `.git/` очень большой.

**Как проверить**:
```bash
tar -tzf archive.tar.gz | head -20
tar -tzf archive.tar.gz | awk -F/ '{print $1"/"$2}' | sort -u
```

**Решение**: использовать формат 3 (git archive) или явные `--exclude` в tar.

---

### Ошибка: target-машина собирает, но неправильно работает

**Причина**: `zone2-offline` preset не активирован, CMake пошёл в сеть, `update_dsp.py` fail-ed, но CMake продолжил с устаревшим `vendor/`.

**Как избежать**: **явно** использовать `zone2-offline`, не `zone2`:
```bash
cmake --preset zone2-offline   # ✅
# НЕ cmake --preset zone2 — это production-режим с LAN
```

---

## 🧭 Дальше

- [04_Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md) — общий workflow LP
- [08_CI_And_Integrity.md](08_CI_And_Integrity.md) — автоматизация transfer через CI (release-gate)
- [11_Troubleshooting.md](11_Troubleshooting.md) — проблемы сборки

---

*07_Transfer_To_Offline_PC.md · 2026-04-19 · Кодо + Alex*
