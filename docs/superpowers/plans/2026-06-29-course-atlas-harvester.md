# Course Atlas Harvester (Subsystem B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable, unit-tested primitives and the `onboard-course` skill that let a local Claude Code session onboard one course end-to-end and open a reviewable PR of schema-valid offering data.

**Architecture:** Deterministic primitives live in `harvester/lib/` and `harvester/verify/` as pure TypeScript modules with Vitest unit tests. The judgment-heavy work (discover archive structure, write the per-course extractor, adjudicate verification) is performed by the Claude Code agent and dispatched subagents, orchestrated by `.claude/skills/onboard-course/SKILL.md`. The agent's verification judgment arrives as JSON validated by a Zod schema and routed by a pure `adjudicate()` function. All harvested data is validated by the *existing* `src/lib/schemas.ts` and integrity checks — the harvester never re-declares the data shape.

**Tech Stack:** TypeScript (ESM), Vitest, `cheerio` (HTML parsing), `yaml` (serialization, already a dep), `astro/zod` (schemas, already a dep), `gh` CLI (PR creation). Node 18+ global `fetch`.

## Global Constraints

- **Reuse the existing contract.** All offering validation goes through `offeringSchema` in `src/lib/schemas.ts` and `checkIntegrity` in `src/lib/integrity.ts`. Never redeclare the offering shape.
- **Harvested output must pass `npm test`, `npm run check`, and `npm run build`.** Nothing merges that the website would reject.
- **No paid API calls in code.** LLM judgment is supplied by the Claude Code agent / dispatched subagents, not by primitives. Primitives are pure and deterministic.
- **Tests never touch the network.** Inject `fetchImpl` / `now` / `waybackLookup`; mock all HTTP.
- **Harvester deps are devDependencies.** The shipped website gains no new runtime dependency.
- **Tests live in `tests/**/*.test.ts`** (Vitest `include` is `tests/**/*.test.ts`); harvester tests go under `tests/harvester/`.
- **Commit trailer** on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SybcRFrunZrh1A4EgsSX1K
  ```
- **Already on branch `course-atlas-harvester-design`.** Do not commit to `master`.

---

## File Structure

```
harvester/
  extractors/
    contract.ts        # Term, FetchedPage, ExtractedOffering, CourseExtractor types (Task 2)
  lib/
    wayback.ts         # findWaybackSnapshot (Task 3)
    fetch.ts           # htmlToText, fetchPage w/ Wayback fallback (Task 4)
    discover.ts        # discoverOfferingUrls (Task 5)
    validate.ts        # validateOffering — reuses offeringSchema (Task 6)
    to-yaml.ts         # offeringToYaml + HarvestProvenance (Task 7)
    open-pr.ts         # branchName, buildPrBody (tested) + openPr (exec wrapper) (Task 9)
  verify/
    verify-offering.ts # verification Zod schema, parseVerification, adjudicate (Task 8)
tests/harvester/
  contract.test.ts  fetch.test.ts  wayback.test.ts  discover.test.ts
  validate.test.ts  to-yaml.test.ts  verify-offering.test.ts  open-pr.test.ts
.claude/skills/onboard-course/SKILL.md   # the orchestration playbook (Task 10)
src/lib/schemas.ts   # MODIFY: add course.tags (Task 1)
```

**Deferred to a Subsystem C (website) follow-up, NOT in this plan:** switching the catalog filter from offering `topics` to course `tags`, and surfacing tags in `CourseCard`. The `course.tags` field is added here (so harvested course files validate and carry tags), but the catalog UI continues to use offering `topics` until the follow-up. This keeps this plan to one subsystem.

---

### Task 1: Add `tags` to the course schema

**Files:**
- Modify: `src/lib/schemas.ts:5-17` (the `courseSchema` object)
- Test: `tests/schemas.test.ts` (append cases)

**Interfaces:**
- Consumes: nothing.
- Produces: `courseSchema` now accepts optional `tags: string[]` defaulting to `[]`. `Course` type gains `tags: string[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/schemas.test.ts`:

```typescript
import { courseSchema } from '../src/lib/schemas';

describe('courseSchema tags', () => {
  const base = {
    title: 'X', number: 'CS 1', institution: 'Y',
    fields: ['nlp'], homepage: 'https://e.com/', summary: 'z',
  };

  it('defaults tags to an empty array when omitted', () => {
    const parsed = courseSchema.parse(base);
    expect(parsed.tags).toEqual([]);
  });

  it('preserves provided tags', () => {
    const parsed = courseSchema.parse({ ...base, tags: ['nlp', 'transformers'] });
    expect(parsed.tags).toEqual(['nlp', 'transformers']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schemas.test.ts -t "courseSchema tags"`
Expected: FAIL — `parsed.tags` is `undefined` (no such field yet).

- [ ] **Step 3: Add the field**

In `src/lib/schemas.ts`, inside `courseSchema`, after the `fields` line (`fields: z.array(z.string()).min(1),`) add:

```typescript
  tags: z.array(z.string()).default([]),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/schemas.test.ts -t "courseSchema tags"`
Expected: PASS.

- [ ] **Step 5: Confirm existing data still builds**

Run: `npm run check && npm run build`
Expected: both pass (the field is optional with a default; existing course files need no edits).

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas.ts tests/schemas.test.ts
git commit -m "feat(schema): add optional course.tags field for harvester

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SybcRFrunZrh1A4EgsSX1K"
```

---

### Task 2: Extractor contract types + cheerio dependency

**Files:**
- Create: `harvester/extractors/contract.ts`
- Modify: `package.json` (add `cheerio` devDependency)
- Test: `tests/harvester/contract.test.ts`

**Interfaces:**
- Consumes: `TERMS` from `src/lib/schemas.ts`.
- Produces:
  - `type Term = (typeof TERMS)[number]`
  - `interface FetchedPage { url: string; html: string; text: string; retrievedAt: string; source: 'official' | 'wayback' }`
  - `interface ExtractedOffering { course: string; year: number; term: Term; instructors: { name: string; role?: string }[]; frameworks: string[]; schedule?: { week?: number; date?: string; title: string }[]; assignments?: { name: string; title: string; framework?: string; weight?: number }[]; project?: { type: string; title: string }; sources: { url: string; type: 'official' | 'wayback' | 'youtube' | 'other' }[]; notes?: string }`
  - `type CourseExtractor = (pages: FetchedPage[]) => ExtractedOffering[]`
  - Note: `ExtractedOffering` deliberately omits `topics` (dropped — see spec §6) and `harvest` (stamped later by `to-yaml`).

- [ ] **Step 1: Add the cheerio dependency**

Run: `npm install --save-dev cheerio@^1.0.0`
Expected: `package.json` devDependencies gains `cheerio`.

- [ ] **Step 2: Write the failing test**

Create `tests/harvester/contract.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { offeringSchema } from '../../src/lib/schemas';
import type { ExtractedOffering } from '../../harvester/extractors/contract';

// An ExtractedOffering must be a valid offering once the schema applies its
// defaults (topics -> []). This locks the contract to the real schema.
describe('ExtractedOffering contract', () => {
  it('a well-formed ExtractedOffering passes offeringSchema', () => {
    const sample: ExtractedOffering = {
      course: 'stanford-cs224n',
      year: 2024,
      term: 'Winter',
      instructors: [{ name: 'Chris Manning', role: 'instructor' }],
      frameworks: ['pytorch'],
      sources: [{ url: 'https://web.stanford.edu/class/cs224n/', type: 'official' }],
    };
    const parsed = offeringSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.topics).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/harvester/contract.test.ts`
Expected: FAIL — cannot resolve `../../harvester/extractors/contract`.

- [ ] **Step 4: Create the contract**

Create `harvester/extractors/contract.ts`:

```typescript
import { TERMS } from '../../src/lib/schemas';

export type Term = (typeof TERMS)[number];

export interface FetchedPage {
  url: string;
  html: string;
  text: string;
  retrievedAt: string; // ISO 8601
  source: 'official' | 'wayback';
}

export interface ExtractedOffering {
  course: string;
  year: number;
  term: Term;
  instructors: { name: string; role?: string }[];
  frameworks: string[];
  schedule?: { week?: number; date?: string; title: string }[];
  assignments?: { name: string; title: string; framework?: string; weight?: number }[];
  project?: { type: string; title: string };
  sources: { url: string; type: 'official' | 'wayback' | 'youtube' | 'other' }[];
  notes?: string;
}

export type CourseExtractor = (pages: FetchedPage[]) => ExtractedOffering[];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/harvester/contract.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add harvester/extractors/contract.ts tests/harvester/contract.test.ts package.json package-lock.json
git commit -m "feat(harvester): add extractor contract types + cheerio

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SybcRFrunZrh1A4EgsSX1K"
```

---

### Task 3: Wayback snapshot lookup

**Files:**
- Create: `harvester/lib/wayback.ts`
- Test: `tests/harvester/wayback.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `async function findWaybackSnapshot(url: string, opts?: { fetchImpl?: typeof fetch; timestamp?: string }): Promise<string | null>` — returns the closest available archived snapshot URL (forced to `https:`), or `null` if none.

- [ ] **Step 1: Write the failing test**

Create `tests/harvester/wayback.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { findWaybackSnapshot } from '../../harvester/lib/wayback';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('findWaybackSnapshot', () => {
  it('returns the closest snapshot url forced to https', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      archived_snapshots: { closest: { available: true, url: 'http://web.archive.org/web/2021/https://x.edu/' } },
    })) as unknown as typeof fetch;
    const out = await findWaybackSnapshot('https://x.edu/', { fetchImpl });
    expect(out).toBe('https://web.archive.org/web/2021/https://x.edu/');
  });

  it('returns null when no snapshot is available', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ archived_snapshots: {} })) as unknown as typeof fetch;
    expect(await findWaybackSnapshot('https://x.edu/', { fetchImpl })).toBeNull();
  });

  it('returns null on a non-ok API response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 })) as unknown as typeof fetch;
    expect(await findWaybackSnapshot('https://x.edu/', { fetchImpl })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harvester/wayback.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `harvester/lib/wayback.ts`:

```typescript
export interface WaybackOptions {
  fetchImpl?: typeof fetch;
  timestamp?: string; // YYYYMMDD; ask Wayback for the snapshot closest to this date
}

interface WaybackResponse {
  archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string } };
}

export async function findWaybackSnapshot(url: string, opts: WaybackOptions = {}): Promise<string | null> {
  const f = opts.fetchImpl ?? fetch;
  const ts = opts.timestamp ? `&timestamp=${opts.timestamp}` : '';
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}${ts}`;
  let res: Response;
  try {
    res = await f(api);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json()) as WaybackResponse;
  const closest = data.archived_snapshots?.closest;
  if (closest?.available && closest.url) {
    return closest.url.replace(/^http:/, 'https:');
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harvester/wayback.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add harvester/lib/wayback.ts tests/harvester/wayback.test.ts
git commit -m "feat(harvester): add Wayback snapshot lookup primitive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SybcRFrunZrh1A4EgsSX1K"
```

---

### Task 4: Fetch with Wayback fallback

**Files:**
- Create: `harvester/lib/fetch.ts`
- Test: `tests/harvester/fetch.test.ts`

**Interfaces:**
- Consumes: `findWaybackSnapshot` (Task 3), `FetchedPage` (Task 2).
- Produces:
  - `function htmlToText(html: string): string` — strips script/style/noscript, collapses whitespace.
  - `async function fetchPage(url: string, opts?: FetchOptions): Promise<FetchedPage>` where `FetchOptions = { timeoutMs?: number; minTextLength?: number; now?: () => string; fetchImpl?: typeof fetch; waybackLookup?: (url: string) => Promise<string | null> }`. Returns a `FetchedPage`; falls back to Wayback when the live page fails or yields too little text (`< minTextLength`, default 200); throws if neither works.

- [ ] **Step 1: Write the failing test**

Create `tests/harvester/fetch.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { htmlToText, fetchPage } from '../../harvester/lib/fetch';

const RICH = '<html><body>' + 'word '.repeat(100) + '<script>var x=1</script></body></html>';
const THIN = '<html><body><div id="app"></div></body></html>';
const NOW = () => '2026-06-24T00:00:00.000Z';

describe('htmlToText', () => {
  it('drops scripts and collapses whitespace', () => {
    const text = htmlToText('<body><script>junk()</script><p>Hello   world</p></body>');
    expect(text).toBe('Hello world');
  });
});

describe('fetchPage', () => {
  it('returns the live page when it has enough text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(RICH, { status: 200 })) as unknown as typeof fetch;
    const page = await fetchPage('https://x.edu/', { fetchImpl, now: NOW });
    expect(page.source).toBe('official');
    expect(page.url).toBe('https://x.edu/');
    expect(page.retrievedAt).toBe('2026-06-24T00:00:00.000Z');
    expect(page.text.length).toBeGreaterThan(200);
  });

  it('falls back to Wayback when the live page is too thin', async () => {
    const fetchImpl = vi.fn(async (u: string) =>
      u.includes('snapshot') ? new Response(RICH, { status: 200 }) : new Response(THIN, { status: 200 }),
    ) as unknown as typeof fetch;
    const waybackLookup = vi.fn().mockResolvedValue('https://web.archive.org/snapshot/x');
    const page = await fetchPage('https://x.edu/', { fetchImpl, waybackLookup, now: NOW });
    expect(page.source).toBe('wayback');
    expect(page.url).toBe('https://web.archive.org/snapshot/x');
  });

  it('falls back to Wayback when the live fetch throws', async () => {
    const fetchImpl = vi.fn(async (u: string) => {
      if (u.includes('snapshot')) return new Response(RICH, { status: 200 });
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const waybackLookup = vi.fn().mockResolvedValue('https://web.archive.org/snapshot/x');
    const page = await fetchPage('https://x.edu/', { fetchImpl, waybackLookup, now: NOW });
    expect(page.source).toBe('wayback');
  });

  it('throws when neither live nor Wayback works', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(THIN, { status: 200 })) as unknown as typeof fetch;
    const waybackLookup = vi.fn().mockResolvedValue(null);
    await expect(fetchPage('https://x.edu/', { fetchImpl, waybackLookup, now: NOW })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harvester/fetch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `harvester/lib/fetch.ts`:

```typescript
import * as cheerio from 'cheerio';
import { findWaybackSnapshot } from './wayback';
import type { FetchedPage } from '../extractors/contract';

export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

export interface FetchOptions {
  timeoutMs?: number;
  minTextLength?: number;
  now?: () => string;
  fetchImpl?: typeof fetch;
  waybackLookup?: (url: string) => Promise<string | null>;
}

async function fetchWithTimeout(f: typeof fetch, url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await f(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<FetchedPage> {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date().toISOString());
  const waybackLookup = opts.waybackLookup ?? ((u: string) => findWaybackSnapshot(u));
  const minText = opts.minTextLength ?? 200;

  let live: Response | null = null;
  try {
    live = await fetchWithTimeout(f, url, opts.timeoutMs ?? 15000);
  } catch {
    live = null;
  }
  if (live && live.ok) {
    const html = await live.text();
    const text = htmlToText(html);
    if (text.length >= minText) {
      return { url, html, text, retrievedAt: now(), source: 'official' };
    }
  }

  const snapshot = await waybackLookup(url);
  if (snapshot) {
    const res = await f(snapshot);
    if (res.ok) {
      const html = await res.text();
      return { url: snapshot, html, text: htmlToText(html), retrievedAt: now(), source: 'wayback' };
    }
  }

  throw new Error(`Could not fetch ${url}: live failed or too thin and no usable Wayback snapshot`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harvester/fetch.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add harvester/lib/fetch.ts tests/harvester/fetch.test.ts
git commit -m "feat(harvester): add fetchPage with Wayback fallback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SybcRFrunZrh1A4EgsSX1K"
```

---

### Task 5: Discover candidate offering URLs

**Files:**
- Create: `harvester/lib/discover.ts`
- Test: `tests/harvester/discover.test.ts`

**Interfaces:**
- Consumes: nothing (takes raw HTML + base URL).
- Produces: `interface DiscoveredUrl { url: string; year?: number }` and `function discoverOfferingUrls(homepageHtml: string, baseUrl: string): DiscoveredUrl[]` — same-host absolute links that contain a 20xx year (in the href or link text), de-duplicated, sorted newest-year first.

- [ ] **Step 1: Write the failing test**

Create `tests/harvester/discover.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { discoverOfferingUrls } from '../../harvester/lib/discover';

const HTML = `
  <html><body>
    <a href="/class/cs224n/2023/">Winter 2023</a>
    <a href="archive/2021/index.html">2021 offering</a>
    <a href="https://web.stanford.edu/class/cs224n/2024/">2024</a>
    <a href="https://youtube.com/watch?v=abc">Lectures 2022</a>
    <a href="/about">About</a>
  </body></html>`;

describe('discoverOfferingUrls', () => {
  const out = discoverOfferingUrls(HTML, 'https://web.stanford.edu/class/cs224n/');

  it('keeps same-host links carrying a year, newest first', () => {
    const urls = out.map(o => o.url);
    expect(urls).toEqual([
      'https://web.stanford.edu/class/cs224n/2024/',
      'https://web.stanford.edu/class/cs224n/2023/',
      'https://web.stanford.edu/class/cs224n/archive/2021/index.html',
    ]);
  });

  it('drops off-host links even when they carry a year', () => {
    expect(out.some(o => o.url.includes('youtube.com'))).toBe(false);
  });

  it('drops links with no year', () => {
    expect(out.some(o => o.url.endsWith('/about'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harvester/discover.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `harvester/lib/discover.ts`:

```typescript
import * as cheerio from 'cheerio';

export interface DiscoveredUrl {
  url: string;
  year?: number;
}

const YEAR_RE = /\b(20\d{2})\b/;

export function discoverOfferingUrls(homepageHtml: string, baseUrl: string): DiscoveredUrl[] {
  const $ = cheerio.load(homepageHtml);
  const base = new URL(baseUrl);
  const seen = new Map<string, DiscoveredUrl>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let abs: string;
    try {
      abs = new URL(href, base).toString();
    } catch {
      return;
    }
    if (new URL(abs).host !== base.host) return;
    const text = $(el).text();
    const m = abs.match(YEAR_RE) ?? text.match(YEAR_RE);
    if (!m) return;
    if (!seen.has(abs)) seen.set(abs, { url: abs, year: Number(m[1]) });
  });

  return [...seen.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harvester/discover.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add harvester/lib/discover.ts tests/harvester/discover.test.ts
git commit -m "feat(harvester): add offering-URL discovery primitive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SybcRFrunZrh1A4EgsSX1K"
```

---

### Task 6: Validate an extracted offering

**Files:**
- Create: `harvester/lib/validate.ts`
- Test: `tests/harvester/validate.test.ts`

**Interfaces:**
- Consumes: `offeringSchema` (`src/lib/schemas.ts`), `expectedOfferingId` (`src/lib/offerings.ts`), `ExtractedOffering` (Task 2).
- Produces: `interface ValidationResult { ok: boolean; errors: string[]; id?: string }` and `function validateOffering(o: ExtractedOffering, courseSlug: string): ValidationResult` — runs the real Zod schema, then derives the canonical offering id via `expectedOfferingId`. On schema failure, `ok: false` with flattened messages and no `id`.

- [ ] **Step 1: Write the failing test**

Create `tests/harvester/validate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateOffering } from '../../harvester/lib/validate';
import type { ExtractedOffering } from '../../harvester/extractors/contract';

const good: ExtractedOffering = {
  course: 'stanford-cs224n',
  year: 2024,
  term: 'Winter',
  instructors: [{ name: 'Chris Manning' }],
  frameworks: ['pytorch'],
  sources: [{ url: 'https://web.stanford.edu/class/cs224n/', type: 'official' }],
};

describe('validateOffering', () => {
  it('accepts a well-formed offering and returns the canonical id', () => {
    const r = validateOffering(good, 'stanford-cs224n');
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.id).toBe('stanford-cs224n-2024-winter');
  });

  it('rejects an offering with no sources', () => {
    const r = validateOffering({ ...good, sources: [] }, 'stanford-cs224n');
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/sources/);
  });

  it('rejects an offering with no instructors', () => {
    const r = validateOffering({ ...good, instructors: [] }, 'stanford-cs224n');
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/instructors/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harvester/validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `harvester/lib/validate.ts`:

```typescript
import { offeringSchema } from '../../src/lib/schemas';
import { expectedOfferingId } from '../../src/lib/offerings';
import type { ExtractedOffering } from '../extractors/contract';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  id?: string;
}

export function validateOffering(o: ExtractedOffering, courseSlug: string): ValidationResult {
  const parsed = offeringSchema.safeParse(o);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  return { ok: true, errors: [], id: expectedOfferingId(courseSlug, parsed.data) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harvester/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add harvester/lib/validate.ts tests/harvester/validate.test.ts
git commit -m "feat(harvester): add validateOffering reusing the real schema

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SybcRFrunZrh1A4EgsSX1K"
```

---

### Task 7: Serialize an offering to YAML

**Files:**
- Create: `harvester/lib/to-yaml.ts`
- Test: `tests/harvester/to-yaml.test.ts`

**Interfaces:**
- Consumes: `stringify`/`parse` from `yaml` (existing dep), `ExtractedOffering` (Task 2).
- Produces: `interface HarvestProvenance { lastVerified: string; extractor: string; confidence: number }` and `function offeringToYaml(o: ExtractedOffering, harvest: HarvestProvenance): string` — emits fields in schema order, omits undefined optionals, appends the `harvest` block, and round-trips back through `yaml.parse` + `offeringSchema`.

- [ ] **Step 1: Write the failing test**

Create `tests/harvester/to-yaml.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { offeringToYaml } from '../../harvester/lib/to-yaml';
import { offeringSchema } from '../../src/lib/schemas';
import type { ExtractedOffering } from '../../harvester/extractors/contract';

const o: ExtractedOffering = {
  course: 'stanford-cs224n',
  year: 2024,
  term: 'Winter',
  instructors: [{ name: 'Chris Manning', role: 'instructor' }],
  frameworks: ['pytorch'],
  sources: [{ url: 'https://web.stanford.edu/class/cs224n/', type: 'official' }],
};
const harvest = { lastVerified: '2026-06-24', extractor: 'stanford-cs224n', confidence: 0.95 };

describe('offeringToYaml', () => {
  const yaml = offeringToYaml(o, harvest);

  it('round-trips through yaml.parse and offeringSchema', () => {
    const parsedBack = offeringSchema.safeParse(parse(yaml));
    expect(parsedBack.success).toBe(true);
  });

  it('keeps lastVerified a string after parsing', () => {
    const back = parse(yaml) as { harvest: { lastVerified: unknown } };
    expect(typeof back.harvest.lastVerified).toBe('string');
    expect(back.harvest.lastVerified).toBe('2026-06-24');
  });

  it('omits optional fields that are absent', () => {
    expect(yaml).not.toContain('project:');
    expect(yaml).not.toContain('assignments:');
  });

  it('stamps the harvest provenance block', () => {
    expect(yaml).toContain('extractor: stanford-cs224n');
    expect(yaml).toContain('confidence: 0.95');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harvester/to-yaml.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `harvester/lib/to-yaml.ts`:

```typescript
import { stringify } from 'yaml';
import type { ExtractedOffering } from '../extractors/contract';

export interface HarvestProvenance {
  lastVerified: string;
  extractor: string;
  confidence: number;
}

export function offeringToYaml(o: ExtractedOffering, harvest: HarvestProvenance): string {
  const doc: Record<string, unknown> = {
    course: o.course,
    year: o.year,
    term: o.term,
    instructors: o.instructors,
    frameworks: o.frameworks ?? [],
  };
  if (o.schedule) doc.schedule = o.schedule;
  if (o.assignments) doc.assignments = o.assignments;
  if (o.project) doc.project = o.project;
  doc.sources = o.sources;
  if (o.notes) doc.notes = o.notes;
  doc.harvest = harvest;

  // defaultStringType QUOTE_DOUBLE on date-like values is unnecessary: the `yaml`
  // package (YAML 1.2 core) serializes/parses 'YYYY-MM-DD' as a plain string, and
  // `npm run check` parses offerings with this same library. The round-trip test guards this.
  return stringify(doc, { lineWidth: 0 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harvester/to-yaml.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add harvester/lib/to-yaml.ts tests/harvester/to-yaml.test.ts
git commit -m "feat(harvester): add offering YAML serializer with provenance

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SybcRFrunZrh1A4EgsSX1K"
```

---

### Task 8: Verification schema + adjudication

**Files:**
- Create: `harvester/verify/verify-offering.ts`
- Test: `tests/harvester/verify-offering.test.ts`

**Interfaces:**
- Consumes: `z` from `astro/zod`.
- Produces:
  - `VERIFIABLE_FIELDS` — the field names the verifier judges.
  - `verificationSchema` (Zod): `{ verdicts: { field: string; verdict: 'grounded'|'unsupported'|'uncertain'; evidence?: string }[]; confidence: number (0..1) }`.
  - `type Verification = z.infer<typeof verificationSchema>`.
  - `function parseVerification(raw: unknown): Verification` — validates/throws (used by the skill on the verifier subagent's JSON).
  - `interface Adjudication { decision: 'pass'|'retry'; fieldsToRetry: string[]; fieldsToFlag: string[]; confidence: number }`.
  - `function adjudicate(v: Verification): Adjudication` — `unsupported` ⇒ retry list + `decision: 'retry'`; `uncertain` ⇒ flag list + 0.1 confidence penalty each (clamped to [0,1]); all grounded ⇒ `decision: 'pass'`.

- [ ] **Step 1: Write the failing test**

Create `tests/harvester/verify-offering.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseVerification, adjudicate, verificationSchema } from '../../harvester/verify/verify-offering';

describe('verificationSchema', () => {
  it('rejects a confidence above 1', () => {
    expect(verificationSchema.safeParse({ verdicts: [{ field: 'year', verdict: 'grounded' }], confidence: 1.5 }).success).toBe(false);
  });
});

describe('parseVerification', () => {
  it('parses a valid verifier payload', () => {
    const v = parseVerification({ verdicts: [{ field: 'year', verdict: 'grounded', evidence: 'Winter 2024' }], confidence: 0.9 });
    expect(v.verdicts[0].field).toBe('year');
  });
});

describe('adjudicate', () => {
  it('passes when every field is grounded', () => {
    const a = adjudicate({ verdicts: [
      { field: 'year', verdict: 'grounded' },
      { field: 'instructors', verdict: 'grounded' },
    ], confidence: 0.95 });
    expect(a.decision).toBe('pass');
    expect(a.fieldsToRetry).toEqual([]);
    expect(a.confidence).toBe(0.95);
  });

  it('requests retry and lists unsupported fields', () => {
    const a = adjudicate({ verdicts: [
      { field: 'year', verdict: 'grounded' },
      { field: 'project', verdict: 'unsupported' },
    ], confidence: 0.8 });
    expect(a.decision).toBe('retry');
    expect(a.fieldsToRetry).toEqual(['project']);
  });

  it('keeps uncertain fields but penalizes confidence', () => {
    const a = adjudicate({ verdicts: [
      { field: 'year', verdict: 'grounded' },
      { field: 'schedule', verdict: 'uncertain' },
      { field: 'frameworks', verdict: 'uncertain' },
    ], confidence: 0.9 });
    expect(a.decision).toBe('pass');
    expect(a.fieldsToFlag).toEqual(['schedule', 'frameworks']);
    expect(a.confidence).toBeCloseTo(0.7, 5);
  });

  it('clamps confidence to zero', () => {
    const a = adjudicate({ verdicts: [
      { field: 'a', verdict: 'uncertain' }, { field: 'b', verdict: 'uncertain' },
      { field: 'c', verdict: 'uncertain' }, { field: 'd', verdict: 'uncertain' },
    ], confidence: 0.1 });
    expect(a.confidence).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harvester/verify-offering.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `harvester/verify/verify-offering.ts`:

```typescript
import { z } from 'astro/zod';

export const VERIFIABLE_FIELDS = [
  'year', 'term', 'instructors', 'frameworks', 'schedule', 'assignments', 'project', 'sources',
] as const;

export const verificationSchema = z.object({
  verdicts: z.array(z.object({
    field: z.string(),
    verdict: z.enum(['grounded', 'unsupported', 'uncertain']),
    evidence: z.string().optional(),
  })).min(1),
  confidence: z.number().min(0).max(1),
});

export type Verification = z.infer<typeof verificationSchema>;

export function parseVerification(raw: unknown): Verification {
  return verificationSchema.parse(raw);
}

export interface Adjudication {
  decision: 'pass' | 'retry';
  fieldsToRetry: string[];
  fieldsToFlag: string[];
  confidence: number;
}

export function adjudicate(v: Verification): Adjudication {
  const fieldsToRetry = v.verdicts.filter(d => d.verdict === 'unsupported').map(d => d.field);
  const fieldsToFlag = v.verdicts.filter(d => d.verdict === 'uncertain').map(d => d.field);
  const confidence = Math.max(0, Math.min(1, v.confidence - 0.1 * fieldsToFlag.length));
  return {
    decision: fieldsToRetry.length > 0 ? 'retry' : 'pass',
    fieldsToRetry,
    fieldsToFlag,
    confidence,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harvester/verify-offering.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add harvester/verify/verify-offering.ts tests/harvester/verify-offering.test.ts
git commit -m "feat(harvester): add verification schema + adjudication

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SybcRFrunZrh1A4EgsSX1K"
```

---

### Task 9: PR branch name + body builder

**Files:**
- Create: `harvester/lib/open-pr.ts`
- Test: `tests/harvester/open-pr.test.ts`

**Interfaces:**
- Consumes: `execFileSync` from `node:child_process`.
- Produces:
  - `function branchName(courseSlug: string): string` ⇒ `harvest/<courseSlug>`.
  - `interface PrOffering { year: number; term: string; confidence: number; flaggedFields: string[]; droppedFields: string[]; source: 'official'|'wayback'; sourceUrl: string }`.
  - `interface PrBodyInput { courseSlug: string; offerings: PrOffering[]; tags: string[] }`.
  - `function buildPrBody(input: PrBodyInput): string` ⇒ a Markdown review surface (tags line + per-offering table of confidence/source/flagged/dropped).
  - `function openPr(opts: { branch: string; title: string; body: string; files: string[]; baseBranch?: string }): void` — thin `git`/`gh` exec wrapper (NOT unit-tested).

- [ ] **Step 1: Write the failing test**

Create `tests/harvester/open-pr.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { branchName, buildPrBody } from '../../harvester/lib/open-pr';

describe('branchName', () => {
  it('namespaces under harvest/', () => {
    expect(branchName('stanford-cs224n')).toBe('harvest/stanford-cs224n');
  });
});

describe('buildPrBody', () => {
  const body = buildPrBody({
    courseSlug: 'stanford-cs224n',
    tags: ['nlp', 'transformers'],
    offerings: [
      { year: 2024, term: 'Winter', confidence: 0.95, flaggedFields: [], droppedFields: [], source: 'official', sourceUrl: 'https://web.stanford.edu/class/cs224n/' },
      { year: 2021, term: 'Winter', confidence: 0.7, flaggedFields: ['schedule'], droppedFields: ['project'], source: 'wayback', sourceUrl: 'https://web.archive.org/x' },
    ],
  });

  it('lists the chosen tags', () => {
    expect(body).toContain('nlp, transformers');
  });

  it('includes a row per offering with confidence and source', () => {
    expect(body).toContain('2024 Winter');
    expect(body).toContain('0.95');
    expect(body).toContain('official');
    expect(body).toContain('wayback');
  });

  it('surfaces flagged and dropped fields for review', () => {
    expect(body).toContain('schedule');
    expect(body).toContain('project');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harvester/open-pr.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `harvester/lib/open-pr.ts`:

```typescript
import { execFileSync } from 'node:child_process';

export function branchName(courseSlug: string): string {
  return `harvest/${courseSlug}`;
}

export interface PrOffering {
  year: number;
  term: string;
  confidence: number;
  flaggedFields: string[];
  droppedFields: string[];
  source: 'official' | 'wayback';
  sourceUrl: string;
}

export interface PrBodyInput {
  courseSlug: string;
  offerings: PrOffering[];
  tags: string[];
}

export function buildPrBody(input: PrBodyInput): string {
  const lines: string[] = [];
  lines.push(`## Harvested: ${input.courseSlug}`, '');
  lines.push(`**Tags:** ${input.tags.join(', ') || '_none_'}`, '');
  lines.push('| Offering | Confidence | Source | Flagged | Dropped |');
  lines.push('|---|---|---|---|---|');
  for (const o of input.offerings) {
    lines.push(
      `| ${o.year} ${o.term} | ${o.confidence.toFixed(2)} | [${o.source}](${o.sourceUrl}) | ` +
      `${o.flaggedFields.join(', ') || '—'} | ${o.droppedFields.join(', ') || '—'} |`,
    );
  }
  lines.push('', '_Generated by the onboard-course harvester. Review flagged/dropped fields against the source links above._');
  return lines.join('\n');
}

// Thin exec wrapper — not unit-tested (shells out to git/gh).
export function openPr(opts: { branch: string; title: string; body: string; files: string[]; baseBranch?: string }): void {
  execFileSync('git', ['checkout', '-b', opts.branch]);
  execFileSync('git', ['add', ...opts.files]);
  execFileSync('git', ['commit', '-m', opts.title]);
  execFileSync('git', ['push', '-u', 'origin', opts.branch]);
  const baseArgs = opts.baseBranch ? ['--base', opts.baseBranch] : [];
  execFileSync('gh', ['pr', 'create', '--title', opts.title, '--body', opts.body, ...baseArgs]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harvester/open-pr.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and the integrity check**

Run: `npm test && npm run check`
Expected: all tests pass; integrity check passes.

- [ ] **Step 6: Commit**

```bash
git add harvester/lib/open-pr.ts tests/harvester/open-pr.test.ts
git commit -m "feat(harvester): add PR branch-name + body builder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SybcRFrunZrh1A4EgsSX1K"
```

---

### Task 10: The `onboard-course` skill playbook

**Files:**
- Create: `.claude/skills/onboard-course/SKILL.md`

**Interfaces:**
- Consumes: every primitive from Tasks 2–9.
- Produces: a markdown playbook (no runtime exports). This is prose, not TDD; verification is a self-consistency read against the spec flow (§4) plus the end-to-end run in Task 11.

- [ ] **Step 1: Write the skill file**

Create `.claude/skills/onboard-course/SKILL.md`:

````markdown
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
````

- [ ] **Step 2: Self-review the playbook against the spec**

Read `docs/superpowers/specs/2026-06-24-course-atlas-harvester-design.md` §4–§7 and confirm each
flow step in the skill maps to a spec step and names a real primitive from Tasks 2–9. Fix any drift.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/onboard-course/SKILL.md
git commit -m "feat(harvester): add onboard-course skill playbook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SybcRFrunZrh1A4EgsSX1K"
```

---

### Task 11: End-to-end onboarding validation

**Files:**
- Create (via the skill run): `harvester/extractors/<slug>.ts`, `tests/harvester/extractors/<slug>.test.ts`, `tests/harvester/fixtures/<slug>-*.html`, `src/content/offerings/<slug>-*.yaml`, and/or `src/content/courses/<slug>.yaml`.

**Interfaces:**
- Consumes: the `onboard-course` skill (Task 10) and all primitives.
- Produces: one real onboarded course as a PR — the proof the pipeline works end-to-end.

- [ ] **Step 1: Pick a target course**

Choose a course NOT already seeded (e.g. `berkeley-cs182` or `stanford-cs231n`) so the run exercises
course-file creation too. Confirm `src/content/courses/<slug>.yaml` does not yet exist.

- [ ] **Step 2: Run the skill**

Invoke the `onboard-course` skill with the chosen homepage URL and slug. Follow its flow end to end
(discover → fetch → extractor + test → validate → adversarial verify → tags → stamp → check/build).

- [ ] **Step 3: Verify the full suite, integrity, and build**

Run: `npm test && npm run check && npm run build`
Expected: all green. The new extractor test passes; harvested offerings pass schema + integrity; the
site builds with the new course.

- [ ] **Step 4: Confirm the PR surface**

Verify the opened PR's body (from `buildPrBody`) lists every offering with a confidence score, source
(official/wayback), and any flagged/dropped fields. Spot-check one offering's YAML against its source
page to confirm the adversarial gate did its job.

- [ ] **Step 5: Record the outcome**

This task has no separate commit — its deliverable is the PR produced by the skill run. Note the PR URL
and any fields the gate flagged/dropped in the final report.

---

## Self-Review

**1. Spec coverage** (against `2026-06-24-course-atlas-harvester-design.md`):
- §3 component layout (lib primitives, extractors, verify, skill) → Tasks 2–10. ✓
- §4 flow steps 1–9 → encoded in the Task 10 skill, backed by primitives in Tasks 2–9. ✓
- §5 adversarial gate (independent verifier, per-field grounding, route-back, drop-and-flag, confidence) → Task 8 (`verificationSchema` + `adjudicate`) + Task 10 step 6. ✓
- §6 topic-normalization dropped, coarse course tags added → Task 1 (`course.tags`), `ExtractedOffering` omits `topics` (Task 2), tags assigned in Task 10 step 7. Catalog UI swap explicitly deferred (stated in File Structure). ✓
- §7 PR output / testing / cost → Task 9 (`buildPrBody`), Task 11 (end-to-end), per-extractor tests (Task 10 step 4). ✓

**2. Placeholder scan:** every code step contains complete, runnable code; no TBD/TODO. The only intentionally un-pre-written code is the per-course extractor (Task 10/11), which is course-specific by design and ships with its own test. ✓

**3. Type consistency:** `FetchedPage`/`ExtractedOffering` (Task 2) are consumed unchanged by `fetchPage` (Task 4), `validateOffering` (Task 6), `offeringToYaml` (Task 7), and the extractor contract. `Verification`/`Adjudication` (Task 8) names match between definition and the skill's usage. `branchName`/`buildPrBody` (Task 9) signatures match their tests. `HarvestProvenance` (Task 7) fields (`lastVerified`, `extractor`, `confidence`) match the reserved `harvest` block in `offeringSchema`. ✓
