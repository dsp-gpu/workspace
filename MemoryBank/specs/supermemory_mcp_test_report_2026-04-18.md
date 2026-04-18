# Supermemory MCP — Test Report

**Date:** 2026-04-18
**Client:** claude-code 2.1.114
**MCP server:** supermemory (Streamable HTTP transport)
**Context:** Multi-agent coordination test — verify that a parent Claude Code session and a spawned subagent share the same memory store and can use it for handoff.

---

## 1. What we tested

We ran a two-level test of the supermemory MCP server:

### Level 1 — Parent session

1. Loaded tool schemas via `ToolSearch`:
   - `mcp__supermemory__whoAmI`
   - `mcp__supermemory__listProjects`
   - `mcp__supermemory__recall`
   - `mcp__supermemory__memory` (save/forget)
2. Called `whoAmI` → got `userId`, `email`, `name`, `client`, `sessionId`. OK.
3. Called `listProjects` → *"No projects found. Memories will use the default project."*
4. Called `recall` on an arbitrary query → *"No memories or profile found."* (expected — empty base).
5. Wrote 4 deliberately tagged test records via `memory` action=`save`. Each record started with a unique bracketed marker so we could check whether literal tokens survive round-trip:
   - `[TEST-AGENT-MEMORY-01] ...`
   - `[TEST-ORCHESTRATOR-02] ...`
   - `[TEST-AGENT-RULES-03] ...`
   - `[TEST-AGENT-HANDOFF-04] repo={name} phase={...} status={...} ts=YYYY-MM-DD`
   All four `save` calls returned `Saved memory (id: ...) in <project> project`.
6. Called `recall` with three queries that should hit those records semantically.
7. Tried `memory` action=`forget` with the exact original text of one record → `"No matching memory found to forget (only document chunks matched in semantic search)."`

### Level 2 — Subagent

Spawned a `general-purpose` subagent in the same session. Its task was self-contained:

1. Load `mcp__supermemory__recall` and `mcp__supermemory__whoAmI` schemas via `ToolSearch`.
2. Call `recall` with three queries targeting the marker records.
3. Call `whoAmI` and compare `userId` with the parent.
4. Report which markers appeared verbatim vs. only as paraphrased summary.

---

## 2. What worked

- **Schema discovery via `ToolSearch`** — fast and reliable for both parent and subagent.
- **`whoAmI`** — returned consistent identity for parent and subagent (same `userId`, same `email`). Shared session confirmed.
- **`memory` save** — all 4 `save` calls succeeded and returned stable IDs.
- **`recall` from parent** — returned a structured response:
  - `User Profile` block with stable facts + recent context
  - `Relevant Memories` list with match-% and short text
- **`recall` from subagent** — worked identically, no auth issues, same base visible. Cross-agent coordination via supermemory is technically possible.
- **Project scoping** — records ended up in a named project container automatically (shown in save response as `in <project> project`).

---

## 3. Problems / things that surprised us

### 3.1 Literal content is not preserved — records are normalized at save time

All four records contained unique bracketed markers (`[TEST-AGENT-MEMORY-01]`, `[TEST-ORCHESTRATOR-02]`, etc.) as the very first tokens, specifically so we could detect them in later `recall` output.

**None of the markers appeared verbatim in any `recall` response**, from either the parent or the subagent. The server instead returned rewritten, paraphrased "profile facts" that captured the semantic gist but dropped:
- The bracketed tags
- The structured key-value format (`repo=X phase=Y status=Z ts=...`)
- Any explicit quoted string the caller put in

Example — saved:
> `[TEST-AGENT-HANDOFF-04] ... Формат: "repo={имя} phase={fix|build|test|doc} status={pending|done|failed} ts=YYYY-MM-DD"`

Recalled (best match):
> *"enforces specific workflow rules for <agents>: relative paths only, exclusion of sensitive/config files from logs, manual approval for CMake changes, ..."*

Different record entirely. The saved format string is gone.

**Impact:** `recall` is usable as a semantic memory layer but **not** as a structured key/value store or a coordination log. You cannot round-trip a machine-parsable string through it. Anything that relies on exact tokens, IDs, tags, or a deterministic schema must live outside supermemory.

A `raw=true` flag on `save` (store the literal text, skip rewriting) or a `matchMode: "literal"` flag on `recall` (return the original saved text instead of the rewritten summary) would fix this.

### 3.2 `forget` cannot target a specific record reliably

We tried `memory` action=`forget` with the **exact text** of a previously saved record. It returned:

> `No matching memory found to forget (only document chunks matched in semantic search). in container <project>`

Two issues:
- The API accepts the saved record's `id` at `save` time but `forget` does not appear to accept an `id` parameter — it only takes `content`, which is then matched semantically.
- "only document chunks matched" suggests `forget` requires a full-document match, but what was saved was already classified as chunks — so a literal round-trip can't hit its own record.

**Impact:** test records cannot be cleaned up deterministically. Our 4 test markers are now stuck in the base. Users will accumulate dead records over time with no reliable way to prune them.

Suggested fix: accept `id` (from the `save` response) as an alternative to `content` in `forget`.

### 3.3 `recall` response format ≠ what was saved

`recall` returns a mix of:
- A free-form `User Profile` (paraphrased)
- A `Relevant Memories` list where items are also paraphrased, with a `(NN% match)` prefix

The `(NN% match)` scores are useful, but there is no way to ask for the **original** saved text, the record `id`, or the `save` timestamp. That makes it impossible to:
- Correlate a recalled fragment back to the record that produced it
- Deduplicate near-identical saves
- Implement "find the memory I saved 10 minutes ago" workflows

Suggested fix: include `id` and optional `rawContent` on each item in `Relevant Memories`.

### 3.4 Semantic drift across similar saves

Four clearly distinct records (agent list, phase status, rules, handoff format) were merged into overlapping "profile facts" in the recall output — the same 8–10 paraphrased lines appeared regardless of which of the three queries we ran. Match scores varied but the underlying text block did not.

**Impact:** when multiple related records exist, recall blurs them together. Good for "what do you know about X" queries, bad for "which specific record said Y".

### 3.5 Minor — `listProjects` message wording

`listProjects` with no projects returns the string `"No projects found. Memories will use the default project."` — but `save` later reported storing into a named project (`in <project> project`). So either the project was auto-created on first save and `listProjects` was stale, or the "default project" has a display name. A one-line clarification in the response would help.

---

## 4. Summary

| Capability | Status |
|---|---|
| Parent ↔ subagent shared access | ✅ works |
| Identity consistency (`whoAmI`) | ✅ works |
| `save` returns usable ID | ✅ works |
| Literal-text round-trip via `recall` | ❌ text is rewritten at save/recall time |
| Deterministic `forget` | ❌ no id-based delete, semantic match unreliable |
| `recall` returns record id / original text | ❌ only paraphrased summaries |
| Usable for structured handoff between agents | ❌ format is normalized away |
| Usable for long-term profile / context memory | ✅ this is where it shines |

**Bottom line:** supermemory is a solid semantic-profile layer. It is not, in its current form, a substitute for a structured key/value or log store for agent coordination. For the two to be combinable, we'd need (a) literal-mode save/recall, (b) id-based forget, and (c) record id + raw text in `recall` output.

---

## 5. Reproduction notes

Everything above was reproduced with:
- `claude-code` 2.1.114
- Supermemory MCP over Streamable HTTP, session ID `streamable-http:c9641c9f83c2ff4583b7de440d70545ee2792ddabb0b2291b29f3930172cf361` (parent)
- Tool surface: `whoAmI`, `listProjects`, `recall`, `memory` (save/forget)

No failing network calls, no retries required. All issues are about API semantics, not transport.
