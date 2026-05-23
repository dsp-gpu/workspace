# Pipeline status: WIP (Work In Progress)

> **target**: <TARGET_NAME>
> **version**: v1
> **status**: 🟡 WIP — в процессе адаптации
> **created**: <YYYY-MM-DD>

---

## Acceptance criteria для перехода WIP → STABLE

| Gate | Threshold | Достигнуто |
|------|-----------|-----------|
| L0 R@5 | ≥ 0.9 | ⬜ |
| L1+L2 R@5 | ≥ 0.85 | ⬜ |
| L3 quality | ≥ 80 на ≥ 90% классов | ⬜ |
| L3b gtest compile | ≥ 90% | ⬜ |
| L4 R@5 | ≥ 0.8 | ⬜ |
| QLoRA Q1-Q10 | ≥ 9/10 | ⬜ |

---

## Когда DONE

1. Все 6 gate'ов ✅
2. Manual review Alex'а
3. `mv _WIP.md _STABLE.md` (переименовать этот файл)
4. `git add . && git commit -m "freeze pipeline <target>_v1"`
5. Push в `/srv/git-remotes/rag-pao.git`

---

## Changelog адаптации (заполнять при каждой правке)

| Date | Что менял | Reason |
|------|-----------|--------|
| <YYYY-MM-DD> | initial cp from _template/ | start |
