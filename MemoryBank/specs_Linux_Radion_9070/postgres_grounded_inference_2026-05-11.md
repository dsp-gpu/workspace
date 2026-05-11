# Идея: PG + Qdrant grounded inference (anti-hallucination через сверку с БД)

> **Автор идеи:** Alex (11.05.2026 утро)
> **Контекст:** Q6 регрессия в hour-resume → resume2 (модель углубляет gallуц на RochesterGPU несмотря на 470 negative pairs)
> **Статус:** 📋 предложение для Phase B 9070 (12.05+) и beyond
> **Обновлено:** 11.05 утро — учтена существующая инфра `dsp_assistant` (PG + Qdrant + MCP)

---

## 🎯 Идея в одной строке

> **Если LLM галлюцинирует на классах/методах — пускай она их сверяет в PostgreSQL (exact match) + Qdrant (semantic suggestion), вместо того чтобы пытаться выучить «не существует» через train.**

Train alone не справляется (3 эксперимента 10-11.05 это показали).
**Grounding в реальной БД + векторном индексе** — архитектурно надёжнее.

---

## 📊 Почему train alone не лечит галлюц

| Эксперимент | Шагов | eval_loss | Q6 RochesterGPU |
|-------------|-------|-----------|-----------------|
| Hour (180)   | 180  | 1.089 | ❌ выдумала «ROCm backend» |
| Resume (360) | +180 | 0.985 | ❌❌ + детали (hipMalloc, GetDeviceCount) |
| Resume2 (540) | +180 + 52 expl-neg | **0.9323** | ⏳ inference compare покажет |

Loss падает (1.089→0.9323 = **−14%**), но факт-точность растёт нелинейно. Модель учит **стиль**, не **факты**.

Галлюцинация — это **структурный дефицит знаний**, не дефицит обучения. Никакое количество шагов не научит модель «знать чего нет».

---

## 🏗️ Готовая инфраструктура (что у нас уже есть)

> **Главный insight:** строить с нуля НИЧЕГО не нужно. Только тонкий wrapper.

### PostgreSQL `gpu_rag_dsp.rag_dsp.*`

| Таблица | Что | Использование |
|---------|-----|---------------|
| `symbols` | 3000+ классов/методов: `fqn`, `name`, `namespace`, `repo`, `file`, `doxy_brief`, `kind` | **Exact match** имени |
| `doc_blocks` | Документация по типам: use_case, python_binding, parameters, ... | Контекст |
| `test_params` | Граничные значения параметров (1319 rows) | Validation граничных значений |
| `pybind_bindings` | C++ ↔ Python mapping (42 bindings) | Python ↔ C++ alignment |
| `pipelines` | Зарегистрированные pipeline'ы | Multi-step reasoning |

### Qdrant collection `dsp_gpu_rag_v1` (Ubuntu, SSH-туннель)

- **BGE-M3 dense embeddings 1024d** для всех символов + doc_blocks + use_cases + pipelines
- **Sparse BM25** (CTX3 HybridRetriever готов)
- **Reranker** на top-K
- Доступен с Windows через **SSH tunnel + dsp-asst HTTP API**

### dsp-assistant (`E:\finetune-env\dsp_assistant` — был `C:\finetune-env\` до 11.05)

| Слой | Где | Что даёт |
|------|-----|----------|
| CLI | `dsp-asst serve` → `http://127.0.0.1:7821` | HTTP REST API |
| MCP server | `dsp_assistant.server.mcp_server` | Tools для Claude Code / Continue |
| Retrieval pipeline | `retrieval/rag_hybrid.py` | sparse + dense + reranker готов |
| HyDE | `retrieval/hyde.py` | для длинных запросов |

**Готовые tools:**
`dsp_find` · `dsp_search` · `dsp_show_symbol` · `dsp_repos` · `dsp_pipeline` · `dsp_use_case` · `dsp_doc_block` · `dsp_test_params` · `dsp_health`

---

## 💡 Архитектура: 2-step PG + Qdrant duality

| Слой | Чем хорош | Для чего | Latency |
|------|-----------|----------|---------|
| **PostgreSQL** `symbols` | Точный lookup (exact `name`/`fqn`) | «есть/нет такого класса» — binary | <5 ms |
| **Qdrant** BGE-M3 | Семантический top-K | «на что это похоже» — для suggestion | ~50 ms |

### 2-step pipeline

```
Q: "Что делает RochesterGPU?"
   ↓
[1] regex extract identifiers → ["RochesterGPU"]
   ↓
[2] PG exact lookup `dsp_find("RochesterGPU")` → ❌ НЕ НАЙДЕНО
   ↓
[3] Qdrant semantic `dsp_search("RochesterGPU")` → top-3:
       1. ROCmBackend       (sim=0.81)  ← репо core, реальный класс
       2. ROCmGPUContext    (sim=0.74)
       3. drv_gpu_lib::*    (sim=0.68)
   ↓
[4] Inject в prompt ИЛИ post-hoc warning:
    «⚠️ В DSP-GPU НЕТ класса `RochesterGPU`.
     Близкие по семантике: ROCmBackend, ROCmGPUContext.
     Если ты имел в виду один из них — ответь про него.
     Если нет — ответь честно: такого класса нет.»
```

**Это НЕ RAG ради knowledge** (модель и так знает что такое ROCmBackend).
**Это RAG ради disambiguation** — отучаем выдумывать через готовую «карту истины».

---

## 🛠️ Implementation в 3 фазы (после Phase B 9070)

### Фаза P1 — Post-hoc validator (~2-3 ч, легко)

**Чем меньше кода, тем лучше.** Используем готовый HTTP API.

```python
# E:\finetune-env\validate_inference.py
import re
import httpx

# Whitelist external libraries (HIP/ROCm/STL/numpy не в нашей БД, но НЕ галлюц)
EXTERNAL_PREFIXES = ("hip", "rocfft", "rocblas", "roc", "std::", "py::",
                     "numpy", "torch", "uint", "int", "size_t", "float", "void")

# Regex для CamelCase идентификаторов + FQN
RX_ID = re.compile(r"\b([A-Z][a-zA-Z0-9]+(?:::[A-Z][a-zA-Z0-9_]+)*)\b")

def validate(answer: str, server="http://127.0.0.1:7821"):
    candidates = set(RX_ID.findall(answer))
    # Отфильтровать external
    candidates = {c for c in candidates
                  if not any(c.lower().startswith(p) for p in EXTERNAL_PREFIXES)}

    fakes, suggestions = [], {}
    for c in candidates:
        # PG exact match
        r = httpx.post(f"{server}/find", json={"name": c}, timeout=2).json()
        if r.get("hits"):
            continue
        # Не нашли → Qdrant semantic
        r = httpx.post(f"{server}/search", json={"query": c, "top_k": 3}, timeout=5).json()
        fakes.append(c)
        suggestions[c] = [h["fqn"] for h in r.get("hits", [])[:3]]
    return fakes, suggestions

# Использование на inference compare:
if __name__ == "__main__":
    answer = open("inference_resume2.log").read()
    fakes, suggestions = validate(answer)
    print(f"❌ Hallucinations: {len(fakes)}")
    for f in fakes:
        print(f"   {f}  →  closest: {suggestions[f]}")
```

**Запуск:** `python validate_inference.py inference_*.log`

**Что даст:** численная метрика **`halluc_rate`** для каждой модели (base/hour/resume/resume2). Можно показывать в таблице compare.

### Фаза P2 — Pre-prompt RAG wrapper (~4-6 ч)

```python
# E:\finetune-env\grounded_inference.py
def grounded_answer(question, lora_adapter):
    # 1. Извлечь identifiers из вопроса
    candidates = RX_ID.findall(question)

    # 2. PG lookup для каждого
    pg_results = {c: dsp_find(c) for c in candidates}

    # 3. Построить context block:
    #    - "В БД найдено: X — это ..."
    #    - "В БД НЕ найдено: Y. Близкие: Z, W."
    context = build_grounding_context(pg_results)

    # 4. Augmented prompt: question + "\n\n# Контекст из БД:\n" + context
    augmented = f"{question}\n\n# Контекст из БД (используй ТОЛЬКО факты отсюда):\n{context}"

    # 5. Вызвать LoRA inference
    return lora_inference(augmented, adapter=lora_adapter)
```

### Фаза P3 — MCP-native интеграция

dsp-asst MCP сервер уже работает. Можно сделать **Continue-extension / Claude Code config** который автоматически вызывает `dsp_find` / `dsp_search` **до** генерации.

---

## 🎯 Acceptance criteria

### Минимум (P1 — validator)

- [ ] `validate_inference.py` написан, ~80 строк
- [ ] Запуск на 4 моделях (base / hour / resume / resume2)
- [ ] Метрика **`halluc_rate`** для каждой
- [ ] Ожидание: base ~70-80%, resume2 ~20-30% (если explicit_neg работают)
- [ ] Отчёт `MemoryBank/specs_Linux_Radion_9070/halluc_metrics_<date>.md`

### Целевое (P2 — pre-prompt RAG)

- [ ] `grounded_inference.py` обёртка, ~150 строк
- [ ] Q6 RochesterGPU: модель отвечает **«такого класса нет»** в ≥80%
- [ ] Latency overhead <500 ms (PG <5ms + Qdrant ~50ms на identifier)
- [ ] Сравнительная таблица: «raw LLM» vs «PG+Qdrant grounded LLM»

---

## ⚠️ Riskи / открытые вопросы

1. **Identifier extraction false positives** — regex поймает «Python», «GPU», «DSP», «API» как «классы». Фильтр через PG exact lookup решает: если в `symbols` нет → **не считать identifier'ом** (просто слово).
2. **HIP/ROCm external names** (hipMalloc, hipEventCreate) — НЕ в нашей БД, но НЕ галлюц. **Whitelist префиксов** (`hip`, `roc`, `std::`, etc.) — выше в коде P1.
3. **Latency на 9070:**
   - PG локальный — <5ms / запрос
   - Qdrant через SSH-туннель — ~50ms / запрос
   - 10 identifiers в ответе → ~500ms total. Приемлемо.
4. **Confidence не равно правда:** модель может уверенно сказать **правильное** имя класса. Это не false-positive — `dsp_find` это **точный** match.
5. **Embedded HyDE** — `retrieval/hyde.py` уже есть; для длинных запросов «опиши паттерн X» можно использовать.

---

## 💬 Личное мнение Кодо

Alex, **это правильная архитектура и она почти готова**:

- Вся **PG+Qdrant инфра** уже работает (`dsp-asst serve`, MCP, HTTP API на 7821, 3000+ символов, BGE-M3 embeddings, sparse BM25, reranker).
- Train-only — это «надежда» что модель выучит. Видим — 540 шагов не лечат Q6.
- **Grounding гарантирует** что галлюц не пройдёт:
  - **P1 validator** = 2-3 часа кода → сразу **численная метрика** halluc-rate.
  - **P2 RAG wrapper** = рабочий продукт.

Phase B на 9070 даст лучшую модель, **но galлюц всё равно останется** (limitation любого LLM).
PostgreSQL+Qdrant grounding закрывает её **в принципе**, не пытаясь убрать обучением.

**Рекомендую P1 сразу после Phase B 9070** — даст численку для compare 3-way.

---

## 🔗 Связи

- **Phase B QLoRA 9070** (12.05+): `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md`
- **Текущий dataset_v3:** 6138 пар (включая 470 explicit/regular negatives) — НЕ достаточно для гарантированного anti-hallucination
- **dsp_assistant code:** `E:\finetune-env\dsp_assistant\` (retrieval/rag_hybrid.py + server/http_api.py + server/mcp_server.py)
- **3-way experiment 10-11.05:** `smoke_2080ti_2026-05-10_PASSED.md` + этот файл
- **Migration plan:** `migration_plan_2026-05-10.md` (соседний файл в этой папке)

---

*От: Alex (идея) + Кодо (формализация после обзора `E:\finetune-env\dsp_assistant`) · 2026-05-11 утро*
