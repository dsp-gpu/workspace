# Doxygen pitfall — преждевременное закрытие `/** */` блока через `*/` в тексте

> **Дата**: 2026-05-04
> **Контекст**: Phase B Python migration B1 build fail (Debian + ROCm 7.2 + RX 9070).
> **Автор**: Кодо.

---

## 🐛 Что за ошибка

Внутри Doxygen-блока (`/** ... */` или `/*! ... */`) последовательность символов `*/` **закрывает** комментарий — где бы она ни встретилась.

Если автор хотел использовать `*` как wildcard в perевозов вида `Process*` / `FindAllMaxima*` и поставил их через слэш — `Process*/FindAllMaxima*` — то парсер видит:

```
/**
 * @note Lifecycle: ... → Process*/FindAllMaxima* → dtor.
                                ^^
                                закрытие блока
FindAllMaxima* → dtor.    ← а это уже КОД (или мусор для C++)
*/                         ← а это снова "комментарий"... но парсер уже сошёл с ума
```

Дальше всё что не похоже на C++ tokens вызывает каскад ошибок:

```
error: extended character → is not valid in an identifier
error: 'FindAllMaxima' was not declared in this scope
error: expected ';' before ...
```

---

## 🔍 Как обнаружить (grep-паттерн)

```bash
grep -rn -E "[a-zA-Z]\*/[a-zA-Z]" --include="*.hpp" --include="*.cpp" --include="*.h" --include="*.hip" \
  core spectrum stats signal_generators heterodyne linalg radar strategies DSP \
  | grep -v third_party
```

Что ловим: `буква*/буква` (`Process*/FindAllMaxima`, `Invert*/InvertBatch`).

**Ложные срабатывания** (отбрасываем при ревью):
- `// ... Set*/Save*.` — это line-комментарий `//`, не `/** */`.
- Нормальные C-комментарии `/*ptr*/0` — там после `*/` идёт цифра/пробел/скобка, не буква.

---

## 🛠️ Как исправить

**Вариант 1 (рекомендуемый)** — пробел между `*` и `/`:

```diff
- * @note Lifecycle: ctor(backend) → Initialize(params) → Process*/FindAllMaxima* → dtor.
+ * @note Lifecycle: ctor(backend) → Initialize(params) → Process* / FindAllMaxima* → dtor.
```

Семантика «Process*-семейство методов / FindAllMaxima*-семейство методов» сохранена, парсер счастлив (без `*/` подряд блок не закрывается).

**Вариант 2** — заменить `*` на `()` если речь о конкретном вызове:

```diff
- * @brief ...по последнему Process*/FindAllMaxima* вызову.
+ * @brief ...по последнему Process()/FindAllMaxima() вызову.
```

**Вариант 3** — обернуть в backticks (Markdown в Doxygen) **И** разделить пробелом — backticks одни не спасают, потому что `*/` внутри них остаётся `*/` для парсера:

```diff
- * @brief Возвращает признак готовности фасада к Process*/FindAllMaxima*.
+ * @brief Возвращает признак готовности фасада к `Process*` / `FindAllMaxima*`.
```

---

## 🚫 Запрет на будущее

В Doxygen-блоках **никогда** не писать `*/` без разделителя — даже если это «логичное» сокращение для семейства методов. Всегда:

- `Process* / FindAllMaxima*` — пробел вокруг `/`.
- `` `Process*` / `FindAllMaxima*` `` — отдельные backticks.

---

## 📋 Список затронутых файлов (фикс 2026-05-04)

| Файл | Линии | Контекст |
|------|-------|----------|
| `spectrum/include/spectrum/processors/spectrum_processor_rocm.hpp` | 89, 116, 360 | `Process*/FindAllMaxima*` |
| `linalg/include/linalg/cholesky_inverter_rocm.hpp` | 68 | `Invert*/InvertBatch*` |

---

## 🤖 Промпт-апдейт для Кодо

Добавить в `.claude/rules/14-cpp-style.md` (или новое правило про doxygen):

> **🚫 В Doxygen-блоках `/** ... */` запрещено `*/` без разделителя.**
> Если нужно показать «семейство методов» — писать `Process* / FindAllMaxima*` (пробел вокруг `/`) или `` `Process*` / `FindAllMaxima*` ``. Симптом ошибки: каскад `extended character is not valid in identifier` + `not declared in scope` сразу после комментария.

---

## 🔗 Ссылки

- Phase B blocker → `MemoryBank/tasks/TASK_python_migration_phase_B_debian_2026-05-03.md` (B1)
- Связь с doxytags Phase 1+2 коммитами: `1475620 spectrum: doxytags Phase 1+2`, `8a5b447 linalg: doxytags Phase 1+2`

---

## 🧨 Bonus pitfall #2 — `ENABLE_ROCM` не пробрасывается через DSP-meta preset

Найден в той же сессии Phase B B1 (2026-05-04). Не Doxygen, но того же класса
«сборка валится с непонятной ошибкой, корень в ином месте».

### Симптом

Ошибки вида:
```
heterodyne_dechirp.cpp:167:15: error: 'antenna_fft' was not declared in this scope
strategies/.../antenna_processor_v1.cpp:5:20: error: 'ScopedHipEvent' has not been declared in 'drv_gpu_lib'
```

Каскадно — десятки ошибок «namespace не объявлен», «class incomplete».

### Корень

В каждом из 8 sub-репо `CMakeLists.txt` есть блок:
```cmake
if(ENABLE_ROCM)
  target_compile_definitions(Dsp<X> PUBLIC ENABLE_ROCM=1)
endif()
```

И собственный `CMakePresets.json` каждого репо имеет `"ENABLE_ROCM": "1"` в configure-preset'е.

**НО** мета-репо `DSP/CMakePresets.json` (`debian-local-dev`, `local-dev`) **не задаёт `ENABLE_ROCM=1`**. При сборке через DSP/ (FetchContent → 8 sub-репо) ни один target не получает `-DENABLE_ROCM=1`, и весь код под `#if ENABLE_ROCM` (включая `#include <spectrum/factory/...>`) исключается препроцессором → namespace не виден → каскад ошибок.

### Fix (временный, без правки CMake-файлов)

```bash
cd DSP/
cmake --preset debian-local-dev \
      -DENABLE_ROCM=1 \
      -DDSP_CORE_BUILD_PYTHON=ON \
      -DDSP_SPECTRUM_BUILD_PYTHON=ON \
      -DDSP_STATS_BUILD_PYTHON=ON \
      -DDSP_SIGNAL_GENERATORS_BUILD_PYTHON=ON \
      -DDSP_HETERODYNE_BUILD_PYTHON=ON \
      -DDSP_LINALG_BUILD_PYTHON=ON \
      -DDSP_RADAR_BUILD_PYTHON=ON \
      -DDSP_STRATEGIES_BUILD_PYTHON=ON
```

### Fix (правильный, требует OK Alex для CMake-правки)

В `DSP/CMakePresets.json` в секцию `local-dev` (от которой наследуется
`debian-local-dev`) добавить:

```jsonc
"cacheVariables": {
  "ENABLE_ROCM": "1",
  "DSP_CORE_BUILD_PYTHON":              "ON",
  "DSP_SPECTRUM_BUILD_PYTHON":          "ON",
  "DSP_STATS_BUILD_PYTHON":             "ON",
  "DSP_SIGNAL_GENERATORS_BUILD_PYTHON": "ON",
  "DSP_HETERODYNE_BUILD_PYTHON":        "ON",
  "DSP_LINALG_BUILD_PYTHON":            "ON",
  "DSP_RADAR_BUILD_PYTHON":             "ON",
  "DSP_STRATEGIES_BUILD_PYTHON":        "ON",
  ...
}
```

Альтернатива — единый флаг `DSP_BUILD_PYTHON_ALL` в `DSP/CMakeLists.txt`,
который активирует все 8 sub-флагов.

### Promotion в правило

Уже отражено в `.claude/rules/12-cmake-build.md` («Опции» раздел):
- `DSP_BUILD_PYTHON` (default: `ON`) — pybind11 модули.

Но **в текущем DSP-meta `CMakeLists.txt` глобального `DSP_BUILD_PYTHON` нет**, есть только per-repo `DSP_<NAME>_BUILD_PYTHON` со значением OFF. Это рассинхронизация между правилом и кодом.

**TODO**: при следующем CMake review-таске синхронизировать.
