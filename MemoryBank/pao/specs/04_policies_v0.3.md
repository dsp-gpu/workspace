# RAG_mentor — Policies v0.3 (anti-hallucination + журнал + 2 режима + контракт + MCP)

> **Версия**: 0.3 · **Дата**: 2026-05-23
> **Скоуп**: жёсткие правила работы. Приоритет №1 Alex: точность (галлюцинации = 0 на известных переменных).

---

## §A — Anti-hallucination policy (приоритет №1)

> Alex: «1. точность (галлюцинации на известных переменных свести к нулю), 2. на кодинге ошибки минимум, 3. всё остальное».

### A.1 Что считается «галлюцинацией»

| Тип | Пример | Степень |
|-----|--------|---------|
| Несуществующее имя метода/класса | `obj.parse_json_safe()` когда в L2 только `parse_json()` | 🔴 критично |
| Несуществующий параметр | `@param flags` — в сигнатуре нет `flags` | 🔴 критично |
| Несуществующий throw | `@throws std::range_error` — в теле нет такого throw | 🟡 средне |
| Generic placeholder | `@brief Function that does something` (вода) | 🟡 средне |
| Несуществующий related class | `@see SomeOtherClass` — класса в проекте нет | 🟡 средне |
| Несуществующая константа | `@test { values=[kMaxBufferSize] }` — не в `public_data.constants` | 🔴 критично |

### A.2 4 защитных барьера

#### Барьер 1 — Retrieval grounding (prompt-builder)

Prompt **явно** перечисляет allow-list:
```
Используй ТОЛЬКО имена из следующего allow-list.
Любое имя вне списка = ошибка.
allow-list-methods: [parse, dump, contains, ...]
allow-list-params: {parse: [text, allow_exceptions], ...}
allow-list-throws: {parse: [std::invalid_argument], ...}
allow-list-constants: [kDefaultBufferSize, kMaxRetries, ...]
allow-list-related: [JsonParser, JsonWriter, ...]
```

#### Барьер 2 — Name validator (после Qwen, до сохранения)

```python
# D34: в обоих сторонах через shared common/anti_hallucination/:
#   rag_mentor/anti_hallucination/ + rag_pao/core/anti_hallucination/name_validator.py
def name_validator(qwen_json, ctx) -> ValidationResult:
    used_names = extract_names_from_doxygen(qwen_json)
    allowed = ctx.symbols.flatten_names()
    not_in_allowlist = used_names - allowed
    if not_in_allowlist:
        return ValidationResult(ok=False, errors=[...])
    return ValidationResult(ok=True)
```

#### Барьер 3 — Schema lint (JSON Schema + doxygen lint)

```python
JsonSchemaValidator.validate(qwen_json)
doxygen_lint(qwen_json.brief)   # > 20 chars, no "function that does"
```

#### Барьер 4 — Comparator (mentor diff vs oracle эталон)

```python
diff = mentor.Comparator(oracle_etalon, qwen_out)
if diff.score < 80:
    issues = mentor.Comparator.issue_categorizer(diff)
    # тип ошибок:
    # - hallucination_name / hallucination_param / hallucination_throw
    # - generic_placeholder / wrong_param_order / missing_throw
    return Critic.fix(prompt, issues)
```

### A.3 Trap-вопросы в Q1-Q10 acceptance

Для каждого target — обязательны trap-вопросы:
- «Существует ли класс X?» (X = заведомо несуществующий) → должно быть «Нет, hallucination»
- «Является ли X типом Y?» (X — есть, Y — другой паттерн) → «Нет, X — это Z»

См. `dataset_v8_plan §1` пункты Q9-Q10 для DSP-GPU.

### A.4 forbidden_terms

`rag-pao/config/forbidden_terms.yaml`:
```yaml
# Generic placeholders to ban
- "function that does"
- "method that performs"
- "abstract operation"
- "implementation details"

# Hallucinations seen в pilot прогонах
- "RochesterGPU"
- "dsp_hybrid::"     # wrong namespace for HybridBackend
```

Любой `forbidden_term` в Qwen output → автоматический critic fix.

---

## §B — Журнал (2 уровня, D17)

### B.1 Per-prompt journal

`rag-pao/MemoryBank/prompts/v1/NNN_<topic>.journal.md`:
```markdown
# 001_doxygen_simple_class.journal

| Date | Class | Outcome | Score | Notes |
|------|-------|---------|-------|-------|
| 2026-05-25 | FFTProcessorROCm | ✅ saved | 92 | retry x2 (schema) |
| 2026-05-25 | SpectrumMaximaFinder | ❌ human_review | 70 | generic placeholder |
```

История применений ОДНОГО промпта к разным классам.

### B.2 Per-class session

`rag-pao/.rag/<target>/sessions/NNN_<Class>_<date>.md`:
```markdown
---
class_fqn: dsp::spectrum::FFTProcessorROCm
target: pao_contrib
date: 2026-05-25
prompt_version: v1/001_doxygen_simple_class.md
total_retries: 2
final_judge_score: 92
final_reviewer_score: 88
final_comparator_score: 85
human_verified: false
escalated: false
---

## Attempt 1
**Prompt:** ...
**Qwen output:** ...
**name_validator:** FAIL (used `parse_json_safe` not in allow-list)
**Critic feedback:** ...

## Attempt 2
**Prompt:** ...
**Qwen output:** ...
**judge:** 92
**reviewer:** 88
**comparator:** 85
**Decision:** ✅ save_to_rag

## Distillation entry
{...}
```

---

## §C — Контракт REST + MCP (D2)

### C.1 REST endpoints rag-pao (по policy)

| Endpoint | Debug | Production | NDA-rest-only | Безопасно |
|----------|-------|------------|---------------|-----------|
| `/health` | ✅ | ✅ | ✅ | yes |
| `/search?query=...&filter=...` | ✅ | ✅ | ✅ | with filter |
| `/show_signature?class=...` | ✅ | ✅ | ✅ | yes (D31) |
| `/show_symbols?...` | ✅ | ✅ | ✅ | yes (D31) |
| `/run_filler?prompt=...` | ✅ | ✅ (sanitized output) | ✅ | yes |
| `/run_judge?...` | ✅ | ✅ | ✅ | yes |
| `/save_rag?class=...&content=...` | ✅ | ✅ | ✅ | yes (write, **idempotency_key required** — D37) |
| `/show_file?path=...` | ✅ | ❌ | ❌ | **NO в production** |
| `/show_journal?class=...` | ✅ | ❌ | ❌ | **NO в production** |
| `/dump_target?...` | ✅ | ❌ | ❌ | **NO в production** |

### C.2 MCP — только для interactive Claude debugging

```yaml
# rag-mentor/config/mcp_servers.yaml
mcpServers:
  rag-pao-<target>:
    command: python
    args: ["-m", "rag_pao.core.api.mcp.server"]
    env:
      RAG_PAO_TARGET: "<target_name>"
      RAG_PAO_MODE: "${RAG_PAO_MODE}"      # пробрасывается из глобального
```

---

## §D — Локальные MCP-серверы для Кодо (D14)

7 MCP стоят на laptop, подключены к Claude Code через `rag-mentor/.mcp.json`.

| MCP | Что даёт |
|-----|----------|
| **context7_local** | локальная Context7 для частых либ (offline) |
| **sequential_thinking** | глубокий анализ |
| **filesystem** | Anthropic official — Кодо ходит по rag-mentor локально |
| **git_mcp** | видит историю промптов / спек |
| **postgres_mcp** | 🌟 видит свой `rag_mentor` PG schema (D23) |
| **qdrant_mcp** | 🌟 видит свой `mentor_v1` Qdrant collection (D23) |
| **memory_mcp** | persistent memory across sessions |

### D.1 `.mcp.json` template

```json
{
  "$schema": "https://modelcontextprotocol.io/schema",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/alex/rag-mentor"]
    },
    "postgres-mentor": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://rag_mentor:***@localhost:5432/rag_mentor"]
    },
    "qdrant-mentor": {
      "command": "python",
      "args": ["-m", "qdrant_mcp"],
      "env": { "QDRANT_URL": "http://localhost:6333", "QDRANT_COLLECTION": "mentor_v1" }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": { "MEMORY_FILE_PATH": "${HOME}/rag-mentor/MemoryBank/.mcp_memory.json" }
    },
    "rag-pao": {
      "command": "python",
      "args": ["-m", "rag_pao.core.api.mcp.server"],
      "env": {
        "RAG_PAO_TARGET": "${RAGCTL_TARGET}",
        "RAG_PAO_MODE": "${RAG_PAO_MODE}"
      }
    }
  }
}
```

### D.2 Что НЕ подключать (self-hosted принцип)

- ❌ OpenAI MCP — нарушает self-hosted
- ❌ Slack/Discord MCP
- ❌ Gmail/Calendar MCP
- ⚠️ GitHub MCP — только если authentication работает

---

## §E — 🌟 2 режима доступа Кодо (D25)

### E.1 Глобальный switch

`rag-pao/config/targets.yaml`:
```yaml
mode: debug | production
```

`.env`:
```
RAG_PAO_MODE=debug                       # переопределяет targets.yaml
```

### E.2 Per-target override

```yaml
targets:
  - name: pao_contrib
    codo_access: full                    # debug-mode: полный REST. Production-mode: forced rest-only
  - name: pao_xxxx_acme
    codo_access: rest-only               # всегда rest-only, даже при mode=debug
```

### E.3 Логика `nda_guard` (D35 — config-driven)

`config/access_policy.yaml` — **single source of truth**:

```yaml
endpoints:
  safe:       [/health, /search, /show_signature, /show_symbols, /run_filler, /run_judge, /save_rag]
  debug_only: [/show_file, /show_journal, /dump_target]
```

```python
# rag_pao/core/access_control/nda_guard.py
class NDAGuard:
    def __init__(self, policy: AccessPolicy, targets: TargetsConfig):
        self.policy = policy           # из access_policy.yaml
        self.targets = targets

    def check_access(self, target: str, endpoint: str, mode: str) -> bool:
        """
        - production → forced safe-only для ВСЕХ targets (codo_access игнорируется)
        - debug + codo_access=full → разрешено всё
        - debug + codo_access=rest-only → safe-only
        """
        if mode == "production":
            return endpoint in self.policy.safe_endpoints

        cfg = self.targets.get(target)
        if cfg.codo_access == "full":
            return True

        return endpoint in self.policy.safe_endpoints
```

OCP: добавление нового endpoint = правка yaml, **не кода**.

### E.4 Когда flip debug → production

**Перед первым NDA-drop'ом** (или когда `pao_contrib` стабилизирован):
1. Regression тест на `golden_set_L0/L1/L2/L3` — все gate'ы зелёные.
2. Manual review acceptance Q1-Q10 на 1-2 random классах.
3. Smoke-test что Кодо НЕ может вызвать `/show_file` (должен ответить 403).
4. Flip `mode: debug → production` в `targets.yaml`.
5. **Не флипать обратно** — production-режим должен оставаться постоянным после flip'а.

### E.5 Что Кодо делает в каждом режиме

| Step | Debug | Production |
|------|-------|------------|
| Oracle эталон | через `mentor_db` (без обращения в pao) | то же |
| Чтение target кода | `/show_file` напрямую | НЕТ — только `/show_signature`/`/show_symbols` |
| Промпт построение | сама в loop | сама в loop |
| Запуск Qwen | `/run_filler` напрямую | `/run_filler` напрямую (output sanitized) |
| Comparator | сама vs oracle эталон | то же |
| Critic | сама правит promtp | то же |
| Журнал | `/show_journal` если надо | НЕТ — журнал sync'ится через git pull |

---

## §F — Sync артефактов (D29)

### F.1 Bare remote setup

На сервере (Phase 01 deploy):
```bash
mkdir -p /srv/git-remotes
git init --bare /srv/git-remotes/rag-pao.git
```

Локально (laptop):
```bash
cd /home/alex/rag-pao
git remote add origin ssh://10.10.4.105:/srv/git-remotes/rag-pao.git
git push -u origin main
```

На сервере (cron / git hook на bare):
```bash
# hooks/post-update
cd /srv/rag-pao && git pull
```

### F.2 Потоки

| Поток | Откуда → куда | Как | Когда |
|-------|---------------|-----|-------|
| Промпты mentor → pao | `rag-mentor/MemoryBank/prompts/for_rag_pao/v1/` → `rag-pao/MemoryBank/prompts/v1/` | `scripts/sync_prompts_to_pao.sh` → `git push` через bare remote | После критики, при создании v2 |
| Журналы pao → mentor | `.rag/<t>/sessions/` + `prompts/v1/*.journal.md` → mentor | `git pull` | После prompt-сессии (~30 классов) |
| Open-source corpus | `rag-pao/external_corpus/` | mentor НЕ копирует, читает через REST | По запросу |

---

## §G — Журнал как датасет для QLoRA

Per-class session автоматически становится train пример (фильтр):

```python
# rag_pao/finetune/dataset_builders/from_journal.py
def journal_to_qlora_sample(session_md_path: Path) -> dict | None:
    metadata = parse_yaml_frontmatter(session_md_path)
    if metadata.final_judge_score < 85:           return None
    if metadata.total_retries > 2:                return None
    if not (metadata.human_verified or metadata.final_reviewer_score >= 90):
        return None

    attempts = parse_attempts(session_md_path)
    final = attempts[-1]
    return {
        "system": load(final.prompt_path).system,
        "user": load(final.prompt_path).user,
        "assistant": load(final.output_path).json_str,
        "weight": metadata.final_judge_score / 100.0,
        "verified": metadata.human_verified,
    }
```

Merge с collectors P0+P1+P2 (см. phases §10) → `dataset_v8_<target>_train.jsonl`.

---

## §H — Pre-flight train hygiene (D33 P5)

Перед каждым QLoRA train на 14B (`rag-pao/infra/healthcheck.sh`):

```bash
#!/usr/bin/env bash
set -e

# 1. Закрыть GUI приложения
killall pycharm code Telegram firefox chromium 2>/dev/null || true

# 2. Очистить swap БЕЗ swapon обратно
sudo swapoff -a
free -h | head -3
[ $(swapon -s | wc -l) -gt 0 ] && { echo "Swap not cleaned"; exit 1; }

# 3. Stop сторонние сервисы
systemctl --user stop dsp-asst.service 2>/dev/null || true
pkill -f "ollama serve" 2>/dev/null || true

# 4. VRAM check
VRAM=$(rocm-smi --showmemuse | grep VRAM | awk '{print $NF}' | tr -d '%')
[ "$VRAM" -gt 10 ] && { echo "VRAM > 10%: $VRAM%"; exit 1; }

echo "✅ Pre-flight OK — go train"
```

Запускать перед каждым `train_v8.sh`.

---

## §J — Idempotency & Resilience (D37, D38)

### J.1 `POST /save_rag` idempotency (D37, R-RES-1)

При network retry клиент может отправить save_rag дважды. Сервер должен **дедуплицировать**.

```python
# Request body:
{
  "target": "pao_contrib",
  "class_fqn": "boost::filesystem::path",
  "layer": "L3",
  "content": {...},
  "idempotency_key": "sha256(target + class_fqn + attempt_id)"   # 🔒 D37
}

# Server:
@app.post("/save_rag")
def save_rag(req: SaveRagRequest):
    if pg.exists("idempotency_keys", req.idempotency_key):
        return existing_result(req.idempotency_key)   # дедуп
    result = persist(req)
    pg.insert("idempotency_keys", req.idempotency_key, ts=now())
    return result
```

Retention idempotency_keys: 30 дней (pg cleanup job).

### J.2 Post-push verify (D38, R-RES-2)

После `git push origin main` в bare remote — `post-receive` hook должен сделать `git pull` на `/srv/rag-pao`. Если hook **silent fail** — mentor видит «push OK» но сервер не sync'нулся.

```bash
# scripts/sync_prompts_to_pao.sh
git push origin main
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(ssh alex@10.10.4.105 'cd /srv/rag-pao && git rev-parse HEAD')

if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
    echo "❌ Post-receive hook failed! Server still at $REMOTE_HEAD"
    exit 1
fi
echo "✅ Sync verified: $LOCAL_HEAD"
```

---

## §K — Bootstrap validators (D39, SEC-1)

### K.1 `validate_targets_config()` — на старте rag-pao

```python
# rag_pao/core/access_control/validators.py
def validate_targets_config(targets: list[Target]) -> None:
    """Falls fast если targets.yaml имеет небезопасную конфигурацию."""
    for t in targets:
        if t.nda_level != "open" and t.codo_access == "full":
            raise InvalidConfig(
                f"SECURITY: Target {t.name} has nda_level={t.nda_level} "
                f"but codo_access=full. NDA-drops MUST have codo_access=rest-only."
            )

        if t.source.startswith("../") or "../" in t.source:
            raise InvalidConfig(f"SECURITY: Target {t.name}.source has path traversal")
```

Запуск:
- `bash scripts/bootstrap.sh` (Phase 01 init)
- `bash scripts/add_target.sh` (при добавлении нового)
- `systemd ExecStartPre=/usr/bin/python -m rag_pao.core.access_control.validators` (при старте сервиса)

Любая ошибка валидации → **systemd НЕ запускает FastAPI** → fail fast.

### K.2 Smoke test перед flip debug → production

`tests/test_nda_smoke.py`:
```python
class NDASmokeTests(TestRunner):
    def test_show_file_denied_on_nda_target(self) -> AssertionGroup:
        # Симулируем production mode для NDA target
        guard = NDAGuard(policy, targets)
        g = AssertionGroup("smoke")
        g.add(
            not guard.check_access("pao_xxxx_acme", "/show_file", "production"),
            "production mode blocks /show_file on NDA target"
        )
        g.add(
            not guard.check_access("pao_xxxx_acme", "/show_file", "debug"),
            "debug + codo_access=rest-only blocks /show_file"
        )
        return g
```

Выполнить **до** flip'а `mode: debug → production`.

---

## §I — Запреты процесса

- **Не делать git push/tag** без явного OK Alex'а (правило 16-github-sync).
- **Не менять CMake/build-системы** без явного OK.
- **Не писать в `.claude/worktrees/*/`** (правило 03-worktree-safety).
- **NO pytest** — только `TestRunner + SkipTest` (правило 04-testing-python).
- **Не использовать `std::cout` / `printf`** в коде (правило DSP-GPU унаследовано).
- **Не флипать `mode: production → debug` обратно** после первого flip'а на NDA.

---

*v0.3 final.*
