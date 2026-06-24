# Course Atlas

**How university CS courses evolve, year over year.** Each semester of a course is treated as a *version* — like versioned documentation — so you can see how its schedule, assignments, default project, instructors, and topic coverage change over time. This is the depth that link-list resources (e.g. csdiy.wiki) leave out.

🔗 **Live:** https://open-ai-course-atlas.vercel.app

## What's here

- **Catalog** — filterable index of courses (by field / institution, with search).
- **Course pages** — docs-style version switcher; view any one semester at a time.
- **Evolution & Similar-courses narratives** — machine-generated summaries, each carrying a visible model badge, grounded in the structured per-version data.

The current seed dataset covers Stanford CS224n, CMU 11-711 (Advanced NLP), Stanford CS336, and MIT 6.S081 (included to prove the schema isn't NLP-specific).

## Tech

Static [Astro](https://astro.build) site. Course data lives in typed content collections validated by [Zod](https://zod.dev) schemas — the schema doubles as the contract for a future automated harvester. The only client-side JavaScript is the catalog filter; everything else is static HTML. Styling via Tailwind CSS v4.

## Data model

| Collection | What | Location |
|---|---|---|
| `courses` | Course identity + lineage | `src/content/courses/*.yaml` |
| `offerings` | One file per semester-version | `src/content/offerings/*.yaml` |
| `comparisons` | LLM-authored evolution / similar-course narratives | `src/content/comparisons/*.md` |
| `topics` | Controlled vocabulary (the backbone of comparisons) | `src/content/topics/topics.yaml` |

Schemas: `src/lib/schemas.ts`. Every offering references a course by slug and uses topic ids from the controlled vocabulary; `npm run check` enforces those references.

## Develop

```bash
npm install
npm run dev      # local dev server
npm test         # Vitest unit tests
npm run check    # referential integrity (course/topic/source refs)
npm run build    # static build to dist/
```

CI (`.github/workflows/ci.yml`) runs tests + integrity check + build on every push and PR. Deploys are handled by Vercel on push to `master`.

## Add a course offering

1. Add `src/content/offerings/<course-slug>-<year>-<term>.yaml` (the filename must match `course:` + `year` + `term`).
2. Use only topic ids that exist in `src/content/topics/topics.yaml` (add new ones there first).
3. Run `npm run check` and `npm run build` — both must pass.

## Roadmap

**Subsystem B — the harvester** (planned): semi-automated population via a tiered pipeline (deterministic scrapers → bounded LLM-extraction fallback → local agent for onboarding/repair), emitting schema-validated data with provenance. See `docs/superpowers/specs/` for the design and the open verification-gate decision.

---

Design docs and the implementation plan live under [`docs/superpowers/`](docs/superpowers/).
