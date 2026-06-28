# Course Atlas — Harvester (Subsystem B) Design

**Date:** 2026-06-24
**Status:** Approved (brainstorming complete; ready for implementation planning)
**Scope of this spec:** Subsystem B — the semi-automated harvesting pipeline. The vertical slice (Subsystem A schema + hand-seeded data + Subsystem C website) is shipped and live; see `2026-06-24-course-atlas-vertical-slice-design.md`. This spec targets the now-locked, validated data format.

---

## 1. Problem & Motivation

The vertical slice proved the model end-to-end with hand-seeded data. Populating it by hand does not scale: each course needs every prior-year offering found, read, and transcribed into schema-valid YAML. Subsystem B automates that work while keeping a human in the loop at the PR boundary.

**Guiding principle:** *the LLM authors and maintains; deterministic code executes.* Expensive judgment (reading a site, writing a parser, adjudicating correctness) is spent **once** at onboarding and frozen into committed, tested code. Every subsequent re-harvest of that course is deterministic and free.

### Goals (this slice)
- Onboard **one** course end-to-end, **locally**, producing a reviewable PR.
- Build the reusable, unit-tested **primitives** every future course and the later scheduler will share.
- Produce a reusable, committed, tested **per-course extractor** so re-harvesting is free.
- Guard factual accuracy with an **adversarial verification gate** before data enters a PR.

### Non-goals (this slice)
- Scheduling (GitHub Actions / cron) — comes after primitives prove out.
- A `repair-scraper` skill — designed-for, not built here.
- Cross-course "similar courses" comparison at scale.
- Fine-grained per-week topic normalization to a controlled vocabulary (**dropped** — see §6).

---

## 2. Key Decisions (resolved during brainstorming)

1. **First slice = onboard ONE course, locally, → PR.** Human-in-the-loop; no automation/scheduling yet.
2. **Full adversarial verification gate now.** An independent LLM re-checks every extracted *factual* field against the raw fetched source before a PR opens. This resolves the vertical-slice spec's open verification decision toward "adversarial gate."
3. **Onboarding produces a reusable per-course extractor** (deterministic script) **plus** the offering data.
4. **Agent-skill orchestration over tested primitives** (Approach A): a markdown skill playbook drives judgment; small committed unit-tested modules do the deterministic work.
5. **Topic normalization dropped.** No per-offering topic ids. Replaced by coarse **course-level tags** for the catalog filter + AI **evolution prose** for narrative. Rationale in §6.

---

## 3. Component Architecture & Repo Layout

Three things, three trust levels:

- **Primitives** (`harvester/lib/`, `harvester/verify/`) — pure, deterministic, unit-tested. Written once, reused by every course and by the future scheduler/`repair-scraper`.
- **Per-course extractor** (`harvester/extractors/<slug>.ts`) — the agent inspects the archive structure and writes this small deterministic module (cheerio/regex). Ships with its own fixture→expected test. This is the asset that makes future re-harvests free.
- **The skill** (`.claude/skills/onboard-course/SKILL.md`) — pure judgment/orchestration.

```
harvester/
  lib/                        # deterministic primitives — unit-tested
    fetch.ts                  # fetch live URL → {url, html, text, retrievedAt, source}; Wayback fallback on failure/JS-SPA
    wayback.ts                # query Wayback CDX/availability API for the best archived snapshot
    discover.ts               # given a course homepage, propose candidate prior-year offering URLs (link scan + known archive patterns)
    to-yaml.ts                # serialize an extracted offering → offerings/*.yaml (schema shape; quotes dates)
    validate.ts               # run the EXISTING Zod offeringSchema + integrity checks (reuse src/lib)
    open-pr.ts                # branch + commit + `gh pr create`
  extractors/
    contract.ts               # CourseExtractor interface: (FetchedPage[]) => ExtractedOffering[]
    <course-slug>.ts          # the per-course extractor the agent WRITES (deterministic), committed
  verify/
    verify-offering.ts        # adversarial gate: (raw page text, extracted offering) → per-field verdict + confidence
tests/harvester/...           # unit tests for every primitive + each course extractor
.claude/skills/onboard-course/SKILL.md   # the playbook that orchestrates the above
```

Everything reuses `src/lib/schemas.ts` and the existing integrity checks as the contract, so harvested data is validated by the exact same rules the website enforces. Nothing merges that the site wouldn't accept.

---

## 4. The `onboard-course` Flow

The playbook the agent follows given one course URL. `[code]` = tested primitive; `[judgment]` = agent reasoning.

1. **Discover** *[judgment + code]* — agent reads the homepage; `discover.ts` proposes candidate prior-year URLs (link scan + known archive patterns like `/class/cs224n/`, `/archive/2022/`); agent picks the real offering pages.
2. **Fetch** *[code]* — `fetch.ts` pulls each page; on failure or JS-only pages, `wayback.ts` falls back to the best archived snapshot. Records `retrievedAt` + source (live vs. wayback).
3. **Write the extractor** *[judgment]* — agent inspects page structure and writes `extractors/<slug>.ts` pulling the structured facts out deterministically.
4. **Write the extractor's test** *[judgment]* — agent saves a fixture (fetched HTML) + expected output, so re-harvesting is verifiable forever.
5. **Run + validate** *[code]* — run the extractor; pipe results through `validate.ts` (existing Zod schema + integrity checks). Failures route back to step 3.
6. **Adversarial verify** *[judgment]* — independent verifier gets raw page text + extracted offering, checks each field is grounded in the page. Disagreements route back to step 3 (see §5).
7. **Assign course tags** *[judgment]* — agent picks the 5–8 coarse course-level tags.
8. **Stamp provenance** *[code]* — write `harvest: { lastVerified, extractor, confidence }` onto each offering.
9. **Open PR** *[code]* — `open-pr.ts` branches, commits the new offering files + extractor + test, opens the PR for review.

Judgment at 1, 3, 4, 6, 7; deterministic tested code at 2, 5, 8, 9. The expensive thinking happens once and freezes into the committed extractor.

---

## 5. Adversarial Verification Gate

**Job:** catch the extractor mis-parsing or hallucinating before data enters a PR. An agent-written extractor can quietly grab the wrong instructor, invent a project, or misread a date; one independent check stops that.

**Mechanics:**
- **Two separate agents, no shared context.** The *extractor* produced the offering. A *fresh verifier* receives only two inputs — the raw fetched page text and the extracted offering YAML — so it cannot inherit the extractor's reasoning or its mistakes.
- **Per-field grounding, not a vibe check.** For each field (`instructors`, `year`, `term`, `frameworks`, `project`, `schedule`, `sources`) the verifier answers *grounded / unsupported / uncertain* and quotes the supporting snippet.
- **Structured verdict**, validated by its own Zod schema: `{ field, verdict, evidence? }[]` plus an overall `confidence` 0–1.

**Routing:**
- All fields `grounded` → proceed; stamp `harvest.confidence`.
- Any `unsupported` → route back to the extractor (step 3) with the specific failing field + the verifier's reasoning. Bounded retries (≈2). If still failing, **drop the field and flag it in the PR body** rather than guessing.
- `uncertain` → keep the value, lower `harvest.confidence`, surface in the PR for eyeballing.

**Deliberately out of scope:** the gate does not judge prose quality, opinions, or the evolution summary — only that *factual extracted fields trace back to the source.* The evolution summary is separate LLM prose and is not gated (consistent with "comparisons are just text, no human review needed").

**Cost:** one extra LLM pass per offering at onboarding (3–4 for a 4-version course), paid once. Later re-harvests re-run the deterministic extractor and can skip the gate unless the extractor changed.

---

## 6. Why Topic Normalization Was Dropped

The vertical slice put a controlled-vocabulary `topics` list on each offering. For Subsystem B we drop fine-grained topic normalization, for two reasons surfaced in brainstorming:

1. **Scale doesn't require it.** The comparison that matters is *within a course* — 3–4 versions — not 40 courses pairwise. For a handful of offerings, the AI can write the evolution summary directly from the structured facts; we don't need normalized topic sets to make a join scale.
2. **Course content genuinely churns.** Weekly content turns over year to year. Forcing every week into a stable vocab id manufactures false "sameness" and risks over-collapsing distinct topics — the *least truthful* part of the pipeline. That a course changed is itself the signal, which prose captures better than a topic-set diff.

**Replacement:**
- **Per offering:** structured factual fields only — year, term, instructors, frameworks, default project, schedule, sources. No topics field.
- **Per course:** 5–8 coarse tags (`nlp`, `transformers`, `systems`, …) for the catalog filter, assigned once at the course level.
- **Narrative:** AI evolution prose over the 3–4 offerings, carrying its model badge, generated locally and regenerated on demand.

**Schema implication (folded into the plan):** topics currently live on the *offering* and the catalog reads `latestOffering(...).data.topics`. Tags move up to the *course*; the schema and the catalog query shift accordingly. This is an implementation-plan change, not a hand-edit of seed data.

**Trade accepted:** lose fine-grained cross-course topic comparison; keep the version toggle, evolution prose, and a working catalog filter; delete the hardest and most brittle part of the pipeline.

---

## 7. PR Output, Testing & Cost

**One PR per onboarded course** contains:
- `src/content/offerings/<slug>-<year>-<term>.yaml` — the 3–4 new offering files, each with stamped `harvest` provenance.
- `src/content/courses/<slug>.yaml` — the course file with its 5–8 coarse tags.
- `harvester/extractors/<slug>.ts` + its test + the HTML fixture(s).
- **PR body** = the human-review surface: per-offering confidence, any fields dropped/flagged by the gate, the tags chosen, and source URLs (live vs. Wayback). The reviewer reads this instead of re-checking the pages.

**Testing layers:**
- **Primitives** (`lib/`, `verify/`) — unit-tested with mocked HTTP, written TDD.
- **Per-course extractor** — ships with its fixture→expected test; CI catches a future break.
- **Existing `npm run check`** runs in CI on the PR — same integrity gate as hand-authored data.

**Cost model** (local-to-keep-costs-down):
- **Onboarding a course:** agent judgment (discover, write extractor, write test, assign tags) + N verifier passes (one per offering). Paid once, locally, via Claude Code/Codex.
- **Re-harvest later:** re-run the deterministic extractor — **zero LLM cost** — unless the site's HTML changed and the extractor breaks → future `repair-scraper` skill.
- **Evolution summary:** one LLM prose pass per course, regenerated only on request.

The expensive part is strictly onboarding, and it amortizes: the committed extractor makes every subsequent year free.

---

## 8. Future Work (beyond this slice)

- **Scheduler** — GitHub Action / cron that re-runs committed extractors on a cadence and opens PRs on diffs.
- **`repair-scraper` skill** — when a site's HTML changes and an extractor's test fails, an agent repairs the extractor.
- **Breadth rollout** — onboard many courses once the one-course flow and primitives are proven.
- **Cross-course comparison** — revisit only if a concrete need for scaled similar-course joins emerges (would reintroduce some shared tagging).
