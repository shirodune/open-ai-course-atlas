# Course Atlas — Vertical Slice Design

**Date:** 2026-06-24
**Status:** Approved (brainstorming complete; ready for implementation planning)
**Scope of this spec:** Sub-project 1 of 3 — the *vertical slice*: data schema + hand-seeded data + website. Subsystems B (harvester) and the broader breadth rollout are out of scope here and captured under "Future Work."

---

## 1. Problem & Motivation

Existing curated course resources (e.g. [csdiy.wiki](https://csdiy.wiki) / `PKUFlyingPig/cs-self-learning`, `ossu/computer-science`, awesome-lists) link to the **latest** offering of a course and stop there. None of them track how a course **evolves across years** — its schedule, assignments, default project, instructors, and topic coverage changing semester to semester. Research earlier in this project confirmed that a true "year-over-year course evolution" resource essentially does not exist; the only large effort (Open Syllabus Project) is a research corpus, not a browsable per-course history.

**Course Atlas** fills that gap: a website that treats each semester of a course as a *version* (like versioned technical documentation), lets you browse a catalog of courses, switch between semester-versions, and read a narrative summary of how each course evolved over the years and how it compares to similar courses.

**Core differentiator vs. csdiy: depth and history.** csdiy is sparse but accurate. Course Atlas must be rich **and** accurate — accuracy is the entire value proposition, so the design protects it via structured ground-truth data per version.

### Goals (this slice)
- Lock a data **schema** that doubles as the contract for the future harvester.
- Hand-seed a small, high-quality dataset (reusing data already gathered this session).
- Ship a **static website**: catalog → course page (docs-style version toggle) → evolution & similar-course narratives.
- Prove the model end-to-end so Subsystem B (harvester) can target a known, validated format.

### Non-goals (this slice)
- The harvesting pipeline (Subsystem B).
- Broad-CS breadth (we seed a couple of AI courses + one non-AI course as a generality test only).
- Two-year side-by-side diff UI (explicitly dropped — see §4).
- User accounts, comments, server-side search, or any backend.

---

## 2. Scope & Sequencing (the bigger picture)

Course Atlas decomposes into three independently-spec'd subsystems:

- **A. Schema + Data Repository** — the canonical structured format. *Everything depends on this.*
- **B. Harvesting Pipeline** — semi-automated population (scrapers + Wayback + LLM extraction). *Future spec.*
- **C. Website** — catalog, version browsing, evolution/comparison narratives.

**Decision:** build a **vertical slice** spanning A + a hand-seeded dataset + C first, validating the schema against real rendering before investing in the brittle harvester. B is built second, targeting the now-locked format. (Rationale: building a scraper for a schema that doesn't exist yet, with no way to view its output, is backwards.)

---

## 3. Data Model (Subsystem A — the contract)

Implemented as **Astro content collections** with **Zod** schemas, so the schema is enforced at build time *and* serves as the harvester's target contract. Data files are **YAML** (human-editable, git-diff-friendly, PR-reviewable). **One file per offering** — keeps diffs clean and maps "one harvest → one file" for the future harvester.

### 3.1 `courses` collection
One file per course (stable identity).

```yaml
id: stanford-cs224n            # slug; primary key
title: Natural Language Processing with Deep Learning
number: CS 224N
institution: Stanford
fields: [nlp, deep-learning]   # drives catalog filtering
homepage: https://web.stanford.edu/class/cs224n/
crossListed: [Ling 284]        # optional
summary: >-
  Stanford's flagship NLP course...
lineage:                       # optional; the "where did this come from" graph
  predecessors: [stanford-cs224d, stanford-cs224n-classic]
  note: 2017 merger of CS 224N (statistical) + CS 224d (deep learning)
```

### 3.2 `offerings` collection
One file per course-in-one-term (a *version*).

```yaml
course: stanford-cs224n        # ref → MUST resolve to a courses id
year: 2024
term: Winter                   # enum: Winter | Spring | Fall | Autumn
instructors:
  - { name: Diyi Yang, role: instructor }       # role optional
  - { name: Tatsunori Hashimoto }
frameworks: [pytorch]          # free-ish list
topics: [transformers, pretraining, rlhf, peft, rag]   # ← controlled vocab (see 3.4)
schedule:                      # optional; included when known
  - { week: 1, title: Word Vectors }
  - { week: 4, title: "Post-training (RLHF, SFT, DPO)" }
assignments:                   # optional
  - { name: A4, title: LLM benchmarking, framework: pytorch, weight: 14 }
project:                       # optional
  { type: default, title: minBERT }
sources:                       # REQUIRED, ≥1 — provenance
  - { url: "https://web.stanford.edu/class/archive/cs/cs224n/cs224n.1244/", type: official }
notes: >-                      # optional freeform markdown
  First Yang+Hashimoto offering; added dedicated post-training + PEFT lectures.
# harvest:                     # RESERVED for Subsystem B — not populated in the slice
#   lastVerified: 2026-06-24
#   extractor: stanford-cs224n-archive-v1
#   confidence: 0.9
```

- Derived offering id: `${course}-${year}-${term}` lowercased (e.g. `stanford-cs224n-2024-winter`).
- `sources[].type`: enum `official | wayback | youtube | other`.

### 3.3 `comparisons` collection
LLM-authored narratives, stored as data, rendered statically. Markdown body + frontmatter.

```yaml
type: evolution                # enum: evolution | similar-courses
subjects: [stanford-cs224n]    # course id(s) the narrative is about
generatedBy:
  model: claude-opus-4-8       # ← the "log which LLM" requirement; also the visible badge
  generatedAt: 2026-06-24
# body: markdown narrative follows frontmatter
```

- `type: evolution` → one course across years. `type: similar-courses` → references multiple courses.
- Rendered with a visible **model badge** (e.g. `🤖 Machine-generated · Claude Opus 4.8 · 2026-06-24`) so readers calibrate trust. The badge is just displaying the logged `generatedBy` field.
- Narratives are **editorial**, grounded in the structured data; the per-version structured fields remain the authoritative ground truth shown alongside.

### 3.4 `topics` taxonomy (controlled vocabulary)
A data file mapping tag → metadata. **This is the backbone of evolution/comparison coherence**: without a controlled vocab, "RLHF" vs "Reinforcement Learning from Human Feedback" wouldn't match.

```yaml
- { id: rlhf, label: RLHF, category: post-training }
- { id: transformers, label: Transformers, category: architecture }
- { id: rag, label: Retrieval-Augmented Generation, category: systems }
```

Every `offerings.topics[]` entry must resolve to a taxonomy `id` (enforced by integrity check, §6).

---

## 4. Website (Subsystem C)

**Mental model: versioned documentation.** Each offering is a doc version; you view one at a time and switch via a dropdown. The "how it evolved" story is a changelog-style narrative on the latest page. **No two-year side-by-side diff** (explicitly dropped for simplicity).

### 4.1 Routes
| Route | Purpose | Rendering |
|---|---|---|
| `/` | **Catalog (hero).** Sidebar filters (field, institution) + card grid; search by name/number. Each card shows offering count + year span and links to the course. | Static + one small client filter island |
| `/courses/[id]` | Course page showing the **latest** version. | Static |
| `/courses/[id]/[term-year]` | A specific version (deep-linkable). The version dropdown links here. | Static (one page per offering) |
| `/about` | What the site is; methodology & provenance; how data is sourced (sets up the harvester story). | Static |

The **only** JavaScript on the site is the catalog filter island. Version switching is plain links; expandable schedule/assignments use native `<details>`.

### 4.2 Catalog page (chosen layout: "A")
- Left **sidebar filters**: Field, Institution (always visible).
- **Card grid**: each card = course number + institution + title + offering count + year span + topic chips.
- Client-side text search + filter (small island).

### 4.3 Course page
- **Header:** title, number, institution, cross-listing, lineage note.
- **Version dropdown** ("Version: Winter 2026 ▾") — switches semesters; defaults to latest.
- **Selected version body:** instructors, frameworks, default project, topic chips, expandable schedule & assignments (`<details>`), source links.
- **On the latest version only**, two narrative sections (each rendered from a `comparisons` entry, with model badge):
  - **📈 Evolution** — how the course changed over the years.
  - **🔀 Similar courses** — prose comparison to related courses (replaces a standalone compare/matrix builder).

---

## 5. Seed Data

Reuse data already gathered this session (cited to primary/archive sources):

- **Stanford CS 224N** — ~5–6 offerings (e.g. 2017, 2019, 2021, 2023, 2025, 2026).
- **CMU 11-711 Advanced NLP** — ~4 offerings (e.g. 2021, 2022, Spring 2024, Spring 2025).
- **Stanford CS 336** (lighter, ~2 offerings) — secondary AI course.
- **MIT 6.S081 Operating Systems** (token entry, light) — proves the schema is **not** NLP-specific (broad-CS readiness).
- **2 `comparisons` narratives** authored this session — CS224n evolution; CS224n vs CMU ANLP — stamped `model: claude-opus-4-8`, `generatedAt: 2026-06-24`.

Seed data is hand-curated for this slice, so no verification-gate question arises yet (that's a Subsystem B concern).

---

## 6. Tooling, Validation & Testing

**Stack:** Astro + TypeScript; content collections + Zod; YAML data files; Tailwind CSS. Static output.

**Validation (two layers):**
1. **Zod** schemas validate every file's shape at build (Astro built-in).
2. **`scripts/check-integrity.ts`** enforces cross-file referential rules Zod can't: every `offerings.course` resolves to a `courses` id; every `offerings.topics[]` resolves to a `topics` taxonomy id; every `comparisons.subjects[]` resolves; each offering has ≥1 source.

**Testing (TDD — tests written first):** Vitest unit tests for the pure helper functions:
- version sorting / "latest" selection,
- offering-id derivation,
- topic resolution,
- the integrity checks themselves.
Plus a **build smoke test**: the site must build successfully and emit the expected pages (catalog, each course, each version, about).

**CI / Hosting:** GitHub Actions runs tests + integrity check + build on every push; deploys static output to **GitHub Pages** (free; fits the open-source/csdiy ethos).

**Repo housekeeping:** `.superpowers/` added to `.gitignore` (visual-companion mockups not committed).

---

## 7. Future Work (out of scope for this slice)

### Subsystem B — Harvesting Pipeline
Semi-automated population. Architecture principle: **the LLM authors and maintains; deterministic code executes on a schedule.** Three tiers:
1. **Deterministic extraction script** (normal case) — runs free on scheduled GitHub Actions.
2. **LLM-API extraction fallback** — a single bounded Claude API call over fetched HTML → schema JSON, for messy/JS-SPA pages (we hit this with phontron.com).
3. **Full local agent** (Claude Code) — onboard a new course / repair a broken scraper; human-in-loop, occasional.

**Agent skills** to encode the Tier-3 work (versioned in the repo): `onboard-course`, `repair-scraper`, `extract-offering`, `generate-comparison`.

**Reserved schema:** the optional `harvest` block on offerings (`lastVerified`, `extractor`, `confidence`) so B can stamp records without a schema migration.

**OPEN DECISION (to settle when brainstorming B):** review model for harvested *facts* —
- (a) **pure auto-commit + self-debug** (user's lean): scripts run; agent auto-fixes on crashes. Risk: silent semantic drift (a redesigned page maps the wrong field, passes schema, commits confidently-wrong data — green CI ≠ correct data) undermines the accuracy differentiator.
- (b) **automated verification gate** (recommended): before merge, an adversarial second LLM pass checks extracted fields against the raw fetched source + source-grounding + schema; failures route back to the authoring agent. No human toil, but errors are caught.
- Narratives (`comparisons`) are agreed lower-stakes: **auto-publish with the model badge**, no human gate.

### Other future
- Broad-CS breadth rollout.
- Stretch: `/topics/[tag]` pages (taxonomy already supports this).

---

## 8. Open Questions / Assumptions
- Exact count of seed offerings is flexible (target ≥4 per flagship AI course).
- Tailwind vs. minimal hand-rolled CSS is a soft choice; Tailwind assumed for speed.
- `model` string format pinned to canonical model ids (e.g. `claude-opus-4-8`) at implementation.
