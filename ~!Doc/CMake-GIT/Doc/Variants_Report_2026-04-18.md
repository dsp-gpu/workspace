# Обзор всех обсуждавшихся вариантов архитектуры

> **Цель документа**: свести в одном месте все рассмотренные варианты построения pipeline `DSP-GPU → SMI100 → LX_x`, с короткими тезисами +/- и с новым требованием — **возможность получить полный клон LX_x и собрать на другом компе без интернета**.
>
> **Дата**: 2026-04-18 | **Автор**: Кодо + Alex (свод обсуждений)
> **Входные документы**: `1_…6_*.md`, `Review_VariantA_*.md`, `update_dsp.py`, CMake/Version/
> **Статус**: черновик для обсуждения — только оглавление + тезисы, детали разворачиваем по выбору

---

## 🎯 Напоминание условий задачи

```
DSP-GPU      (ПК Alex)           — есть интернет + github
             │
             │ локальная сеть
             ▼
SMI100       (промежуточный)     — НЕТ интернета, локальная сеть, раздаёт исходники
             │
             │ локальная сеть
             ▼
LX_x         (конечный клиент)    — НЕТ интернета, может жить без SMI100 после клонирования
```

**Три требования**:
1. R-normal — LX_x собирается из SMI100 (обычный workflow)
2. R-offline — LX_x можно скопировать целиком на **другой ПК без интернета и без SMI100** и собрать там (**НОВОЕ требование**)
3. R-patches — из LX_x можно редко вернуть правки в DSP-GPU через SMI100

---

## 📑 Оглавление вариантов

| # | Название | Источник | Статус |
|---|---------|---------|--------|
| V1 | **BASE** — bare mirrors + submodules + FetchContent override | `1_`/`2_` | Обсуждён |
| V2 | **Full workspace** — SMI100 с полным checkout + сборкой | `2_` | Обсуждён |
| V3 | **Dist из workspace** — из рабочего дерева собирать dist-repo | `2_` | ⚠️ Тяжёлый |
| V4 | **Копии папок (rsync)** — без git вообще | `2_` | ❌ Отвергнут |
| V5 | **Dist из bare** — bare mirrors + скрипт собирает dist | `2_` | Обсуждён |
| V6 | **Release Repo** — один монорепо живых релизов | `5_` | Обсуждён |
| V7A | **Отдельный git per модуль** на SMI100 | `6_` | ✅ **Выбран как база** |
| V7B | **Aggregated bundle** per LocalServer | `6_` | Обсуждён |
| V7C | **Уникальный git per LocalServer** | `6_` | ❌ Отвергнут |
| V8 | **Наш текущий Distribution Spec** — Zone 0/1/2 + `smi100_*.git` + promotion | `cmake_git_distribution_spec_2026-04-18.md` | ✅ **Текущий дизайн** |
| V9 | **Vendored deps** (умная мысль Кодо) — LX_x содержит папку `vendor/` с исходниками всех deps | новый | 💡 под R-offline |
| V10 | **Git bundle** (умная мысль Кодо) — один `.bundle` файл со всеми репо | новый | 💡 под R-offline |
| V11 | **Tarball snapshot** (умная мысль Кодо) — архив `.tar.gz` с исходниками | новый | 💡 под R-offline |

---

## V1 — BASE: bare mirrors + submodules + FetchContent

**Тезис**: на SMI100 лежат N пустых bare-репо. LX_x через `git clone --recurse-submodules` + CMake `FetchContent_Declare` с локальным `FETCHCONTENT_SOURCE_DIR_*` override тянет нужные модули.

**📖 Простыми словами**: представь SMI100 как шкаф-каталог в библиотеке. В каталожных ящиках (bare-репо) лежат только карточки — указатели «какой тег, какой коммит». Сами книги (исходники) материализуются только когда LX_x приходит и говорит «хочу всё вот по этим карточкам». Лёгкий шкаф на SMI100, но каждый запрос LX_x = отдельный поход к карточке + выдача книги. Минималистично, но в LX_x попадает «тетрадь submodules» (`.gitmodules`), которая лично меня (и Alex-а) раздражает.

**Взаимодействие**:
```
DSP-GPU  --push tag-->  SMI100/mirrors/*.git  --clone + submodule update-->  LX_x
```

**+**:
- Минимальное место на SMI100 (bare = delta)
- Версии модулей независимы
- Patch flow через relay-ветки
- Чистая изоляция зон

**−**:
- На SMI100 файлы нельзя читать напрямую (bare)
- Submodule update — ручная операция
- `.gitmodules` в LX_x-репо (загрязнение)

**R-offline**: ⚠️ частично — после `git clone --recurse-submodules` папка самодостаточна, но содержит `.git` внутри `deps/` которые ссылаются на SMI100 origin. Можно перенести на другой ПК только если оставить submodule-checkout (без git fetch).

---

## V2 — Full workspace: SMI100 с полным checkout

**Тезис**: SMI100 держит и bare mirrors (для транспорта), и полный workspace с живыми checkout-ами (для чтения / сборки / тестов прямо на SMI100).

**📖 Простыми словами**: то же что V1, но теперь в библиотеке есть ещё **читальный зал**. SMI100 не просто шкаф с карточками — это ещё и рабочие места, где сотрудник (сам SMI100) может полистать книги, собрать чертёж (build), убедиться что всё сходится, прежде чем LX_x за книгами придёт. Занимает в два раза больше места на диске (шкаф + читальный зал), зато ловит большинство проблем до того как LX_x начнёт жаловаться.

**Взаимодействие**:
```
DSP-GPU --push--> SMI100/mirrors/ --post-receive hook--> SMI100/workspace/ (checkout)
                                                            └── сам собирает + тестирует
LX_x --FetchContent--> SMI100/workspace/ (через SSH / HTTP)
```

**+**:
- SMI100 может сам собирать — валидация перед тем как LX_x потянет
- Файлы читаются/смотрятся
- Python-примеры работают прямо на SMI100

**−**:
- SMI100 нужен build toolchain (CMake + ROCm/HIP)
- Больше места на диске (bare + workspace = 2×)

**R-offline**: то же что V1 — зависит от того как LX_x получил код.

---

## V3 — Dist из workspace

**Тезис**: надстройка над V2 — скрипт `build_dist.sh` собирает из workspace отдельный монорепо `dsp-dist.git` (без Python тестов, без MemoryBank). LX_x тянет **один** репо.

**📖 Простыми словами**: в библиотеке из V2 сотрудник периодически сшивает **антологию** — один толстый том, в который вошли только нужные главы из всех книг. LX_x больше не бегает по шкафу за восемью книгами — он берёт один том и уходит счастливый. Минус: антология — это снимок на момент сшивания, отдельных «кто и когда правил главу» внутри неё больше нет; чтобы обновить — надо пересшивать том.

**Взаимодействие**:
```
github.com/dsp-gpu/*                          SMI100
         │                                    ┌──────────────────────────────────┐
         │  git push (tag)                    │  mirrors/*.git (bare, как в V2)  │
         ▼                                    │            │                     │
  Alex local ─── git push smi100 ─────────────┼─► workspace/*/ (live checkout)   │
                                              │            │                     │
                                              │    build_dist.sh (on-tag hook)   │
                                              │            │                     │
                                              │            ▼                     │
                                              │  dsp-dist.git (монорепо снимок)  │
                                              └──────────────┬───────────────────┘
                                                             │
                                              LX_x ◄─────────┘  single git clone
                                                                 cmake --build
```

**+**:
- LX_x делает один `git clone` — проще
- Нет submodules в LX_x

**−**:
- Требует V2 как основу
- dsp-dist = снапшот, история отдельных модулей теряется
- При обновлении — пересобирается весь dist
- Patch flow сложнее (relay через dist)

**R-offline**: ✅ — dsp-dist монорепо полностью самодостаточен. Один clone → другой ПК без интернета → сборка.

---

## V4 — Копии папок (rsync) ❌

**Тезис**: из SMI100 в LX_x файлы копируются `rsync`-ом без git вообще.

**📖 Простыми словами**: берём весь шкаф с книгами, делаем **фотокопию** всех страниц стопкой, скотчем обматываем и отправляем LX_x. Быстро, просто, работает. Но: нет истории «кто когда что исправил», нет возможности сделать `git blame` или `git revert`, патч обратно в Zone 0 — это руками через `diff`. Для серьёзной инженерной работы не годится.

**Взаимодействие**:
```
SMI100 /srv/sources/core/, spectrum/, ...        LX_x
          │                                      ~/LX_x/deps/
          │                                          ├── core/      ┐
          │   rsync -avz --delete (LAN)             │   └── *.hpp    │ просто
          ├─────────────────────────────────────►   ├── spectrum/   │ файлы,
          │                                          │   └── *.hpp    │ никакого
          │                                          └── ...          ┘ .git
          │
   патч обратно: ручной  diff -ruN оригинал править.hpp > my_patch.txt
                         → передать Alex по почте / SFTP
```
- Простая доставка

**−**:
- Нет git-истории → нельзя diff / blame / revert
- Версионирование только через README
- Патч обратно — `git diff > patch.txt` вручную

**R-offline**: ✅ теоретически (обычная папка), но без git неудобно. Отвергнут.

---

## V5 — Dist из bare mirrors

**Тезис**: аналог V3, но `build_dist.sh` использует `git archive` из bare mirrors (без полного workspace на SMI100). Легче чем V3.

**📖 Простыми словами**: та же антология, что в V3, но сшивается напрямую из шкафа-каталога, без читального зала. `git archive` вытягивает нужные страницы по тегу прямо из bare-репо — не нужно держать на SMI100 полные рабочие копии. Библиотеке достаточно шкафа и одного переплётного стола. Для LX_x разницы нет — тот же один том. Для SMI100 — в 2 раза меньше места на диске и не нужен build-toolchain.

**Взаимодействие**:
```
DSP-GPU --push tag--> SMI100/mirrors/*.git (bare)
                                 │
                           build_dist.sh (git archive)
                                 ▼
                      SMI100/dist/dsp-dist-v1.0.0.git (один repo)
LX_x --clone--> SMI100/dist/dsp-dist-v1.0.0.git
```

**+**:
- SMI100 не нужен build toolchain
- LX_x — один clone
- Лёгкое тиражирование версий (tag = dist-v1.0.0)
- Готовые snapshots на SMI100

**−**:
- dsp-dist удваивается (hip + opencl ветки)
- Patch flow через relay в mirror

**R-offline**: ✅ — LX_x клонировал dsp-dist → всё внутри → можно перенести.

---

## V6 — Release Repo (живой)

**Тезис**: Alex ведёт **один живой репо** `dsp-release`, каждый коммит = атомарный релиз с определённым набором версий модулей. SMI100 его зеркалит. LX_x через FetchContent тянет по тегу.

**📖 Простыми словами**: Alex ведёт один **журнал выпусков** — как книгу «Издания за квартал»: каждая запись в журнале = «в этом релизе core v1.2.0, spectrum v1.1.0, stats v1.0.3, и всё это вместе проверено». Ни один модуль сам по себе не живёт — только в составе выпуска. Подписчик (LX_x) берёт «выпуск v1.2.0» и получает целостный набор. Очень дисциплинированно, но менее гибко: если одной команде нужен только core, а они не хотят обновляться в spectrum — придётся тянуть выпуск целиком либо собирать свой.

**Взаимодействие**:
```
DSP-GPU --Alex вручную компонует--> dsp-release.git (на ПК Alex)
                                             │
                                     git push --> SMI100
                                             │
                                   LX_x -- FetchContent --> SMI100/dsp-release.git @ v1.2.0
```

**+**:
- Один репо на SMI100 вместо N
- LX_x: один clone, без submodules
- Атомарный релиз (все версии связаны)
- `RELEASE_NOTES.md` внутри — документация автоматом
- Alex полный контроль над релизом

**−**:
- Две истории: DSP-GPU/* и dsp-release (размывается история)
- Каждый релиз Alex компонует вручную (скриптом, но его запуск)
- Репо растёт линейно (каждый commit = полный snapshot)
- При обновлении тега LX_x меняет одну строку в preset

**R-offline**: ✅ — один clone → всё внутри.

---

## V7A — Отдельный git per модуль ✅ (выбрано)

**Тезис**: каждый модуль на SMI100 — свой git. LX_x через CMake + `USE_DSP_*` переключатели подключает только нужные. Состав определяется пресетом в LX_x.

**📖 Простыми словами**: вместо одной большой библиотеки — **восемь отдельных специализированных складов**: «склад core», «склад spectrum», «склад stats» и т.д. Каждая команда LX_x сама пишет заказ: «мне нужны склады core + spectrum, stats не нужен». Доставщик (FetchContent) едет только по нужным складам. Новый модуль = открыли девятый склад, ничего не сломалось. Каждый склад живёт своей жизнью — на core v1.5 уже запускается v1.6, а linalg спокойно держит v0.3. Это именно **тот дизайн**, на котором мы остановились.

**Взаимодействие**:
```
DSP-GPU -> SMI100/core.git, spectrum.git, linalg.git, ...
                  │
LX_x -- FetchContent на включённые модули --> нужные репо
```

**+**:
- Один набор репо на SMI100 — все LX_x из них
- Каждый модуль независимо версионируется
- Масштаб: +1 модуль = +1 строка в cmake (с манифестом)
- Нет дублирования на SMI100
- Транзитивные зависимости через FetchContent автоматом

**−**:
- LX_x пользователь должен знать какие модули ему нужны
- Совместимость версий — ответственность Alex
- Patch flow — через отдельные incoming репо на SMI100

**R-offline**: ⚠️ сложнее — LX_x состоит из своего кода + `build/_deps/` (который снесётся при clean build). Без спец-механики self-contained не сделать.

---

## V7B — Aggregated bundle per LocalServer

**Тезис**: Alex на SMI100 для конкретного сервера (LX_A, LX_B) формирует отдельный **bundle-репо** с проверенной комбинацией модулей.

**📖 Простыми словами**: как V6 (журнал выпусков), но **свой выпуск для каждой команды**. Для LX_A Alex собрал «корзину А» — в ней ровно их набор модулей нужных версий, проверено, подписано. Для LX_B — «корзина B», под их задачи. Команда LX_A тянет свою корзину одним `git clone`, никто не думает о зависимостях. Минус: если появилось 5 команд — 5 корзин, и в каждой свой `core` (дублирование); security-фикс core — 5 корзин надо перепаковать.

**Взаимодействие**:
```
SMI100/core.git + spectrum.git + ...  
        └──bundle_update.sh──► SMI100/localserver_A.git (один монорепо для LX_A)
LX_A -- single clone --> SMI100/localserver_A.git
```

**+**:
- LX_A — один clone, предельно просто
- Гарантированные совместимые версии в bundle
- LX_A не думает о составе зависимостей
- `git pull` — один

**−**:
- Alex делает bundle для каждого сервера
- При N серверах = N bundle-репо (растут)
- Дублирование: core в каждом bundle
- Patch flow сложнее (через bundle)

**R-offline**: ✅ — bundle-репо самодостаточен.

---

## V7C — Уникальный git per LocalServer ❌

**Тезис**: каждый LX_x имеет свой уникальный набор модулей и уникальные версии, все разные.

**📖 Простыми словами**: для каждой команды — **свой личный склад с копией всех модулей**, которые никак не связаны со складами других команд. Совсем никак. Каждая правка core = сходить в склад LX_A, скопировать; сходить в склад LX_B, скопировать; …в склад LX_N. Прибегать с фиксом в N мест вручную. 5 команд × 8 модулей = 40 репо, каждый живёт своей жизнью. Быстро превратится в болото, где никто не знает, где «настоящий» core. Поэтому **отвергнут**.

**Взаимодействие**:
```
                    ┌──► smi100/LX_A_core.git    (копия, жизнь у LX_A)
                    ├──► smi100/LX_A_spectrum.git
                    ├──► smi100/LX_A_stats.git   ... × все модули для A
                    │
  Alex вручную ─────┼──► smi100/LX_B_core.git    (ДРУГАЯ копия для B)
  каждой команде    ├──► smi100/LX_B_spectrum.git
  отдельно          ├──► smi100/LX_B_stats.git   ... × все модули для B
                    │
                    ├──► smi100/LX_N_*           ... (× N команд)
                    
   security-fix core → Alex лазает во все N копий руками → 🔥 кошмар
```

**+**:
- Полная изоляция серверов

**−**:
- N серверов × M модулей = экспоненциальный overhead
- Нет единого источника правды
- Security fix = N ручных операций
- Кошмар поддержки

**Отвергнут** — решается правами на V7A без копирования.

---

## V8 — Текущий Distribution Spec (наш выбор)

**Тезис**: развитие V7A с явными `smi100_*.git` репо (отдельные от public github), promotion pipeline Alex-ом, FetchContent с GIT_REMOTE_UPDATE_STRATEGY CHECKOUT, deps_state.json для reproducibility, Config.cmake для внятных ошибок версий, dev-режим для правок.

**📖 Простыми словами**: V7A + аккуратная **витрина с паспортами**. На склады попадает **только проверенный товар** (Alex сам решает что промотировать — не зеркало github), у каждого склада висит паспорт производителя (`Config.cmake` — если версии несовместимы, CMake скажет об этом внятно, не загадочной ошибкой линкера), в LX_x ведётся **журнал отгрузок** (`deps_state.json` — точные SHA, что именно сейчас используется). Через полгода клиент говорит «у меня глючит» — вы по журналу восстанавливаете сборку тех же дней до коммита. Это основа действующего дизайна `cmake_git_distribution_spec_2026-04-18.md`.

**Взаимодействие**:
```
github.com/dsp-gpu/*  (public, Mir A)
        │  promote_to_smi100.sh (Alex вручную промотирует проверенные теги)
        ▼
E:\DSP-GPU\smi100_*.git  (release-only копии на ПК Alex)
        │  git push (локальная сеть)
        ▼
SMI100/smi100_*.git  (Zone 1)
        │  FetchContent по локальной сети
        ▼
LX_1, LX_2, ..., LX_N  (Zone 2)
    • clean build каждый раз
    • deps_state.json коммитится → reproducibility
    • dev-preset для правок в ../module-dev/
```

**+** (сверх V7A):
- Reproducibility через deps_state.json
- Понятные CMake-ошибки (Config.cmake + write_basic_package_version_file)
- Dev-preset — правки переживают clean build
- Manifest `dsp_modules.json` — SSOT для масштабирования
- Patch flow задокументирован

**−**:
- 7 фаз реализации (не моментально)
- SSH infra на SMI100 нужна
- R-offline **не решён** в явном виде — требуется доп. механизм (см. V9-V11)

**R-offline**: ⚠️ **не решён** — LX_x без интернета потеряет возможность refetch. Нужна надстройка.

---

## V9 — Vendored deps (💡 умная мысль → теперь ОСНОВНОЙ режим)

> 🆕 **Обновление 2026-04-19 от Alex**: V9 (vendored) — не экзотический режим под R-offline, а **основной способ работы LX_x-серверов**. Подробно описано в `Distributed_Modules_Guide_2026-04-19.md §4.3`. Обновление vendor/ с SMI100 — отдельный шаг (`update_dsp.py --sync`, cron / on-demand), сборка всегда локально из vendor/.

**Тезис**: в LX_x есть папка `vendor/` с **копией исходников** всех нужных модулей. CMake использует её как источник через `FETCHCONTENT_SOURCE_DIR_*`. Копия обновляется через скрипт `sync_vendor.sh`.

**📖 Простыми словами**: LX_x держит **собственную копию всех нужных книг у себя**, прямо в своей папке `vendor/`. Когда инженер делает сборку — никуда не ходит, читает прямо со своей полки. Раз в день / по кнопке приходит «обновитель» (`update_dsp.py --sync`) — смотрит в шкаф SMI100, если там появилось новое издание — кладёт его на полку LX_x, старое заменяет. Главное: сборка и обновление — **два разных действия**. Сборка не трогает сеть вообще.

**Взаимодействие**:
```
SMI100 ---(git archive или rsync)---> LX_x/vendor/core/, vendor/spectrum/
LX_x/CMakeLists.txt: FETCHCONTENT_SOURCE_DIR_DSPCORE=vendor/core  → никаких сетевых запросов
```

**+**:
- **R-offline решено идеально** — LX_x можно скопировать на любой ПК, ничего не отвалится
- Прозрачность — исходники deps видны в LX_x
- Reproducibility автоматическая (код в git-репо LX_x)
- Не нужно держать SMI100 доступной после первого `sync`

**−**:
- LX_x репо вырастает (размер × N модулей) — ~300-500 МБ
- Обновление = копирование + git add -A (lot of churn)
- Нет автодетекции что на SMI100 вышла новая версия
- Правила Alex: «нельзя дублирование» — нарушается

**R-offline**: ✅ — **идеальное решение этого требования**.

**Когда применять**: когда R-offline критична. Как опциональный режим поверх V8 — например, скрипт `freeze_for_transfer.sh` превращает обычный LX_x в vendored snapshot.

---

## V10 — Git bundle (💡 умная мысль)

**Тезис**: вместо копирования папок — использовать `git bundle` для упаковки всего LX_x + всех deps в **один файл** `.bundle`. На другом ПК: `git clone my-project.bundle` → всё восстанавливается.

**📖 Простыми словами**: берём всю библиотеку **с её историей правок** и спрессовываем её в один плотный чемодан (`.bundle`). На другом компе открываешь чемодан — получаешь полноценную git-библиотеку со всеми коммитами, blame, diff, revert. Чемодан сам по себе довольно компактный (только дельта коммитов, не полные файлы каждого раза). Идеально для «унёс на флешке, восстановил на другой стороне», но сложнее чем просто архив — нужно знать про `git bundle unbundle`.

**Взаимодействие**:
```
ПК Alex / SMI100                                           Другой ПК (без SMI100)
     │
     ├─ git bundle create LX_x.bundle --all
     ├─ git -C core-dev bundle create core.bundle --all
     ├─ git -C spectrum-dev bundle create spectrum.bundle --all
     ├─ ...
     │
     └─ tar czf LX_x-portable.tar.gz *.bundle
                       │
                       │ USB / SFTP / rsync (не важно)
                       ▼
                                                    tar xzf LX_x-portable.tar.gz
                                                    git clone LX_x.bundle my-project
                                                    git -C deps/core bundle unbundle core.bundle
                                                    git -C deps/spectrum bundle unbundle spectrum.bundle
                                                    ...
                                                    cmake --preset zone2-from-bundle
                                                    cmake --build build ──► готово
```

**Команды**:
```bash
# На SMI100/LX_x:
git bundle create snapshot-v1.0.bundle --all                    # LX_x целиком
# + по каждому deps:
git -C ../core-dev bundle create core-v1.0.bundle --all
# Пакуем всё в tar:
tar czf LX_x-portable-v1.0.tar.gz *.bundle

# На другом ПК:
tar xzf LX_x-portable-v1.0.tar.gz
git clone snapshot-v1.0.bundle my-project
cd my-project
git -C deps/core bundle unbundle ../core-v1.0.bundle
# + FETCHCONTENT_SOURCE_DIR на deps/
cmake --preset zone2-offline-from-bundle
```

**+**:
- Компактно: `git bundle` = delta всех коммитов (не файлы)
- Полная git-история сохраняется
- Один файл на transfer → USB/SFTP/что угодно

**−**:
- Сложность: несколько bundle файлов + скрипт unbundle
- Каждому deps нужен свой bundle
- Не все пользователи знают про git bundle

**R-offline**: ✅ — решает.

**Когда применять**: когда transfer LX_x идёт через очень узкий канал (USB-стик) или нужна компактность.

---

## V11 — Tarball snapshot (💡 самое простое)

**Тезис**: один shell-скрипт `freeze_for_transfer.sh` делает snapshot LX_x целиком (код + vendor/ с deps) → `.tar.gz` → на другой ПК: распаковать → собирать.

**📖 Простыми словами**: делаем **моментальный срез** LX_x — всё, что сейчас есть (код + vendor/), упаковываем в обычный `.tar.gz` как папку. Отдаём клиенту: «вот архив, распакуй и собирай». Ни git, ни истории — просто исходники. Клиенту даже git на машине не нужен. Самый примитивный и самый понятный способ «отдать готовое». Минус: нет истории, каждое обновление = новый архив.

**Взаимодействие**:
```
ПК Alex / SMI100                                     Другой ПК у клиента
                                                     (без SMI100, без интернета, даже без git)
   freeze_for_transfer.sh:
     ├─ git archive LX_x        → tmp/src/
     ├─ git archive core        → tmp/vendor/core/
     ├─ git archive spectrum    → tmp/vendor/spectrum/
     ├─ git archive ...
     └─ tar czf LX_x-portable.tar.gz tmp/
                   │
                   │ USB / SFTP / почта
                   ▼
                                              tar xzf LX_x-portable.tar.gz
                                              cd LX_x-portable
                                              cmake --preset zone2-portable
                                              cmake --build build ──► готово
                                              (никаких git-команд вообще)
```

**Команды**:
```bash
# На SMI100 / ПК с LX_x:
./freeze_for_transfer.sh --output LX_x-portable-v1.0.tar.gz
  # внутри: git clone LX_x в tmp, git archive deps в tmp/vendor/, tar czf
  
# На другом ПК:
tar xzf LX_x-portable-v1.0.tar.gz
cd LX_x-portable-v1.0
cmake --preset zone2-portable    # использует vendor/
cmake --build build
```

**+**:
- **Предельно простой transfer** — один файл
- Никакого git требуется на target ПК
- Самодостаточно — ничего не качает
- Легко показать клиенту «вот архив, распакуй и собирай»

**−**:
- Нет git-истории на target ПК (только snapshot)
- Обновление = новый архив
- Размер больше чем bundle (нет delta)

**R-offline**: ✅ — самое простое решение.

**Когда применять**: для single-shot transfer (не для регулярных обновлений).

---

## 📊 Сводная сравнительная таблица

| Вариант | LX_x один clone? | SMI100 лёгкий? | Independent versions | R-offline (портативность) | Размер LX_x |
|---------|:---:|:---:|:---:|:---:|:---:|
| V1 BASE | ❌ submodules | ✅ bare | ✅ | ⚠️ | S |
| V2 Full workspace | ❌ submodules | ❌ build toolchain | ✅ | ⚠️ | M |
| V3 Dist из workspace | ✅ | ❌ | ⚠️ снапшот | ✅ | L |
| V4 Rsync (отвергнут) | n/a | ✅ | ❌ | ✅ (но без git) | L |
| V5 Dist из bare | ✅ | ✅ bare only | ⚠️ снапшот | ✅ | L |
| V6 Release Repo | ✅ | ✅ | ⚠️ атомарный релиз | ✅ | L (растёт) |
| **V7A/V8 наш выбор** | ⚠️ FetchContent | ✅ N×bare | ✅ | ⚠️ требует доп. механизма | S |
| V7B Aggregated | ✅ | ⚠️ N×bundle | ✅ фиксированные | ✅ | M |
| **V9 Vendored** | ✅ | ✅ (или любой источник) | ⚠️ фриз | ✅ **полностью** | L |
| **V10 Git bundle** | ✅ (через bundle) | ✅ | ✅ через bundle tags | ✅ | S (bundle) / L (unpacked) |
| **V11 Tarball snapshot** | ✅ (через archive) | ✅ | ⚠️ снапшот | ✅ **самое простое** | L |

---

## 🎯 Как R-offline связать с нашим V8

**V8 (текущий дизайн)** покрывает обычный workflow LX_x-через-SMI100, но **не** требование R-offline «копировать LX_x целиком на другой ПК без интернета».

**Варианты интеграции**:

### Option α — Добавить `freeze_for_transfer.sh` (V11) как утилиту поверх V8

Скрипт берёт LX_x + всё что в `build/_deps/` + `deps_state.json` → делает `git archive` каждого модуля → укладывает в `vendor/` → `tar czf`. На target ПК: распаковка + `cmake --preset zone2-portable` (новый preset с `FETCHCONTENT_SOURCE_DIR_*` = `vendor/*`).

✅ Не меняет основной дизайн, добавляет опцию.
✅ Применяется по требованию (не каждый день).

### Option β — Перейти на V5 / V6 как способ distribution (вместо V7A/V8)

dsp-dist из bare — один LX_x клонирует один репо, всё внутри, R-offline решается естественно.

⚠️ Требует перестройки текущего дизайна.

### Option γ — Сделать V8 + V9 (vendored) опциональным pre-seed

При первом `cmake --preset zone2` FetchContent кладёт deps в `build/_deps/`. Скрипт `promote_to_vendor.sh` копирует их в `vendor/` и коммитит в LX_x-репо. С этого момента LX_x → **vendored**, R-offline работает.

✅ Гибко — можно жить в обоих режимах.

---

## 💡 Умные мысли от Кодо (бонусом)

### M1 — Manifest `dsp_modules.json` полезен всем вариантам

Независимо от выбора V5/V6/V7A/V8, manifest модулей как SSOT — must-have. Из него можно генерить fetch_deps.cmake, список модулей для dist-bundle, vendor/sync script, dependency graph.

### M2 — Zero-rebuild из v2 спеки совместим со всеми вариантами

Layer 1 (version.cmake early-return) + Layer 2 (CMAKE_CONFIGURE_DEPENDS) работают одинаково хорошо в V7A, V5, V6, V9. Не нужно переделывать.

### M3 — R-offline не обязательно монолитный выбор

Можно иметь **два режима** одновременно:
- **Production mode** (V8) — LX_x тянет из SMI100, обновляется периодически
- **Transfer mode** (V11) — раз в квартал/по требованию собирается tarball-snapshot для клиентов у которых нет SMI100

Это покрывает R-normal + R-offline одним дизайном.

### M4 — Git bundle как backup-механизм

Независимо от основного pipeline — `git bundle` всех `smi100_*.git` каждую ночь → backup-архив. Если SMI100 умер, восстанавливается из bundle быстро. Это **бесплатная страховка**.

### M5 — SMI100 может сам делать `freeze` и класть готовые tarball-снапшоты

На SMI100 post-tag hook → `freeze_for_transfer.sh` → готовые архивы в `/srv/smi100/portable/LP_A-v1.0.tar.gz`. Пользователь не запускает скрипт, просто скачивает.

---

## 🔗 Источники

- `~!Doc/CMake-GIT/1_MultiProject_Architecture.md` — V1 (BASE)
- `~!Doc/CMake-GIT/2_Variants_Analysis.md` — V1-V5 + сводная
- `~!Doc/CMake-GIT/3_GPU_Architecture.md` — GPU ось (применяется ко всем)
- `~!Doc/CMake-GIT/4_Workflow_Scenarios.md` — потоки A/B/C + тиражирование
- `~!Doc/CMake-GIT/5_ReleaseRepo_Variant.md` — V6 (Release Repo)
- `~!Doc/CMake-GIT/6_Zone2_Access_Variants.md` — V7A/V7B/V7C
- `~!Doc/CMake-GIT/Review_VariantA_Kodo_2026-04-18.md` — детальный разбор V7A
- `MemoryBank/specs/cmake_git_distribution_spec_2026-04-18.md` — V8 (наш выбор)
- `MemoryBank/specs/cmake_git_aware_build.md` v2 — Layer 1/2 (совместимо со всеми)
- [CMake BundleUtilities](https://cmake.org/cmake/help/latest/module/BundleUtilities.html) — bundled self-contained apps
- [CMake Offline Build Discourse](https://discourse.cmake.org/t/cmake-offline-build-how-to-pre-populate-source-dependencies-in-the-build-tree/13173) — pre-populate deps
- [CPM Offline Issue #166](https://github.com/TheLartians/CPM.cmake/issues/166) — offline mode best practices
- [Apache Arrow Dependency Sources](https://arrow.apache.org/docs/developers/cpp/building.html) — AUTO/BUNDLED/SYSTEM pattern

---

## 📝 Следующие шаги (на выбор Alex)

- **A.** Разворачиваем подробно **один из V9/V10/V11** — чтобы выбрать финально какой способ R-offline делаем
- **B.** Обновляем `cmake_git_distribution_spec.md` — добавляем раздел «portable transfer mode» (Option α + V11)
- **C.** Создаём отдельный spec `portable_lx_transfer_spec.md` — чтобы R-offline было отдельным проектом
- **D.** Оставляем как есть, возвращаемся к cleanup и реализации V8

Что выбираем?

*Draft by: Кодо | На ревью Alex | Дата: 2026-04-18*
