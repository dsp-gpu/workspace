# 10 — Target Onboarding (как добавить новый pao_<name>)

## Алгоритм (5 шагов)

### 1. Drop на сервере

```bash
# Alex руками (или scp от заказчика):
scp -r <от заказчика> alex@10.10.4.105:/srv/pao_xxxx_acme
```

### 2. _META.yaml

```bash
ssh alex@10.10.4.105
cd /srv/pao_xxxx_acme
cp /srv/rag-pao/MemoryBank/pao/templates/pao_drop/_META.yaml.template _META.yaml
vim _META.yaml      # заполнить customer / nda_level / modules / license_map / layout
```

### 3. Mentor → targets.yaml

```bash
# Локально (rag-mentor):
cd /home/alex/rag-mentor
vim ../rag-pao-shadow/config/targets.yaml    # добавить запись pao_xxxx_acme
# git push → bare remote
git add config/targets.yaml
git commit -m "feat(targets): add pao_xxxx_acme"
git push origin main
```

### 4. pao → pipeline init

```bash
ssh alex@10.10.4.105
cd /srv/rag-pao
git pull                                      # подтянули новый targets.yaml
bash scripts/add_target.sh pao_xxxx_acme
# что делает:
# - cp pipelines/pao_contrib_v1/ → pipelines/pao_xxxx_acme_v1/   (или _template/ если нет similar)
# - tree-sitter + libclang indexer
# - CREATE SCHEMA rag_pao_pao_xxxx_acme
# - Qdrant collection pao_xxxx_acme_v1
# - L0/L1/L2 индекс
```

### 5. Adapt pipeline

`/srv/rag-pao/pipelines/pao_xxxx_acme_v1/`:
- `collectors/` — адаптировать под known patterns / classes target'а
- `prompts_override/` — если нужны другие промпты
- `golden_set/Q1_Q10_acceptance.jsonl` — **Кодо синтезирует** из `_META.yaml.modules` + L2 symbols + patterns

### 6. Orchestrator → train → freeze

```bash
python -m rag_pao.orchestrator --pipeline pao_xxxx_acme_v1
# когда score ≥ 80 на golden_set:
mv _WIP.md _STABLE.md
git commit -m "freeze pipeline pao_xxxx_acme_v1"
```

## codo_access policy

| nda_level | codo_access |
|-----------|-------------|
| `open` | `full` (debug-mode) ИЛИ `rest-only` (production-mode) |
| `customer-A`, `customer-B`, … | **всегда** `rest-only` (даже при `mode: debug`) |

## Q1-Q10 синтез (Q-R2)

Для open drops Alex пишет вручную (готово в `dataset_v8 §1` для DSP-GPU).

Для нового target Кодо синтезирует:
1. **Q1-Q3 forward**: для топ-3 key classes из `_META.yaml.modules[]`
2. **Q4-Q5 listings + reverse**: exhaustive listing для топ pattern + reverse mapping
3. **Q6 migration**: если есть `MemoryBank/changelog/` → legacy/current
4. **Q7-Q8 build/config**: cmake preset + optimizer (из `_META.yaml.build`)
5. **Q9 hallucination**: fake class name из похожих имён + 1 буква
6. **Q10 confusion**: правильный паттерн ≠ wrong_pattern (наиболее частая confusion в pilot)

Alex финально ревьюит.
