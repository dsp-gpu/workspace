# [DEPRECATED 2026-05-01] Визуализация data flow в `_RAG_TEST_PARAMS.md`

> ⛔ **Этот документ отменён.** Решение от Alex: визуализация `data_flow:` + `shapes:`
> признана избыточной. Источником правды стали **doxygen-теги `@test`** в коде —
> см. [09_RAG_md_Spec.md](./09_RAG_md_Spec.md), Draft 3.
>
> Файл оставлен как **история принятых решений** (что рассматривалось и почему отказались).
> Реализовывать `data_flow:` и `shapes:` НЕ нужно.
>
> **Причина отказа**:
> - ASCII в шапке `.hpp` — слишком сложно, программисты ломаются.
> - Дублирует информацию из `@param` (типы, размеры).
> - AI и так выведет shape из типов параметров.

---

> **Версия (исходно)**: draft 1 · **Создано**: 2026-05-01
> **Контекст**: расширение спеки [09_RAG_md_Spec.md](./09_RAG_md_Spec.md) после комментария Alex:
> «вывести строку как визуально выглядит метод к которому все это делается; я зная/понимаю — но увязать с физическим выводом не могу»

---

## 1. Зачем

YAML с `params: range/test_values/...` показывает **диапазоны входов**, но не показывает:
- какие **формы тензоров** возникают между этапами,
- куда они идут (CPU↔GPU),
- какие **kernel-launches** выполняются.

Без этого:
- Человек смотрит на `n_point=6000` и не сразу видит, что после `nextPow2` получится `nFFT=8192`, а в выходе `[batch]` структур (не `[batch, n_point]` массив).
- AI пишет тесты с неправильным `assert` на размер выхода.

Нужен **поток данных через метод** — связь между параметрами и формами на каждом этапе.

---

## 2. Варианты визуализации (sequential thinking)

| Форма | Плюсы | Минусы |
|---|---|---|
| **ASCII flow** (стрелочки `▼`) | Видно глазами, не нужен рендерер, влезает в diff | для AI — текст-как-текст |
| **Mermaid `flowchart TD`** | GitHub/VS Code рендерят как картинку | сложнее в diff, AI парсит как код |
| **Таблица stages** | Машинно-читаемо, AI парсит чётко | не так наглядно человеку |
| **Формульная строка** | компактно | не помещаются операции |

### Решение: **обе формы вместе** в YAML-блоке метода:

- `data_flow: |` — ASCII-схема для человека (читается глазами).
- `shapes:` — структурированный список stage→shape→dtype→op для AI.

---

## 3. Шаблон полей в YAML-блоке метода

Добавляются сразу после `brief:`:

```yaml
data_flow: |
  data (CPU)            [beam_count, n_point]               complex<float>
                              │ H2D copy
                              ▼
  buffer_in (GPU)       [beam_count, n_point]               complex<float>
                              │ PadDataOp kernel (zero-pad до nFFT)
                              ▼
  buffer_padded (GPU)   [beam_count, nFFT]                  complex<float>
                              │ hipfftExecC2C(plan, batch=beam_count, FORWARD)
                              ▼
  buffer_fft_out (GPU)  [beam_count, nFFT]                  complex<float>
                              │ D2H copy
                              ▼
  result (CPU)          [beam_count] of FFTComplexResult{ mag[nFFT], phase[nFFT] }

shapes:                       # машинно-парсимая версия data_flow для AI/индексера
  - stage: input
    where: CPU
    shape: "[beam_count, n_point]"
    dtype: "complex<float>"
    example: "[128, 6000]"
  - stage: H2D
    where: "CPU → GPU"
    shape: "[beam_count, n_point]"
    dtype: "complex<float>"
    op: "hipMemcpy"
  - stage: padded
    where: GPU
    shape: "[beam_count, nFFT]"
    dtype: "complex<float>"
    op: "PadDataOp kernel (hiprtc)"
    example: "[128, 8192]"           # nFFT = nextPow2(6000) = 8192
  - stage: fft_out
    where: GPU
    shape: "[beam_count, nFFT]"
    dtype: "complex<float>"
    op: "hipfftExecC2C(FORWARD, batch=beam_count)"
    example: "[128, 8192]"
  - stage: D2H
    where: "GPU → CPU"
    shape: "[beam_count, nFFT]"
    dtype: "complex<float>"
    op: "hipMemcpy"
  - stage: output
    where: CPU
    shape: "[beam_count]"
    dtype: "FFTComplexResult"
    example: "[128]"
    notes: "каждый FFTComplexResult содержит magnitudes[nFFT] и phases[nFFT]"
```

---

## 4. Что это даёт

### Для человека (Alex)
- Глазами видишь: input был `[128, 6000]` → после padding стал `[128, 8192]` (потому что `nFFT=nextPow2(6000)=8192`).
- Между stage'ами видны kernel-launches (PadDataOp / hipfftExecC2C).
- Видно что выход — `[128]` структур, не `[128, 8192]` массив.

### Для AI
- Корректный assert в тесте:
  ```cpp
  auto results = proc->ProcessComplex(data, params);
  ASSERT_EQ(results.size(), params.beam_count);
  ASSERT_EQ(results[0].magnitudes.size(), nFFT);    // не n_point!
  ```
- Понимание где H2D/D2H — это часто bottleneck → можно предложить perf-тест с `hipEvent` между stages.
- Знание что padded buffer на GPU `[beam, nFFT]` complex<float> = `8 * beam * nFFT bytes` — оценка VRAM.

---

## 5. Связь с твоим стилем комментариев в `core`

В шапках `core/services/profiling/profiling_facade.hpp` уже стиль:
```
ЧТО:    ...
ЗАЧЕМ:  ...
ПОЧЕМУ: ...
ИСПОЛЬЗОВАНИЕ:
   ...
ИСТОРИЯ:
   ...
```

Предлагаю **расширить** этим стилем — добавить секцию `ДАННЫЕ:` в шапку `.hpp` для каждого процессорного класса:

```cpp
// ============================================================================
// FFTProcessorROCm — thin Facade for FFT using hipFFT + hiprtc kernels
//
// ЧТО:    ...
// ЗАЧЕМ:  ...
// ПОЧЕМУ: ...
// ИСПОЛЬЗОВАНИЕ: ...
// ИСТОРИЯ: ...
//
// ДАННЫЕ (ProcessComplex):
//   CPU [batch, n_point] c64  ─H2D─►  GPU [batch, n_point]
//     ─Pad─► GPU [batch, nFFT]  ─hipFFT─► GPU [batch, nFFT]
//     ─D2H─► CPU [batch] of FFTComplexResult{mag[nFFT], phase[nFFT]}
//
// ДАННЫЕ (ProcessMagnitudesToGPU):
//   GPU [batch, n_point] c64  ─Pad+Window─► GPU [batch, nFFT]
//     ─hipFFT─► GPU [batch, nFFT]  ─Magnitude─► GPU [batch, nFFT] f32
// ============================================================================
```

### Преимущество
**Один источник правды — код**. Алекс пишет ASCII flow один раз в шапке hpp (как привык).
Автогенератор `dsp-asst manifest init`:
1. Парсит шапку `.hpp` (regex по маркерам `ЧТО:` / `ДАННЫЕ:` / ...).
2. Извлекает блок `ДАННЫЕ` для каждого метода.
3. Кладёт в `_RAG_TEST_PARAMS.md` как `data_flow:`.
4. Распарсивает в структурированный `shapes:` (там где может).

Алекс правит **только в hpp**, индексер тащит. Никакого дублирования.

---

## 6. Альтернатива — Mermaid

Если хочешь рендеринг в GitHub/VS Code как картинку — Mermaid:

```yaml
data_flow_mermaid: |
  flowchart TD
      A["data (CPU)<br/>[beam, n_point]<br/>complex&lt;float&gt;"]
      B["buffer_in (GPU)<br/>[beam, n_point]"]
      C["buffer_padded (GPU)<br/>[beam, nFFT]"]
      D["buffer_fft_out (GPU)<br/>[beam, nFFT]"]
      E["result (CPU)<br/>[beam] FFTComplexResult"]
      A -->|H2D copy| B
      B -->|PadDataOp| C
      C -->|hipfftExecC2C| D
      D -->|D2H copy| E
```

**Плюс**: красивая картинка в браузере / IDE.
**Минус**: AI плохо парсит mermaid (это код для рендерера, а не данные). diff'ы хуже читаются.

**Рекомендую ASCII** — он и человеку понятен, и AI парсится.

---

## 7. Объём

Дополнительные строки на метод:
- `data_flow:` — 8-15 строк
- `shapes:` — 20-40 строк YAML

На метод итого +30-50 строк. Для класса с 14 методами — +400-700 строк. Для всего spectrum — +3000-5000 строк к `_RAG_TEST_PARAMS.md`.

Это терпимо: файл всё равно листается по классам/методам, не читается линейно.

---

## 8. Поэтапно — что нужно сделать

1. **Добавить в `09_RAG_md_Spec.md` секцию про `data_flow:` + `shapes:`** — формализовать как часть YAML.
2. **Расширить промпт `009_test_params_extract.md`** — научить Qwen парсить шапку hpp на маркер `ДАННЫЕ:` и переносить.
3. **Стандарт шапки hpp** — отдельный документ (`11_HPP_Header_Standard.md`?) с обязательными маркерами `ЧТО:/ЗАЧЕМ:/ПОЧЕМУ:/ИСПОЛЬЗОВАНИЕ:/ДАННЫЕ:/ИСТОРИЯ:`.
4. **Автогенератор `manifest init`** — парсит маркер `ДАННЫЕ:` в каждом hpp, генерит `data_flow:` и `shapes:`.
5. **Пилот**: применить к 3 классам в `spectrum` (FFTProcessorROCm, SpectrumProcessorROCm, SnrEstimator), показать тебе.
6. **Если работает** — раскатываем на все классы автогенератором.

---

## 9. Вопросы Алексу

1. **`data_flow:` + `shapes:` — формат ОК?** Или хочешь только ASCII (без `shapes:`)? Или только `shapes:` (без ASCII)? Или mermaid?
2. **Добавлять в шапку `.hpp` маркер `ДАННЫЕ:`** как новый стандарт? Если да — я подготовлю **`11_HPP_Header_Standard.md`** с полным шаблоном шапки и примерами.
3. **Метод 2 и 3 в файле-примере** — переписать с `data_flow:` + `shapes:` или достаточно Method 1 как образца?
4. **Mermaid-вариант** — добавить вторичным (рядом с ASCII), для красивого GitHub-просмотра? Или это излишне?

---

*Конец draft 1. Связан с [09_RAG_md_Spec.md](./09_RAG_md_Spec.md) и [examples/_RAG_TEST_PARAMS.example.md](./examples/_RAG_TEST_PARAMS.example.md) (там Method 1 уже расширен `data_flow:` + `shapes:`).*

### От  Alex
Мне очень понравилась идея с данными в шапке `.hpp`. Это действительно удобно для понимания контекста кода. !!!
1. не очень понятно (( ребята сломаются на этом
ДАННЫЕ (ProcessComplex):
//   CPU [batch, n_point] c64  ─H2D─►  GPU [batch, n_point]
//     ─Pad─► GPU [batch, nFFT]  ─hipFFT─► GPU [batch, nFFT]
//     ─D2H─► CPU [batch] of FFTComplexResult{mag[nFFT], phase[nFFT]}
//
// ДАННЫЕ (ProcessMagnitudesToGPU):
//   GPU [batch, n_point] c64  ─Pad+Window─► GPU [batch, nFFT]
//     ─hipFFT─► GPU [batch, nFFT]  ─Magnitude─► GPU [batch, nFFT] f32

 - давай подумаем. Если там будет поля описания doxygen может на них ссылаться?
 писать тесты только там где есть 1. teg на тест 2. где есть описвние на doxygen
 на примере FFT:
  параметр int n_fft - размер fft 
  а по teg тест { n_fft =[8..4096], value = 1024, step = 2^n n=[2, 3, 4, ...] } -идея!!
  тогда все проавиться - должно быть компактно одна строка один параметр 
  а в _RAG_TEST_PARAMS.md - ты можешь писать как тебе удобно для работы и если в коде нет тега теста тест не генериуется просто просит с начало создать параметры
  