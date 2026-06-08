# 📥 Скачивание баз для роутера/проб (дома)

> **Когда:** дома (>600 МБ → по правилу качаем дома), потом SSD на работу (RX 9070).
> **Куда:** `<offline-debian-pack>/1_models/<Модель>/` (весь HF-репо: config+tokenizer+shards).
> **Связь:** `llm_router_model_choice_2026-06-08.md` (зачем эти 3), `finetune_training_guide_2026-06-08.md`.

## Что качаем (3 базы, ~5.2 ГБ, публичные — токен НЕ нужен)

| Модель | HF repo | Размер | Зачем |
|--------|---------|--------|-------|
| ModernBERT-base | `answerdotai/ModernBERT-base` | ~0.6 ГБ | encoder-классификатор (план Б роутера) |
| Qwen3-1.7B | `Qwen/Qwen3-1.7B` | ~3.4 ГБ | малая generative LLM (проба) |
| Qwen3-0.6B | `Qwen/Qwen3-0.6B` | ~1.2 ГБ | самая малая Qwen3 (проба) |

## Как запустить дома

Скрипт лежит на SSD: `<offline-debian-pack>/download_router_models.sh`. Если SSD под рукой нет —
**пересоздай из этого файла** (текст ниже) и запусти:

```bash
bash <offline-debian-pack>/download_router_models.sh
```

- Кладёт в `1_models/` рядом с собой · сам находит python с `huggingface_hub` (venv→системный→ставит).
- **Докачка:** оборвалось → запусти ещё раз, дочинает.
- `hf_transfer` (ускорение) — опционально: `pip install hf_transfer`.

## Полный текст скрипта (для пересоздания дома)

```bash
#!/usr/bin/env bash
# download_router_models.sh — скачать 3 базы для роутера/проб (дома, на SSD).
set -uo pipefail

BASE="$(cd "$(dirname "$0")" && pwd)/1_models"   # рядом со скриптом
mkdir -p "$BASE"
echo "📂 Качаю в: $BASE"

PY=""
for cand in /home/alex/finetune-env/.venv/bin/python "$HOME/finetune-env/.venv/bin/python" python3 python; do
    if command -v "$cand" >/dev/null 2>&1 && "$cand" -c "import huggingface_hub" 2>/dev/null; then PY="$cand"; break; fi
done
if [ -z "$PY" ]; then
    echo "⚠️ huggingface_hub не найден — ставлю…"; python3 -m pip install -q --user huggingface_hub && PY="python3"
fi
echo "🐍 python: $PY ($("$PY" -c 'import huggingface_hub as h; print("hub",h.__version__)'))"

if "$PY" -c "import hf_transfer" 2>/dev/null; then export HF_HUB_ENABLE_HF_TRANSFER=1; echo "🚀 hf_transfer вкл"; fi

dl() {
    echo; echo "⬇️  $1 → $BASE/$2"
    "$PY" -m huggingface_hub.commands.huggingface_cli download "$1" --local-dir "$BASE/$2" \
      || "$PY" -c "from huggingface_hub import snapshot_download as s; s('$1', local_dir='$BASE/$2')"
}

dl answerdotai/ModernBERT-base  ModernBERT-base   # ~0.6 ГБ
dl Qwen/Qwen3-1.7B              Qwen3-1.7B        # ~3.4 ГБ
dl Qwen/Qwen3-0.6B              Qwen3-0.6B        # ~1.2 ГБ

echo; echo "=== ✅ ИТОГ ==="
for d in ModernBERT-base Qwen3-1.7B Qwen3-0.6B; do
    n=$(find "$BASE/$d" -type f 2>/dev/null | wc -l)
    sz=$(du -sh "$BASE/$d" 2>/dev/null | cut -f1)
    printf "  %-18s файлов=%-4s размер=%s\n" "$d" "$n" "$sz"
done
echo "Оборвалось — запусти ещё раз (докачает)."
```

## Программы для обучения (на работе, RX 9070)

Стек `finetune-env/.venv` уже укомплектован (torch-rocm 2.11, transformers 5.8, peft, bitsandbytes,
accelerate, datasets, trl, scikit-learn, sentence-transformers, FlagEmbedding). **Докачивать не нужно.**
Опционально: `pip install setfit` (план В роутера, few-shot).

⚠️ На gfx1201 **DoRA/NEFTune крашат** (`rc=134`) — и для Qwen3 тоже. rsLoRA/обычный LoRA — ок.

---

*Создано: 2026-06-08 · Кодо · скрипт-дубль на SSD `offline-debian-pack/download_router_models.sh`*
