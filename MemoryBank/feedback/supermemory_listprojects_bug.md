# Supermemory MCP — Feedback on `listProjects` / Container Discoverability

**Date:** 2026-04-20
**Author:** Alex Lanin (cpplankuz@gmail.com)
**Target:** Supermemory MCP developers
**Severity:** Medium — functional workaround exists (pass `containerTag` explicitly), but discoverability is broken for assistants without prior knowledge of tags.

---

## Draft message

**Subject:** `listProjects` returns empty while `containerTag`-scoped memories exist — request for dynamic container enumeration

Hi team,

First of all — thanks a lot for the work you're putting into Supermemory MCP. The `recall` / `memory` round-trip inside Claude Code feels great, and the automatic profile-summary synthesis is genuinely impressive. Really appreciate the direction this product is heading. 🙌

I wanted to flag a small but impactful UX gap we hit today, in case it's useful for your backlog.

### The issue

When memories are stored with a custom `containerTag` (e.g. `"DSP-GPU"`), the `listProjects` tool does **not** report those containers — it responds with `"No projects found. Memories will use the default project."` even though the documents are alive and retrievable.

Reproduction:

1. `memory(action: "save", content: "...", containerTag: "DSP-GPU")` → stored successfully, `spaceContainerTag: "DSP-GPU"` visible on the record.
2. `listProjects(refresh: true)` → `"No projects found"`.
3. `recall(query: "...")` without `containerTag` → `"No memories or profile found"`.
4. `recall(query: "...", containerTag: "DSP-GPU")` → all 11 memories return correctly. ✅

So the data is there and the indexing works perfectly — the discoverability layer is the only missing piece. An assistant that doesn't know the exact tag in advance will effectively see an empty memory store and silently miss everything.

### Why it matters in practice

In real workflows, the set of container tags is **dynamic**: I might create `DSP-GPU` today, add `kernel-cache-v2` tomorrow, retire `old-migration` next week. Hard-coding a list in `CLAUDE.md` or project config defeats the point of having a memory service — the assistant ends up needing a *memory of the memory*. The server already knows which container tags exist (they're attached to every stored record); exposing that list would close the loop.

### Suggested improvements

Any one of these would fix the discoverability gap — in rough order of effort:

1. **Make `listProjects` return all distinct `containerTag` values** the current user has ever written to, not only explicitly-created "projects". Optional: include `memoryCount` and `lastUpdatedAt` per tag so the assistant can prioritize.
2. **Make `recall` container-agnostic by default** — if `containerTag` is omitted, search across *all* of the user's containers and include `containerTag` in each result so the assistant learns which spaces are relevant. An explicit `containerTag` would still scope narrowly.
3. **Add a lightweight `listContainers` / `listSpaces` tool** if you'd rather keep `listProjects` reserved for an explicit "project" concept introduced later. Both could coexist.

A combination of (1) + (2) would probably be the most ergonomic — the assistant would discover containers on first recall without any manual configuration on the user's side.

### Nice-to-have (lower priority)

- Surface `containerTag` in the `recall` result header, so when cross-container search is enabled the assistant can cite *where* each memory came from.
- A small note in the `recall` tool description confirming that an omitted `containerTag` searches across **all** containers (once fixed) would remove ambiguity.

---

Happy to test any fix you ship — the setup is easy to reproduce on our side, and we use containers heavily, so we'll hit edge cases quickly. Thanks again for iterating on the product — the day-to-day improvements really show. 🚀

Best,
Alex Lanin (DSP-GPU / cpplankuz@gmail.com)

---

## Internal notes (not part of the outgoing message)

### Observed behavior snapshot (2026-04-20)

- **Client:** claude-code v2.1.114
- **User ID:** `YVX857dVRJMZXK2m5BJjmf`
- **Container in question:** `DSP-GPU` (spaceId `TYT4wmdVzwEg5PxvyPMGbA`)
- **Memories stored:** 5 documents → 11 derived memory entries (created 2026-04-18 03:55–04:00 UTC)
- **Tools used for reproduction:** `mcp__supermemory__whoAmI`, `mcp__supermemory__listProjects`, `mcp__supermemory__recall`, `mcp__supermemory__fetch-graph-data`

### Local workaround until fix lands

- Always pass `containerTag: "DSP-GPU"` on `recall` calls from this workspace.
- Maintain the list of known container tags in `CLAUDE.md` (or auto-memory) until the server can enumerate them.

### Follow-up ideas

- Attached reproducer: `supermemory_reproducer.sh` — bash + curl + jq, runs the 4 steps against the MCP streamable-http endpoint with a unique containerTag, prints raw JSON responses so the observed vs expected behavior is obvious without Claude Code in the loop.
