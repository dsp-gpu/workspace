# Сравнение: cmake_git_aware_build.md (v2, 2026-04-13) ↔ cmake_git_distribution_spec_2026-04-18.md

> **Цель**: понять как два документа соотносятся — дополняют ли они друг друга, пересекаются или противоречат. Составить план синхронизации.
>
> **Дата**: 2026-04-18 | **Автор**: Кодо
> **Методика**: Sequential-thinking + Context7 + web research — уже применены в обоих исходных документах

---

## 📋 TL;DR — они дополняют друг друга, не замещают

- **`cmake_git_aware_build.md` (2026-04-13, v2, ОДОБРЕН)** = **build механика** внутри одной машины (как CMake узнаёт об изменениях в git и пересобирает)
- **`cmake_git_distribution_spec_2026-04-18.md` (2026-04-18, DRAFT)** = **distribution pipeline** между машинами (как проверенный код доходит из Zone 0 в Zone 2 через SMI100)

**Они покрывают разные слои одной системы.** Старая спека — про «что происходит когда мы уже дома», новая — про «как доставить домой». Противоречий нет, но новая должна **явно переиспользовать** Layer 1/2 из старой.

---

## 🗂️ 1. Scope каждого документа

### `cmake_git_aware_build.md` (старая, v2)

**Покрывает**:
- Layer 1 — `version.cmake` в каждом из 8 модулей с early-return при неизменном git HEAD
- Layer 2 — `CMAKE_CONFIGURE_DEPENDS` на `.git/index` + `.git/FETCH_HEAD` → ninja автоматически запускает `cmake reconfigure` при `git pull`
- Dependency guards — `FATAL_ERROR` при нарушении графа (spectrum без core и т.д.)
- Diamond dependency — first-declare-wins через `FetchContent_MakeAvailable`
- Git worktree support (если `.git` — файл)
- Zero-rebuild при неизменном коде (через `copy_if_different` + early-return hash compare)

**Не покрывает**:
- Как код доходит до закрытого сервера (транспорт — упомянут абстрактно как «Уровень 3»)
- Распределение на **несколько** независимых LocalProject
- Версионирование релизов, promotion-процесс
- Reproducibility старых релизов через полгода
- Config.cmake.in с `write_basic_package_version_file`
- Патч-флоу из Zone 2 обратно в Zone 0
- SSH / ACL инфраструктура

### `cmake_git_distribution_spec_2026-04-18.md` (моя новая, draft)

**Покрывает**:
- 3 зоны: public github → smi100_*.git (promotion) → SMI100 → N × LocalProject
- `smi100_*.git` как release-only репо (отдельные от публичных)
- `promote_to_smi100.sh` + `promote_breaking_change.sh` (ручной атомарный перенос)
- `dsp_modules.json` манифест + генератор (single source of truth)
- `deps_state.json` pipeline → reproducibility через коммит SHA
- `Config.cmake.in` + `write_basic_package_version_file` → понятные CMake-ошибки вместо линкерных
- Dev-preset для правок в `../module-dev/` (переживает clean build)
- Patch_Flow для редких правок из Zone 2
- SSH setup для SMI100
- 7 фаз с timeline

**Не покрывает** (подразумевает из старой спеки):
- ⚠️ Layer 1 `version.cmake` — упомянут как «переиспользуем», но без деталей
- ⚠️ Layer 2 `CMAKE_CONFIGURE_DEPENDS` — **не упомянут**, но **нужен** для dev-preset
- ⚠️ Git worktree support — не упомянут

---

## 🔄 2. Пересечения и переиспользования

| Компонент | Old (v2) | New (draft) | Статус |
|-----------|----------|-------------|--------|
| `version.cmake` с early-return + MODULE_PREFIX | ✅ детально описан, **в проде** | ✅ упомянут «как есть» | **Переиспользуем без изменений** |
| `copy_if_different` / zero-rebuild | ✅ центральный принцип | ✅ подразумевается | Переиспользуем |
| Diamond dependency (first-declare-wins) | ✅ есть | ✅ есть (в дизайне sync-promotion) | Совпадение |
| Graph зависимостей модулей | ✅ hardcoded в fetch_deps.cmake | ✅ через `dsp_modules.json` | **Эволюция** — новый подход |
| Dependency guards FATAL_ERROR | ✅ hardcoded 7 блоков | ✅ генерируются из манифеста | **Эволюция** |
| FETCHCONTENT_SOURCE_DIR_DSP* | ✅ для local-dev режима | ✅ для dev-preset | Совпадение |
| Namespace macros (DSPCORE_*) | ✅ в version.h | ✅ (не упомянут отдельно, берётся из v2) | Переиспользуем |
| `BUILD_TIMESTAMP` **удалён** | ✅ исправлено в v2 | — (и не должен возвращаться) | Политика |

---

## ⭐ 3. Что ДОБАВЛЯЕТ новая спека (уникальное)

1. **Zone-модель (0/1/2)** вместо «3 уровня транспорта» — явное разделение dev / transit / consumer
2. **`smi100_*.git`** как **отдельные release-only репо**, parallel к публичным (не зеркала!)
3. **Promotion pipeline** — Alex вручную продвигает только проверенные теги (scriptified)
4. **Атомарное промотирование** нескольких модулей при breaking change (`promote_breaking_change.sh`)
5. **N LocalProject** с разным `USE_DSP_*` составом — в старой спеке только ОДИН closed server
6. **Manifest `dsp_modules.json`** как SSOT (вместо hardcoded списка в 5+ местах)
7. **`Config.cmake.in` + `write_basic_package_version_file`** для понятных CMake-ошибок
8. **`deps_state.json` pipeline** для reproducibility через 6+ месяцев
9. **Dev-preset `zone2-dev-*`** — правишь модуль в соседней папке, clean build не трогает
10. **Patch_Flow** — 2 варианта (быстрая правка в `build/_deps/` и долгая через dev-mode)
11. **SSH / gitolite infrastructure** на SMI100 (старая спека не касается)
12. **7 фаз реализации** с оценкой времени

---

## 🔧 4. Что НЕДОРАБОТАНО в новой спеке (нужно добрать из старой)

### 4.1 Layer 2 — `CMAKE_CONFIGURE_DEPENDS` в dev-preset

**В старой спеке** (cmake_git_aware_build.md, строки 114-155):
```cmake
# DSP/CMakeLists.txt — отслеживает .git/index и .git/FETCH_HEAD
foreach(_mod ${_watch_modules})
    ...
    set_property(DIRECTORY APPEND PROPERTY
        CMAKE_CONFIGURE_DEPENDS "${_git_dir}/index")
endforeach()
```

**Зачем нужен в distribution spec**:
Когда LP работает в `zone2-dev-stats` preset (правит `../stats-dev/`), cmake должен **автоматически** среагировать на `git commit` в `stats-dev/` → пересобрать. Без Layer 2 придётся руками делать `cmake -B build` после каждого коммита в dev-папке.

**Действие**: добавить в компонент C8 (CMakePresets + Layer 2 integration) в новый spec.

### 4.2 Git worktree support

**В старой спеке** (строки 135-145): проверка `IS_DIRECTORY "${_dir}/.git"` vs `EXISTS` — если `.git` это файл (worktree), читать `gitdir:` ссылку.

**Зачем**: если Alex когда-нибудь переключится на git-worktree setup для DSP-GPU, код не должен сломаться.

**Действие**: упомянуть в новом spec (компонент C8) как «обязательное условие для Layer 2».

### 4.3 Zero-rebuild guarantee — проверить что не поломан

**Старая спека** это **центральный принцип**: «hash не изменился → файл не тронут → NO rebuild».

**Моя новая спека** в ряде мест может **незаметно** его нарушить:
- Если `deps_state.json` содержит timestamp `"updated": "2026-04-18T..."` — при `cmake reconfigure` CMake прочитает его как «изменение» → configure запустится. Но **сам файл** не попадёт в бинарь → rebuild может не случиться.
- Но: если `fetch_deps.cmake` вызывает `file(READ deps_state.json)` → CMake добавляет файл в `CMAKE_CONFIGURE_DEPENDS` автоматически → при изменении timestamp CMake reconfigure.

**Тест для фазы 2**: внести косметическое изменение в `deps_state.json` (только timestamp) → убедиться что `cmake --build` **не пересобирает** код (zero-rebuild сохранён).

**Действие**: добавить в DoD Фазы 2: «verify zero-rebuild when only `deps_state.json` timestamp changes».

### 4.4 Dependency guards — перенести формулировки

Старая спека даёт **готовый код** 7 блоков `FATAL_ERROR`. В новой я упомянула что генерируются из манифеста, но не дала шаблон.

**Действие**: в C2 (генератор `fetch_deps.cmake`) добавить секцию «dependency guards» с генерируемым blueprint:

```cmake
# Generated from dsp_modules.json:
if(USE_DSP_SPECTRUM AND NOT USE_DSP_CORE)
    message(FATAL_ERROR "[DSP] spectrum requires USE_DSP_CORE=ON")
endif()
# ... (7 таких блоков)
```

---

## ❌ 5. Противоречия? — НЕТ

Проверила sequential-thinking-ом все пункты — прямых противоречий **нет**. Есть только **терминологический сдвиг**:

| Понятие | Old (v2) | New (draft) | Совпадает? |
|---------|----------|-------------|-----------|
| Публичная разработка | «Уровень 2 (GitHub)» | «Zone 0» | ✅ |
| Транспорт/шлюз | «Уровень 3 (Промежуточный)» | «Zone 1 (smi100_*.git)» | ✅ (уточнено) |
| Закрытый сервер | «Уровень 1» | «Zone 1 (SMI100) + Zone 2 (N×LP)» | ⚠️ **расширено** |
| local-dev сборка | `debian-local-dev` с `FETCHCONTENT_SOURCE_DIR_*` | `zone2` + `zone2-dev-*` presets | ✅ (то же самое, другое имя) |
| Version.cmake | «Слой 1» | «переиспользуем из v2» | ✅ |
| CMAKE_CONFIGURE_DEPENDS | «Слой 2» | **не упомянут** | ⚠️ Нужно добавить |

**Главное различие терминологии**: старая спека говорит о **одном** закрытом сервере (где живёт всё), новая — **распределяет** на SMI100 + N LocalProject. Это **расширение модели**, не противоречие.

---

## 📊 6. Итоговая матрица

| Критерий | `cmake_git_aware_build.md` v2 | `cmake_git_distribution_spec.md` | Вывод |
|----------|-------------------------------|---------------------------------|-------|
| Дата / Статус | 2026-04-13 / ОДОБРЕН | 2026-04-18 / DRAFT | — |
| Scope | Build механика (1 машина) | Distribution (N машин) | Дополняют |
| Layer 1 (version.cmake) | ✅ Детально | ⚠️ Упомянут, без деталей | Переиспользуем |
| Layer 2 (CMAKE_CONFIGURE_DEPENDS) | ✅ Код готов | ❌ Пропущено | **Добавить в новый** |
| Dependency guards | ✅ Hardcoded | ✅ Из манифеста | Эволюция |
| Diamond dependency | ✅ | ✅ | Совпадение |
| Git worktree support | ✅ | ❌ | **Добавить в новый** |
| Zero-rebuild guarantee | ✅ Центральный принцип | ⚠️ Подразумевается | **Добавить тест в DoD** |
| Distribution / Promotion | ❌ | ✅ | Уникальное |
| Reproducibility | ❌ | ✅ | Уникальное |
| Config.cmake + version | ❌ | ✅ | Уникальное |
| Manifest (SSOT) | ❌ | ✅ | Уникальное |
| Patch Flow | ❌ | ✅ | Уникальное |
| SSH infrastructure | ❌ | ✅ | Уникальное |

---

## 🎯 7. Рекомендация

### 7.1 Обновить новую спеку — 3 правки

1. **Ссылаться явно на `cmake_git_aware_build.md` v2** как на источник Layer 1/2.
2. **Добавить Layer 2 в компонент C8** (CMakePresets) — CMAKE_CONFIGURE_DEPENDS для dev-preset.
3. **Добавить git worktree support** в C8 (5 строк).
4. **Добавить в DoD Фазы 2 тест**: «verify zero-rebuild при косметическом изменении deps_state.json».

### 7.2 Не трогаем старую спеку

`cmake_git_aware_build.md` v2 **уже одобрена и в проде**. version.cmake уже использует её паттерны. Не переписываем.

### 7.3 Новая спека = продолжение старой

В глазах MemoryBank это **преемственность**:
```
2026-04-13  cmake_git_aware_build.md v2           [APPROVED, в проде]
            ↑
            Layer 1/2, dependency guards, one closed server
2026-04-18  cmake_git_distribution_spec.md draft  [ON REVIEW]
            ↑
            Добавляет distribution механику к существующему base'у
```

Если старую спеку переименовать в `cmake_git_phase1_build.md`, а новую — в `cmake_git_phase2_distribution.md` — это подсветит связь. Но не обязательно.

### 7.4 План применения правок 7.1

В `cmake_git_distribution_spec_2026-04-18.md`:

- **Раздел 2.2 (Терминология)** — добавить ссылку: *"Layer 1 / Layer 2 см. cmake_git_aware_build.md v2 — переиспользуются без изменений"*
- **Раздел 3, компонент C8 (CMakePresets)** — добавить под-секцию:

  ```markdown
  #### C8.2 Layer 2 — CMAKE_CONFIGURE_DEPENDS (из v2 спеки)

  Для dev-preset копируем механизм из cmake_git_aware_build.md v2 строки 114-155.
  Отслеживает `.git/index` + `.git/FETCH_HEAD` в `${FETCHCONTENT_SOURCE_DIR_*}`
  → ninja автоматически делает reconfigure при git pull в dev-папке.

  Включает git worktree support (если `.git` — файл, а не директория).
  ```

- **Раздел 4, Фаза 2 (deps_state.json)** — добавить в DoD:
  ```markdown
  - [ ] **Zero-rebuild тест**: изменить только `"updated": "..."` timestamp в deps_state.json,
        сделать `cmake --build` → объектники НЕ пересобираются (только configure-step)
  ```

- **Раздел 5 (Exit Criteria)** — добавить:
  ```markdown
  - [ ] Layer 1 + Layer 2 из cmake_git_aware_build.md v2 работают в связке с новой distribution pipeline
  ```

---

## 🔗 8. Референсы

- `E:\DSP-GPU\MemoryBank\specs\cmake_git_aware_build.md` — v2, 2026-04-13, approved
- `E:\DSP-GPU\MemoryBank\specs\cmake_git_aware_build_REVIEW.md` — ревью первой версии, применён
- `E:\DSP-GPU\MemoryBank\specs\cmake_git_distribution_spec_2026-04-18.md` — новая спека, draft
- `MemoryBank/.architecture/CMake-GIT/Review_VariantA_Kodo_2026-04-18.md` — исходное обсуждение
- [CMake CMAKE_CONFIGURE_DEPENDS](https://cmake.org/cmake/help/latest/prop_dir/CMAKE_CONFIGURE_DEPENDS.html) — Layer 2 механизм
- [CMake FetchContent SOURCE_DIR override](https://cmake.org/cmake/help/latest/module/FetchContent.html) — dev-preset
- Существующий prod-код: `linalg/cmake/version.cmake`, `DSP/CMakeLists.txt` (Layer 2 должен быть там)

---

## 📝 9. Changelog

| Дата | Изменение |
|------|-----------|
| 2026-04-18 | Первая версия — анализ соотношения двух специй |

*Author: Кодо | Sequential-thinking применено к структурному сравнению | Context7 не потребовался (внутренний analysis)*
