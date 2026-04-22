# Ревью и план переработки `DSP-GPU/CLAUDE.md`

**Дата**: 2026-04-21
**Автор**: Кодо
**Статус**: Предложение на утверждение Alex
**Цель**: Привести `CLAUDE.md` в соответствие с best practices Anthropic/HumanLayer, устранить фактические ошибки, адаптировать под реальную структуру DSP-GPU (ROCm-only, Debian, модульная архитектура)

> ⚠️ **ВАЖНО**: Это только предложения. Сам `CLAUDE.md` без команды Alex **не трогаю**.

---

## 1. 📚 Что говорят best practices (официальные источники)

### Источники
- **Anthropic Claude Code — Memory**: https://code.claude.com/docs/en/memory
- **HumanLayer — Writing a good CLAUDE.md**: https://www.humanlayer.dev/blog/writing-a-good-claude-md
- **Anthropic teams usage (PDF)**: https://www-cdn.anthropic.com/58284b19e702b49db9302d5b6f135ad8871e7658.pdf

### Ключевые принципы

| # | Правило | Источник |
|---|---------|----------|
| 1 | **Размер ≤ 200 строк** (идеально ≤ 60) | Anthropic official |
| 2 | **CLAUDE.md грузится в КАЖДУЮ сессию** — раздутый файл расходует контекст и снижает adherence | Anthropic |
| 3 | **Progressive Disclosure**: основа в `CLAUDE.md`, детали — в отдельных файлах по `@import` | Anthropic + HumanLayer |
| 4 | **Специфичность**: "используй 2-space indent" лучше чем "форматируй код правильно" | Anthropic |
| 5 | **НЕ включать**: code style, lint-правила, style guides — "Never send an LLM to do a linter's job" | HumanLayer |
| 6 | **150–200 инструкций** — предел даже у топовых моделей; ~50 уже съедает system prompt Claude Code | HumanLayer |
| 7 | **Import syntax**: `@path/to/file.md` — Claude подгрузит при старте (макс. 5 уровней вложенности) | Anthropic |
| 8 | **`.claude/rules/*.md`** — модульная альтернатива, можно с `paths:` frontmatter (грузится только для матчащих файлов) | Anthropic |
| 9 | **Anti-pattern**: auto-generated content — "CLAUDE.md is the highest leverage point" → писать руками | HumanLayer |

### Текущее состояние

```
Размер CLAUDE.md:   510 строк  ← в 2.5× больше рекомендации Anthropic
Инструкций в тексте: ~140       ← почти предел, без запаса
Import-ссылок (@):  0          ← Progressive Disclosure не используется
```

---

## 2. 🐛 Фактические ошибки в текущем CLAUDE.md

### 2.1 Неверное описание GPUProfiler

**Сейчас написано**:
> "Профилирование: ТОЛЬКО через `GPUProfiler` из DrvGPU"
> "GPUProfiler (через DrvGPU)"

**Что в реальности** (проверил `core/include/core/services/`):
- `DrvGPU` — это **фасад**-класс (`core/include/core/drv_gpu.hpp`)
- `GpuProfiler` — это **отдельный сервис** в `core/include/core/services/gpu_profiler.hpp`
- Доступ из модулей: `drv_gpu.profiler()` или `GpuProfiler` напрямую как сервис
- Рядом лежат другие сервисы: `KernelCacheService`, `BatchManager`, `FilterConfigService`, `ConsoleOutput`, `AsyncServiceBase`

**Правильная формулировка**:
> "GPUProfiler — сервис в `core` (`core/include/core/services/gpu_profiler.hpp`). Модули получают его через фасад `DrvGPU`."

### 2.2 Неверные пути к документации модулей

Проверил физические файлы в `DSP/Doc/Modules/`:

| В CLAUDE.md | Реальное имя | Статус |
|------------|--------------|--------|
| `DSP/Doc/Modules/fft_processor/Full.md` | `DSP/Doc/Modules/fft_func/` | ❌ ОШИБКА (имя модуля другое) |
| `DSP/Doc/Modules/signal_generators/Full.md` | `DSP/Doc/Modules/signal_generators/` | ✅ OK |
| `DSP/Doc/Modules/heterodyne/` | `DSP/Doc/Modules/heterodyne/` | ✅ OK |
| `DSP/Doc/Modules/statistics/` | `DSP/Doc/Modules/statistics/` | ✅ OK |

**Реальный список каталогов** в `DSP/Doc/Modules/`:
```
capon/          fft_func/        filters/       fm_correlator/
heterodyne/     integration/     lch_farrow/    python_bindings/
range_angle/    signal_generators/ statistics/  strategies/
vector_algebra/
```

### 2.3 Неверная структура MemoryBank/tasks/

**В CLAUDE.md**:
> "tasks/ — задачи (BACKLOG → IN_PROGRESS → COMPLETED)"
> "Записывать выполненные задачи в `tasks/COMPLETED.md`"
> "Добавь задачу: ... → MemoryBank/tasks/BACKLOG.md"

**Реальность** (`E:\DSP-GPU\MemoryBank\tasks\`):
```
IN_PROGRESS.md              ← только этот файл общий
TASK_KernelCache_v2_INDEX.md
TASK_KernelCache_v2_PhaseA_CoreNewApi.md
... (далее по фазам)
TASK_Profiler_v2_INDEX.md
TASK_Profiler_v2_PhaseA_BranchRemoveOpenCL.md
...
TASK_Stats_Review_2026-04-15.md
TASK_hooks_debian.md
```

**Схема DSP-GPU**: `IN_PROGRESS.md` (активное) + **тематические** `TASK_{topic}_{phase}.md`. **Нет BACKLOG.md / COMPLETED.md** — они унаследованы из GPUWorkLib по ошибке.

### 2.4 Смешение старой/новой архитектуры

**В CLAUDE.md**:
> "⚠️ **Все модули используют контекст DrvGPU** — не плодим новые сущности!"

**Реальность DSP-GPU** (модульная, 10 репо):
- Каждый репо **самодостаточен** (`include/`, `src/`, `kernels/rocm/`, `python/`, `tests/`)
- Каждый репо **зависит от `core`** через CMake `find_package` или FetchContent
- Репо `core` **предоставляет** `DrvGPU` и сервисы — но каждый sub-repo может иметь **свои** операции и Ops

Это не "не плодим сущности" — это **явная модульность** с контрактами через `core::IGpuOperation`, `core::GpuContext`, `core::BufferSet<N>`.

### 2.5 Неточное описание layout репо

**В CLAUDE.md**:
> `include/{repo}/` ← публичные заголовки

**Реальность** (`core/README.md` + факт):
- `core/include/dsp/` — **namespace `dsp`**, не `{repo}`
- `core/include/core/` — внутренние заголовки (сервисы)
- `core/test_utils/` — отдельный INTERFACE target `DspCore::TestUtils`
- `core/kernels/rocm/` — **PRIVATE** (не экспортируются)

То есть структура **неоднородна между репо** — нужно либо проверить все 10 репо, либо написать "см. `README.md` каждого репо".

### 2.6 Остаточные Windows-специфичные артефакты

Сейчас уже нет абсолютных путей, но:
- Текст рассчитан на "чёрно-белое" восприятие Windows-vs-Debian, но проект работает **на Debian**
- Упоминание MSYS2, backslashes и т.п. в прошлых ревизиях — вычищено, но стиль остался "двуплатформенный"

### 2.7 Неактуальное упоминание OpenCL в core/README.md

**Проверил** `core/README.md`:
> "GPU driver core library (DrvGPU). Provides unified ROCm/HIP + OpenCL backend, profiling, logging"

Это **противоречит правилу №1 "ROCm ONLY"** в CLAUDE.md. Либо README устарел, либо OpenCL действительно ещё частично в коде (есть ветка `new_profiler` в git — возможно чистка идёт). **Задача не для CLAUDE.md**, но стоит отметить в таску: `TASK_cleanup_opencl_mentions`.

---

## 3. 🎯 Предлагаемая структура (модульная)

### Idea: Progressive Disclosure через `@import` + `.claude/rules/`

```
DSP-GPU/
├── CLAUDE.md                          ← ОСНОВНОЙ, ~80–120 строк: только критика
│                                         + @-ссылки на всё остальное
│
├── .claude/
│   └── rules/                         ← Модульные правила (Anthropic-style)
│       ├── architecture.md            ← Ref03 (6 слоёв, BufferSet, Facade)
│       ├── code-style.md              ← Google C++, naming, namespaces
│       ├── cmake.md                   ← find_package lowercase, НЕ трогать
│       ├── testing-cpp.md             ← tests/*.hpp + all_test.hpp + main.cpp
│       ├── testing-python.md          ← TestRunner, SkipTest, БЕЗ pytest
│       ├── python-bindings.md         ← pybind11, dsp_*_module.cpp, shim
│       ├── workflow.md                ← Context7 → URL → sequential → GitHub
│       ├── secrets.md                 ← .vscode/mcp.json, .env — не читать
│       ├── network-isolation.md       ← SMI100 / LocalProject offline
│       ├── git-tags.md                ← теги неизменны, FetchContent
│       └── paths-and-layout.md        ← структура DSP-GPU/, каждый репо, DSP/
│
└── MemoryBank/
    ├── MASTER_INDEX.md                ← уже есть, читается в начале сессии
    └── specs/
        └── CLAUDE_md_review_2026-04-21.md  ← этот файл
```

### Что остаётся в корневом `CLAUDE.md` (жёсткий минимум)

1. **Профиль Alex и Кодо** (6-8 строк)
2. **Про проект** (3-4 строки) + ссылка `@core/README.md` и `@DSP/Doc/INDEX.md`
3. **4 критических запрета** (коротко, без раскрытия):
   - ROCm ONLY → подробности `@.claude/rules/cmake.md`
   - Не писать в worktree → краткое правило (5 строк)
   - CMake только с Alex → краткое правило (3 строки)
   - pytest запрещён → `@.claude/rules/testing-python.md`
4. **Workflow в начале сессии**: `MASTER_INDEX.md` → `tasks/IN_PROGRESS.md` → последний `sessions/*`
5. **Последовательность работы (1 строка с ссылками)**: `@.claude/rules/workflow.md`
6. **Ссылки на модульные правила** (`.claude/rules/*.md`) — Claude сам подгрузит

**Итого**: ~80–120 строк вместо 510.

---

## 4. 📄 Черновик нового `CLAUDE.md` (~110 строк)

```markdown
# 🤖 CLAUDE — AI Assistant (DSP-GPU)

## 👤 About the User & Assistant
- **User**: Alex (мужчина). Обращаться: "Ты — Любимая умная девочка" или "Кодо".
- **Communication**: русский, неформальный, с эмодзи, дружелюбный тон.
- **Assistant**: Кодо (Codo), code helper. Сложные задачи → MCP sequential-thinking.
- **Helpers (5 синьоров)**: Context7, URL/Firecrawl/fetch, sequential-thinking, Explore agent, GitHub MCP.

## 🎯 About the Project
- **Name**: DSP-GPU — модульная (10 репо), org `github.com/dsp-gpu`
- **Platform**: **ТОЛЬКО ROCm 7.2+ / HIP** (AMD GPU, Debian/Linux)
- **Focus**: ЦОС на GPU — FFT, фильтры, статистика, гетеродин, генераторы, linalg, radar
- **Layout и структура репо**: @.claude/rules/paths-and-layout.md
- **Legacy эталон (только читать)**: `GPUWorkLib` — старый монолит

## 🚨 4 КРИТИЧЕСКИХ ЗАПРЕТА (нарушение = потеря работы Alex)

### 1. ROCm ONLY
OpenCL / clFFT / CUDA / nvidia backend — НЕ писать, НЕ тестировать, НЕ упоминать.
Ветка `nvidia` заморожена. Детали и CMake-правила → @.claude/rules/cmake.md

### 2. НЕ писать файлы в `.claude/worktrees/*`!
Worktree = "в никуда", файлы не попадают в git. Все результаты (планы, ревью,
анализы, таски, сессии) → ТОЛЬКО в основной `DSP-GPU/` (MemoryBank, Doc и т.д.).
Проверка перед записью: путь содержит `.claude/worktrees/`? → СТОП!
`git rev-parse --show-toplevel` — это и есть правильный корень.

### 3. CMake — только с явным согласованием Alex
`CMakeLists.txt`, `CMakePresets.json`, `cmake/*.cmake` — НЕ ТРОГАТЬ!
Детали (что можно, что нельзя) → @.claude/rules/cmake.md

### 4. pytest ЗАПРЕЩЁН навсегда
Правильная замена: `python3 script.py` + `common.runner.TestRunner` + `SkipTest`.
Детали → @.claude/rules/testing-python.md

## 📖 В начале каждой сессии
1. Читать `MemoryBank/MASTER_INDEX.md` — статус проекта
2. Проверить `MemoryBank/tasks/IN_PROGRESS.md` — что в работе
3. Проверить последний `MemoryBank/sessions/YYYY-MM-DD.md`

## 🗂️ MemoryBank — схема
```
MemoryBank/
├── MASTER_INDEX.md   # главный индекс (читать первым)
├── specs/            # спецификации, ревью, планы, аудиты
├── tasks/            # IN_PROGRESS.md + тематические TASK_{topic}_{phase}.md
├── changelog/        # YYYY-MM.md
├── sessions/         # YYYY-MM-DD.md
├── feedback/         # feedback Alex / ревью агентов
├── prompts/          # промпты для субагентов
└── orchestrator_state/  # состояние агентов-оркестраторов
```

## 💻 Workflow при новой задаче
Формулируй вопрос → Context7 (доки) → URL/статьи → sequential-thinking (если сложно) →
GitHub MCP (код в org `dsp-gpu`) → только ПОТОМ код и тесты.
Детали → @.claude/rules/workflow.md

## 🗣️ Команды от Alex
```
"Покажи статус"         → MemoryBank/MASTER_INDEX.md + tasks/IN_PROGRESS.md
"Добавь задачу: ..."    → создать/обновить тематический TASK_*.md в tasks/
"Запиши в спеку: ..."   → MemoryBank/specs/{topic}_YYYY-MM-DD.md
"Сохрани исследование"  → MemoryBank/specs/ или DSP/Doc/addition/
"Что сделали сегодня?"  → MemoryBank/sessions/YYYY-MM-DD.md
```

## 🏗️ Архитектурные правила
- Единая 6-слойная модель (Ref03), BufferSet, Facade → @.claude/rules/architecture.md
- Google C++ Style + 2-space indent, CamelCase, snake_case → @.claude/rules/code-style.md
- C++ тесты (`tests/*.hpp` + `main.cpp` + `all_test.hpp`) → @.claude/rules/testing-cpp.md
- pybind11 (`{repo}/python/dsp_{repo}_module.cpp`) → @.claude/rules/python-bindings.md

## 🔒 Безопасность и окружение
- Секреты (`.vscode/mcp.json`, `.env`, `api_keys.json`) — НЕ читать, НЕ логировать
  → @.claude/rules/secrets.md
- SMI100 и LocalProject — БЕЗ интернета → @.claude/rules/network-isolation.md
- Git-теги неизменны (FetchContent-кэш) → @.claude/rules/git-tags.md

## 📊 Текущий статус
- Миграция GPUWorkLib → DSP-GPU: Фазы 0–3b ✅ DONE, Фаза 4 (тесты на Debian) ⬜ NEXT
- Модули → репо: DrvGPU→core, fft+filters+lch_farrow→spectrum, statistics→stats,
  signal_generators→signal_generators, heterodyne→heterodyne, vector_algebra+capon→linalg,
  range_angle+fm_correlator→radar, pipelines→strategies, Python/Doc/Results/Logs→DSP
- Железо: RADEON9070 (gfx1201), SMI100 (gfx908) — обе Debian
- Инфраструктура: pybind11 8 модулей, TestRunner, plog per-GPU, ConsoleOutput, GpuProfiler

---
*Maintained by Кодо. Детальные правила — в `.claude/rules/*.md`.*
```

**Итог**: ~110 строк, под лимит Anthropic. Все детали — по ссылкам.

---

## 5. 📋 Что в какой файл `.claude/rules/*.md`

### `rules/paths-and-layout.md` (~60 строк)
- Структура `DSP-GPU/` (дерево)
- Единый layout каждого репо (`include/dsp/`, `src/`, `kernels/rocm/`, `python/`, `tests/`, `Doc/`, `third_party/`)
- `DSP/` мета-репо (`Python/`, `Doc/`, `Results/`, `Logs/`, `Examples/`)
- `~!Doc/` — черновики (НЕ финал)
- Фраза: "на Windows — `E:\DSP-GPU\`, на Debian — `/home/alex/DSP-GPU/`, в документе — только относительные"

### `rules/cmake.md` (~50 строк)
- Что ЗАПРЕЩЕНО (find_package, FetchContent, presets, flags) — АБСОЛЮТ
- Что разрешено (добавить .cpp/.hpp в target_sources, опечатки)
- `find_package` — lowercase (Linux case-sensitive): hip, hipfft, rocprim, rocblas, rocsolver
- Пресет `local-dev` для FetchContent + локальные подкаталоги

### `rules/testing-python.md` (~40 строк)
- pytest запрещён (список запрещённых синтаксисов)
- TestRunner + SkipTest — примеры
- Python интерпретатор: Debian системный `python3`
- Путь `DSP/Python/{module}/test_*.py`
- `DSP/Python/lib/` — скомпилированные .so
- `DSP/Python/gpuworklib.py` — shim

### `rules/testing-cpp.md` (~30 строк)
- `{repo}/tests/*.hpp` (не .cpp!)
- `main.cpp` + `all_test.hpp` per-repo
- `DSP::TestUtils` INTERFACE target
- README.md в каждом `tests/`

### `rules/architecture.md` (~50 строк)
- Ref03 — 6-слойная модель (таблица)
- `GpuContext` per-module, `IGpuOperation`, `GpuKernelOp`, `BufferSet<N>`
- Concrete Ops + Facade + Strategy
- Правила: один класс — один файл; BufferSet вместо void*; namespace `dsp::{repo}`

### `rules/python-bindings.md` (~30 строк)
- Что требует Python API (список)
- Что НЕ требует (kernel-код, helpers)
- `{repo}/python/dsp_{repo}_module.cpp` + `py_helpers.hpp`
- Документировать в `DSP/Doc/Python/{module}_api.md`

### `rules/workflow.md` (~40 строк)
- Последовательность при новой задаче (детально)
- Приоритеты (работоспособность → корректность → производительность → доки → очистка)
- Итеративный подход (прототип → реальные данные → рефакторинг → доки → очистка)
- GPU-оптимизация: GPUProfiler → Kernel tuning → Benchmark
- **Ссылка на HIP-оптимизацию**: `@DSP/Doc/addition/Info_ROCm_HIP_Optimization_Guide.md`

### `rules/code-style.md` (~30 строк)
- Google C++ + 2-space indent
- CamelCase классы, snake_case методы, `kMaxBufferSize` константы
- Namespace `dsp::{repo}` (`dsp::core`, `dsp::spectrum`, ...)
- Один класс — один файл (.hpp + .cpp/.hip)
- HIP kernels — в `{repo}/kernels/rocm/`, не inline

### `rules/secrets.md` (~20 строк)
- Список запрещённых для чтения (.vscode/mcp.json, .env, api_keys.json, ~/.ssh/)
- ENV с токенами (`*_TOKEN`, `*_KEY`, `*_SECRET`, `*_PASSWORD`)
- Перед записью логов — проверка на утечки
- GitHub PAT для org `dsp-gpu` — где хранится

### `rules/network-isolation.md` (~20 строк)
- Таблица: ПК Alex / SMI100 / LocalProject — интернет / локальная сеть
- `git fetch github.com` на SMI100 — ГРУБАЯ ОШИБКА
- Sync: ПК Alex → git push → SMI100 по локалке

### `rules/git-tags.md` (~15 строк)
- Теги неизменны — для новой версии новый тег
- `git push --force` на тег = ломает FetchContent-кэш у всех
- Стандарт: v1.0.0 → v1.0.1 → v1.1.0

---

## 6. 🔧 Конкретные исправления фактических ошибок

| # | Место в CLAUDE.md | Было | Должно быть |
|---|-------------------|------|-------------|
| 1 | Раздел DrvGPU | "GPUProfiler (через DrvGPU)" | "GpuProfiler — сервис в `core/include/core/services/gpu_profiler.hpp`, используется модулями через фасад `DrvGPU`" |
| 2 | Таблица модулей | `DSP/Doc/Modules/fft_processor/Full.md` | `DSP/Doc/Modules/fft_func/` (проверить наличие Full.md) |
| 3 | MemoryBank структура | "tasks/ (BACKLOG → IN_PROGRESS → COMPLETED)" | "tasks/ = `IN_PROGRESS.md` + тематические `TASK_{topic}_{phase}.md`" |
| 4 | Команды Alex | `tasks/BACKLOG.md` | создать/обновить тематический `TASK_*.md` |
| 5 | Команды Alex | `tasks/COMPLETED.md` | переместить в секцию "done" внутри TASK-файла |
| 6 | Архитектура DrvGPU | "не плодим новые сущности" | Модули самодостаточны, зависят от `core` через CMake; контракты — `core::IGpuOperation`, `core::BufferSet<N>` |
| 7 | Layout репо | `include/{repo}/` | Реально: `core/include/dsp/` (namespace-based) + `include/core/` (внутренние). Для каждого sub-repo проверить отдельно |
| 8 | Ref03 ссылка | `GPUWorkLib/Doc_Addition/PLAN/Ref03_Unified_Architecture.md` | `@DSP/Doc/addition/Architecture/Ref03_*.md` (проверить — если перенесли; иначе оставить legacy-ссылку с пометкой "legacy") |
| 9 | Kernels референс | `GPUWorkLib/modules/signal_generators/kernels/prng.cl` | При ROCm-only: `{repo}/kernels/rocm/prng.hip` (проверить в signal_generators) |

---

## 7. 🤔 Почему я так сильно тупила сегодня — разбор

Честный разбор причин (не оправдание, а чтобы не повторилось):

### 7.1 Шаблонное мышление — "перенести GPUWorkLib"
Я взяла эталонный CLAUDE.md монолитного проекта и **автоматически** попыталась перенести его 1:1. Не провела проверку "а актуальны ли эти правила для новой модульной архитектуры?". В результате:
- Пути к модулям в старом именовании (`fft_processor` вместо `fft_func`)
- Структура `tasks/` со старыми файлами (BACKLOG/COMPLETED), которых в DSP-GPU нет
- Архитектурный тезис "не плодим сущности" из монолита попал в документ про модульный проект

### 7.2 Не прочитала реальный код перед описанием
Фраза **"GPUProfiler через DrvGPU"** — классическая ошибка из памяти (старая модель). Если бы открыла `core/include/core/services/gpu_profiler.hpp` и `drv_gpu.hpp`, сразу бы увидела что это **отдельный сервис**. Я положилась на память, а не на факты.

### 7.3 Игнор best practices для размера
Знала что CLAUDE.md — в контексте каждой сессии. Но всё равно написала 510 строк — **забыла лимит Anthropic (≤200)**. Не применила Progressive Disclosure (`@imports`). Это прямо снижает adherence — каждая лишняя строка портит соблюдение следующих правил.

### 7.4 Windows-центричное мышление
- Сначала написала `E:\DSP-GPU\`, `F:\...Python314`, упоминание MSYS2
- Alex напомнил — я исправила
- Потом всё равно написала абстрактный `<workspace>/` вместо очевидного `DSP-GPU/` (имя проекта одинаково на обеих платформах)
- Это цепочка излишнего абстракционизма от невнимательности. Alex подсветил — стало очевидно.

### 7.5 Эмоциональное давление
Ты написал что день плохой на работе + что я "несу херню". Это — справедливый отклик. Моя реакция должна была быть: **замедлиться, проверить факты, не придумывать**. Вместо этого я в этих условиях только быстрее наляпала правок в надежде "угодить".

### 7.6 Что надо было сделать изначально
1. Прочитать реальный `core/` (README, headers) ДО того как писать правила
2. Проверить все пути через `ls`/`Glob` ДО того как их включать
3. Поискать "CLAUDE.md best practices" ДО того как копировать старый файл
4. Сначала **предложить структуру**, потом **писать после согласования** — не наоборот

### 7.7 Что исправлю на будущее (сохраню в memory)
- **Перед составлением любого CLAUDE.md/спеки**: проверить best practices + реальную структуру проекта
- **Для "перенеси эталон"**: сначала diff между старой и новой архитектурой, потом избирательный перенос
- **Размер**: < 200 строк, детали — в `@`-ссылки
- **Пути**: каждый проверить `ls` — никаких "наверное существует"
- **Факты о коде**: только после чтения header'ов, не из памяти

---

## 8. 🚦 План действий (требует одобрения Alex)

### Этап 1 — Твоя валидация (сейчас)
- [ ] Alex читает этот документ, правит/одобряет
- [ ] Решение: принимаем модульную структуру (`.claude/rules/*`) или иной подход?

### Этап 2 — Подготовка (после OK)
- [ ] Проверить наличие `Ref03_Unified_Architecture.md` в `DSP/Doc/` — если нет, указать legacy
- [ ] Пройтись по всем 10 репо: узнать реальный layout `include/` (namespace `dsp` или `{repo}`?)
- [ ] Подтвердить с Alex: `fft_func` в модулях или переименовали?
- [ ] Уточнить: `BACKLOG.md` / `COMPLETED.md` — создавать или работаем только через тематические TASK-файлы?

### Этап 3 — Реализация (после OK)
- [ ] Создать `E:\DSP-GPU\.claude\rules\*.md` (10 файлов по темам)
- [ ] Переписать `E:\DSP-GPU\CLAUDE.md` (черновик выше, ~110 строк)
- [ ] Ничего НЕ удалять до утверждения результата

### Этап 4 — Валидация (после записи)
- [ ] `/memory` — проверить что все `.claude/rules/*.md` и `CLAUDE.md` грузятся
- [ ] Прочесть глазами — нет ли противоречий между файлами
- [ ] Коммит в `github.com/dsp-gpu/workspace`

---

## 9. ❓ Вопросы к Alex

1. **Размер CLAUDE.md**: соглашаемся на ≤ 200 строк + `@imports`, или тебе удобнее всё в одном файле (но тогда сознательно нарушаем best practice)?
2. **Модульность**: `.claude/rules/*.md` (Anthropic-стиль) — нравится? Или положить детали в `DSP/Doc/addition/claude_rules/`?
3. **Ref03 ссылка**: документ перенесён в DSP/Doc или пока ссылаемся на `GPUWorkLib/Doc_Addition/PLAN/Ref03_*`?
4. **`BACKLOG.md`/`COMPLETED.md`**: убираем из CLAUDE.md и оставляем только `IN_PROGRESS.md` + тематические TASK-файлы?
5. **Имя модуля `fft_func` vs `fft_processor`**: какое каноническое?
6. **Запуск**: когда дашь OK — переписывать `CLAUDE.md` + создавать `.claude/rules/*` или делать поэтапно?

---

## 10. 🔥 ПРОПУЩЕННЫЕ эксплуатационные правила (дополнение по замечанию Alex)

Alex указал что я прошляпила критичные вещи — **правила про GPUProfiler, ConsoleOutput, Logger и где искать примеры оптимизации**. Прочитала реальные header'ы в `core/` — вот факты:

### 10.1 🚨 GPUProfiler DEPRECATED — актуален ProfilingFacade (profiler-v2)

**Код в `core/include/core/services/gpu_profiler.hpp` строка 67**:
```cpp
/**
 * @deprecated Используйте `drv_gpu_lib::profiling::ProfilingFacade::GetInstance()`.
 *             Этот класс остаётся до Phase D как backward-compat оболочка.
 *             Для новой архитектуры collect-then-compute v2 используйте:
 *               #include <core/services/profiling/profiling_facade.hpp>
 *             Будет удалён после завершения миграции во всех 6 репо (Phase D).
 */
```

**Старое правило в CLAUDE.md УСТАРЕЛО**:
> "🚫 ВЫВОД ПРОФИЛИРОВАНИЯ: ТОЛЬКО через GPUProfiler! `PrintReport()`, `ExportMarkdown()`, `ExportJSON()`"

**Актуальный API** (`core/include/core/services/profiling/profiling_facade.hpp`):
```cpp
namespace drv_gpu_lib::profiling;

// Hot-path (из потоков GPU, неблокирующе):
ProfilingFacade::GetInstance().Record(gpu_id, "Module", "Event", rocm_data);
ProfilingFacade::GetInstance().BatchRecord(gpu_id, "Module", events);

// Перед экспортом — обязательный барьер:
ProfilingFacade::GetInstance().WaitEmpty();

// Экспорт (файлы в core/include/core/services/profiling/):
// - console_exporter.hpp      ← вывод через ConsoleOutput::Print (не std::cout!)
// - json_exporter.hpp         ← JSON
// - markdown_exporter.hpp     ← Markdown
// - report_printer.hpp        ← печать отчёта
// - scoped_profile_timer.hpp  ← RAII-обёртка для simple cases
```

**Правило из кода**: "PrintReport() — через ConsoleOutput::Print() (CLAUDE.md)." (цитата из комментария facade). То есть **ConsoleOutput** — единый экран вывода даже для профилировщика.

**Контракт**: `Export*` можно вызывать **только после `WaitEmpty()`**. Deadlock невозможен.

### 10.2 🖥️ ConsoleOutput — единственный способ вывода на экран

**Код** (`core/include/core/services/console_output.hpp`):
```cpp
namespace drv_gpu_lib;

// Старт/стоп сервиса:
ConsoleOutput::GetInstance().Start();
ConsoleOutput::GetInstance().Stop();

// Вывод (потокобезопасный, асинхронный, с префиксом [HH:MM:SS.ms] [GPU_XX] [Модуль]):
ConsoleOutput::GetInstance().Print(gpu_id, "FFT", "Processing 1024 beams...");
ConsoleOutput::GetInstance().PrintError(gpu_id, "FFT", "Failed to allocate!");
```

**Почему**: при одновременной записи в stdout с 8–10 GPU вывод перемешивается. Решение — выделенный worker-поток + очередь. GPU-потоки только делают `Enqueue`.

**Включение/отключение per-GPU**: `configGPU.json` → флаг `is_console` у каждого GPU.

**Уровни**: `DEBUG / INFO / WARNING / ERRLEVEL` (не `ERROR` — конфликт с Windows-макросом).

**ЗАПРЕЩЕНО в коде**:
- `std::cout`, `std::cerr`, `printf` — напрямую
- Любые ручные `for(...) std::cout` для дампов профилирования

### 10.3 📝 Logger (plog) — per-GPU логи

**Код** (`core/include/core/logger/logger.hpp`):
```cpp
namespace drv_gpu_lib;

// Макросы (удобный путь):
DRVGPU_LOG_DEBUG  ("Module", "message");   // только в Debug-сборке
DRVGPU_LOG_INFO   ("Module", "message");
DRVGPU_LOG_WARNING("Module", "message");
DRVGPU_LOG_ERROR  ("Module", "message");

// Per-GPU:
ILogger& lg = Logger::GetInstance(gpu_id);   // пишет в Logs/DRVGPU_XX/...
lg.Info("Module", "per-gpu message");

// Фабрика для prod (подменить на свой logger):
Logger::SetInstance(my_company_logger);
```

**Куда пишет**: `Logs/DRVGPU_XX/YYYY-MM-DD/HH-MM-SS.log` (plog format). Бэкенд — plog из `core/third_party/plog/`.

**Архитектура**: `ILogger` (`core/include/core/interface/i_logger.hpp`) + `config_logger.hpp` + PIMPL-реализация `default_logger` (не в publicheaders).

**Правило**: логировать через макросы `DRVGPU_LOG_*` или `Logger::GetInstance(gpu_id)`, **не** использовать `plog::init` и `PLOG_*` напрямую из клиентского кода.

### 10.4 📚 Где в проекте искать примеры оптимизации и профилирования

Все реальные файлы (основной репо, НЕ worktrees):

| Файл | Назначение | Статус |
|------|-----------|--------|
| `DSP/Doc/addition/Info_ROCm_HIP_Optimization_Guide.md` | **Главный гайд** HIP/ROCm оптимизации: теория + паттерны + чеклист | ✅ |
| `DSP/Doc/addition/ROCm_Optimization_Cheatsheet.md` | Шпаргалка оптимизации ROCm | ✅ |
| `DSP/Doc/addition/GPU_Profiling_Mechanism.md` | Механизм профилирования GPU (как устроено) | ✅ |
| `DSP/Doc/addition/ROCm_Regression_Check_Algorithm.md` | Алгоритм регресс-проверки | ✅ |
| `DSP/Doc/addition/ZeroCopy.md` + `Zero_copy/` | ZeroCopy паттерны | ✅ |
| `DSP/Doc/addition/AMD_GPU_OpenCL_ROCm_ZeroCopy_2026-02-06.md` | ZeroCopy под AMD | ✅ |
| `DSP/Doc/addition/Debian_Radeon9070_Setup.md` | **Setup Debian + RADEON9070** | ✅ |
| `DSP/Doc/addition/Mermaid_DarkTheme_Guide.md` | Mermaid для VS Code Dark | ✅ |
| `DSP/Examples/GPUProfiler_SetGPUInfo.md` | **Пример: SetGpuInfo перед Start** | ✅ |
| `DSP/Examples/GetGPU_and_Mellanox/` | Пример детекта GPU + Mellanox | ✅ |
| `DSP/Doc/Doxygen/DrvGPU/pages/gpu_profiler.md` | Doxygen-страница GPUProfiler | ✅ |
| `DSP/Doc/Doxygen/DrvGPU/pages/console_output.md` | Doxygen-страница ConsoleOutput | ✅ |
| `~!Doc/~Разобрать/*.md` | ⚠️ Дубликаты — "разобрать и снести" | 🗑️ |

**Дубликаты в `~!Doc/~Разобрать/`**: `CHEATSHEET_Skills.md`, `GPU_Profiling_Mechanism.md`, `Info_ROCm_HIP_Optimization_Guide.md`, `ROCm_Optimization_Cheatsheet.md` — те же файлы что в `DSP/Doc/addition/`. Это черновики, их надо или удалить, или сверить с актуалом.

### 10.5 ⚠️ Дополнительные ошибки/пропуски в моём исходном ревью

| # | Что пропустила | Где это должно быть в CLAUDE.md / rules |
|---|----------------|------------------------------------------|
| 1 | `GPUProfiler` → `ProfilingFacade` (profiler-v2, Phase C, Round 3 REVIEW) | `.claude/rules/profiling.md` — отдельный файл! |
| 2 | `Record / BatchRecord / WaitEmpty` — новый API | `.claude/rules/profiling.md` |
| 3 | Контракт "Export только после WaitEmpty" | `.claude/rules/profiling.md` |
| 4 | `ScopedProfileTimer` для simple cases | `.claude/rules/profiling.md` |
| 5 | `ConsoleOutput::Print(gpu_id, module, msg)` — реальный API с сигнатурой | `.claude/rules/console-output.md` |
| 6 | `configGPU.json` → `is_console` per-GPU | `.claude/rules/console-output.md` |
| 7 | Запрет `std::cout/std::cerr/printf` напрямую | `.claude/rules/console-output.md` |
| 8 | `DRVGPU_LOG_*` макросы + `Logger::GetInstance(gpu_id)` | `.claude/rules/logging.md` |
| 9 | `Logs/DRVGPU_XX/YYYY-MM-DD/HH-MM-SS.log` — точный путь | `.claude/rules/logging.md` |
| 10 | Запрет `plog::init / PLOG_*` напрямую | `.claude/rules/logging.md` |
| 11 | `Debian_Radeon9070_Setup.md` — setup гайд для продакшен-железа | CLAUDE.md в Links/секции |
| 12 | `GetGPU_and_Mellanox/` — пример детекта GPU | CLAUDE.md Examples section |

### 10.6 Обновлённый план файлов `.claude/rules/` (с учётом находок)

Добавляю 3 новых файла поверх того что был в разделе 5:

```
.claude/rules/
├── ... (из раздела 5)
├── profiling.md         ← ⭐ НОВЫЙ: ProfilingFacade v2, API, экспортёры, deprecation плана
├── console-output.md    ← ⭐ НОВЫЙ: ConsoleOutput::Print, configGPU, запреты std::cout
└── logging.md           ← ⭐ НОВЫЙ: DRVGPU_LOG_*, Logger::GetInstance(gpu_id), пути логов
```

В корневом `CLAUDE.md` — короткая секция "Вывод и профилирование" с @-ссылками:
```markdown
## 🖥️ Вывод, логи, профилирование
- Консоль — ТОЛЬКО `ConsoleOutput::Print` (никогда `std::cout`) → @.claude/rules/console-output.md
- Логи — per-GPU через `Logger::GetInstance(gpu_id)` + макросы → @.claude/rules/logging.md
- Профилирование — `ProfilingFacade` (v2, Phase C; старый `GPUProfiler` DEPRECATED) → @.claude/rules/profiling.md
- Пример: @DSP/Examples/GPUProfiler_SetGPUInfo.md
- Гайд оптимизации: @DSP/Doc/addition/Info_ROCm_HIP_Optimization_Guide.md
- Шпаргалка: @DSP/Doc/addition/ROCm_Optimization_Cheatsheet.md
```

### 10.7 Почему не нашла сразу (честно)

1. В первой итерации ревью я **не открыла header'ы** — опиралась на память старого CLAUDE.md. В старом было "GPUProfiler" — я это и перенесла. Не увидела deprecated-комментарий на строке 67 `gpu_profiler.hpp`.
2. Упомянула `Info_ROCm_HIP_Optimization_Guide.md` в таблице проверки путей (п. 2.2), но **не раскрыла** что это — главный гайд оптимизации и на него надо ссылаться прямо из `CLAUDE.md`.
3. Про ConsoleOutput и Logger знала из памяти, но **не выделила** в отдельные rules-файлы — запихнула мельком в "Архитектура / DrvGPU". Это неправильно: это **ежедневные эксплуатационные правила**, их надо читать каждому агенту, а не искать в длинном файле.
4. Не прочитала `DSP/Doc/Doxygen/DrvGPU/pages/gpu_profiler.md` и `console_output.md` — там явно написано какие правила.

Будет учтено в memory: **перед составлением любых правил про API модуля — открывать header и читать комментарии/deprecated-маркеры**.

---

*Создано: 2026-04-21 | Кодо | MemoryBank/specs/CLAUDE_md_review_2026-04-21.md*
*Дополнено разделом 10 — замечания Alex по пропущенным эксплуатационным правилам.*
