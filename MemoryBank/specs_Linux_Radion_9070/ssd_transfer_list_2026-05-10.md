# SSD Transfer List — что нести Windows → Debian

> **Только то что НЕ в git** и **НЕ скачивается быстро**.
> Размеры проверены по файловой системе.

---

## ✅ Обязательно (~23 GB)

| # | Что | Откуда (Win) | Куда (Debian) | Размер | Зачем |
|---|-----|--------------|---------------|------:|-------|
| 1 | **`qwen3-8b/`** (Qwen3-8B полная модель, safetensors) | `E:\finetune-env\qwen3-8b\` (Win, было `C:\` до 11.05) | `/home/alex/finetune-env/qwen3-8b/` (Debian) — после reorg `models/qwen3-8b/` | **16 GB** | базовая LLM для fine-tuning + inference |
| 2 | **BGE-M3 модель** | `C:\Users\user\.cache\huggingface\hub\models--BAAI--bge-m3` | `~/.cache/huggingface/hub/models--BAAI--bge-m3` | **4.6 GB** | embeddings (5432 vectors) — нужна 1 раз для наполнения PG |
| 3 | **BGE-reranker-v2-m3** | `C:\Users\user\.cache\huggingface\hub\models--BAAI--bge-reranker-v2-m3` | `~/.cache/huggingface/hub/models--BAAI--bge-reranker-v2-m3` | **2.2 GB** | hybrid retrieval (BM25 + dense + rerank) — нужна для inference |

**Можно скачать заново через `huggingface-cli download` на Debian** — но через SSD быстрее (минуты vs часы).

---

## 🟡 По желанию (для inference variants)

| # | Что | Размер | Зачем |
|---|-----|------:|-------|
| 4 | **Qwen3-14B** (если есть на диске) | ~30 GB | альтернатива 8B если RAM 64GB позволяет (более точные ответы) |
| 5 | **Qwen3-32B** (если есть) | ~65 GB | максимальная точность (но fit only с offload) |
| 6 | **Qwen2.5-Coder-7B** | ~14 GB | code-specific inference (для code completion) |

> **Заметка:** в `C:/Users/user/.cache/huggingface/hub/` Qwen3-8B и Qwen2.5-Coder-7B лежат как **заглушки** (~100 MB / ~1 KB) — полные веса видимо скачаны куда-то ещё. **Alex знает** где они физически.

**Рекомендация:** для **первого запуска 12.05** хватит:
- Qwen3-8B (16 GB) — для inference + Phase B fine-tune
- BGE-M3 (4.6 GB) + reranker (2.2 GB) — для RAG

**Большие модели** (14B / 32B / Qwen2.5-coder) — нести **отдельно** через SSD когда понадобятся.

---

## 🟢 Опционально (если Phase B уже обучен дома)

| # | Что | Размер | Зачем |
|---|-----|------:|-------|
| 7 | Phase B checkpoint `phase_b_2026-05-12/` | ~500 MB - 2 GB | если обучение делали дома → нести готовый, не повторять |
| 8 | Smoke 2080 Ti checkpoint `smoke_2080ti_2026-05-10/` | ~500 MB | для baseline сравнения в B1 inference |

---

## ❌ НЕ нести

- `.obj / .bin / .exe / .dll` — компилятор Debian пересоберёт
- HSACO kernel cache (`~/.cache/dsp-gpu/kernels/`) — генерируется автоматически при first run
- PostgreSQL dump `_backup_pre_rag_2026-05-06.dump` — устарел, перепарсим заново
- `dataset_*.jsonl` — уже в git `finetune-env`
- `dsp_assistant/` python код — уже в git
- `.venv/` — пересоздадим через `pip install`
- `E:\finetune-env\backups\` — бэкапы Windows-специфики

---

## 📦 Команды копирования

**На Windows (подготовка SSD):**
```powershell
# Создать папку на SSD
mkdir D:\ssd\dsp-gpu-migration

# Копирование (используй robocopy для скорости)
robocopy E:\finetune-env\qwen3-8b D:\ssd\dsp-gpu-migration\qwen3-8b /E /MT:8

# HF cache — копируем точную структуру (snapshot layout HF SDK)
robocopy "C:\Users\user\.cache\huggingface\hub\models--BAAI--bge-m3" "D:\ssd\dsp-gpu-migration\hf-cache\models--BAAI--bge-m3" /E /MT:8
robocopy "C:\Users\user\.cache\huggingface\hub\models--BAAI--bge-reranker-v2-m3" "D:\ssd\dsp-gpu-migration\hf-cache\models--BAAI--bge-reranker-v2-m3" /E /MT:8
```

> ⚠️ HF cache источник = **`%USERPROFILE%\.cache\huggingface\hub\models--*`** (snapshot layout, готов к использованию).
> НЕ использовать `huggingface-cli download --local-dir` flat-layout — он не подхватится HF SDK как cache.
> Альтернатива (если flat layout уже есть) — см. `INSTALL_DEBIAN_offline_2026-05-10.md` Шаг 5B.

**На Debian (распаковка с SSD):**
```bash
# Подключить SSD как /mnt/ssd
sudo mount /dev/sdX /mnt/ssd

# Скопировать на локальный диск
mkdir -p /home/alex/finetune-env
# Если reorg ЕЩЁ НЕ сделан → qwen3-8b/ в корне:
cp -r /mnt/ssd/dsp-gpu-migration/qwen3-8b /home/alex/finetune-env/
# Если reorg УЖЕ сделан → models/qwen3-8b/:
# mkdir -p /home/alex/finetune-env/models
# cp -r /mnt/ssd/dsp-gpu-migration/qwen3-8b /home/alex/finetune-env/models/

# HF cache в правильное место
mkdir -p ~/.cache/huggingface/hub
cp -r /mnt/ssd/dsp-gpu-migration/hf-cache/* ~/.cache/huggingface/hub/

# Проверить
ls -lh /home/alex/finetune-env/qwen3-8b/
ls -lh ~/.cache/huggingface/hub/ | grep BAAI
```

---

*SSD list готов: 2026-05-10*
