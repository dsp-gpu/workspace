# 17 — 🌟 Access Modes (Кодо ↔ rag-pao, D25)

> **Критическое правило.** Регулирует доступ Кодо к target коду в rag-pao.

## 2 режима

### `debug` — на этапе отладки методики

- Кодо имеет **полный REST доступ** к rag-pao: `/show_file`, `/run_filler`, `/show_journal`, ...
- Используется на **открытом** target (`pao_contrib`) при отладке pipeline'а.
- Цикл prompt→Qwen→validate→critic→retry занимает **секунды**.

### `production` — для NDA-drops

- Кодо видит **только safe-endpoints**: `/show_signature`, `/show_symbols`, `/search` (filtered), `/run_filler` (sanitized output).
- НЕТ `/show_file` (raw C++ скрыт), НЕТ `/show_journal` (контекст drop'а скрыт), НЕТ `/dump_target`.
- Используется на NDA-drops (`pao_xxxx_acme`, ...).
- Round-trip: Кодо строит промпт → Alex дёргает `/run_filler` руками → копирует результат → Кодо comparator.
- Цикл занимает **минуты** (медленнее, но NDA-friendly).

## Переключатель

### Глобально

`rag-pao/config/targets.yaml`:
```yaml
mode: debug | production
```

`.env`:
```
RAG_PAO_MODE=debug
```

`.env` имеет приоритет над `targets.yaml`.

### Per-target

```yaml
targets:
  - name: pao_contrib
    codo_access: full              # debug-mode полный, production-mode forced safe
  - name: pao_xxxx_acme
    codo_access: rest-only         # ВСЕГДА rest-only, даже при mode=debug
```

## Логика `nda_guard.py` (rag-pao server-side)

```python
SAFE_ENDPOINTS = {
    "/health", "/search",
    "/show_signature", "/show_symbols",
    "/run_filler", "/run_judge",
    "/save_rag"
}

def check_access(target: str, endpoint: str, mode: str) -> bool:
    """
    True если Кодо может вызвать endpoint для target в текущем mode.
    """
    # 1. Production mode — forced safe-only для ВСЕХ targets
    if mode == "production":
        return endpoint in SAFE_ENDPOINTS

    # 2. Debug mode — зависит от per-target codo_access
    target_cfg = load_targets_yaml()[target]
    if target_cfg.codo_access == "full":
        return True                                    # полный доступ

    return endpoint in SAFE_ENDPOINTS                  # NDA в debug — safe-only
```

## Когда flip debug → production

**Перед первым NDA-drop'ом**:

1. Regression тест: golden_set_L0/L1/L2/L3 — все gate'ы зелёные.
2. Manual review acceptance Q1-Q10 на 1-2 случайных классах.
3. Smoke-test: попытка вызвать `/show_file` из mentor → должна вернуть 403.
4. Flip:
   ```bash
   sed -i 's/^mode: debug$/mode: production/' /srv/rag-pao/config/targets.yaml
   # ИЛИ через env override
   export RAG_PAO_MODE=production
   ```
5. **НЕ флипать обратно** debug.

## Реакция Кодо на 403 Forbidden

| Сценарий | Реакция |
|----------|---------|
| `/show_file` в production | ожидаемо — использовать `/show_signature` + `/show_symbols` |
| `/show_file` в debug + codo_access=rest-only | ожидаемо — то же |
| `/show_file` в debug + codo_access=full + 403 | **БАГ инфры** — сообщить Alex'у |

## Что Кодо делает в каждом режиме

| Step | Debug | Production |
|------|-------|------------|
| Oracle эталон | через `mentor_db` (НЕ обращается в pao) | то же |
| Чтение target кода | `/show_file` напрямую | НЕТ — только `/show_signature` + `/show_symbols` |
| Сборка промпта | сама в loop | сама в loop |
| Запуск Qwen | `/run_filler` напрямую | `/run_filler` напрямую (output sanitized) |
| Comparator | сама vs эталон | то же |
| Critic | сама правит | то же |
| Журнал | `/show_journal` если нужно | НЕТ — sync через git pull |

## Test

```python
# tests/test_nda_guard.py
def test_debug_full_allows_show_file():
    assert check_access("pao_contrib", "/show_file", "debug") == True

def test_debug_rest_only_blocks_show_file():
    assert check_access("pao_xxxx_acme", "/show_file", "debug") == False

def test_production_blocks_show_file_everywhere():
    assert check_access("pao_contrib", "/show_file", "production") == False
    assert check_access("pao_xxxx_acme", "/show_file", "production") == False
```

См. `MemoryBank/specs/04_policies_v0.3.md §E` для полного описания.
