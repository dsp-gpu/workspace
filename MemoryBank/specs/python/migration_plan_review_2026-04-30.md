# Глубокое ревью: `migration_plan_2026-04-29.md`

**Дата ревью**: 2026-04-30
**Ревьюер**: Кодо
**Документ**: [`migration_plan_2026-04-29.md`](migration_plan_2026-04-29.md)
**Вердикт**: 🟢 **APPROVED** — план в основе правильный, 5 блокеров **согласованы Alex** (2026-04-30): B1 правка `gpu_loader.py`, B2 удаление shim, B3 переписать heterodyne на новый API, B4 `CMAKE_CURRENT_LIST_DIR`, B5 отдельный шаблон sub-репо. Можно стартовать Phase A0 после правки самого `migration_plan_2026-04-29.md`.

---

## 1. Сводка

| Аспект | Оценка |
|--------|--------|
| Архитектура подхода | ✅ Корректен (минимальные правки, шаблон, `GPULoader.setup_path`) |
| Соответствие реальности репо | ⚠️ Местами устарел (см. §3) |
| Согласованность с правилами `.claude/rules/` | ⚠️ Есть конфликты с `04-testing-python.md` и `11-python-bindings.md` (правила сами устарели — см. §6) |
| Технические детали CMake-патча | ⚠️ `CMAKE_SOURCE_DIR` ненадёжен (см. §4.3) |
| Покрытие edge-кейсов | ⚠️ Не учтены sub-репо `python/t_*.py` и shim `gpuworklib.py` (см. §4.4, §4.5) |
| Оценка времени | 🟡 Слишком оптимистично (51 файл за 4 ч, см. §5) |

---

## 2. 🔴 Блокеры (исправить ДО старта)

### B1. Phase B1 уже частично выполнен — `gpu_loader.py` НЕ обновлён

**Факт на 2026-04-30**:
- `DSP/Python/libs/` ✅ создана
- `DSP/Python/lib/` ❌ отсутствует
- `DSP/Python/common/gpu_loader.py:51` всё ещё `_PYTHON_ROOT / "lib"` ← **сломано**
- `DSP/Python/gpuworklib.py:36-37` в docstring ссылается на `DSP/Python/lib` ← устарело

**Последствие**: после первого тестового запуска `GPULoader.setup_path()` не найдёт ни одной `.so`, тесты упадут. Это **СЕЙЧАС** даёт false negative.

**Действие**: B1 надо выполнить **до** Phase A (а не после), причём `gpu_loader.py:51` правится одной строкой:

```python
# было
_PYTHON_ROOT / "lib",
# стало
_PYTHON_ROOT / "libs",
```

И docstring `gpu_loader.py:13`, `gpuworklib.py:36-37`.

### B2. `gpuworklib.py` shim — рудимент legacy, удаляется после Phase A

**Решение Alex (2026-04-30)**: shim — это рудимент GPUWorkLib, нам не нужен. Полностью выпиливаем.

**Факт**: `DSP/Python/gpuworklib.py` существует (110 строк, реэкспортирует `dsp_*` под legacy-именами).

**План действий**:
1. Phase A2 — переводит все `import gpuworklib` на `import dsp_<module>` напрямую.
2. Phase A3 (Verify) — `grep "import gpuworklib"` должен дать **0** в `t_*.py`.
3. **После Phase A4 (Cleanup)** — удалить **сам** `DSP/Python/gpuworklib.py` (одной командой, отдельный коммит).
4. Также обновить `gpu_loader.py:166` (`import gpuworklib as gw`) и `gpu_loader.py:159 _load_gpuworklib()` — выпилить блок shim-загрузки (или оставить как dead-code для последующего удаления вместе с методом `GPULoader.get()` → оставить только `setup_path()`).

**Критерий завершения**: `grep -rn "gpuworklib" DSP/Python/ --include='*.py'` → пусто.

### B3. Heterodyne: переписать тесты на `HeterodyneROCm.dechirp/correct + NumPy FFT`

**Контекст**: legacy `HeterodyneDechirp` делал всё в одном вызове и возвращал `dict {success, antennas[].f_beat_hz}`. В `dsp_heterodyne` его **нет** — `dsp_heterodyne_module.cpp:18-19` имеет `#include "py_heterodyne.hpp"` **закомментирован** (он завязан на legacy OpenCL `GPUContext` из nvidia-ветки, для ROCm не подходит). Экспортируется **только** низкоуровневый `HeterodyneROCm`.

**Что делать (НЕ нужен живой GPU для этого):**

API из [heterodyne/python/py_heterodyne_rocm.hpp:39-55](../../../heterodyne/python/py_heterodyne_rocm.hpp#L39-L55):

```python
import dsp_heterodyne as het_mod
import numpy as np

het = het_mod.HeterodyneROCm(ctx)
het.set_params(f_start=0, f_end=2e6, sample_rate=12e6,
               num_samples=8000, num_antennas=5)

# 1. Dechirp на GPU
dc = het.dechirp(rx, ref)             # complex64 ndarray

# 2. FFT + поиск пика — СВОИМИ силами на CPU (NumPy)
spec = np.fft.fft(dc.reshape(num_antennas, num_samples), axis=-1)
mag  = np.abs(spec)
peaks = np.argmax(mag, axis=-1)
f_beat_hz = peaks * (sample_rate / num_samples)

# 3. (Опционально) Correct на GPU
out = het.correct(dc, list(f_beat_hz))   # complex64 ndarray
```

**План для 4 файлов `heterodyne/t_*.py`**:
1. **На Windows (сейчас)** — переписать код по паттерну выше. API стабилен, можно править вслепую.
2. **Guard `if not HAS_GPU: raise SkipTest(...)`** в каждой `def test_*()` — как в общем шаблоне C.
3. **Доп. SkipTest «pending Debian validation»** (опционально) — в начале файла, чтобы тест не пытался запуститься на Windows совсем; снимем после первого успешного прогона на gfx1201.
4. **На Debian (через 4 дня)** — запустить, проверить корректность сравнением с эталонным NumPy `np.fft`-расчётом по тому же `dc`.

**Время**: ~1 ч на 4 файла (паттерн один и тот же).

**Не блокер плана** — просто требует чёткой инструкции «переписываем структурно, а не SkipTest навсегда».

### B4. CMake-блок: `${CMAKE_SOURCE_DIR}/../DSP/Python/libs` — ломкий путь

Path работает только при сборке отдельного репо (`cmake --preset` из `spectrum/`). При сборке через супер-проект (`workspace/` добавляет `add_subdirectory(spectrum)`), `CMAKE_SOURCE_DIR` = workspace, и `../DSP/Python/libs` уезжает на уровень выше workspace — **наружу** дерева.

**Действие**: заменить на стабильный путь от `CMakeLists.txt` файла:

```cmake
set(DSP_PYTHON_LIB_DIR "${CMAKE_CURRENT_LIST_DIR}/../../DSP/Python/libs"
    CACHE PATH "Where to deploy compiled .so for tests")
```

`CMAKE_CURRENT_LIST_DIR` = каталог, где лежит сам `python/CMakeLists.txt` → `{repo}/python/`. Идём 2 уровня вверх → корень репо → `DSP/Python/libs/`.

Также: повторное `option(DSP_DEPLOY_PYTHON_LIB ...)` в 8 файлах — формально CMake разрешает (повторный `option()` no-op), но default value будет браться у **первого** объявления. Не блокер, но добавь комментарий: `# duplicated in 8 files intentionally per Q1=B`.

### B5. Шаблон A) не работает для sub-репо `linalg/python/t_linalg.py` etc.

Шаблон вычисляет `_PT_DIR = dirname(dirname(__file__))` — это поднятие на 2 уровня. Для `DSP/Python/{module}/t_X.py` это даёт `DSP/Python/` → `from common.runner import ...` ✅.

Но для `linalg/python/t_linalg.py` (sub-репо) `dirname(dirname(...))` = корень `linalg/`, а `common/` живёт в `DSP/Python/common/`. **Импорт упадёт.**

**Действие**: для sub-репо `python/t_*.py` (4 файла из §10 плана) — отдельный шаблон импорта:

```python
# Найти DSP/Python/ как sibling от {repo}/
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DSP_PY = os.path.join(os.path.dirname(_REPO_ROOT), "DSP", "Python")
if _DSP_PY not in sys.path:
    sys.path.insert(0, _DSP_PY)
```

Либо вынести 4 sub-репо тестов в **отдельную фазу A2.8** с явной пометкой «другая структура путей».

---

## 3. Расхождения плана с реальностью

| План (`migration_plan_2026-04-29.md`) | Реальность 2026-04-30 |
|---------------------------------------|-------------------------|
| «Phase B1: создать пустую `libs/`, добавить `.gitkeep`» | `libs/` уже есть, но `.gitkeep` не упомянут — проверить наличие `ls DSP/Python/libs/` показал пусто |
| «Удалить старую `lib/`» | `lib/` уже нет |
| «Phase B1 — на работе через 4 дня» | По факту B1 уже сделан (частично) на Windows; нужно **доделать** `gpu_loader.py` сейчас |
| «`HeterodyneDechirp(ctx) + het.process(rx)`» (legacy) | Реально в `dsp_heterodyne` экспортируется только `HeterodyneROCm`; `HeterodyneDechirp` в pybind закомментирован |
| Подсчёт «3 уже мигрировано» | OK, последний коммит `04e22c1` подтверждает |

---

## 4. Средние замечания

### 4.1. Phase A2 порядок — начать с самого уверенного

План: stats → signal_generators → linalg → radar → spectrum → heterodyne → strategies/integration/common → sub-репо.

Лучше: начать с того, где API уже разведано:
1. **signal_generators** (1 файл с `LfmAnalyticalDelayROCm` известен, остальные 3 — близкая семантика).
2. **spectrum** оставшиеся (11+1) — есть 3 готовых эталона из этой же сессии.
3. **stats** — небольшой, 4 файла.
4. **linalg, radar** — pybind A1 покажет.
5. **heterodyne** — последним, по политике SkipTest+TODO.

Логика: сначала «быстрые победы» с одним и тем же шаблоном, потом «сложное».

### 4.2. Шаблон C) — guard в каждом `def test_*()` дублируется

Если в файле 8 функций — 8× повтор `if not HAS_GPU: raise SkipTest(...)`. Альтернатива — один guard на уровне модуля + ранний выход:

```python
if not HAS_GPU:
    raise SystemExit(0)  # ← НЕТ, это запрещено
```

Нельзя, `sys.exit` запрещён. Тогда — оставить как есть (8 повторов). Но **одна общая функция-проверка** в начале файла:

```python
def _require_gpu():
    if not HAS_GPU:
        raise SkipTest("dsp_core/dsp_<module> not found")

def test_xxx():
    _require_gpu()
    ...
```

Чуть чище, без потери поведения. Опционально, не блокер.

### 4.3. Data-файлы: копирование vs симлинк

План: копировать `lagrange_matrix_48x5.json` в `DSP/Python/spectrum/data/`. Это **дублирование** — оригинал лежит в `spectrum/src/...`. Альтернативы:

| Подход | Плюс | Минус |
|--------|------|-------|
| Копия (план) | Просто, работает на Windows | Дубль данных, рассинхрон при правке |
| symlink | Без дубля | Windows требует admin; ломает git на Win |
| `os.path.join({repo}/src/...)` поиском | Без дубля, работает везде | Тест зависит от структуры репо |
| CMake `configure_file` копирует при сборке | Корректно | Тесты сломаны до сборки |

Для Windows-разработки и Debian-исполнения **копия — единственный надёжный путь**. Согласен с планом, но добавь правило: если файл в `data/` обновляется — синхронить в исходный location вручную (или удалить из `src/`, оставив только в `DSP/Python/<module>/data/`).

### 4.4. Sub-репо тесты — статус неясен

В §10 плана 4 файла `{repo}/python/t_*.py`. План говорит «standalone тесты в каждом репо». Вопросы:

- Они **дублируют** тесты в `DSP/Python/{module}/` или дополняют?
- Если дублируют — может, удалить sub-репо тесты после миграции `DSP/Python/`?
- Если дополняют — оформить отдельную фазу A2.8 с другим шаблоном (см. B5).

**Действие**: до миграции — `diff` каждого `{repo}/python/t_*.py` против соответствующих `DSP/Python/{module}/t_*.py`. По результату — либо удалить, либо отдельный шаблон.

### 4.5. `t_gpuworklib.py` → `t_e2e.py` — где обновить ссылки

Если переименовываем — поиск `t_gpuworklib` через grep не дал нулевого результата без проверки. Проверить:

```bash
grep -rn "t_gpuworklib" DSP/Python/ tests/ MemoryBank/
```

Все найденные — обновить ссылку. Не блокер, но если есть в README/runner/CMake — забыть нельзя.

### 4.6. Критерий «0 файлов с `sys.exit`» — слишком жёсткий

Тесты могут использовать `sys.exit(0)` при successful exit — это **не запрещено** правилом 04. Запрещено `sys.exit(1)` при отсутствии GPU/модуля.

**Действие**: переформулировать критерий:
> «0 файлов где `sys.exit` используется как замена `SkipTest` (т.е. при отсутствии GPU/модуля/dependency)».

Можно проверить точечнее:

```bash
grep -rn "sys\.exit" --include='t_*.py' DSP/Python/ \
  | grep -v "exit(0)"  # ← оставить только не-zero exits
```

### 4.7. CMake `option()` с одинаковым именем в 8 файлах

`option(DSP_DEPLOY_PYTHON_LIB ...)` в 8 разных `python/CMakeLists.txt`. Поведение CMake:
- Первый `option()` создаёт переменную в кеше.
- Последующие `option()` с тем же именем — **no-op** (если переменная уже определена).

**Следствие**: «default ON» сработает только у первого. Это ОК, потому что CACHE-переменная одна на проект. Но если кто-то сделает `cmake -DDSP_DEPLOY_PYTHON_LIB=OFF`, отключится для **всех** 8 — что и нужно по Q3. Логика правильная, но добавить комментарий чтобы будущий разработчик не удивлялся:

```cmake
# Опция определена в 8 файлах (Q1=B, автономность);
# первое определение создаёт CACHE-переменную, остальные — no-op.
option(DSP_DEPLOY_PYTHON_LIB "Auto-copy .so to DSP/Python/libs/" ON)
```

---

## 5. Оценка времени — оптимистично

| План | Реалистично |
|------|-------------|
| A1 Inventory: 1 ч | 1.5-2 ч (8 pybind файлов + сверка с C++ headers, заполнение таблицы) |
| A2 Migration: 3-4 ч | 6-8 ч (51 файл × ~7 мин/файл при отлаженном шаблоне; +30 мин на каждый «нестандартный» файл — sub-репо, integration, heterodyne) |
| A3 Verify: 15 мин | 30 мин (grep + ручной просмотр 5-10 файлов на sanity-чек) |
| A4 Commit/Push: 15 мин | 30 мин (6 репо × ~3-5 мин на осмысленное commit msg) |
| **Итого Phase A** | **~10 ч** (а не 5) |

Не блокер, но **разбить на 2 сессии** (A1+A2.1-A2.4 = ~5 ч; A2.5-A4 = ~5 ч) — иначе устанешь, и качество «хвоста» упадёт.

---

## 6. Конфликты с правилами `.claude/rules/`

### 6.1. Правило `04-testing-python.md` — устарело

Правило требует:
- `class TestX:` + `setUp()` + `TestRunner.run(TestX())`
- Файлы `test_*.py`

План:
- `def test_*()` top-level (как в legacy)
- Файлы `t_*.py` (после `test_→t_` renaming, коммит `04e22c1`)

**План правильный** (соответствует уже сделанному), правило **устарело**. После Phase A — обновить `04-testing-python.md`:
1. Префикс файла: `t_*.py` (не `test_*.py`).
2. Структура: top-level `def test_*()` допустима наряду с `class TestX:`.
3. `TestRunner` адаптировать на оба варианта (или убрать `class`-вариант если не нужен).

### 6.2. Правило `11-python-bindings.md` — устарело

Правило: `dsp_{repo}_pyd.cpython-3XX-...so`, `import dsp_spectrum_pyd as spectrum`.

Реальность: `PYBIND11_MODULE(dsp_spectrum, m)` → `dsp_spectrum.cpython-...so` (без `_pyd`).

**План правильный**, правило **устарело**. После Phase A — обновить `11-python-bindings.md` (убрать суффикс `_pyd` из всех примеров).

### 6.3. Правило `04` — `GPULoader.get_instance().get_context(gpu_id=0)`

Правило ссылается на API, которого **нет** в `gpu_loader.py`. Реальный API — `GPULoader.get()` (возвращает shim) и `GPULoader.setup_path()` (план использует это).

**План правильный**, правило **устарело**. Обновить пример в `04-testing-python.md` и `11-python-bindings.md`.

> 📌 Рекомендация: создать отдельный TASK после Phase A — **«Sync .claude/rules/ с реальностью Python»**.

---

## 7. Что в плане сделано хорошо

- ✅ Чёткая нумерация Q1-Q3 с фиксированными решениями.
- ✅ Таблица «Известные API breaking changes» с указанием конкретных файлов.
- ✅ Раздел «Что НЕ делаем» — отсекает scope creep.
- ✅ Таблица рисков с митигациями.
- ✅ Шаблон 5-точечных правок (A-E) — даёт повторяемость.
- ✅ PRE_BUILD/POST_BUILD логика — fail-fast при сломанной сборке.
- ✅ Готовый «План на работу через 4 дня» с конкретными командами.
- ✅ Согласовано Q1-Q4 + Доп.1-3 — нет «решим по ходу».

---

## 8. Чек-лист правок плана (приоритет)

### 🔴 Сначала (блокеры)

- [ ] B1: вынести в Phase A0 (preflight): обновить `gpu_loader.py:51` `lib`→`libs` + docstring; добавить `.gitkeep` если нет.
- [x] B2: ✅ согласовано Alex — выпиливаем `gpuworklib.py` shim после Phase A4 (отдельный коммит `cleanup: remove gpuworklib shim`). В план добавить шаг A5 (Cleanup).
- [x] B3: ✅ согласовано Alex — переписываем 4 файла `heterodyne/t_*.py` на `HeterodyneROCm.dechirp/correct + np.fft + argmax` (~1 ч на Windows). SkipTest только как «pending Debian validation», не как permanent skip.
- [x] B4: ✅ согласовано Alex — заменить `${CMAKE_SOURCE_DIR}/../DSP/Python/libs` → `${CMAKE_CURRENT_LIST_DIR}/../../DSP/Python/libs`.
- [x] B5: ✅ согласовано Alex — отдельный шаблон импорта для sub-репо `python/t_*.py` (фаза A2.8).

### 🟡 Желательно

- [ ] §3 — синхронизировать таблицу «Состояние» с фактом 2026-04-30.
- [ ] §4.1 — переупорядочить A2 (signal_generators первым).
- [ ] §4.2 — добавить helper `_require_gpu()` в шаблон C.
- [ ] §4.4 — diff sub-репо тестов vs `DSP/Python/`, решить дубль/дополнение.
- [ ] §4.6 — переформулировать критерий «0 файлов с sys.exit».
- [ ] §5 — пересмотреть оценку до ~10 ч; разбить на 2 сессии.

### 🟢 После Phase A (отдельный TASK)

- [ ] Обновить `04-testing-python.md`: `test_*` → `t_*`, top-level `def`.
- [ ] Обновить `11-python-bindings.md`: убрать суффикс `_pyd`.
- [ ] Обновить пример `GPULoader` в обоих правилах.

---

## 9. Финальная рекомендация

План **не нужно переписывать целиком** — структура и решения корректны, все 5 блокеров согласованы Alex (2026-04-30). Достаточно:

1. **Сейчас** (~30 мин): отредактировать `migration_plan_2026-04-29.md` по чек-листу §8.🔴 (B1-B5 уже согласованы) + §8.🟡.
2. **После правок** — старт Phase A0 (preflight: `gpu_loader.py:51` `lib`→`libs` + grep `t_gpuworklib`).
3. **Затем** Phase A1-A4 как запланировано:
   - A2 переупорядочить: signal_generators → spectrum → stats → linalg → radar → heterodyne (переписать на `HeterodyneROCm.dechirp/correct + np.fft`) → strategies/integration/common → A2.8 sub-репо `python/t_*.py`.
   - Время — ~10 ч, разбить на 2 сессии.
4. **A5 Cleanup (новая фаза)** — удалить `DSP/Python/gpuworklib.py` + выпилить shim-блок из `gpu_loader.py`.
5. **На Debian (4 дня)** — Phase B2-B3 как в плане.

После Phase A — отдельный мини-TASK на синк правил `.claude/rules/` (`04-testing-python.md`, `11-python-bindings.md`) с реальностью.

---

## 10. Changelog ревью

| Дата | Изменение |
|------|-----------|
| 2026-04-30 | Создан документ |
| 2026-04-30 | Alex согласовал B2 (удаляем shim), B3 (переписываем heterodyne), B4 (CMAKE_CURRENT_LIST_DIR), B5 (отдельный шаблон sub-репо). Раздел B2/B3 переписан. §8 чек-лист обновлён. |

---

*Last updated: 2026-04-30 by Кодо*
