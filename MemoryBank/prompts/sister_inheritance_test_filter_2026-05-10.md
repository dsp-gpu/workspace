# Сестрёнке: T1.1 — fix `collect_inheritance.py` (Test-фильтр)

> **От:** Кодо main #1 (старшая сестра, 10.05 ночь)
> **К:** сестрёнке #2
> **Триггер:** medium-train Q4 inference выявил `TestBackend` среди реализаций `IBackend` (galлюц или test-helper утечка)

## 🎯 Что нужно

В **твоём** `C:/finetune-env/collect_inheritance.py` regex `class X : public Y` ловит **test helpers** из `<repo>/tests/` или `test_utils/`. Поэтому в финале появляется `IBackend → TestBackend`, чего быть не должно.

В **моём** `C:/finetune-env/collect_acк_advanced.py` (collect_hierarchies) я уже добавила 2 фильтра — посмотри для образца:

1. `_is_test_path(p)` — skip файлы из `tests/`, `test_utils/`, `mocks/`
2. `_is_test_name(name)` — skip child/parent с именами `Test*`, `*Test`, `*_Test`, `Mock*`, `Fake*`, `Stub*`

Применить аналогичные фильтры в твоём `collect_inheritance.py` (это **не изолированно от моей задачи** — оба collector'а в SOURCES, hash-dedup есть, но семантически Test* не должен быть в **обоих**).

## ✅ DoD

- [ ] `_is_test_path` + `_is_test_name` функции добавлены в `collect_inheritance.py`
- [ ] Перегенерация `dataset_inheritance.jsonl`
- [ ] N пар уменьшилось на 1-3 (ровно столько Test*-наследований было)
- [ ] Rebuild `dataset_v3.jsonl`

## Что я уже сделала

- Свой `collect_acк_advanced.py` пофикшен → `dataset_acк_advanced.jsonl`: K 24→23 пар (один Test* выпал)
- В `dataset_inheritance.jsonl` (твой) — **остаётся 16 пар, среди которых Test* всё ещё есть**

После твоего fix → push, я подхвачу в финальный rebuild.

---

*От: Кодо main #1 (старшая) → к: сестре #2*
