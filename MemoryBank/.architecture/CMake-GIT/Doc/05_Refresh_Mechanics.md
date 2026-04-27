# 05 · Механика обновления vendor/

> **Кто это читает**: инженер LP (хочет понять как именно работают обновления), архитектор (решающий A vs B).
> **Цель**: детальное описание потока «cmake configure → refresh vendor/ → build» и механики pin.

---

## 🎯 Основной принцип

> 🔄 При каждом `cmake configure` автоматически запускается refresh `vendor/` из SMI100 по LAN.
> 🏗 Сборка дальше — локально из `vendor/`, сеть не нужна.
> 📦 `git clone LP_x` даёт полный комплект — потому что `vendor/` в git, а перед коммитом LP_x всегда собирается+тестируется.

---

## ⚙️ Две альтернативы реализации refresh

Механика «configure → refresh vendor/» может быть реализована двумя способами. **Решение Alex (2026-04-19): реализуем B, A оставляем в документе как альтернативу**.

---

### 🅰️ Вариант A — Pure CMake FetchContent

CMake сам через `FetchContent_Declare(... GIT_REMOTE_UPDATE_STRATEGY CHECKOUT)` ходит в SMI100 и обновляет `vendor/`.

```cmake
# CMakeLists.txt (LP_x) — вариант A
FetchContent_Declare(DspCore
    GIT_REPOSITORY       ssh://smi100.local/srv/smi100/smi100_core.git
    GIT_TAG              v1.3.0
    GIT_REMOTE_UPDATE_STRATEGY CHECKOUT
    SOURCE_DIR           ${CMAKE_SOURCE_DIR}/vendor/core
)
FetchContent_MakeAvailable(DspCore)
```

**Плюсы**:
- ✅ Одна технология (CMake), меньше движущихся частей
- ✅ Python не требуется
- ✅ Стандартный паттерн CMake 3.24+

**Минусы**:
- ❌ Поведение зависит от версии CMake (3.24 ↔ 3.28 различаются)
- ❌ Чёрный ящик — сложно дебажить «почему сегодня не обновилось»
- ❌ Pin-логика — через хак (условный переопределяемый `GIT_TAG`), не прямолинейна
- ❌ Нет нормального логирования
- ❌ Retry / graceful fallback при сетевых проблемах — сложно

---

### 🅱️ Вариант B — Python-скрипт `update_dsp.py` (✅ выбран)

Существующий `update_dsp.py` (уже есть в `MemoryBank/.architecture/CMake-GIT/`) **дорабатывается** и вызывается из CMakeLists.txt на этапе configure. Он сам делает git fetch из SMI100, обновляет `vendor/` и `deps_state.json`. CMake после этого использует готовый `vendor/` через `FETCHCONTENT_SOURCE_DIR_*` — в сеть больше не ходит.

```cmake
# CMakeLists.txt (LP_x) — вариант B (выбран)
execute_process(
    COMMAND python3 ${CMAKE_SOURCE_DIR}/scripts/update_dsp.py
            --mode lp-refresh
            --smi100-remote ssh://gitsrv@smi100.local/srv/smi100
            --vendor-dir    ${CMAKE_SOURCE_DIR}/vendor
            --state-file    ${CMAKE_SOURCE_DIR}/deps_state.json
            --manifest      ${CMAKE_SOURCE_DIR}/cmake/dsp_modules.json
    RESULT_VARIABLE _rc
    OUTPUT_VARIABLE _out
)
if(NOT _rc EQUAL 0)
    message(WARNING "update_dsp.py failed (rc=${_rc}): using cached vendor/ as-is")
    message(STATUS "Output: ${_out}")
endif()

# Дальше CMake просто пользуется vendor/ — без сети:
set(FETCHCONTENT_SOURCE_DIR_DSPCORE     ${CMAKE_SOURCE_DIR}/vendor/core)
set(FETCHCONTENT_SOURCE_DIR_DSPSPECTRUM ${CMAKE_SOURCE_DIR}/vendor/spectrum)
# ...

FetchContent_Declare(DspCore)
FetchContent_MakeAvailable(DspCore)
```

**Плюсы**:
- ✅ Прозрачная логика, читаемый Python-код
- ✅ Легко дебажить — запускается отдельно: `python update_dsp.py --mode lp-refresh --dry-run`
- ✅ Нормальное логирование в любом формате (journald, JSON, stderr)
- ✅ Pin / unpin / status — прямолинейные if/else
- ✅ Retry, timeout, graceful fallback — естественно
- ✅ **Уже есть базовый скрипт** — доработка, не написание с нуля
- ✅ Запускается независимо от CMake (для ручных команд)

**Минусы**:
- ❌ Python ≥ 3.8 требуется на LP_x (✅ есть — подтверждено Alex)
- ❌ Ещё одна зависимость в стеке
- ❌ Часть метаданных (список модулей) может дублироваться → решается через `dsp_modules.json` как SSOT

---

### 📊 Сравнение A vs B

| Критерий | 🅰️ Pure CMake | 🅱️ Python-скрипт |
|---|:---:|:---:|
| Количество технологий | 1 (CMake) | 2 (CMake + Python) |
| Python на LP_x | не нужен | нужен ≥ 3.8 |
| Дебаг «почему не обновилось?» | 🔴 тяжело | 🟢 легко |
| Логирование | 🔴 минимум | 🟢 любой формат |
| Pin-логика | 🔴 хак | 🟢 прямолинейно |
| Retry / fallback | 🔴 сложно | 🟢 естественно |
| Разные версии CMake | 🔴 тонкости | 🟢 не касается |
| Тест скрипта независимо от сборки | ❌ | ✅ `--dry-run` |
| Нам нужно писать с нуля | базовый код | **доработка готового** |
| **Итог для DSP-GPU** | альтернатива | **✅ выбрано** |

**Почему (B)**: команды LP > 10 человек → нужен **прозрачный механизм**, дебажащийся без знания внутренностей CMake. Плюс `update_dsp.py` уже есть — дорабатываем.

---

## 🔧 Два отдельных скрипта — разделение ответственности

Решение Alex (2026-04-19): **не смешивать** промотирование и lp-refresh в одном скрипте.

| Скрипт | Где живёт | Кто запускает | Что делает |
|--------|-----------|---------------|-----------|
| **`scripts/promote_to_smi100.sh`** | ПК Alex | Только Alex | Zone 0 → Zone 1: тянет release-тег из public GitHub → `_release_git/smi100_*.git` → `git push smi100` (LAN). Подробно — [02_Zone0_Alex_Setup.md](02_Zone0_Alex_Setup.md). |
| **`scripts/update_dsp.py`** | На каждом LP_x | LP-разработчики + CMake через `execute_process` | Zone 2 only: идёт в SMI100 по LAN, обновляет `vendor/<mod>/` и `deps_state.json`, держит pin-логику. |

---

## 📋 Полный 5-шаговый цикл обычной сборки

```
 ┌─ ШАГ 1: cmake --preset zone2 (configure) ───────────────────────────────┐
 │                                                                          │
 │   CMake читает CMakeLists.txt → execute_process:                         │
 │     python3 scripts/update_dsp.py --mode lp-refresh                      │
 │                                                                          │
 │   Внутри скрипта для каждого модуля из dsp_modules.json:                 │
 │     • читает deps_state.json — текущий SHA и pinned флаг                 │
 │     • если pinned == true → SKIP (не трогать vendor/<mod>/)              │
 │     • иначе:                                                             │
 │       - git ls-remote ssh://smi100/smi100_<mod>.git                      │
 │       - сравнить с SHA из deps_state.json                                │
 │       - если разные:                                                     │
 │         * git fetch → git checkout в vendor/<mod>/                       │
 │         * обновить deps_state.json (sha, tag, timestamp)                 │
 │       - если одинаковые: no-op                                           │
 │                                                                          │
 │   После скрипта CMake использует vendor/ как источник:                   │
 │     set(FETCHCONTENT_SOURCE_DIR_DSPCORE vendor/core)                     │
 │     FetchContent_MakeAvailable(DspCore ...)                              │
 └──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌─ ШАГ 2: cmake --build build ────────────────────────────────────────────┐
 │                                                                          │
 │   Компиляция идёт из vendor/ локально.                                   │
 │   🌐 Сеть не трогается.                                                  │
 │   Все исходники на диске, на расстоянии read() от компилятора.          │
 └──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌─ ШАГ 3: ctest --test-dir build ─────────────────────────────────────────┐
 │   Прогоняем тесты. Если зелёные → LP_x в рабочем состоянии со свежими   │
 │   зависимостями.                                                         │
 └──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌─ ШАГ 4: git add + commit (опц., CI делает это автоматически) ───────────┐
 │                                                                          │
 │   git add vendor/ deps_state.json                                        │
 │   git commit -m "sync with SMI100: core v1.2.0 → v1.3.0"                │
 │                                                                          │
 │   Это можно:                                                             │
 │     • делать руками после каждой успешной сборки (дисциплина)            │
 │     • делать pre-release (перед tag release)                            │
 │     • автоматизировать через CI (рекомендуется — см. 08_CI_*)           │
 └──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌─ ШАГ 5: git clone LP_x на другой ПК / флешку (опц.) ────────────────────┐
 │                                                                          │
 │   git clone → target-ПК получает src/ + vendor/ + deps_state.json       │
 │   → cmake --preset zone2-offline                                        │
 │       (preset с FETCHCONTENT_SOURCE_DIR_* на vendor/ → не идёт в LAN)   │
 │   → cmake --build → собирается автономно, без SMI100                    │
 │                                                                          │
 │   Подробно — 07_Transfer_To_Offline_PC.md                                │
 └──────────────────────────────────────────────────────────────────────────┘
```

---

## 🧊 Pin — «заморозка» версий deps

### Зачем

Три реальных сценария:

1. **Release candidate**: команда стабилизирует релиз, QA проверяет. Если в это время Alex выкатит `core v2.0.0` (breaking) — обычный configure подтянет → тесты сломаются, приёмка насмарку. **Решение**: зафиксировать `core` на `v1.x.y` до конца приёмки.

2. **Воспроизведение бага клиента**: обычно не нужен pin (`vendor/` в git → `git checkout LP_x-r23` даёт те версии). Но если хочется воспроизвести на **свежем коде LP_x** с **замороженными deps** — используется pin.

3. **Изоляция от breaking change**: все команды адаптируются к новому API. LP_B нужно ещё неделю — замораживаются, `cmake configure` не ломает им сборку.

---

### Формат `deps_state.json` v2 (с pin)

```json
{
  "schema_version": 2,
  "updated": "2026-04-19T10:00:00+03:00",
  "repos": {
    "core": {
      "sha":    "abc123def...",
      "tag":    "v1.2.0",
      "pinned": true,
      "pin_reason": "RC stabilization до 2026-05-01",
      "pinned_at":  "2026-04-18T09:15:00+03:00",
      "pinned_by":  "lp_a_team_lead"
    },
    "spectrum": {
      "sha":    "fed456cba...",
      "tag":    "v1.1.0",
      "pinned": false
    }
  }
}
```

### Поведение `update_dsp.py --mode lp-refresh`

```python
# Псевдокод внутри update_dsp.py
for mod in manifest_modules:
    entry = deps_state["repos"].get(mod, {})
    if entry.get("pinned") is True:
        log(f"⏸  {mod}: pinned ({entry.get('pin_reason', '')}), skip")
        continue
    
    remote_sha = git_ls_remote(smi100_url(mod), entry.get("tag", "main"))
    if remote_sha != entry.get("sha"):
        log(f"🔄 {mod}: {entry.get('sha', '?')[:8]} → {remote_sha[:8]}")
        git_fetch_and_checkout(vendor_dir/mod, remote_sha)
        entry["sha"] = remote_sha
        entry["updated_at"] = now_iso()
        deps_state["repos"][mod] = entry
    else:
        log(f"✓  {mod}: up-to-date ({entry['sha'][:8]})")
```

---

### Команды `update_dsp.py` (для LP)

| Команда | Что делает |
|---------|-----------|
| `python scripts/update_dsp.py --mode lp-refresh` | основной режим (вызывается из CMake) |
| `python scripts/update_dsp.py --mode lp-refresh --dry-run` | показать что сделал бы, не меняя файлов |
| `python scripts/update_dsp.py --pin core v1.2.0 --reason "RC2"` | заморозить `core` на `v1.2.0` |
| `python scripts/update_dsp.py --unpin core` | снять pin с `core` |
| `python scripts/update_dsp.py --status` | показать какие модули замороженны |
| `python scripts/update_dsp.py --pin-all --reason "release v0.5"` | заморозить все модули разом |
| `python scripts/update_dsp.py --unpin-all` | снять все pin |

После `--pin` / `--unpin` — обычный цикл коммит:
```bash
python scripts/update_dsp.py --pin core v1.2.0 --reason "RC stab"
git add deps_state.json
git commit -m "pin core@v1.2.0 for RC stabilization"
```

---

## 🎬 Три типовых сценария

### 🟢 Сценарий 1 — обычный рабочий день LP_A

```
10:00  Разработчик подключается к LP_A-серверу:
         git pull
         rm -rf build
         cmake --preset zone2
       → CMake: «на SMI100 появилась spectrum v1.2.1, у нас v1.2.0 в vendor/»
                → git fetch → git checkout → vendor/spectrum обновлён
                → deps_state.json обновлён
         cmake --build build -j$(nproc)
       → сборка из свежего vendor/, без сети.

12:00  Тесты зелёные, фиксим состояние:
         git add vendor/ deps_state.json
         git commit -m "sync: spectrum v1.2.0 → v1.2.1"
         git push origin main
       → CI прогоняет полный build+test → зелёный → принимается.
```

### 🟢 Сценарий 2 — «заморозка» LP_B на RC

```
 Команда LP_B готовит релиз v0.5. Приёмка.
 
 python scripts/update_dsp.py --pin-all --reason "RC2 stabilization"
 git add deps_state.json
 git commit -m "pin all for RC2"
 git tag LP_B-v0.5-rc2
 
 → После этого любой cmake configure в LP_B идёт через update_dsp.py,
    но все модули pinned → SKIP → vendor/ как есть → воспроизводимая сборка.
 
 Когда RC2 принят:
   python scripts/update_dsp.py --unpin-all
   git add deps_state.json
   git commit -m "unpin all after RC2 release"
   → обычный цикл возвращается.
```

### 🟢 Сценарий 3 — SMI100 недоступна во время сборки

```
 cmake --preset zone2
 → update_dsp.py пытается git ls-remote smi100... → timeout
 → graceful fallback:
   ⚠ WARN: SMI100 unreachable, using cached vendor/
 → CMake продолжает с существующим vendor/
 → cmake --build работает как обычно

 Разработчик видит warning, может проигнорировать (сборка работает)
 или разбираться с сетью.
 После восстановления LAN → следующий configure подтянет всё.
```

---

## ✅ Best practices

1. **Всегда commit vendor/ после успешной build+test**. Не оставляй «обновился, но не закоммитил» — следующий разработчик получит diff но без гарантий что работало.

2. **Используй pin только когда это действительно нужно**. Случайный pin в main-ветке может заморозить всю команду надолго.

3. **Проверяй `--status` периодически**. Забытый pin — частая проблема.

4. **CI должен запускать полный цикл**. См. [08_CI_And_Integrity.md](08_CI_And_Integrity.md).

5. **Не редактируй `deps_state.json` руками**. Только через `update_dsp.py` — иначе сломаешь формат.

---

## 🧭 Дальше

- [06_Patch_Flow.md](06_Patch_Flow.md) — как отправить правку обратно Alex-у
- [07_Transfer_To_Offline_PC.md](07_Transfer_To_Offline_PC.md) — перенос LP на изолированный ПК
- [08_CI_And_Integrity.md](08_CI_And_Integrity.md) — CI и автоматизация commit vendor/
- [09_Scripts_Reference.md](09_Scripts_Reference.md#update_dsppy) — полный API `update_dsp.py`
- [11_Troubleshooting.md](11_Troubleshooting.md) — проблемы и решения

---

*05_Refresh_Mechanics.md · 2026-04-19 · Кодо + Alex*
