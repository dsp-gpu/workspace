# Варианты архитектуры: анализ +/−

> **Статус**: ✅ BASE v1.0  
> **Дата**: 2026-04-18 | **Основа**: `1_MultiProject_Architecture.md`

---

## Сводная таблица

| # | Название | SMI100 | Project 2 получает | Рекомендация |
|---|----------|--------|-------------------|--------------|
| 1 | **BASE** | bare mirrors | submodules + FetchContent | ✅ Базовый |
| 2 | **Full workspace** | bare + живые исходники + сборка | submodules + FetchContent | ✅ Расширение |
| 3 | **Dist из workspace** | как 2 + сборка dist-repo | один git clone | ⚠️ Тяжело |
| 4 | **Копии папок** | как 2+3 + rsync | голые файлы без git | ❌ Абсурд |
| 5 | **Dist из bare** | bare mirrors + сборка dist-repo | один git clone | ✅ Элегантно |

---

## Вариант 1 — BASE (базовый)

**Описание**: SMI100 держит bare-зеркала. Project 2 использует git submodules + CMake FetchContent override.

```
SMI100/mirrors/core.git   (bare)
               spectrum.git
               linalg.git
SMI100/projects/LocalProject0.git

Project 2: git clone --recurse-submodules → deps/ → cmake --preset from-submodules
```

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| Минимальный вес на SMI100 | На SMI100 нельзя открыть/читать файлы |
| CMake пресеты управляют составом | submodule update — ручная операция |
| Zero network при сборке (stamp) | Нужно обновлять .gitmodules при смене тега |
| Патч из 2→0 через relay branch | — |
| Чистая изоляция зон | — |

---

## Вариант 2 — Full workspace (расширение базового)

**Описание**: Поверх bare mirrors добавляется полноценный checkout. Всё собирается на SMI100. Python примеры доступны.

```
SMI100/mirrors/core.git        (bare — как в варианте 1)
SMI100/workspace/core/         (живой clone, можно читать/редактировать)
              spectrum/
              linalg/
SMI100/workspace/python/       (Python примеры)
SMI100/build/                  (собранные бинарники)
```

**Управление составом** — один раз через CMakePresets.json:
```jsonc
// SMI100/CMakePresets.json
{ "name": "deploy-stats-spectrum",
  "cacheVariables": {
    "MIRROR_REPO_CORE":     "ON",
    "MIRROR_REPO_SPECTRUM": "ON",
    "MIRROR_REPO_STATS":    "ON",
    "MIRROR_REPO_LINALG":   "OFF",
    "MIRROR_REPO_RADAR":    "OFF"
  }
}
```
Один раз выбрал нужные репо → синхронизировал → всё готово.

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| Файлы видны и читаемы на SMI100 | SMI100 нужен build toolchain (CMake + HIP/ROCm) |
| Python примеры работают сразу | Больше места на диске |
| Сборка проверяется на SMI100 | Нужно обновлять workspace при смене тега |
| Включает/выключает репо через пресет | — |
| Project 2 → как вариант 1 (submodules) | — |

---

## Вариант 3 — Dist-репо из workspace ⚠️

**Описание**: Из Варианта 2 — скрипт собирает всё в один "дистрибутивный" git-репо (без Python тестов). Project 2 клонирует один репо.

```
SMI100/workspace/core/ + spectrum/ + linalg/
        │
        └─ build_dist.sh
               │
               ▼
SMI100/dist/dsp-dist.git   ← один репо с исходниками всех модулей
```

```
dsp-dist/
├── core/       @ v1.0.0  (скопировано из workspace)
├── spectrum/   @ v1.0.0
├── linalg/     @ v1.0.0
└── CMakeLists.txt         (обёртка: add_subdirectory для каждого)
```

Project 2:
```bash
git clone git@smi100.local:dist/dsp-dist.git
cmake -S dsp-dist -B build
```

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| Project 2: один clone, нет submodules | Требует Вариант 2 как основу |
| Нет зависимости от сети при сборке | dist-репо = копия → дублирование |
| Простая команда для пользователя | Нет истории отдельных модулей в dist |
| — | При обновлении тега — пересобирать весь dist |
| — | Патч из 2→0: нужен relay (история размыта) |

---

## Вариант 4 — Копии папок ❌ АБСУРД

**Описание**: Из SMI100 в Project 2 летят просто директории (rsync/архив). Без git истории.

```
rsync -av smi100:/workspace/core/ localproject/core/
```

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| Предельная простота доставки | Нет git истории → нельзя diff, blame, revert |
| 100% автономность Project 2 | Патч обратно в 0 — крайне неудобно |
| — | Версионирование только вручную (README) |
| — | Обновление = полная перезапись |
| — | Конфликты при правках непрозрачны |

> ⚠️ Практический сценарий патча 2→0: `git diff > patch.txt` → передать файлом → применить вручную в DSP-GPU. Работает, но болезненно.

---

## Вариант 5 — Dist-репо из bare mirrors ✅

**Описание**: Берём BASE (Вариант 1, bare mirrors) и добавляем скрипт сборки dist-репо. Без полного workspace на SMI100. Python тесты не включаем.

```
SMI100/mirrors/core.git  (bare)
               spectrum.git
               linalg.git
        │
        └─ build_dist.sh   ← git archive + сборка dist
               │
               ▼
SMI100/dist/dsp-dist.git   ← единый репо для Project 2
```

**Скрипт build_dist.sh**:
```bash
#!/usr/bin/env bash
# Собирает dist-репо из bare зеркал
DIST=/srv/smi100/dist/dsp-dist
MIRRORS=/srv/smi100/mirrors
TAG=v1.0.0
MODULES="core spectrum linalg"  # управляемый список

git -C $DIST checkout --orphan dist-$TAG 2>/dev/null || true

for mod in $MODULES; do
    git --git-dir=$MIRRORS/$mod.git archive $TAG \
        | tar -x -C $DIST/$mod/
    echo "  + $mod @ $TAG"
done

git -C $DIST add -A
git -C $DIST commit -m "dist: $TAG — $MODULES"
git -C $DIST tag -f dist-$TAG
```

Project 2:
```bash
git clone git@smi100.local:dist/dsp-dist.git
cmake --preset from-dist   # пресет: SOURCE_DIR = локальные папки
```

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| Один clone для Project 2 | dist-репо = snapshot, не living history |
| Не нужен полный workspace на SMI100 | Патч 2→0: relay через SMI100, чуть сложнее |
| Легче чем Вариант 3 (нет build env) | — |
| Управляемый список модулей в скрипте | — |
| Версионирование: тег `dist-v1.0.0` | — |
| Сочетается с Вариантом 1 (bare mirrors те же) | — |

---

## 🎯 Итоговая рекомендация

```
Для разработки (команда):   Вариант 1 (BASE)
Для проверки сборки:        Вариант 2 (+workspace)
Для конечного пользователя: Вариант 5 (dist из bare)
```

**Оптимальная комбинация**: Вариант 1 + Вариант 5 параллельно.
SMI100 держит bare mirrors (для разработчиков через submodules)
и dist-репо (для конечных пользователей — один clone и готово).

---

## 🔮 Следующий вопрос: GPU под разные платформы

Нерешённый вопрос: DSP-GPU = ROCm/gfx1201, SMI100 и LocalProject = другие карты.
→ Решается через GPU-ось в CMakePresets.json (следующий файл `3_gpu_presets.md`).

---

*Created: 2026-04-18 | Version: BASE v1.0 | Author: Кодо + Alex*
