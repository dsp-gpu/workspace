# 13 — Target Onboarding (rag-pao side, layout-aware)

> **paths:** `pipelines/**`, `scripts/add_target.sh`

## Шаги (executor side)

### 1. После `add_target.sh <name>`

`scripts/add_target.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
TARGET=$1

# 1. Validate _META.yaml exists
test -f "/srv/pao_$TARGET/_META.yaml" || { echo "Missing _META.yaml"; exit 1; }

# 2. Copy pipeline template (или из похожего отлаженного pipeline)
if [ -d "pipelines/${TARGET}_v1" ]; then
    echo "pipeline already exists"; exit 1
fi

# choose source for cp:
SOURCE_PIPELINE="${COPY_FROM:-_template}"
cp -r "pipelines/${SOURCE_PIPELINE}" "pipelines/${TARGET}_v1"

# 3. Fill placeholders in pipeline.yaml
sed -i "s/<TARGET_NAME>/${TARGET}/g" "pipelines/${TARGET}_v1/pipeline.yaml"
sed -i "s/<YYYY-MM-DD>/$(date +%Y-%m-%d)/g" "pipelines/${TARGET}_v1/pipeline.yaml"

# 4. Create PG schema + Qdrant collection
psql -U rag_pao -c "CREATE SCHEMA rag_pao_${TARGET}"
psql -U rag_pao -d rag_pao_${TARGET} -f pao_db/postgres_init.sql

python -m rag_pao.pao_db.qdrant_bootstrap --target "${TARGET}"

# 5. Add symlink в targets/
ln -s "/srv/pao_${TARGET}" "targets/${TARGET}"

# 6. Trigger initial L0/L1/L2 indexing
python -m rag_pao.orchestrator --pipeline "${TARGET}_v1" --layers L0 L1 L2

echo "✅ Target ${TARGET} ready. Adapt pipelines/${TARGET}_v1/{collectors,prompts_override,golden_set}"
```

### 2. Layout-aware indexing (D22)

Indexer читает `_META.yaml.layout`:
```python
def get_module_paths(target: str) -> list[Path]:
    meta = load_meta_yaml(target)
    drop_root = Path(f"/srv/pao_{target}")
    modules_dir = drop_root / meta["layout"]["modules_dir"]
    return [m for m in modules_dir.iterdir() if m.is_dir() and m.name not in meta["layout"]["ignore"]]

def get_cmake_infra_path(target: str) -> Path:
    meta = load_meta_yaml(target)
    return Path(f"/srv/pao_{target}") / meta["layout"]["cmake_infra_dir"]

def get_overlay_paths(target: str) -> dict:
    meta = load_meta_yaml(target)
    drop_root = Path(f"/srv/pao_{target}")
    return {
        "docs":         drop_root / meta["layout"]["our_overlays"]["docs"],
        "examples":     drop_root / meta["layout"]["our_overlays"]["examples"],
        "native_tests": drop_root / meta["layout"]["our_overlays"]["native_tests"],
        "gtest":        drop_root / meta["layout"]["our_overlays"]["gtest"],
    }
```

### 3. Acceptance (после индексации)

```bash
# golden_set L0 R@5 ≥ 0.9?
python -m rag_pao.orchestrator --pipeline "${TARGET}_v1" --eval L0

# golden_set L1+L2 R@5 ≥ 0.85?
python -m rag_pao.orchestrator --pipeline "${TARGET}_v1" --eval L1 L2
```

Если gate FAIL — Кодо адаптирует `prompts_override/` + `collectors/` → re-eval.

## Когда freeze

```bash
# когда все gate'ы зелёные + Q1-Q10 acceptance ≥ 9/10:
bash scripts/freeze_pipeline.sh "${TARGET}" 1
# что делает:
mv "pipelines/${TARGET}_v1/_WIP.md" "pipelines/${TARGET}_v1/_STABLE.md"
git add "pipelines/${TARGET}_v1"
git commit -m "freeze pipeline ${TARGET}_v1"
git push origin main
```

## codo_access policy (D25)

| nda_level | codo_access |
|-----------|-------------|
| `open` | `full` (debug) / `rest-only` (production) |
| `customer-*` | **всегда** `rest-only` |
