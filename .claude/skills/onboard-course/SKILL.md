---
name: onboard-course
description: Use when onboarding a new course into Course Atlas — given one course homepage URL, discover its prior-year offerings, write a per-course extractor, extract + adversarially verify each offering, and open a PR of schema-valid data.
---

# Onboard Course

Onboard ONE course end-to-end, locally, ending in a reviewable PR. The deterministic
primitives under `harvester/` do the mechanical work; you (the agent) do the judgment.

## Inputs
- A course homepage URL.
- The intended course slug (e.g. `stanford-cs224n`). If the course file does not exist
  yet under `src/content/courses/<slug>.yaml`, create it first (title, number, institution,
  fields, homepage, summary, and 5–8 coarse `tags`).

## Flow

### 1. Discover (judgment + code)
- Fetch the homepage: `fetchPage(homepageUrl)` from `harvester/lib/fetch.ts`.
- Run `discoverOfferingUrls(page.html, homepageUrl)` from `harvester/lib/discover.ts`.
- Review the candidates. Keep the real per-year offering pages (usually 3–4 of them);
  discard duplicates, lecture-video indexes, and unrelated year-bearing links. Use judgment —
  the discovery primitive is deliberately broad.

### 2. Fetch (code)
- For each chosen URL, `fetchPage(url)`. It falls back to the Wayback Machine automatically
  when a page is dead or JS-only. Record each returned `FetchedPage` (note `source`:
  `official` vs `wayback`).

### 3. Write the extractor (judgment)
- Inspect the fetched HTML structure. Write `harvester/extractors/<slug>.ts` exporting a
  `CourseExtractor` (see `harvester/extractors/contract.ts`): a deterministic function
  `(pages: FetchedPage[]) => ExtractedOffering[]` using `cheerio`. Pull out: `year`, `term`,
  `instructors`, `frameworks`, `schedule`, `assignments`, `project`, `sources`. Do NOT emit
  `topics` (dropped) or `harvest` (stamped later).
- Reference shape:

  ```typescript
  import * as cheerio from 'cheerio';
  import type { CourseExtractor, ExtractedOffering } from './contract';

  export const extract: CourseExtractor = (pages) => {
    return pages.map((page): ExtractedOffering => {
      const $ = cheerio.load(page.html);
      // ...course-specific selectors...
      return {
        course: 'stanford-cs224n',
        year: 2024,
        term: 'Winter',
        instructors: [{ name: $('.instructor').first().text().trim() }],
        frameworks: ['pytorch'],
        sources: [{ url: page.url, type: page.source }],
      };
    });
  };
  ```

### 4. Write the extractor's test (judgment)
- Save each fetched page's HTML as a fixture under `tests/harvester/fixtures/<slug>-<year>.html`.
- Write `tests/harvester/extractors/<slug>.test.ts` asserting the extractor turns the fixture
  into the expected `ExtractedOffering`. This makes future re-harvests verifiable forever.
- Run it: `npx vitest run tests/harvester/extractors/<slug>.test.ts` — must pass.

### 5. Run + validate (code)
- Run the extractor over the fetched pages.
- For each result: `validateOffering(offering, slug)` from `harvester/lib/validate.ts`.
  If `ok` is false, fix the extractor (back to step 3) until validation passes.

### 6. Adversarial verify (judgment — dispatched subagent)
- For each extracted offering, dispatch a FRESH verifier subagent. Give it ONLY:
  (a) the raw `page.text` of the source, and (b) the extracted offering as JSON.
  Do NOT give it your extraction reasoning.
- Instruct the verifier to return JSON exactly matching this shape (validated by
  `verificationSchema` in `harvester/verify/verify-offering.ts`):

  ```json
  {
    "verdicts": [
      { "field": "year", "verdict": "grounded", "evidence": "<quote from page>" },
      { "field": "instructors", "verdict": "unsupported" }
    ],
    "confidence": 0.0
  }
  ```

  Verifier prompt template:
  > You are verifying extracted course data against its source page. For each field in the
  > offering, decide whether the value is **grounded** (clearly supported by the page text),
  > **unsupported** (contradicted or absent), or **uncertain** (plausible but not clearly
  > supported). Quote the supporting snippet as `evidence` when grounded. Then give an overall
  > `confidence` in [0,1]. Judge only whether values trace back to the SOURCE TEXT — do not use
  > outside knowledge. Return ONLY the JSON object.

- Parse the reply with `parseVerification(...)`, then `adjudicate(...)`.
  - `decision === 'retry'`: revise the extractor for the `fieldsToRetry` (back to step 3),
    up to 2 retries. If a field still fails, DROP it from the offering and record it as a
    dropped field for the PR body.
  - `fieldsToFlag`: keep the values, record them as flagged for the PR body.
  - Use the returned `confidence` for the harvest provenance.

### 7. Assign course tags (judgment)
- Choose 5–8 coarse, course-level tags (e.g. `nlp`, `transformers`, `systems`). Write them to
  `src/content/courses/<slug>.yaml` under `tags:`.

### 8. Stamp provenance + serialize (code)
- For each verified offering, build `HarvestProvenance`:
  `{ lastVerified: <today ISO date>, extractor: '<slug>', confidence: <adjudicated> }`.
- `offeringToYaml(offering, harvest)` from `harvester/lib/to-yaml.ts`.
- Write to `src/content/offerings/<slug>-<year>-<term>.yaml` (the filename MUST equal
  the canonical id returned by `validateOffering`).

### 9. Verify the dataset + open the PR (code)
- Run `npm run check && npm run build`. Both MUST pass before opening a PR.
- Build the PR body with `buildPrBody(...)` and branch name with `branchName(slug)` from
  `harvester/lib/open-pr.ts`, then `openPr(...)`. Include: the new offering files, the course
  file, the extractor, its test, and the fixtures.

## Done when
- A PR is open whose body lists each offering's confidence, source, and any flagged/dropped
  fields, and CI (`npm test`, `npm run check`, `npm run build`) is green.
