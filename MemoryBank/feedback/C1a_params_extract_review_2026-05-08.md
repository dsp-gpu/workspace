# Deep review — C1a params_extract.py (2026-05-08 поздний вечер)

**Reviewer:** deep-reviewer subagent (sequential-thinking 7 thoughts)
**Verdict:** **PASS_minor** — DoD CTX1 LEVEL 0 ≥200 закрыт (396), код пригоден как baseline для C1b, переписывать не нужно.

**Артефакт:** `C:\finetune-env\dsp_assistant\cli\params_extract.py` (506 строк), коммит `c0cb2c1` в `AlexLan73/finetune-env`.

---

## ✅ Что сделано хорошо

1. Чистое переиспользование `agent_doxytags.extractor.extract_methods()` + `indexer.file_walker.iter_source_files` — нулевая дублировка tree-sitter парсинга.
2. ООП-структура: `ExtractedParam` dataclass → `_apply_heuristics_to_param` → `_process_method` → `run_extract_repo` → CLI. Слои разделены, тестируемо.
3. Идемпотентный INSERT через `ON CONFLICT DO NOTHING`.
4. CLI флаги `--dry-run` / `--method <fqn>` / `--all` / `--repo` / `--dsp-root` все на месте, `click.UsageError` при неправильных аргументах.
5. 3-уровневый `_lookup_symbol_id` с tolerance ±15 строк и arity-fallback — overload-resilient.
6. `is_trivial_accessor` / `is_deleted` / `is_defaulted` фильтрация — не пишем мусор.

## 🔴 Critical issues (для C1b — ranked)

### #1 [BLOCKER для heuristics] Walker идёт только по `.hpp`

**Проблема:** строки 379-385 `_iter_repo_headers` ходит по `<repo>/include/**/*.hpp`. Реальные тела методов с `throw`/`assert`/`clamp` живут в `<repo>/src/**/*.cpp`. Поэтому **0 hits** на edge_values/throw_checks (только 76 return заглушек).

**Fix для C1b:**
```python
def _find_cpp_pair(hpp_path: Path, fqn: str) -> tuple[Path, int, int] | None:
    """Найти .cpp где есть <class>::<method>(...), вернуть (path, line_start, line_end)."""
    repo_root = hpp_path
    while repo_root.name != "include" and repo_root.parent != repo_root:
        repo_root = repo_root.parent
    src_dir = repo_root.parent / "src"
    if not src_dir.exists():
        return None
    parts = fqn.rsplit("::", 2)
    cls = parts[-2] if len(parts) > 1 else None
    method = parts[-1]
    if not cls:
        return None
    pat = re.compile(rf"\b{re.escape(cls)}::{re.escape(method)}\s*\(")
    for cpp in src_dir.rglob("*.cpp"):
        text = cpp.read_text(encoding="utf-8", errors="ignore")
        m = pat.search(text)
        if m:
            line = text[:m.start()].count("\n") + 1
            # find matching closing brace
            ...
            return cpp, line, line_end
    return None
```

### #2 [HIGH — 62% no_symbol] Strict path matching

**Проблема:** `_lookup_symbol_id` строки 247 матчит только `\\` ↔ `/`. БД часто хранит **относительный** путь.

**Fix:** добавить третий запрос:
```sql
WHERE s.fqn = %s AND f.path LIKE '%%' || %s
```
с последними 3-4 сегментами пути.

### #3 [HIGH — терминологическая ошибка] `min_excl` vs `min_inclusive`

**Проблема:** `_THROW_RANGE_RE` (строка 161-162): для `if (X < A) throw` пишется `edge["min_excl"] = val1`. Семантически `min_excl` = «X > min_excl», но факт — «X должен быть `>= A`», т.е. `min_inclusive=A`. **LLM-генератор тестов получит ошибочные границы.**

**Fix:** мигрировать на безшовный формат `{"op": ">=", "value": A}` или явные `min_inclusive`/`max_inclusive`. **Сделать ДО LLM-промптов** на 396 записях.

### #4 [MED] `_ASSERT_RE` ловит `sizeof` как имя переменной

`static_assert(sizeof(T) == 4)` → `sizeof` распознается как `pname`. Фильтр `var == pname` спасает в большинстве случаев, но `static_assert(N > 0)` где `N` — template-param попадёт в constraints как параметр.

**Fix:** исключить tokens-keywords (`sizeof`, `alignof`, `noexcept`).

### #5 [MED] Шаг 4 lookup в docstring, но не реализован

Строка 234 docstring обещает «Без файла — единственный кандидат глобально». Кода нет.

**Fix:** либо реализовать (даст +5-10% recall), либо убрать из docstring.

### #6 [LOW] 76 заглушек `non_void_return_present` — шум

Не несёт информации, занимает место в `return_checks`. **Fix:** убрать (LEVEL 1 LLM наполнит) или пометить `confidence=0.1` отдельно.

## 🟢 Minor / nice-to-have

- `DEFAULT_DSP_ROOT = Path("E:/DSP-GPU")` — Windows-only. Добавить через env `DSP_GPU_ROOT` или `git rev-parse --show-toplevel`.
- `MethodReturn` dataclass определён (стр. 75-80), **не используется**. Удалить.
- `from dataclasses import asdict` неиспользуемый импорт.
- `extracted_from.snippet` обрезается до 400 — для HIP-методов мало (200-500 строк). Хранить только line range, snippet брать через retrieval.
- `_slice_body` читает файл на каждый метод — кэшировать через `@functools.lru_cache(maxsize=64)`.
- `log.warning("extract_methods FAIL ...")` теряет tracebacks — `log.exception(...)` вместо `log.warning`.
- `targets = DSP_GPU_REPOS if all_repos else [repo]` — type-ignore лишний при чёткой ветви проверки выше.

## 📋 Конкретные рекомендации сестре C1b (5 пунктов)

1. **Расширить walker на `.cpp`** (#1): после `extract_methods(hpp)` для inline-методов брать тело из `.hpp`; для методов без тела — найти `.cpp` через `_find_cpp_pair()`. Поднимет throw/assert/clamp с 0 до сотен.
2. **Дополнить `_lookup_symbol_id` суффиксным path-match** (#2): третий запрос `WHERE s.fqn = %s AND f.path LIKE '%' || %s`. Цель recall 60%+.
3. **Исправить `min_excl`/`max_excl` семантику** (#3): мигрировать на `{"op": ">=", "value": A}` ДО LLM-промптов.
4. **LEVEL 2 ручная верификация** на 20 ключевых классах через `--method <FQN>`. Цель ≥80 LEVEL 2 записей. Это закроет CTX1 полностью.
5. **Удалить шум `non_void_return_present`** (#6) или переместить под `confidence<0.3`.

---

## Compliance check (CLAUDE.md)

- ✅ pytest не использован
- ✅ worktree safety (писала в `C:\finetune-env\dsp_assistant\` — основной репо `AlexLan73/finetune-env`)
- ✅ CMake не трогала
- ✅ `std::cout` не применимо (Python)
- ✅ Все output через `console.print` (rich), не raw `print()`

## Git compliance

Один коммит `c0cb2c1`: миграция + extract скелет + регистрация в main.py. Без `--force`, без CMake. ✅

---

*Reviewer: deep-reviewer (Claude Opus 4.7) · 2026-05-08 поздний вечер*
*Reviewee: Кодо (та же модель, другая сессия)*
*Файл агента: a3d35d1b046c71c60*
