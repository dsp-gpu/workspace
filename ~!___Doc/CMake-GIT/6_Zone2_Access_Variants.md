# Варианты доступа Zone 2 к репозиториям SMI100

> **Статус**: ✅ BASE v1.0
> **Дата**: 2026-04-18 | **Основа**: `5_ReleaseRepo_Variant.md`

---

## Контекст

SMI100 содержит N release-репозиториев (копии из DSP-GPU, только стабильные версии).
Zone 2 (LocalProject_N) получает код оттуда. Вопрос: **как именно**?

```
SMI100:
  core.git      spectrum.git      linalg.git      stats.git  ...  (8, 80, ...)
        │              │               │               │
        └──────────────┴───────────────┴───────────────┘
                              ↓
                     ???  как тянет Zone 2  ???
```

---

## Вариант A — каждый git отдельно (ЛУЧШИЙ, масштабируется)

**Описание**: Zone 2 подключает каждый нужный репо с SMI100 напрямую.
Состав определяется через `USE_DSP_*` переключатели в `CMakePresets.json`.

```
SMI100:
  core.git      spectrum.git      linalg.git      stats.git

LocalProject_A:           LocalProject_B:
  USE_DSP_CORE=ON           USE_DSP_CORE=ON
  USE_DSP_SPECTRUM=ON       USE_DSP_LINALG=ON
  USE_DSP_LINALG=OFF        USE_DSP_SPECTRUM=OFF
  → тянет core + spectrum   → тянет core + linalg
```

**CMake (fetch_dsp_deps.cmake)**:
```cmake
dsp_declare(core)      # → git@smi100.local:core.git     @ HEAD
dsp_declare(spectrum)  # → git@smi100.local:spectrum.git @ HEAD
dsp_declare(linalg)    # → git@smi100.local:linalg.git   @ HEAD
# выключенные — не скачиваются вообще
```

**Автообновление через version.cmake**:
```bash
# Zone 2 (автоматически при сборке):
git -C deps/core pull          # новый SHA появился
cmake --build build            # git_version ALL → SHA изменился → rebuild
# ← никакого вмешательства, всё само
```

**Масштабирование**:
```
Добавить новый модуль (например radar):
  SMI100:        Alex кладёт radar.git
  fetch_dsp_deps.cmake: dsp_declare(radar) — одна строка
  CMakePresets:  USE_DSP_RADAR=ON/OFF — одна строка

Новый LocalProject_C с другим составом:
  Копируем CMakePresets.json → меняем ON/OFF → готово
  SMI100 не меняется вообще
```

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| Одни репо на SMI100 — все проекты из них | Пользователь должен знать какие модули ему нужны |
| Каждый модуль версионируется независимо | Совместимость версий — ответственность Alex |
| Масштаб: +1 модуль = +1 строка в cmake | — |
| version.cmake — автодетект изменений | — |
| Транзитивные зависимости через FetchContent | — |
| Нет дублирования кода на SMI100 | — |

---

## Вариант B — агрегированный git для каждого LocalServer

**Описание**: Alex на SMI100 формирует отдельный сборный репо под конкретный
LocalServer. В него входят только нужные модули, уже проверенная комбинация.

```
SMI100:
  core.git  spectrum.git  linalg.git  stats.git    ← источники
        │         │            │
        └─────────┴────────────┘
                  │  Alex собирает (скрипт)
                  ▼
  localserver1.git:              localserver2.git:
    core/ @ v1.2.0                 core/ @ v1.2.0
    spectrum/ @ v1.1.0             linalg/ @ v1.0.0
    stats/ @ v1.0.0                stats/ @ v1.0.0
```

**Zone 2 (LocalServer1)**:
```cmake
FetchContent_Declare(
    localserver1
    GIT_REPOSITORY git@smi100.local:localserver1.git
    GIT_TAG        HEAD
    FIND_PACKAGE_ARGS NAMES dsp_bundle
)
FetchContent_MakeAvailable(localserver1)
# один clone — всё внутри
```

**Обновление**:
```bash
# Alex обновляет localserver1.git (скрипт на SMI100):
./bundle_update.sh localserver1 --core v1.3.0 --spectrum v1.2.0
git -C localserver1 commit -m "bump: core v1.2→v1.3, spectrum v1.1→v1.2"

# Zone 2:
git pull         # тянет обновлённый bundle
cmake --build    # version.cmake → SHA изменился → rebuild
```

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| Zone 2 работает с одним репо — максимально просто | Alex формирует отдельный bundle для каждого сервера |
| Гарантированно совместимые версии в bundle | При N серверах → N bundle-репо на SMI100 |
| Zone 2 не думает о составе зависимостей | Bundle-репо растут (все файлы в каждом) |
| Обновление — один `git pull` | Дублирование: core живёт в каждом bundle |
| — | Патч из Zone 2 → в bundle, потом перенос в источник |

---

## Вариант C — отдельный git для каждого LocalServer_N (АБСУРД)

**Описание**: Как Вариант B, но каждый сервер Zone 2 получает полностью
уникальный репо с уникальным составом и уникальными версиями. Ни один bundle
не похож на другой.

```
SMI100:
  localserver1.git  ← core v1.2 + spectrum v1.1
  localserver2.git  ← core v1.1 + linalg v1.0 (старый core!)
  localserver3.git  ← spectrum v1.2 + stats v1.0 (без core???)
  localserver4.git  ← всё v1.0 (заморожено год назад)
  ...
  localserverN.git  ← своя уникальная каша
```

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| Полная изоляция серверов | N серверов = N bundle = экспоненциальный overhead |
| Каждый получает ровно своё | Нет единого источника правды |
| — | Обновить security fix: N ручных операций |
| — | Разные версии core на разных серверах → поддержка кошмар |
| — | Дублирование во всём |

> ⚠️ Единственный разумный случай для Варианта C:
> жёсткие требования безопасности — каждый сервер не должен знать
> о существовании других модулей. Но это решается через права доступа
> на Варианте A, а не копированием.

---

## Сравнительная таблица

```
                     Вариант A          Вариант B           Вариант C
─────────────────────────────────────────────────────────────────────────
Репо на SMI100       8 (фиксировано)    8 + N bundle        8 + N×M bundle
Добавить сервер      CMakePresets       новый bundle         новый bundle
Добавить модуль      1 строка cmake     обновить все bundle  обновить все bundle
Совместимость        ответственность    гарантирована        уникальна для каждого
                     Zone 2             Alex
Обновление           git pull + build   git pull + build     git pull + build
version.cmake        ✅ работает         ✅ работает            ✅ работает
Дублирование         нет                да (bundle)           максимальное
Масштаб              ✅ отлично           ⚠️ растёт линейно     ❌ экспоненциально
```

---

## Рекомендация

```
Основа:          Вариант A (всегда)
                 8 репо на SMI100, каждый LocalProject берёт нужные

Дополнение:      Вариант B (по запросу)
                 Если конкретной команде нужен "один clone и всё готово"
                 → Alex делает bundle для них как исключение

Никогда:         Вариант C
                 Решается правами доступа в Варианте A, не копированием
```

**Для тиражирования (1×SMI100 → 10×LocalProject)**:
Вариант A масштабируется идеально — SMI100 не меняется,
каждый LocalProject только настраивает свой `CMakePresets.json`.

---

*Created: 2026-04-18 | Version: BASE v1.0 | Author: Кодо + Alex*
