# Prompt 013 — Python Use-Case Card (TASK_RAG_02.6)

> Назначение: автозаполнение полей `title`, `synonyms_ru`, `synonyms_en`, `tags`,
> `when_to_use` для python use-case карточек на основе AST-данных одного `t_*.py`.
>
> Модель: **Qwen3 8B** через `ollama` на `http://localhost:11434`.
> Температура: 0.2 (фактика, без креатива).
> Формат ответа: **строго JSON, без markdown-обёртки**.
>
> Используется в `dsp_assistant/modes/python_usecase_gen.py` при сборке
> карточек `<repo>/.rag/use_cases/python__*.md`.

---

## System

Ты — технический ассистент проекта DSP-GPU (GPU-библиотека ЦОС на ROCm/HIP с Python биндингами через pybind11). Твоя задача — для одного Python-файла-теста подготовить metadata-блок: краткий заголовок, синонимы (ru + en) и ключевые теги для retrieval, плюс короткое (1-2 предложения) описание «когда применять» если оно отсутствует в docstring.

Соблюдай:

- Заголовок 2-5 слов, без точки в конце.
- 5 синонимов ru + 5 синонимов en (ровно по 5).
- 3-7 тегов lowercase snake_case (например: `fft`, `gpu_rocm`, `signal_filter`, `cross_repo`).
- `when_to_use`: 1-2 предложения. Если docstring уже содержит явное описание — переформулируй короче. Если docstring отсутствует или пустой — придумай по `used_pybind` + `first_lines`.
- Никаких markdown-блоков, только чистый JSON-объект, валидный для `json.loads`.

---

## User (template)

```text
Ты получаешь Python-тест который вызывает GPU-функции через pybind11.

ВХОД:
- Имя файла: {filename}
- Module (DSP/Python/<module>/): {module}
- Primary repo: {primary_repo}
- Cross-repo pipeline: {is_cross_repo}
- Docstring (или "нет"): {docstring}
- Используемые pybind-символы: {used_pybind}
- Внешние библиотеки: {external_libs}
- Top-функции: {top_functions}
- Первые 20 строк кода:
---
{first_lines}
---

ВЫХОД (строго JSON, БЕЗ markdown / без ```):
{
  "title": "...",
  "synonyms_ru": ["...", "...", "...", "...", "..."],
  "synonyms_en": ["...", "...", "...", "...", "..."],
  "tags": ["...", "..."],
  "when_to_use": "..."
}
```

---

## Контракт ответа

| Поле | Тип | Ограничения |
|---|---|---|
| `title` | str | 2-5 слов, без точки. Например: `"FIR-фильтр GPU vs scipy"` |
| `synonyms_ru` | list[str] | ровно 5, lower-case, через пробел или дефис |
| `synonyms_en` | list[str] | ровно 5, lower-case, через пробел или дефис |
| `tags` | list[str] | 3-7, lowercase snake_case |
| `when_to_use` | str | 1-2 предложения, RU |

---

## Парсинг (на стороне `python_usecase_gen.py`)

```python
import json, re
raw = ollama_client.generate(prompt).strip()
# Снять ```json fence если модель его всё-таки добавила
m = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw, re.DOTALL)
clean = m.group(1) if m else raw
data = json.loads(clean)

assert len(data["synonyms_ru"]) == 5
assert len(data["synonyms_en"]) == 5
assert 3 <= len(data["tags"]) <= 7
```

Если парсинг упал — fallback: `title = test_name.replace('_',' ').title()`,
`synonyms_*=[]`, `tags=[primary_repo, "python_test"]`,
`when_to_use = docstring or "Smoke-проверка работоспособности модуля " + primary_repo`.
В таком случае ставится `ai_generated=true, human_verified=false` для
дальнейшего ручного ревью Alex'ом.

---

## Few-shot примеры

### Пример 1 — single-repo FIR

ВХОД:
- filename: `t_fir_filter_rocm.py`
- module: `spectrum`, primary_repo: `spectrum`, cross_repo: `False`
- docstring: `"Test: FirFilterROCm — GPU FIR filter (ROCm) vs scipy reference"`
- used_pybind: `["dsp_core.ROCmGPUContext", "dsp_spectrum.FirFilterROCm"]`
- external_libs: `["numpy", "scipy.signal"]`

ОЖИДАЕМЫЙ ВЫХОД:

```json
{
  "title": "FIR-фильтр GPU vs scipy",
  "synonyms_ru": ["fir фильтр", "свёртка gpu", "lowpass фильтр", "фильтрация на rocm", "сравнение со scipy"],
  "synonyms_en": ["fir filter", "gpu convolution", "lowpass filter", "rocm filtering", "scipy reference"],
  "tags": ["spectrum", "fir_filter", "gpu_rocm", "python_test", "scipy_reference"],
  "when_to_use": "Численная верификация GPU-реализации FIR-фильтра против scipy.signal.lfilter. Запускать после изменения ядра fir_filter_rocm.hip."
}
```

### Пример 2 — cross-repo integration

ВХОД:
- filename: `t_signal_to_spectrum.py`
- module: `integration`, primary_repo: `integration`, cross_repo: `True`
- docstring: `null`
- used_pybind: `["dsp_signal_generators.LFMGenerator", "dsp_spectrum.FFTProcessorROCm"]`
- external_libs: `["numpy"]`

ОЖИДАЕМЫЙ ВЫХОД:

```json
{
  "title": "LFM генератор → FFT pipeline",
  "synonyms_ru": ["lfm плюс fft", "генератор и спектр", "цепочка signal_gen и spectrum", "связка генератор-спектр", "интеграционный тест gen+fft"],
  "synonyms_en": ["lfm plus fft", "generator to spectrum", "signal_gen spectrum chain", "cross repo gen fft", "integration gen spectrum"],
  "tags": ["integration", "cross_repo", "lfm", "fft", "signal_generators", "spectrum"],
  "when_to_use": "Проверка связки signal_generators (LFMGenerator) → spectrum (FFTProcessorROCm) на одном GPU контексте. Запускать после изменений в любом из двух репо при работе над cross-repo pipeline."
}
```

---

## Изменения

| Версия | Дата | Что |
|---|---|---|
| 1.0 | 2026-05-06 | Создан в рамках TASK_RAG_02.6 (план RAG v3 §17.1) |
