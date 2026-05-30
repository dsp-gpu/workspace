# TASK — Phase 7: DeepSeek deploy → compare → RAG→llama → train

> **Создано:** 2026-05-30 · Кодо
> **Старт:** 2026-06-01
> **Status:** 🟡 READY — модели скачаны (50.7 GB), ждёт старта на Debian
> **Железо:** дома RX 9070 16 GB + 64 GB RAM, Debian + ROCm 7.2+, llama-server
> **Зависит от:** `specs/deepseek_analysis_2026-05-28.md`, `specs/phase6_FINAL_2026-05-28.md`
> **Оценка:** 2-3 рабочих дня (фазы A-E)

---

## 🎯 Цель

Развернуть 6 скачанных DeepSeek-моделей, подключить speculative-ускорители, **перевести весь RAG-стек на единый llama-server** (embeddings + reranker + generation), сравнить с production-Qwen (правило 17-llm-bench), и обучить DeepSeek (QLoRA 8B пилот → 14B) против нашего Qwen2.5-Coder-14B.

**Планка quality** = Qwen2.5-Coder-14B. Оставляем в работе только модели ≥ планки **по числам**, остальное удаляем.

---

## 📦 Что есть на входе

### Скачано (`D:\offline-debian-pack\1_models\DeepSeek\`, 50.7 GB)

| Модель | Quant | GB | Роль |
|---|---|--:|---|
| Qwen2.5-Coder-1.5B-Instruct | Q8_0 | 1.53 | draft → наш Qwen2.5-Coder-14B |
| DeepSeek-R1-Distill-Qwen-1.5B | Q8_0 | 1.76 | draft → R1-Distill-14B/32B |
| DeepSeek-R1-0528-Qwen3-8B | Q8_0 | 8.11 | reasoning competitor |
| DeepSeek-R1-Distill-Qwen-14B | Q5_K_M | 9.79 | competitor vs наш 14B |
| DeepSeek-Coder-V2-Lite-Instruct | Q5_K_M | 11.04 | coder competitor (MoE) |
| DeepSeek-R1-Distill-Qwen-32B | Q4_K_M | 18.49 | reasoning, partial offload |

### Production (Phase 6, уже работает)

- Qwen3.6-35B-A3B-MTP (топ-1 quality, MTP draft встроен)
- Qwen3-Coder-30B-A3B (топ-2 speed)
- Qwen2.5-Coder-14B (FT-target, обучаем)
- embeddings: bge-m3, bge-reranker-v2-m3, jina-v3 (сейчас через dsp-asst)

### Ещё НЕ скачано (для Phase E — train)

- `deepseek-ai/DeepSeek-R1-Distill-Qwen-14B` FP16 (~28 GB)
- `deepseek-ai/DeepSeek-R1-0528-Qwen3-8B` FP16 (~16 GB)
- training stack: bitsandbytes 1.33.7.preview + unsloth + peft/trl

---

## 🗺️ Speculative drafts — карта подключения

> **Главное правило**: draft подключается только к модели **той же семьи** с тем же токенизатором. Чужой draft = низкий acceptance = замедление.

| Target (production/new) | Подходящий draft | Acceptance | Speedup | Статус |
|---|---|--:|--:|---|
| **Qwen2.5-Coder-14B** (наш FT) | Qwen2.5-Coder-1.5B Q8 ✅ скачан | ~75% | ×2-2.5 | 🟢 готово |
| DeepSeek-R1-Distill-14B | R1-Distill-1.5B Q8 ✅ скачан | ~70% | ×1.6-2.5 | 🟢 готово |
| DeepSeek-R1-Distill-32B | R1-Distill-1.5B Q8 ✅ скачан | ~65% | ×1.5-2 | 🟢 готово |
| Qwen3.6-35B-A3B-MTP | (встроенный MTP draft) | — | ×1.7 | 🟢 уже Phase 6 |
| **Qwen3-Coder-30B-A3B** | ❌ нет Qwen3-Coder draft | — | — | 🔴 draft не скачан |
| DeepSeek-R1-0528-Qwen3-8B | ❌ нет Qwen3-0.6B-R1 draft | — | — | 🟡 без speculative |
| DeepSeek-Coder-V2-Lite | (MoE 2.4B active — сам быстрый) | — | — | 🟡 draft не нужен |

**Вывод по ускорителям**:
- ✅ 3 пары готовы к speculative (наш Coder-14B + R1-14B + R1-32B)
- 🔴 Qwen3-Coder-30B speedup только через **EAGLE-3** (`lmsys/SGLang-...`, требует SGLang) — отдельный эксперимент Phase 8
- 🟡 R1-0528-8B и V2-Lite запускаем без draft (8B и так быстрый, V2-Lite MoE сам по себе быстрый)

---

## 🔧 Phase A — Deploy на Debian (~1 час)

### A1. Перенос моделей на Debian SSD

> Структура папок та же что при скачке (`offline-debian-pack/1_models/DeepSeek/`), меняется только префикс: Windows `D:\` → Debian `/home/alex/`.
> Итоговый путь на Debian: **`/home/alex/offline-debian-pack/1_models/DeepSeek/`**

```bash
# Скопировать папку DeepSeek/ с переносного SSD на Debian (структура сохраняется):
#   D:\offline-debian-pack\1_models\DeepSeek\  →  /home/alex/offline-debian-pack/1_models/DeepSeek/
# Проверка после копирования:
ls -lh /home/alex/offline-debian-pack/1_models/DeepSeek/*/*.gguf
```

### A2. Симлинки в llama.cpp/models/

```bash
LM=/home/alex/llama.cpp/models
DS=/home/alex/offline-debian-pack/1_models/DeepSeek

ln -sfn $DS/Qwen2.5-Coder-1.5B-Instruct-GGUF/Qwen2.5-Coder-1.5B-Instruct-Q8_0.gguf       $LM/qwen2.5-coder-1.5b-draft.gguf
ln -sfn $DS/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/DeepSeek-R1-Distill-Qwen-1.5B-Q8_0.gguf    $LM/r1-1.5b-draft.gguf
ln -sfn $DS/DeepSeek-R1-0528-Qwen3-8B-GGUF/DeepSeek-R1-0528-Qwen3-8B-Q8_0.gguf            $LM/r1-0528-qwen3-8b.gguf
ln -sfn $DS/DeepSeek-R1-Distill-Qwen-14B-GGUF/DeepSeek-R1-Distill-Qwen-14B-Q5_K_M.gguf    $LM/r1-distill-14b.gguf
ln -sfn $DS/DeepSeek-Coder-V2-Lite-Instruct-GGUF/DeepSeek-Coder-V2-Lite-Instruct-Q5_K_M.gguf $LM/dsv2-lite.gguf
ln -sfn $DS/DeepSeek-R1-Distill-Qwen-32B-GGUF/DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf    $LM/r1-distill-32b.gguf
```

### A3. Smoke test — каждая модель грузится

```bash
cd /home/alex/llama.cpp
for m in r1-0528-qwen3-8b r1-distill-14b dsv2-lite; do
    echo "=== $m ==="
    timeout 60 ./build/bin/llama-server -m $LM/$m.gguf -c 2048 -ngl 99 \
        --host 127.0.0.1 --port 8090 > /tmp/smoke-$m.log 2>&1 &
    sleep 30
    curl -s http://127.0.0.1:8090/health && echo " ← $m OK"
    pkill -f "llama-server.*$m"
    sleep 3
done
```

**Gate A**: все 6 моделей грузятся без ошибок hyperparameters/OOM (32B — с `-ngl 50` partial).

---

## ⚡ Phase B — Speculative подключение + замер (~1 час)

### B1. Наш Qwen2.5-Coder-14B + draft (главный ROI)

```bash
cd /home/alex/llama.cpp
nohup ./build/bin/llama-server \
    -m $LM/qwen2.5-coder-14b-dsp.gguf \
    -md $LM/qwen2.5-coder-1.5b-draft.gguf \
    --draft-max 16 --draft-min 4 --draft-p-min 0.9 \
    -c 4096 -fa on -ngl 99 -ngld 99 \
    --host 127.0.0.1 --port 8080 > /tmp/ls-coder14b-spec.log 2>&1 &
```

### B2. Замер до/после (один и тот же prompt)

```bash
# baseline (Phase 6): 43.5 tok/s
# с draft измерить tok/s через curl + jq timing
curl -s http://127.0.0.1:8080/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"<DSP-GPU codegen prompt>"}],"max_tokens":2000,"temperature":0.3}' \
    | jq '.usage, .timings'
```

**Gate B**: speculative даёт ≥ ×1.5 speedup для Coder-14B + R1-14B. Записать tok/s до/после.

---

## 🔀 Phase C — RAG → единый llama-server (~2-3 часа)

> **Цель**: убрать dsp-asst для embeddings/reranker, всё через llama-server. Единый стек, проще деплой.

### C1. Embeddings через llama-server

bge-m3 — это BERT/XLM-R, llama.cpp поддерживает через `--embeddings`. Нужен GGUF bge-m3 (проверить есть ли локально, иначе скачать `CompendiumLabs/bge-m3-gguf` или конвертировать).

```bash
# Отдельный llama-server на embedding-порту
nohup ./build/bin/llama-server \
    -m $LM/bge-m3-q8.gguf \
    --embeddings -c 8192 -ngl 99 \
    --host 127.0.0.1 --port 8081 > /tmp/ls-embed.log 2>&1 &

# Тест:
curl -s http://127.0.0.1:8081/v1/embeddings \
    -H "Content-Type: application/json" \
    -d '{"input":"FFT processor GPU kernel"}' | jq '.data[0].embedding | length'
# Должно вернуть размерность 1024 (bge-m3)
```

### C2. Reranker через llama-server

llama-server поддерживает rerank через `--reranking` + endpoint `/v1/rerank` (bge-reranker-v2-m3 — cross-encoder, llama.cpp умеет с недавних версий).

```bash
nohup ./build/bin/llama-server \
    -m $LM/bge-reranker-v2-m3-q8.gguf \
    --reranking -c 8192 -ngl 99 \
    --host 127.0.0.1 --port 8082 > /tmp/ls-rerank.log 2>&1 &

curl -s http://127.0.0.1:8082/v1/rerank \
    -H "Content-Type: application/json" \
    -d '{"query":"FFT GPU","documents":["FFTProcessor class","median filter"]}' | jq
```

⚠️ **Риск C2**: если llama.cpp reranking версия не тянет bge-reranker-v2-m3 корректно — оставить reranker на dsp-asst (fallback), embeddings всё равно перевести. Проверить на golden_set из rag-mentor.

### C3. Переключить RAG-клиент на новые порты

```
Было:  dsp-asst :XXXX (embeddings + rerank)
Стало: llama-server :8081 (embed) + :8082 (rerank) + :8080 (generation)
```

Обновить конфиг RAG-pipeline (rag-mentor / dsp-asst client) → 3 llama-server порта. Сверить retrieval quality на golden_set (recall@5, MRR@10) — **не должно упасть** vs dsp-asst baseline.

**Gate C**: embeddings + rerank работают через llama-server, retrieval метрики на golden_set ≥ прежних (или reranker fallback на dsp-asst если llama.cpp слабее).

---

## 📊 Phase D — Phase 7 Compare (~2-3 часа)

### D1. Добавить модели в runner

В `/home/alex/finetune-env/Core/phase6_qwen3coder_30b_moe/run_all_via_llamaserver.sh`:

```bash
# Новые строки массива MODELS:
"r1-distill-14b-spec|$LM/r1-distill-14b.gguf|-md $LM/r1-1.5b-draft.gguf --draft-max 8 --reasoning on"
"r1-0528-qwen3-8b|$LM/r1-0528-qwen3-8b.gguf|--reasoning on"
"dsv2-lite-coder|$LM/dsv2-lite.gguf|"
"r1-distill-32b-partial|$LM/r1-distill-32b.gguf|--reasoning on -ngl 50"
"qwen2.5-coder-14b-spec|$LM/qwen2.5-coder-14b-dsp.gguf|-md $LM/qwen2.5-coder-1.5b-draft.gguf --draft-max 16"
```

### D2. Прогон + запись в БД (правило 17-llm-bench)

```bash
./run_all_via_llamaserver.sh   # DSP-GPU + pao-contrib
# → run_id 12-16 в gpu_rag_dsp.llm_bench.runs
```

### D3. AI-judge (Кодо/сестрёнка) → scores

UPDATE quality/correctness/completeness по каждому ответу.

### D4. Cross-таблица

```sql
SELECT * FROM llm_bench.v_best_per_category WHERE project_name IN ('dsp-gpu','pao-contrib');
```

**Gate D**: 5 новых моделей со scores в БД. Финальная таблица → `specs/phase7_compare_2026-06-0X.md`. Решение: кто ≥ планки Qwen2.5-Coder-14B остаётся, остальные GGUF удаляем.

---

## 🎓 Phase E — QLoRA train DeepSeek vs Qwen2.5-Coder-14B (~1-2 дня)

> Цель: обучить DeepSeek на нашем v7/v8 corpus, сравнить с обученным Qwen2.5-Coder-14B (Phase 6 v7 checkpoint eval 1.844→1.167).

### E1. Скачать FP16 base (на Windows WSL заранее, потом перенос на Debian SSD)

```bash
# Скачка идёт на Windows WSL (где интернет), папка та же offline-debian-pack/1_models/DeepSeek/
source ~/hf-venv/bin/activate
export HF_HUB_DISABLE_XET=1
cd /mnt/d/offline-debian-pack/1_models/DeepSeek   # WSL-вид Windows D:\

# 8B пилот (~16 GB)
hf download deepseek-ai/DeepSeek-R1-0528-Qwen3-8B --local-dir ./DeepSeek-R1-0528-Qwen3-8B-FP16
# 14B основной (~28 GB)
hf download deepseek-ai/DeepSeek-R1-Distill-Qwen-14B --local-dir ./DeepSeek-R1-Distill-Qwen-14B-FP16
```

После скачки — перенос на Debian SSD (тот же суффикс):
```
D:\offline-debian-pack\1_models\DeepSeek\*-FP16  →  /home/alex/offline-debian-pack/1_models/DeepSeek/*-FP16
```
Train (E3/E4) читает base локально из `/home/alex/offline-debian-pack/1_models/DeepSeek/DeepSeek-R1-Distill-Qwen-14B-FP16` (offline, без HF repo id).

### E2. Training stack (на Debian)

```bash
cd /home/alex/finetune-env && source venv/bin/activate
pip install bitsandbytes==1.33.7.preview --index-url https://download.pytorch.org/whl/nightly/rocm6.4
pip install --upgrade --no-deps "unsloth[rocm-torch26] @ git+https://github.com/unslothai/unsloth.git"
pip install -U peft trl transformers datasets accelerate
# Smoke check (см. TASK_download_deepseek_stack.md P2.2)
```

### E3. Пилот 8B (быстрый, проверка пайплайна)

QLoRA на v7 dataset, 100 steps smoke → 750 steps full. Конфиг — из `specs/deepseek_analysis_2026-05-28.md §5` (r=16, adamw_8bit, bf16, gradient_checkpointing=unsloth, batch=2, seq=4K).

### E4. Основной 14B

Тот же конфиг, R1-Distill-Qwen-14B base. 750 steps.

### E5. Compare обученных

```
GGUF-конверт adapter → llama-server → run_all_via_llamaserver.sh →
  • r1-14b-v1-ft  vs  qwen2.5-coder-14b-v7-ft  (Phase 6 baseline)
  → run_id 17-18
```

**Gate E**: обучены 8B + 14B, eval_loss падает, compare записан. Decision: лучше ли DeepSeek-14B-FT vs Qwen2.5-Coder-14B-FT на DSP-GPU задачах?
- Да → новый FT-target
- Нет → остаёмся на Qwen2.5-Coder-14B (Industry consensus «FT for FORM not FACTS» — тогда RAG важнее FT)

---

## ✅ Definition of Done (вся Phase 7)

- [ ] **A**: 6 моделей развёрнуты, smoke OK
- [ ] **B**: speculative ×1.5+ для Coder-14B + R1-14B, tok/s записаны
- [ ] **C**: RAG embeddings+rerank через llama-server, retrieval ≥ baseline (или reranker fallback)
- [ ] **D**: 5 моделей в compare, scores в БД, финальная таблица, слабые удалены
- [ ] **E**: 8B+14B обучены, compare vs Qwen2.5-Coder-14B-FT, decision принят
- [ ] Артефакты: `specs/phase7_compare_2026-06-0X.md`, session, changelog
- [ ] Память обновлена (что осталось в production)

---

## ⚠️ Риски

| # | Риск | Митигация |
|---|---|---|
| R1 | 32B Q4 OOM на 16 GB | `-ngl 50` partial offload (RAM буфер 64 GB есть) |
| R2 | bge-reranker через llama.cpp слабее dsp-asst | fallback reranker на dsp-asst, embeddings всё равно перевести |
| R3 | bge-m3 GGUF нет локально | скачать `CompendiumLabs/bge-m3-gguf` или конвертировать через llama.cpp convert |
| R4 | Qwen3-Coder-30B без draft (нет speedup) | EAGLE-3 эксперимент → Phase 8 (SGLang), не блокирует Phase 7 |
| R5 | bnb 0.49.2 NaN на AMD | bitsandbytes 1.33.7.preview (Phase 6 знаем) |
| R6 | FT 14B не влезает в 16 GB | QLoRA 4-bit + adamw_8bit + grad_checkpoint → ~13-15 GB (см §5 spec) |
| R7 | retrieval quality падает после миграции на llama | замер на golden_set ДО переключения, rollback если хуже |

---

## 🔗 Связанное

- Research: `specs/deepseek_analysis_2026-05-28.md`
- Download task: `tasks/TASK_download_deepseek_stack.md`
- Phase 6 итог: `specs/phase6_FINAL_2026-05-28.md`
- LLM bench: `.claude/rules/17-llm-bench.md`
- Память: `memory/project_deepseek_models_downloaded_2026-05-30.md`

---

*Кодо · 2026-05-30 (старт 2026-06-01)*
