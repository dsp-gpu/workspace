# TASK — Скачать DeepSeek-стек + draft для Qwen2.5-Coder-14B (RX 9070 + 64 GB RAM)

> **Создано:** 2026-05-28 · Кодо (v2 — после ревизии Alex'а)
> **Status:** 🟡 READY — ждёт явного OK на P0a (`go P0a`)
> **Зависит от:** `MemoryBank/specs/deepseek_analysis_2026-05-28.md` v2
> **Где:** WSL Ubuntu, `~/hf-venv/` активирован
> **Куда:** `/mnt/d/offline-debian-pack/1_models/`
> **Принцип:** ВСЕ команды устойчивы к разрыву связи — повтор той же команды докачает с того же байта.

---

## 0. Один раз перед всеми этапами

```bash
# Активация venv + флаг resume + токен + переход в папку
source ~/hf-venv/bin/activate
export HF_HUB_DISABLE_XET=1          # ⚠️ КРИТИЧНО для надёжного resume!
export HF_TOKEN='<твой_токен>'        # или unset HF_TOKEN если не нужен
cd /mnt/d/offline-debian-pack/1_models
df -h .                               # проверь что есть >= 100 GB свободно
hf --version                          # должно показать 1.16.x
```

**Правило резюма для ВСЕХ команд ниже** (универсальное):

> Если скачивание оборвалось — выполни ту же команду ещё раз. `hf` найдёт частичный файл и продолжит с точного байта.
>
> Если зависло на `Still waiting to acquire lock` дольше 60 секунд:
> ```bash
> # 1. Ctrl+C (прервать)
> # 2. Удалить stale lock файл:
> find <local-dir> -name '*.lock' -delete
> # 3. Повтор той же команды
> ```

---

## 🔴 P0a — Draft для нашего Qwen2.5-Coder-14B (~1.7 GB, ~10 мин)

> **Самый высокий ROI**: ×1.5-2.5 speedup существующего production Qwen2.5-Coder-14B без новых моделей. После этого qwen-coder-14b-dsp-llamaserver с 43.5 tok/s → **70-100 tok/s** при том же quality.

### Команда скачки (старт)

```bash
hf download unsloth/Qwen2.5-Coder-1.5B-Instruct-GGUF \
    Qwen2.5-Coder-1.5B-Instruct-Q8_0.gguf \
    README.md \
    --local-dir ./Qwen2.5-Coder-1.5B-Instruct-GGUF
```

### Команда **докачки** (если оборвалось)

```bash
# 1. Очистить stale lock'и
find ./Qwen2.5-Coder-1.5B-Instruct-GGUF -name '*.lock' -delete 2>/dev/null

# 2. ТА ЖЕ команда снова — продолжит с точного байта
hf download unsloth/Qwen2.5-Coder-1.5B-Instruct-GGUF \
    Qwen2.5-Coder-1.5B-Instruct-Q8_0.gguf \
    README.md \
    --local-dir ./Qwen2.5-Coder-1.5B-Instruct-GGUF
```

### Проверка

```bash
ls -lh ./Qwen2.5-Coder-1.5B-Instruct-GGUF/
# должно быть ~1.7 GB *.gguf
du -sh ./Qwen2.5-Coder-1.5B-Instruct-GGUF/
```

---

## 🔴 P0b — DeepSeek-R1-Distill-Qwen-14B (~10 GB, ~50 мин)

> Прямой конкурент Qwen2.5-Coder-14B (та же база Qwen2.5-14B + R1 reasoning). Для Phase 7 compare.

### Команда скачки (старт)

```bash
hf download unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF \
    DeepSeek-R1-Distill-Qwen-14B-Q5_K_M.gguf \
    README.md \
    --local-dir ./DeepSeek-R1-Distill-Qwen-14B-GGUF
```

### Команда **докачки**

```bash
find ./DeepSeek-R1-Distill-Qwen-14B-GGUF -name '*.lock' -delete 2>/dev/null

hf download unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF \
    DeepSeek-R1-Distill-Qwen-14B-Q5_K_M.gguf \
    README.md \
    --local-dir ./DeepSeek-R1-Distill-Qwen-14B-GGUF
```

### Если упадёт стабильно через xet bridge (вчерашняя проблема):

```bash
# Уже стоит HF_HUB_DISABLE_XET=1 — должно работать.
# Если всё равно сбой — резерв через HTTP wget:
cd /mnt/d/offline-debian-pack/1_models
wget -c --header="Authorization: Bearer $HF_TOKEN" \
    https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-14B-Q5_K_M.gguf \
    -O ./DeepSeek-R1-Distill-Qwen-14B-GGUF/DeepSeek-R1-Distill-Qwen-14B-Q5_K_M.gguf
```

### Проверка

```bash
du -sh ./DeepSeek-R1-Distill-Qwen-14B-GGUF/   # ~10 GB
```

---

## 🔴 P0c — DeepSeek-R1-0528-Qwen3-8B (~8.5 GB, ~40 мин)

> SOTA на 8B reasoning (май 2025), matches Qwen3-235B-thinking. Свежее R1-Distill.

### Команда скачки (старт)

```bash
hf download unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF \
    DeepSeek-R1-0528-Qwen3-8B-Q8_0.gguf \
    README.md \
    --local-dir ./DeepSeek-R1-0528-Qwen3-8B-GGUF
```

### Команда **докачки**

```bash
find ./DeepSeek-R1-0528-Qwen3-8B-GGUF -name '*.lock' -delete 2>/dev/null

hf download unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF \
    DeepSeek-R1-0528-Qwen3-8B-Q8_0.gguf \
    README.md \
    --local-dir ./DeepSeek-R1-0528-Qwen3-8B-GGUF
```

### Резерв wget

```bash
wget -c --header="Authorization: Bearer $HF_TOKEN" \
    https://huggingface.co/unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF/resolve/main/DeepSeek-R1-0528-Qwen3-8B-Q8_0.gguf \
    -O ./DeepSeek-R1-0528-Qwen3-8B-GGUF/DeepSeek-R1-0528-Qwen3-8B-Q8_0.gguf
```

### Проверка

```bash
du -sh ./DeepSeek-R1-0528-Qwen3-8B-GGUF/   # ~8.5 GB
```

---

## 🔴 P0d — Draft для R1-Distill-Qwen-14B (~1.7 GB, ~10 мин)

> Speculative pair: 14B target + 1.5B draft → ×1.6-2.5 speedup для R1-14B inference.

### Команда скачки (старт)

```bash
hf download unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF \
    DeepSeek-R1-Distill-Qwen-1.5B-Q8_0.gguf \
    README.md \
    --local-dir ./DeepSeek-R1-Distill-Qwen-1.5B-GGUF
```

### Команда **докачки**

```bash
find ./DeepSeek-R1-Distill-Qwen-1.5B-GGUF -name '*.lock' -delete 2>/dev/null

hf download unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF \
    DeepSeek-R1-Distill-Qwen-1.5B-Q8_0.gguf \
    README.md \
    --local-dir ./DeepSeek-R1-Distill-Qwen-1.5B-GGUF
```

### Проверка

```bash
du -sh ./DeepSeek-R1-Distill-Qwen-1.5B-GGUF/   # ~1.7 GB
```

---

## 🟡 P1a — DeepSeek-Coder-V2-Lite (~11 GB, ~55 мин)

> Прямой coder-конкурент Qwen2.5-Coder-14B: MoE 16B/2.4B active, 338 языков, скорость dense 7B.

### Команда скачки (старт)

> ⚠️ Используется **bartowski/** репо (unsloth GGUF для V2-Lite отсутствует, проверено через HF API 401).

```bash
hf download bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF \
    DeepSeek-Coder-V2-Lite-Instruct-Q5_K_M.gguf \
    README.md \
    --local-dir ./DeepSeek-Coder-V2-Lite-Instruct-GGUF
```

### Команда **докачки**

```bash
find ./DeepSeek-Coder-V2-Lite-Instruct-GGUF -name '*.lock' -delete 2>/dev/null

hf download bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF \
    DeepSeek-Coder-V2-Lite-Instruct-Q5_K_M.gguf \
    README.md \
    --local-dir ./DeepSeek-Coder-V2-Lite-Instruct-GGUF
```

### Резерв wget

```bash
wget -c --header="Authorization: Bearer $HF_TOKEN" \
    https://huggingface.co/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF/resolve/main/DeepSeek-Coder-V2-Lite-Instruct-Q5_K_M.gguf \
    -O ./DeepSeek-Coder-V2-Lite-Instruct-GGUF/DeepSeek-Coder-V2-Lite-Instruct-Q5_K_M.gguf
```

### Проверка

```bash
du -sh ./DeepSeek-Coder-V2-Lite-Instruct-GGUF/   # ~11 GB
```

---

## 🟡 P1b — DeepSeek-R1-Distill-Qwen-32B (~19 GB, ~100 мин)

> Reasoning 32B через partial offload (15.5 GB GPU + 5.5 GB RAM). Альтернатива тяжёлым 35B-MTP если перегружен.

### Сначала очистить старую брошенную папку

```bash
ls -lh /mnt/d/offline-debian-pack/1_models/DeepSeek-R1-Distill-Qwen-32B/ 2>/dev/null
# если там 248 MB мусора с вчера:
rm -rf /mnt/d/offline-debian-pack/1_models/DeepSeek-R1-Distill-Qwen-32B
```

### Команда скачки (старт)

```bash
hf download unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF \
    DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf \
    README.md \
    --local-dir ./DeepSeek-R1-Distill-Qwen-32B-GGUF
```

### Команда **докачки** (этот файл крупный — будет рваться, готовься повторять)

```bash
find ./DeepSeek-R1-Distill-Qwen-32B-GGUF -name '*.lock' -delete 2>/dev/null

hf download unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF \
    DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf \
    README.md \
    --local-dir ./DeepSeek-R1-Distill-Qwen-32B-GGUF
```

### Резерв wget с ретраями (для самых крупных файлов рекомендую)

```bash
wget -c --tries=0 --retry-connrefused --waitretry=10 \
    --header="Authorization: Bearer $HF_TOKEN" \
    https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf \
    -O ./DeepSeek-R1-Distill-Qwen-32B-GGUF/DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf
```

`--tries=0` = бесконечные ретраи. Если упадёт — `wget` сам резюмит с того же байта.

### Проверка

```bash
du -sh ./DeepSeek-R1-Distill-Qwen-32B-GGUF/   # ~19 GB
```

---

## 🟢 P2 — Training base + stack (~30 GB модели + ~1 GB packages)

> Выполнять **только** если приняли решение делать QLoRA FT поверх R1-Distill-14B (Phase 8+).

### P2.1 — FP16 base для QLoRA (~28 GB, ~140 мин)

#### Команда скачки (старт)

```bash
hf download deepseek-ai/DeepSeek-R1-Distill-Qwen-14B \
    --local-dir ./DeepSeek-R1-Distill-Qwen-14B-FP16
```

Скачаются 6 шардов (`model-0000{1-6}-of-000006.safetensors`) + tokenizer + configs.

#### Команда **докачки**

```bash
find ./DeepSeek-R1-Distill-Qwen-14B-FP16 -name '*.lock' -delete 2>/dev/null

hf download deepseek-ai/DeepSeek-R1-Distill-Qwen-14B \
    --local-dir ./DeepSeek-R1-Distill-Qwen-14B-FP16
```

#### Проверка

```bash
du -sh ./DeepSeek-R1-Distill-Qwen-14B-FP16/   # ~28 GB
ls ./DeepSeek-R1-Distill-Qwen-14B-FP16/*.safetensors | wc -l   # должно быть 6
```

### P2.2 — Training packages (выполнять **на Debian**, не в WSL!)

```bash
# На Debian, не в WSL — нужно реальное HIP/ROCm
ssh debian-home   # или просто переключиться на Debian-машину

cd /home/alex/finetune-env
source venv/bin/activate

# 1. PyTorch ROCm 7.2 (если ещё нет)
pip install --index-url https://download.pytorch.org/whl/rocm6.4 \
    torch torchvision torchaudio

# 2. bitsandbytes pre-release (КРИТИЧНО — fix NaN bug)
pip install bitsandbytes==1.33.7.preview \
    --index-url https://download.pytorch.org/whl/nightly/rocm6.4

# 3. Unsloth для AMD
pip install --upgrade --no-deps \
    "unsloth[rocm-torch26] @ git+https://github.com/unslothai/unsloth.git"

# 4. Standard FT stack
pip install -U peft trl transformers datasets accelerate

# 5. Smoke check (обязательно)
python -c "
import torch, bitsandbytes as bnb, unsloth
print(f'torch: {torch.__version__}')
print(f'bnb: {bnb.__version__}')
print(f'unsloth: {unsloth.__version__}')
print(f'hip available: {torch.cuda.is_available()}')
print(f'device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"none\"}')
"
```

#### Ожидаемое:
```
torch: 2.6.x+rocm6.4
bnb: 1.33.7.preview
unsloth: 2026.5.x
hip available: True
device: AMD Radeon RX 9070 (или MI100 на работе)
```

#### Если smoke check падает на bnb NaN — резервный путь:

```bash
# Уточнить актуальный wheel из Unsloth репо:
pip install --upgrade --no-deps \
    "bitsandbytes-rocm @ https://github.com/unslothai/bitsandbytes-rocm-wheels/releases/download/latest/bitsandbytes-1.33.7.preview-cp312-cp312-linux_x86_64.whl"
```

---

## 🏃 Перенос на Debian + setup llama-server

### Rsync с WSL на Debian (после P0a-P0d минимум)

> **Путь на Debian**: структура `offline-debian-pack/1_models/DeepSeek/` та же что при скачке, меняется только префикс `D:\` → `/home/alex/`. Итог: **`/home/alex/offline-debian-pack/1_models/DeepSeek/`**. Перенос — копированием с переносного SSD (не rsync по сети).

> Детальные команды deploy + симлинки + llama-server → см. `TASK_Phase7_deepseek_2026-06-01.md` (Phase A). Ниже — краткий справочник пути.

### Симлинки для llama.cpp

```bash
LLAMA_MODELS=/home/alex/llama.cpp/models
DS=/home/alex/offline-debian-pack/1_models/DeepSeek

# Draft для нашего Qwen2.5-Coder-14B (P0a)
ln -sfn $DS/Qwen2.5-Coder-1.5B-Instruct-GGUF/Qwen2.5-Coder-1.5B-Instruct-Q8_0.gguf \
    $LLAMA_MODELS/qwen2.5-coder-1.5b-draft.gguf

# R1-Distill-14B (P0b) + его 1.5B draft (P0d)
ln -sfn $DS/DeepSeek-R1-Distill-Qwen-14B-GGUF/DeepSeek-R1-Distill-Qwen-14B-Q5_K_M.gguf \
    $LLAMA_MODELS/r1-distill-14b-q5km.gguf
ln -sfn $DS/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/DeepSeek-R1-Distill-Qwen-1.5B-Q8_0.gguf \
    $LLAMA_MODELS/r1-distill-1.5b-draft.gguf

# R1-0528-Qwen3-8B (P0c)
ln -sfn $DS/DeepSeek-R1-0528-Qwen3-8B-GGUF/DeepSeek-R1-0528-Qwen3-8B-Q8_0.gguf \
    $LLAMA_MODELS/r1-0528-qwen3-8b-q8.gguf

# (после P1) V2-Lite + R1-32B
ln -sfn $DS/DeepSeek-Coder-V2-Lite-Instruct-GGUF/DeepSeek-Coder-V2-Lite-Instruct-Q5_K_M.gguf \
    $LLAMA_MODELS/dsv2-lite-coder-q5km.gguf
ln -sfn $DS/DeepSeek-R1-Distill-Qwen-32B-GGUF/DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf \
    $LLAMA_MODELS/r1-distill-32b-q4km.gguf
```

### llama-server: тестовые запуски

#### 1. Boost Qwen2.5-Coder-14B + 1.5B draft (P0a ROI)

```bash
cd /home/alex/llama.cpp

nohup ./build/bin/llama-server \
    -m $LLAMA_MODELS/qwen2.5-coder-14b-dsp.gguf \
    -md $LLAMA_MODELS/qwen2.5-coder-1.5b-draft.gguf \
    --draft-max 16 --draft-min 4 --draft-p-min 0.9 \
    -c 4096 -fa on -ngl 99 -ngld 99 \
    --host 127.0.0.1 --port 8080 \
    > /tmp/llama-server-qwen-coder-spec.log 2>&1 &

sleep 8 && curl -s http://127.0.0.1:8080/health
```

Ожидаемо: `{"status":"ok"}`. Затем bench через `run_compare_v2.sh` — сравним 43.5 → ~70-100 tok/s.

#### 2. R1-Distill-Qwen-14B + speculative

```bash
nohup ./build/bin/llama-server \
    -m $LLAMA_MODELS/r1-distill-14b-q5km.gguf \
    -md $LLAMA_MODELS/r1-distill-1.5b-draft.gguf \
    --draft-max 8 --draft-min 4 --draft-p-min 0.9 \
    -c 4096 -fa on -ngl 99 -ngld 99 \
    --reasoning on \
    --host 127.0.0.1 --port 8080 \
    > /tmp/llama-server-r1-14b.log 2>&1 &
```

#### 3. R1-0528-Qwen3-8B (без speculative — нет официального draft)

```bash
nohup ./build/bin/llama-server \
    -m $LLAMA_MODELS/r1-0528-qwen3-8b-q8.gguf \
    -c 4096 -fa on -ngl 99 \
    --reasoning on \
    --host 127.0.0.1 --port 8080 \
    > /tmp/llama-server-r1-0528.log 2>&1 &
```

#### 4. R1-Distill-32B partial offload (только Q4)

```bash
# На RX 9070 16 GB: -ngl 50 (часть слоёв на CPU)
nohup ./build/bin/llama-server \
    -m $LLAMA_MODELS/r1-distill-32b-q4km.gguf \
    -c 4096 -fa on -ngl 50 \
    --reasoning on \
    --host 127.0.0.1 --port 8080 \
    > /tmp/llama-server-r1-32b.log 2>&1 &
```

#### 5. DeepSeek-Coder-V2-Lite

```bash
nohup ./build/bin/llama-server \
    -m $LLAMA_MODELS/dsv2-lite-coder-q5km.gguf \
    -c 4096 -fa on -ngl 99 \
    --host 127.0.0.1 --port 8080 \
    > /tmp/llama-server-dsv2-lite.log 2>&1 &
```

---

## 🧪 Phase 7 — Compare runs

После переноса и симлинков добавь в `run_all_via_llamaserver.sh`:

```bash
# Новые строки в массиве MODELS:
"qwen2.5-coder-14b-dsp-spec-llamaserver|$MODELS_DIR/qwen2.5-coder-14b-dsp.gguf|-md $MODELS_DIR/qwen2.5-coder-1.5b-draft.gguf --draft-max 16"
"r1-distill-14b-spec-llamaserver|$MODELS_DIR/r1-distill-14b-q5km.gguf|-md $MODELS_DIR/r1-distill-1.5b-draft.gguf --draft-max 8 --reasoning on"
"r1-0528-qwen3-8b-llamaserver|$MODELS_DIR/r1-0528-qwen3-8b-q8.gguf|--reasoning on"
"dsv2-lite-coder-llamaserver|$MODELS_DIR/dsv2-lite-coder-q5km.gguf|"
"r1-distill-32b-q4-partial-llamaserver|$MODELS_DIR/r1-distill-32b-q4km.gguf|--reasoning on -ngl 50"
```

Запустить и записать через правило `17-llm-bench` → ожидаемые `run_id` 12-16.

---

## ✅ DoD (Definition of Done)

- [ ] **P0a** скачан, 1.5B draft работает с Qwen2.5-Coder-14B → bench показал ×1.5-2.5 speedup
- [ ] **P0b** скачан, R1-Distill-14B в compare
- [ ] **P0c** скачан, R1-0528-Qwen3-8B в compare
- [ ] **P0d** скачан, R1-Distill-14B + 1.5B draft → speculative speedup измерен
- [ ] **P1a** скачан (опционально), DeepSeek-Coder-V2-Lite в compare как coder-конкурент
- [ ] **P1b** скачан (опционально), R1-Distill-32B partial offload работает
- [ ] **P2** установлен (опционально, для FT Phase 8+)
- [ ] Все модели в `llm_bench.runs` со scores
- [ ] Финальная таблица `specs/phase7_compare_2026-XX-XX.md`

---

## ⚠️ Риски и митигации

| # | Риск | Митигация |
|---|---|---|
| R1 | Связь рвётся каждые 30-60 мин | Команды докачки выше — все идемпотентны. Если особо часто → `wget --tries=0` |
| R2 | xet bridge даёт 502/503 | `HF_HUB_DISABLE_XET=1` уже в шаге 0. Если всё равно — `wget -c` напрямую |
| R3 | Stale lock после перезагрузки | `find <dir> -name '*.lock' -delete` перед повтором |
| R4 | 32B Q4 не влезает 16 GB полностью | `-ngl 50` (partial offload), будет ~5-15 tok/s |
| R5 | DeepSpeed/ZeRO для FT 32B падает | QLoRA 14B вместо 32B (наш план) — без offload |
| R6 | DeepSeek-Coder-V2-Lite GGUF от unsloth отсутствует | используем `bartowski/...` (проверено через HF API) |
| R7 | bnb 0.49.2 NaN bug | устанавливаем `bitsandbytes==1.33.7.preview` (Phase 6 уже знаем) |
| R8 | Дисковое место кончается | проверь `df -h` перед каждым P-этапом; всего ~80 GB на P0+P1+P2 |

---

## 🔗 Связанные документы

- Research v2: `specs/deepseek_analysis_2026-05-28.md` (с deep review)
- Phase 6 итог: `specs/phase6_FINAL_2026-05-28.md`
- LLM bench правила: `.claude/rules/17-llm-bench.md`
- HF download memory: `~/.claude/projects/.../memory/reference_hf_download_xet_resume.md`

---

## 🎯 Quick start (TL;DR команды для копипасты)

```bash
# Шаг 0 — один раз
source ~/hf-venv/bin/activate
export HF_HUB_DISABLE_XET=1
export HF_TOKEN='<токен>'
cd /mnt/d/offline-debian-pack/1_models

# P0a (10 мин) — лучший ROI
hf download unsloth/Qwen2.5-Coder-1.5B-Instruct-GGUF Qwen2.5-Coder-1.5B-Instruct-Q8_0.gguf README.md --local-dir ./Qwen2.5-Coder-1.5B-Instruct-GGUF

# P0d (10 мин)
hf download unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF DeepSeek-R1-Distill-Qwen-1.5B-Q8_0.gguf README.md --local-dir ./DeepSeek-R1-Distill-Qwen-1.5B-GGUF

# P0c (40 мин)
hf download unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF DeepSeek-R1-0528-Qwen3-8B-Q8_0.gguf README.md --local-dir ./DeepSeek-R1-0528-Qwen3-8B-GGUF

# P0b (50 мин)
hf download unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF DeepSeek-R1-Distill-Qwen-14B-Q5_K_M.gguf README.md --local-dir ./DeepSeek-R1-Distill-Qwen-14B-GGUF

# === ЕСЛИ оборвалось любое из выше ===
# 1) find <local-dir> -name '*.lock' -delete
# 2) Та же команда снова

# P1a (55 мин, опционально)
hf download bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF DeepSeek-Coder-V2-Lite-Instruct-Q5_K_M.gguf README.md --local-dir ./DeepSeek-Coder-V2-Lite-Instruct-GGUF

# P1b (100 мин, опционально)
rm -rf ./DeepSeek-R1-Distill-Qwen-32B   # старый мусор 248 MB
hf download unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf README.md --local-dir ./DeepSeek-R1-Distill-Qwen-32B-GGUF

# P2.1 (140 мин, только для FT)
hf download deepseek-ai/DeepSeek-R1-Distill-Qwen-14B --local-dir ./DeepSeek-R1-Distill-Qwen-14B-FP16
```

---

*Кодо · 2026-05-28 v2 (с командами докачки)*
