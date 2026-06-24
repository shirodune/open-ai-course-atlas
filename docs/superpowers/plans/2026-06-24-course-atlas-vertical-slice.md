# Course Atlas Vertical Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static website that browses a catalog of CS courses and lets users view each course as versioned documentation (one semester at a time) with LLM-authored evolution/comparison narratives, backed by a typed, validated data schema.

**Architecture:** Astro static site. Course data lives in YAML/Markdown content collections validated by shared Zod schemas (the schema doubles as the future harvester's contract). Pure helper modules handle version sorting and referential-integrity checks and are unit-tested with Vitest. Pages are statically generated; the only client JavaScript is a catalog filter. Deployed to GitHub Pages via GitHub Actions.

**Tech Stack:** Astro 5, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), Zod (via `astro/zod`), Vitest, fast-glob + yaml + gray-matter (integrity script), GitHub Actions + GitHub Pages.

## Global Constraints

- **Node:** 20+ (CI uses Node 20).
- **Schemas are shared:** all Zod schemas live in `src/lib/schemas.ts` and import `z` from `astro/zod` (NOT a separately installed `zod`, NOT `astro:content`) so the same Zod instance is used by both `src/content.config.ts` and Vitest tests.
- **Collection entry ids come from filenames** (Astro `glob` loader default). Course slug = filename, e.g. `stanford-cs224n.yaml` → id `stanford-cs224n`. Do NOT duplicate an `id` field inside course YAML bodies.
- **One file per offering.** Offering filename = `${courseSlug}-${year}-${term}.yaml` lowercased, e.g. `stanford-cs224n-2026-winter.yaml`.
- **Every offering MUST have ≥1 `sources` entry.** Enforced in schema (`.min(1)`) and re-checked by integrity.
- **Term enum:** `Winter | Spring | Summer | Fall | Autumn`. `Autumn` and `Fall` are equivalent for ordering.
- **Topics are a controlled vocabulary.** Every `offerings.topics[]` value must be an `id` present in `src/content/topics/topics.yaml`.
- **Model id format:** canonical ids, e.g. `claude-opus-4-8`.
- **Commit after every task** (steps below show exact commands). Use clear conventional-commit messages.
- **TDD:** for every logic module, write the failing test first, watch it fail, then implement.

---

### Task 1: Project scaffold (Astro + TypeScript + Tailwind + Vitest)

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `src/styles/global.css`, `src/layouts/Base.astro`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: a working `npm test` (Vitest) and `npm run build` (Astro). `Base.astro` exports a layout taking a `title` prop and a default `<slot />`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "open-ai-course-atlas",
  "type": "module",
  "version": "0.1.0",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run",
    "check": "tsx scripts/check-integrity.ts"
  },
  "dependencies": {
    "astro": "^5.2.0",
    "@tailwindcss/vite": "^4.0.0",
    "tailwindcss": "^4.0.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "fast-glob": "^3.3.0",
    "yaml": "^2.7.0",
    "gray-matter": "^4.0.3",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"],
  "compilerOptions": {
    "types": ["node"]
  }
}
```

- [ ] **Step 4: Create `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// NOTE: For a GitHub *project* page the site is served under /open-ai-course-atlas/.
// If deploying to a user/org page or a custom domain, set base: '/' and update site.
export default defineConfig({
  site: 'https://example.github.io',
  base: '/open-ai-course-atlas',
  vite: { plugins: [tailwindcss()] },
});
```

- [ ] **Step 5: Create `src/styles/global.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 6: Create `src/layouts/Base.astro`**

```astro
---
import '../styles/global.css';
interface Props { title: string }
const { title } = Astro.props;
const base = import.meta.env.BASE_URL;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
  </head>
  <body class="min-h-screen bg-white text-gray-900">
    <header class="border-b border-gray-200 px-6 py-3 flex gap-4 text-sm">
      <a href={base} class="font-semibold">📚 Course Atlas</a>
      <a href={base} class="text-gray-600 hover:text-black">Catalog</a>
      <a href={`${base}/about`} class="text-gray-600 hover:text-black">About</a>
    </header>
    <main class="px-6 py-6 max-w-6xl mx-auto">
      <slot />
    </main>
  </body>
</html>
```

- [ ] **Step 7: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 8: Write the smoke test `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 9: Run tests and build to verify the toolchain**

Run: `npm test`
Expected: 1 passing test.

Run: `npm run build`
Expected: build succeeds (it will warn "no pages" — acceptable at this stage; if it errors on zero pages, that resolves in Task 7 when `index.astro` exists).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json astro.config.mjs vitest.config.ts src/ tests/
git commit -m "chore: scaffold Astro + Tailwind + Vitest project"
```

---

### Task 2: Content schemas (Zod) + collection config

**Files:**
- Create: `src/lib/schemas.ts`, `src/content.config.ts`, `tests/schemas.test.ts`

**Interfaces:**
- Produces:
  - `courseSchema`, `offeringSchema`, `comparisonSchema`, `topicSchema` (Zod object schemas).
  - TypeScript types `Course`, `Offering`, `Comparison`, `Topic` inferred from those schemas.
  - `src/content.config.ts` exporting `collections` with keys `courses`, `offerings`, `comparisons`, `topics`.

- [ ] **Step 1: Write the failing test `tests/schemas.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { courseSchema, offeringSchema, comparisonSchema, topicSchema } from '../src/lib/schemas';

describe('offeringSchema', () => {
  const valid = {
    course: 'stanford-cs224n',
    year: 2026,
    term: 'Winter',
    instructors: [{ name: 'Diyi Yang' }],
    frameworks: ['pytorch'],
    topics: ['transformers'],
    sources: [{ url: 'https://web.stanford.edu/class/cs224n/', type: 'official' }],
  };

  it('accepts a valid offering', () => {
    expect(offeringSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an offering with no sources', () => {
    expect(offeringSchema.safeParse({ ...valid, sources: [] }).success).toBe(false);
  });

  it('rejects an invalid term', () => {
    expect(offeringSchema.safeParse({ ...valid, term: 'Monsoon' }).success).toBe(false);
  });
});

describe('courseSchema', () => {
  it('accepts a minimal course', () => {
    const r = courseSchema.safeParse({
      title: 'NLP with Deep Learning', number: 'CS 224N',
      institution: 'Stanford', fields: ['nlp'],
      homepage: 'https://web.stanford.edu/class/cs224n/', summary: 'x',
    });
    expect(r.success).toBe(true);
  });
});

describe('comparisonSchema', () => {
  it('accepts a valid comparison', () => {
    const r = comparisonSchema.safeParse({
      type: 'evolution', subjects: ['stanford-cs224n'],
      generatedBy: { model: 'claude-opus-4-8', generatedAt: '2026-06-24' },
    });
    expect(r.success).toBe(true);
  });
});

describe('topicSchema', () => {
  it('accepts a valid topic', () => {
    expect(topicSchema.safeParse({ id: 'rlhf', label: 'RLHF', category: 'post-training' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/schemas.test.ts`
Expected: FAIL — cannot resolve `../src/lib/schemas`.

- [ ] **Step 3: Implement `src/lib/schemas.ts`**

```ts
import { z } from 'astro/zod';

export const TERMS = ['Winter', 'Spring', 'Summer', 'Fall', 'Autumn'] as const;

export const courseSchema = z.object({
  title: z.string(),
  number: z.string(),
  institution: z.string(),
  fields: z.array(z.string()).min(1),
  homepage: z.string().url(),
  summary: z.string(),
  crossListed: z.array(z.string()).optional(),
  lineage: z.object({
    predecessors: z.array(z.string()).optional(),
    note: z.string().optional(),
  }).optional(),
});

const sourceSchema = z.object({
  url: z.string().url(),
  type: z.enum(['official', 'wayback', 'youtube', 'other']),
});

export const offeringSchema = z.object({
  course: z.string(),
  year: z.number().int(),
  term: z.enum(TERMS),
  instructors: z.array(z.object({ name: z.string(), role: z.string().optional() })).min(1),
  frameworks: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  schedule: z.array(z.object({
    week: z.number().optional(),
    date: z.string().optional(),
    title: z.string(),
  })).optional(),
  assignments: z.array(z.object({
    name: z.string(),
    title: z.string(),
    framework: z.string().optional(),
    weight: z.number().optional(),
  })).optional(),
  project: z.object({ type: z.string(), title: z.string() }).optional(),
  sources: z.array(sourceSchema).min(1),
  notes: z.string().optional(),
  // Reserved for Subsystem B; not populated in the slice.
  harvest: z.object({
    lastVerified: z.string().optional(),
    extractor: z.string().optional(),
    confidence: z.number().optional(),
  }).optional(),
});

export const comparisonSchema = z.object({
  type: z.enum(['evolution', 'similar-courses']),
  subjects: z.array(z.string()).min(1),
  generatedBy: z.object({ model: z.string(), generatedAt: z.string() }),
});

export const topicSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.string(),
});

export type Course = z.infer<typeof courseSchema>;
export type Offering = z.infer<typeof offeringSchema>;
export type Comparison = z.infer<typeof comparisonSchema>;
export type Topic = z.infer<typeof topicSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/schemas.test.ts`
Expected: PASS (all schema tests).

- [ ] **Step 5: Implement `src/content.config.ts`**

```ts
import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { courseSchema, offeringSchema, comparisonSchema, topicSchema } from './lib/schemas';

const courses = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/courses' }),
  schema: courseSchema,
});
const offerings = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/offerings' }),
  schema: offeringSchema,
});
const comparisons = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/comparisons' }),
  schema: comparisonSchema,
});
const topics = defineCollection({
  loader: file('./src/content/topics/topics.yaml'),
  schema: topicSchema,
});

export const collections = { courses, offerings, comparisons, topics };
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas.ts src/content.config.ts tests/schemas.test.ts
git commit -m "feat: add content collection schemas and config"
```

---

### Task 3: Offering version helpers

**Files:**
- Create: `src/lib/offerings.ts`, `tests/offerings.test.ts`

**Interfaces:**
- Consumes: `Offering` type from `src/lib/schemas.ts`. Tests use plain objects shaped like offerings plus an `id` string (the collection entry id).
- Produces (operate on `{ id: string; data: Offering }` entries):
  - `offeringSlug(data: Offering): string` → `"2026-winter"`.
  - `expectedOfferingId(courseSlug, data): string` → `"stanford-cs224n-2026-winter"`.
  - `versionLabel(data: Offering): string` → `"Winter 2026"`.
  - `sortOfferings(entries): typeof entries` → newest first (year desc, then term desc by `Winter<Spring<Summer<Fall=Autumn`).
  - `latestOffering(entries): entry | undefined` → first of `sortOfferings`.

- [ ] **Step 1: Write the failing test `tests/offerings.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { offeringSlug, expectedOfferingId, versionLabel, sortOfferings, latestOffering } from '../src/lib/offerings';

const mk = (year: number, term: string) => ({
  id: `c-${year}-${term.toLowerCase()}`,
  data: { course: 'c', year, term, instructors: [{ name: 'x' }], frameworks: [], topics: [], sources: [{ url: 'https://a.b', type: 'official' }] } as any,
});

describe('offering helpers', () => {
  it('builds a version slug', () => {
    expect(offeringSlug(mk(2026, 'Winter').data)).toBe('2026-winter');
  });

  it('builds the expected offering id', () => {
    expect(expectedOfferingId('stanford-cs224n', mk(2026, 'Winter').data)).toBe('stanford-cs224n-2026-winter');
  });

  it('builds a human label', () => {
    expect(versionLabel(mk(2026, 'Winter').data)).toBe('Winter 2026');
  });

  it('sorts newest first across years and terms', () => {
    const sorted = sortOfferings([mk(2024, 'Winter'), mk(2026, 'Winter'), mk(2025, 'Fall'), mk(2025, 'Winter')]);
    expect(sorted.map(o => o.data.year + '-' + o.data.term)).toEqual([
      '2026-Winter', '2025-Fall', '2025-Winter', '2024-Winter',
    ]);
  });

  it('treats Autumn and Fall equivalently in ordering', () => {
    const sorted = sortOfferings([mk(2025, 'Winter'), mk(2025, 'Autumn')]);
    expect(sorted[0].data.term).toBe('Autumn');
  });

  it('picks the latest offering', () => {
    expect(latestOffering([mk(2024, 'Winter'), mk(2026, 'Winter')])?.data.year).toBe(2026);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/offerings.test.ts`
Expected: FAIL — cannot resolve `../src/lib/offerings`.

- [ ] **Step 3: Implement `src/lib/offerings.ts`**

```ts
import type { Offering } from './schemas';

const TERM_ORDER: Record<string, number> = {
  Winter: 1, Spring: 2, Summer: 3, Fall: 4, Autumn: 4,
};

export function offeringSlug(data: Offering): string {
  return `${data.year}-${data.term.toLowerCase()}`;
}

export function expectedOfferingId(courseSlug: string, data: Offering): string {
  return `${courseSlug}-${offeringSlug(data)}`;
}

export function versionLabel(data: Offering): string {
  return `${data.term} ${data.year}`;
}

export function sortOfferings<T extends { data: Offering }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (b.data.year !== a.data.year) return b.data.year - a.data.year;
    return (TERM_ORDER[b.data.term] ?? 0) - (TERM_ORDER[a.data.term] ?? 0);
  });
}

export function latestOffering<T extends { data: Offering }>(entries: T[]): T | undefined {
  return sortOfferings(entries)[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/offerings.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/offerings.ts tests/offerings.test.ts
git commit -m "feat: add offering version helpers"
```

---

### Task 4: Referential integrity checker

**Files:**
- Create: `src/lib/integrity.ts`, `scripts/check-integrity.ts`, `tests/integrity.test.ts`

**Interfaces:**
- Produces:
  - `checkIntegrity(input): string[]` — pure function returning a list of human-readable error messages (empty = OK). `input` shape:
    ```ts
    {
      courses: { id: string }[];
      offerings: { id: string; data: { course: string; year: number; term: string; topics: string[]; sources: unknown[] } }[];
      comparisons: { id: string; data: { subjects: string[] } }[];
      topics: { id: string }[];
    }
    ```
  - `scripts/check-integrity.ts` — reads the real content files and runs `checkIntegrity`, exiting non-zero on any error.

- [ ] **Step 1: Write the failing test `tests/integrity.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { checkIntegrity } from '../src/lib/integrity';

const base = () => ({
  courses: [{ id: 'stanford-cs224n' }],
  topics: [{ id: 'transformers' }, { id: 'rlhf' }],
  offerings: [{
    id: 'stanford-cs224n-2026-winter',
    data: { course: 'stanford-cs224n', year: 2026, term: 'Winter', topics: ['transformers'], sources: [{ url: 'https://a.b', type: 'official' }] },
  }],
  comparisons: [{ id: 'cs224n-evolution', data: { subjects: ['stanford-cs224n'] } }],
});

describe('checkIntegrity', () => {
  it('passes on a consistent dataset', () => {
    expect(checkIntegrity(base())).toEqual([]);
  });

  it('flags an offering referencing an unknown course', () => {
    const d = base(); d.offerings[0].data.course = 'ghost';
    expect(checkIntegrity(d).some(e => e.includes('unknown course'))).toBe(true);
  });

  it('flags a topic not in the taxonomy', () => {
    const d = base(); d.offerings[0].data.topics = ['not-a-topic'];
    expect(checkIntegrity(d).some(e => e.includes('unknown topic'))).toBe(true);
  });

  it('flags an offering with no sources', () => {
    const d = base(); d.offerings[0].data.sources = [];
    expect(checkIntegrity(d).some(e => e.includes('no sources'))).toBe(true);
  });

  it('flags a comparison referencing an unknown subject', () => {
    const d = base(); d.comparisons[0].data.subjects = ['ghost'];
    expect(checkIntegrity(d).some(e => e.includes('unknown subject'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integrity.test.ts`
Expected: FAIL — cannot resolve `../src/lib/integrity`.

- [ ] **Step 3: Implement `src/lib/integrity.ts`**

```ts
interface IntegrityInput {
  courses: { id: string }[];
  topics: { id: string }[];
  offerings: { id: string; data: { course: string; topics: string[]; sources: unknown[] } }[];
  comparisons: { id: string; data: { subjects: string[] } }[];
}

export function checkIntegrity(input: IntegrityInput): string[] {
  const errors: string[] = [];
  const courseIds = new Set(input.courses.map(c => c.id));
  const topicIds = new Set(input.topics.map(t => t.id));

  for (const o of input.offerings) {
    if (!courseIds.has(o.data.course)) {
      errors.push(`offering "${o.id}" references unknown course "${o.data.course}"`);
    }
    for (const t of o.data.topics) {
      if (!topicIds.has(t)) errors.push(`offering "${o.id}" references unknown topic "${t}"`);
    }
    if (!o.data.sources || o.data.sources.length === 0) {
      errors.push(`offering "${o.id}" has no sources`);
    }
  }

  for (const c of input.comparisons) {
    for (const s of c.data.subjects) {
      if (!courseIds.has(s)) errors.push(`comparison "${c.id}" references unknown subject "${s}"`);
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integrity.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement the IO wrapper `scripts/check-integrity.ts`**

```ts
import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parse } from 'yaml';
import matter from 'gray-matter';
import { checkIntegrity } from '../src/lib/integrity';

const idOf = (p: string) => basename(p).replace(/\.(yaml|md)$/, '');

function loadYaml(dir: string) {
  return fg.sync(`${dir}/**/*.yaml`).map(p => ({ id: idOf(p), data: parse(readFileSync(p, 'utf8')) }));
}

const courses = loadYaml('src/content/courses');
const offerings = loadYaml('src/content/offerings');
const comparisons = fg.sync('src/content/comparisons/**/*.md').map(p => ({
  id: idOf(p), data: matter(readFileSync(p, 'utf8')).data as { subjects: string[] },
}));
const topicsFile = fg.sync('src/content/topics/topics.yaml')[0];
const topics = topicsFile ? (parse(readFileSync(topicsFile, 'utf8')) as { id: string }[]) : [];

const errors = checkIntegrity({ courses, offerings, comparisons, topics } as any);
if (errors.length) {
  console.error(`Integrity check failed (${errors.length}):`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Integrity check passed.');
```

- [ ] **Step 6: Run the script (expect "no content yet" to pass cleanly)**

Run: `npm run check`
Expected: `Integrity check passed.` (no content files yet → empty sets → no errors).

- [ ] **Step 7: Commit**

```bash
git add src/lib/integrity.ts scripts/check-integrity.ts tests/integrity.test.ts
git commit -m "feat: add referential integrity checker"
```

---

### Task 5: Seed data (topics, courses, offerings, comparisons)

**Files:**
- Create: `src/content/topics/topics.yaml`
- Create: `src/content/courses/*.yaml` (4 courses)
- Create: `src/content/offerings/*.yaml` (offerings listed below)
- Create: `src/content/comparisons/*.md` (2 narratives)

**Interfaces:**
- Consumes: schemas (Task 2). Produces: a dataset that passes `npm run check` and `npm run build`.

Required fields per offering are fully specified below. `schedule`, `assignments`, and `notes` are OPTIONAL — populate them from the cited source URL when convenient, but the task is complete with the required fields present and integrity passing.

- [ ] **Step 1: Create `src/content/topics/topics.yaml`** (controlled vocabulary — every topic used below must appear here)

```yaml
- { id: word-vectors, label: Word Vectors, category: representation }
- { id: rnn, label: RNNs / LSTMs, category: architecture }
- { id: attention, label: Attention, category: architecture }
- { id: transformers, label: Transformers, category: architecture }
- { id: pretraining, label: Pretraining, category: training }
- { id: bert, label: BERT / Encoders, category: training }
- { id: prompting, label: Prompting / In-Context Learning, category: usage }
- { id: instruction-tuning, label: Instruction Tuning, category: post-training }
- { id: rlhf, label: RLHF, category: post-training }
- { id: dpo, label: DPO / SFT, category: post-training }
- { id: peft, label: PEFT / LoRA, category: efficiency }
- { id: distillation, label: Distillation / Quantization, category: efficiency }
- { id: rag, label: Retrieval-Augmented Generation, category: systems }
- { id: agents, label: Agents / Tool Use, category: systems }
- { id: reasoning, label: Reasoning, category: capabilities }
- { id: evaluation, label: Benchmarking & Evaluation, category: methodology }
- { id: multimodal, label: Multimodality, category: capabilities }
- { id: interpretability, label: Interpretability, category: analysis }
- { id: nmt, label: Machine Translation / Seq2Seq, category: application }
- { id: os-kernel, label: OS Kernels, category: systems }
- { id: concurrency, label: Concurrency, category: systems }
- { id: virtual-memory, label: Virtual Memory, category: systems }
```

- [ ] **Step 2: Create the 4 course files**

`src/content/courses/stanford-cs224n.yaml`:
```yaml
title: Natural Language Processing with Deep Learning
number: CS 224N
institution: Stanford
fields: [nlp, deep-learning]
homepage: https://web.stanford.edu/class/cs224n/
crossListed: [Ling 284]
summary: >-
  Stanford's flagship NLP course. Evolved from statistical NLP (pre-2017) through
  RNN-based deep learning into a Transformer/LLM-centric curriculum.
lineage:
  predecessors: [stanford-cs224d]
  note: 2017 merger of CS 224N (statistical NLP) and CS 224d (deep learning for NLP)
```

`src/content/courses/cmu-11711.yaml`:
```yaml
title: Advanced NLP
number: 11-711
institution: CMU
fields: [nlp, deep-learning]
homepage: https://phontron.com/class/anlp2024/
summary: >-
  CMU's graduate Advanced NLP. Born neural (from 11-747 "Neural Networks for NLP");
  research/build-oriented, with a signature build-it-from-scratch assignment each year.
lineage:
  note: Grew out of 11-747 "Neural Networks for NLP" (became 11-711 in Fall 2021)
```

`src/content/courses/stanford-cs336.yaml`:
```yaml
title: Language Modeling from Scratch
number: CS 336
institution: Stanford
fields: [nlp, deep-learning, llm]
homepage: https://cs336.stanford.edu/
summary: >-
  Build a language model end-to-end: tokenization, architecture, training,
  systems, and evaluation. Depth-first counterpart to the breadth of CS 224N.
```

`src/content/courses/mit-6s081.yaml`:
```yaml
title: Operating System Engineering
number: 6.S081
institution: MIT
fields: [systems, operating-systems]
homepage: https://pdos.csail.mit.edu/6.S081/
summary: >-
  Hands-on OS course built around the xv6 teaching kernel. Included as a
  non-AI course to prove the schema generalizes beyond NLP.
```

- [ ] **Step 3: Create the CS 224N offerings**

Create one file per row. Full example for the latest, then the remaining rows give every required field value.

`src/content/offerings/stanford-cs224n-2026-winter.yaml` (complete example):
```yaml
course: stanford-cs224n
year: 2026
term: Winter
instructors:
  - { name: Diyi Yang }
  - { name: Yejin Choi }
frameworks: [pytorch]
topics: [word-vectors, transformers, pretraining, rlhf, peft, agents, rag, reasoning, evaluation]
project: { type: default, title: GPT-2 }
sources:
  - { url: "https://web.stanford.edu/class/cs224n/", type: official }
notes: >-
  First Yang+Choi offering. Dedicated lectures on agents/tool use and reasoning;
  A4 is LLM benchmarking & evaluation.
```

Remaining CS 224N offerings (file `stanford-cs224n-<year>-<term>.yaml`, `course: stanford-cs224n`, `frameworks` as noted, `sources[0].type: official`):

| year | term | instructors | frameworks | topics | project.title | source url |
|---|---|---|---|---|---|---|
| 2025 | Winter | Diyi Yang; Tatsunori Hashimoto | pytorch | word-vectors, transformers, pretraining, rlhf, dpo, peft, rag, evaluation | GPT-2 | https://web.stanford.edu/class/archive/cs/cs224n/cs224n.1254/ |
| 2023 | Winter | Christopher Manning | pytorch | word-vectors, rnn, transformers, pretraining, bert, prompting, rlhf, nmt | minBERT | https://web.stanford.edu/class/archive/cs/cs224n/cs224n.1234/ |
| 2021 | Winter | Christopher Manning | pytorch | word-vectors, rnn, attention, transformers, pretraining, bert, nmt | SQuAD QA | https://web.stanford.edu/class/archive/cs/cs224n/cs224n.1214/ |
| 2019 | Winter | Christopher Manning | pytorch | word-vectors, rnn, attention, transformers, bert, nmt | SQuAD QA | https://web.stanford.edu/class/archive/cs/cs224n/cs224n.1194/ |
| 2017 | Winter | Christopher Manning; Richard Socher | tensorflow | word-vectors, rnn, attention, nmt | SQuAD QA | https://web.stanford.edu/class/archive/cs/cs224n/cs224n.1174/ |

For each: `instructors` is a list of `{ name: ... }`; split the `;`-separated names. Example for 2023:
```yaml
course: stanford-cs224n
year: 2023
term: Winter
instructors:
  - { name: Christopher Manning }
frameworks: [pytorch]
topics: [word-vectors, rnn, transformers, pretraining, bert, prompting, rlhf, nmt]
project: { type: default, title: minBERT }
sources:
  - { url: "https://web.stanford.edu/class/archive/cs/cs224n/cs224n.1234/", type: official }
```

- [ ] **Step 4: Create the CMU 11-711 offerings**

File `cmu-11711-<year>-<term>.yaml`, `course: cmu-11711`, `frameworks: [pytorch]`, `sources[0].type: official`:

| year | term | instructors | topics | project.title | source url |
|---|---|---|---|---|---|
| 2025 | Spring | Sean Welleck | transformers, pretraining, prompting, rlhf, dpo, rag, agents, reasoning, distillation, multimodal, evaluation | Build Your Own LLaMa | https://cmu-l3.github.io/anlp-spring2025/ |
| 2024 | Spring | Graham Neubig | transformers, pretraining, prompting, instruction-tuning, rlhf, rag, agents, distillation, reasoning | Build Your Own LLaMa | https://www.phontron.com/class/anlp2024/ |
| 2022 | Fall | Graham Neubig | word-vectors, rnn, attention, transformers, pretraining, bert, prompting, nmt | Build Your Own BERT | https://phontron.com/class/anlp2022/ |
| 2021 | Fall | Graham Neubig; Robert Frederking | word-vectors, rnn, attention, transformers, pretraining, bert, prompting, nmt | Reproduce + improve a paper | https://phontron.com/class/anlp2021/ |

Example `cmu-11711-2024-spring.yaml`:
```yaml
course: cmu-11711
year: 2024
term: Spring
instructors:
  - { name: Graham Neubig }
frameworks: [pytorch]
topics: [transformers, pretraining, prompting, instruction-tuning, rlhf, rag, agents, distillation, reasoning]
project: { type: default, title: Build Your Own LLaMa }
sources:
  - { url: "https://www.phontron.com/class/anlp2024/", type: official }
```

- [ ] **Step 5: Create the CS 336 and MIT 6.S081 offerings**

`src/content/offerings/stanford-cs336-2025-spring.yaml`:
```yaml
course: stanford-cs336
year: 2025
term: Spring
instructors:
  - { name: Percy Liang }
  - { name: Tatsunori Hashimoto }
frameworks: [pytorch]
topics: [transformers, pretraining, distillation, evaluation]
project: { type: default, title: Build a language model from scratch }
sources:
  - { url: "https://cs336.stanford.edu/", type: official }
```

`src/content/offerings/stanford-cs336-2024-spring.yaml`:
```yaml
course: stanford-cs336
year: 2024
term: Spring
instructors:
  - { name: Percy Liang }
  - { name: Tatsunori Hashimoto }
frameworks: [pytorch]
topics: [transformers, pretraining, evaluation]
project: { type: default, title: Build a language model from scratch }
sources:
  - { url: "https://cs336.stanford.edu/spring2024/", type: official }
```

`src/content/offerings/mit-6s081-2023-fall.yaml`:
```yaml
course: mit-6s081
year: 2023
term: Fall
instructors:
  - { name: Frans Kaashoek }
  - { name: Robert Morris }
frameworks: [c, risc-v]
topics: [os-kernel, concurrency, virtual-memory]
project: { type: default, title: xv6 labs }
sources:
  - { url: "https://pdos.csail.mit.edu/6.S081/2023/", type: official }
```

- [ ] **Step 6: Create the 2 comparison narratives**

`src/content/comparisons/cs224n-evolution.md`:
```markdown
---
type: evolution
subjects: [stanford-cs224n]
generatedBy:
  model: claude-opus-4-8
  generatedAt: 2026-06-24
---

CS 224N has lived through three eras: classic statistical NLP (Java, through 2016),
RNN-centric deep learning (2017–18, TensorFlow then PyTorch), and the Transformer/LLM
pivot (2021 onward). The default project tracks the field directly — SQuAD QA →
minBERT → GPT-2, an encoder-to-decoder shift mirroring industry. ChatGPT (late 2022)
triggered the jump where RLHF and prompting went from absent to dedicated lectures,
and the instructor lineage handed off from Manning to Yang + Hashimoto to Yang + Choi,
each new team pushing further into agents, RAG, reasoning, and evaluation.
```

`src/content/comparisons/cs224n-vs-cmu-anlp.md`:
```markdown
---
type: similar-courses
subjects: [stanford-cs224n, cmu-11711]
generatedBy:
  model: claude-opus-4-8
  generatedAt: 2026-06-24
---

Both CS 224N and CMU 11-711 pivoted to the LLM lifecycle and both swapped their
flagship project from a BERT build to a decoder-LLM build. But CS 224N carries two
decades of statistical-NLP DNA (it still opens with a History of NLP lecture and held
onto linguistics content longer), while CMU 11-711 was neural from birth — more
research/build-oriented, every year culminating in a reproduce-then-improve project,
and reaching the frontier (agents, RAG, reasoning) roughly a year ahead.
```

- [ ] **Step 7: Run integrity check and build against real data**

Run: `npm run check`
Expected: `Integrity check passed.`

Run: `npm run build`
Expected: build succeeds with no schema errors (pages come in later tasks; zero-page warning is fine). If a topic-not-found or course-not-found error appears, fix the offending YAML.

- [ ] **Step 8: Commit**

```bash
git add src/content/
git commit -m "feat: add seed dataset (4 courses, offerings, comparisons, topics)"
```

---

### Task 6: Shared UI components

**Files:**
- Create: `src/lib/topics.ts`, `src/components/ModelBadge.astro`, `src/components/TopicChips.astro`, `src/components/OfferingDetail.astro`, `src/components/VersionSwitcher.astro`, `tests/topics.test.ts`

**Interfaces:**
- Consumes: `versionLabel`, `offeringSlug` (Task 3); `Offering`, `Topic` types (Task 2).
- Produces:
  - `topicLabel(topics: Topic[], id: string): string` (falls back to the id if unknown).
  - `ModelBadge` props `{ model: string; generatedAt: string }`.
  - `TopicChips` props `{ topics: string[]; allTopics: Topic[] }`.
  - `OfferingDetail` props `{ data: Offering; allTopics: Topic[] }`.
  - `VersionSwitcher` props `{ courseId: string; entries: { id: string; data: Offering }[]; currentSlug: string }`.

- [ ] **Step 1: Write the failing test `tests/topics.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { topicLabel } from '../src/lib/topics';

const topics = [{ id: 'rlhf', label: 'RLHF', category: 'post-training' }];

describe('topicLabel', () => {
  it('returns the label for a known topic', () => {
    expect(topicLabel(topics, 'rlhf')).toBe('RLHF');
  });
  it('falls back to the id for an unknown topic', () => {
    expect(topicLabel(topics, 'mystery')).toBe('mystery');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/topics.test.ts`
Expected: FAIL — cannot resolve `../src/lib/topics`.

- [ ] **Step 3: Implement `src/lib/topics.ts`**

```ts
import type { Topic } from './schemas';

export function topicLabel(topics: Topic[], id: string): string {
  return topics.find(t => t.id === id)?.label ?? id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/topics.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `src/components/ModelBadge.astro`**

```astro
---
interface Props { model: string; generatedAt: string }
const { model, generatedAt } = Astro.props;
---
<span class="inline-block text-xs text-gray-500 border border-gray-300 rounded-full px-2 py-0.5">
  🤖 Machine-generated · {model} · {generatedAt}
</span>
```

- [ ] **Step 6: Implement `src/components/TopicChips.astro`**

```astro
---
import type { Topic } from '../lib/schemas';
import { topicLabel } from '../lib/topics';
interface Props { topics: string[]; allTopics: Topic[] }
const { topics, allTopics } = Astro.props;
---
<div class="flex flex-wrap gap-1">
  {topics.map(t => (
    <span class="text-xs bg-gray-100 rounded px-2 py-0.5">{topicLabel(allTopics, t)}</span>
  ))}
</div>
```

- [ ] **Step 7: Implement `src/components/OfferingDetail.astro`**

```astro
---
import type { Offering, Topic } from '../lib/schemas';
import TopicChips from './TopicChips.astro';
interface Props { data: Offering; allTopics: Topic[] }
const { data, allTopics } = Astro.props;
---
<section class="space-y-3">
  <p class="text-sm text-gray-700">
    👤 {data.instructors.map(i => i.name).join(', ')}
    {data.frameworks.length > 0 && <span> · ⚙ {data.frameworks.join(', ')}</span>}
    {data.project && <span> · 🎓 {data.project.title}</span>}
  </p>
  <TopicChips topics={data.topics} allTopics={allTopics} />
  {data.schedule && (
    <details class="text-sm">
      <summary class="cursor-pointer">Schedule ({data.schedule.length} lectures)</summary>
      <ul class="list-disc ml-6 mt-1">
        {data.schedule.map(s => <li>{s.week ? `Week ${s.week}: ` : ''}{s.title}</li>)}
      </ul>
    </details>
  )}
  {data.assignments && (
    <details class="text-sm">
      <summary class="cursor-pointer">Assignments ({data.assignments.length})</summary>
      <ul class="list-disc ml-6 mt-1">
        {data.assignments.map(a => <li>{a.name}: {a.title}{a.weight ? ` (${a.weight}%)` : ''}</li>)}
      </ul>
    </details>
  )}
  {data.notes && <p class="text-sm text-gray-600 italic">{data.notes}</p>}
  <p class="text-xs text-gray-500">
    Sources: {data.sources.map((s, i) => <a href={s.url} class="underline">[{i + 1}]</a>)}
  </p>
</section>
```

- [ ] **Step 8: Implement `src/components/VersionSwitcher.astro`**

```astro
---
import type { Offering } from '../lib/schemas';
import { sortOfferings, offeringSlug, versionLabel } from '../lib/offerings';
interface Props { courseId: string; entries: { id: string; data: Offering }[]; currentSlug: string }
const { courseId, entries, currentSlug } = Astro.props;
const base = import.meta.env.BASE_URL;
const sorted = sortOfferings(entries);
---
<label class="text-sm">
  Version:
  <select
    class="border border-gray-300 rounded px-2 py-1 ml-1"
    onchange="window.location.href = this.value"
  >
    {sorted.map(o => {
      const slug = offeringSlug(o.data);
      return (
        <option value={`${base}/courses/${courseId}/${slug}`} selected={slug === currentSlug}>
          {versionLabel(o.data)}
        </option>
      );
    })}
  </select>
</label>
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/topics.ts src/components/ tests/topics.test.ts
git commit -m "feat: add shared UI components and topic helper"
```

---

### Task 7: Catalog page (home) with filtering

**Files:**
- Create: `src/components/CourseCard.astro`, `src/pages/index.astro`

**Interfaces:**
- Consumes: `getCollection` from `astro:content`; `sortOfferings`, `latestOffering` (Task 3); `CourseCard`.
- Produces: the `/` route. CourseCard props `{ course, offeringCount, yearSpan, topics, allTopics, href }`.

- [ ] **Step 1: Implement `src/components/CourseCard.astro`**

```astro
---
import type { Course, Topic } from '../lib/schemas';
import TopicChips from './TopicChips.astro';
interface Props {
  course: Course; offeringCount: number; yearSpan: string;
  topics: string[]; allTopics: Topic[]; href: string; fields: string; institution: string;
}
const { course, offeringCount, yearSpan, topics, allTopics, href, fields, institution } = Astro.props;
---
<a href={href}
   class="block border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
   data-fields={fields} data-institution={institution} data-name={`${course.number} ${course.title}`.toLowerCase()}>
  <div class="font-semibold">{course.number} <span class="text-gray-500 font-normal">· {course.institution}</span></div>
  <div class="text-sm">{course.title}</div>
  <div class="text-xs text-gray-500 my-1">{offeringCount} offerings · {yearSpan}</div>
  <TopicChips topics={topics.slice(0, 5)} allTopics={allTopics} />
</a>
```

- [ ] **Step 2: Implement `src/pages/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import Base from '../layouts/Base.astro';
import CourseCard from '../components/CourseCard.astro';
import { sortOfferings, latestOffering } from '../lib/offerings';

const base = import.meta.env.BASE_URL;
const courses = await getCollection('courses');
const offerings = await getCollection('offerings');
const allTopics = await getCollection('topics').then(ts => ts.map(t => t.data));

const cards = courses.map(course => {
  const mine = offerings.filter(o => o.data.course === course.id);
  const sorted = sortOfferings(mine);
  const years = sorted.map(o => o.data.year);
  const yearSpan = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : 'no offerings';
  return {
    course: course.data,
    href: `${base}/courses/${course.id}`,
    offeringCount: mine.length,
    yearSpan,
    topics: latestOffering(mine)?.data.topics ?? [],
    fields: course.data.fields.join(' '),
    institution: course.data.institution,
  };
});

const fields = [...new Set(courses.flatMap(c => c.data.fields))].sort();
const institutions = [...new Set(courses.map(c => c.data.institution))].sort();
---
<Base title="Course Atlas — how CS courses evolve">
  <div class="flex gap-6">
    <aside class="w-44 shrink-0 text-sm">
      <input id="search" placeholder="🔍 Search…" class="border border-gray-300 rounded px-2 py-1 w-full mb-3" />
      <div class="font-semibold text-xs uppercase text-gray-500">Field</div>
      {fields.map(f => <label class="block"><input type="checkbox" class="f-field" value={f} /> {f}</label>)}
      <div class="font-semibold text-xs uppercase text-gray-500 mt-3">Institution</div>
      {institutions.map(i => <label class="block"><input type="checkbox" class="f-inst" value={i} /> {i}</label>)}
    </aside>
    <div id="grid" class="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
      {cards.map(c => <CourseCard {...c} allTopics={allTopics} />)}
    </div>
  </div>

  <script>
    const grid = document.getElementById('grid')!;
    const search = document.getElementById('search') as HTMLInputElement;
    function checked(sel: string) {
      return [...document.querySelectorAll<HTMLInputElement>(sel)].filter(c => c.checked).map(c => c.value);
    }
    function apply() {
      const q = search.value.toLowerCase();
      const fields = checked('.f-field');
      const insts = checked('.f-inst');
      for (const card of grid.children as HTMLCollectionOf<HTMLElement>) {
        const cardFields = (card.dataset.fields ?? '').split(' ');
        const okField = !fields.length || fields.some(f => cardFields.includes(f));
        const okInst = !insts.length || insts.includes(card.dataset.institution ?? '');
        const okSearch = !q || (card.dataset.name ?? '').includes(q);
        card.style.display = okField && okInst && okSearch ? '' : 'none';
      }
    }
    search.addEventListener('input', apply);
    document.querySelectorAll('.f-field, .f-inst').forEach(c => c.addEventListener('change', apply));
  </script>
</Base>
```

- [ ] **Step 3: Build and verify the catalog renders**

Run: `npm run build`
Expected: build succeeds; `dist/index.html` exists and contains the course numbers (e.g. "CS 224N", "11-711").

Run: `npm run dev` then open the printed URL; confirm the four cards render and that typing in search / toggling filters hides cards. Stop dev with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add src/components/CourseCard.astro src/pages/index.astro
git commit -m "feat: add catalog home page with client-side filtering"
```

---

### Task 8: Course pages (latest + per-version)

**Files:**
- Create: `src/components/NarrativeSection.astro`, `src/pages/courses/[id].astro`, `src/pages/courses/[id]/[version].astro`

**Interfaces:**
- Consumes: `getCollection`, `render` from `astro:content`; `sortOfferings`, `latestOffering`, `offeringSlug`, `versionLabel` (Task 3); `OfferingDetail`, `VersionSwitcher` (Task 6).
- Produces: routes `/courses/[id]` (latest + narratives) and `/courses/[id]/[version]` (specific version, no narratives).

- [ ] **Step 1: Implement `src/components/NarrativeSection.astro`**

```astro
---
import ModelBadge from './ModelBadge.astro';
interface Props { title: string; model: string; generatedAt: string }
const { title, model, generatedAt } = Astro.props;
---
<section class="border-t border-gray-200 pt-4 mt-4">
  <div class="flex items-center justify-between">
    <h2 class="font-semibold">{title}</h2>
    <ModelBadge model={model} generatedAt={generatedAt} />
  </div>
  <div class="prose prose-sm max-w-none mt-2">
    <slot />
  </div>
</section>
```

- [ ] **Step 2: Implement `src/pages/courses/[id].astro`** (latest version + narratives)

```astro
---
import { getCollection, render } from 'astro:content';
import Base from '../../layouts/Base.astro';
import OfferingDetail from '../../components/OfferingDetail.astro';
import VersionSwitcher from '../../components/VersionSwitcher.astro';
import NarrativeSection from '../../components/NarrativeSection.astro';
import { latestOffering, offeringSlug, versionLabel } from '../../lib/offerings';

export async function getStaticPaths() {
  const courses = await getCollection('courses');
  return courses.map(course => ({ params: { id: course.id }, props: { course } }));
}

const { course } = Astro.props;
const offerings = (await getCollection('offerings')).filter(o => o.data.course === course.id);
const allTopics = (await getCollection('topics')).map(t => t.data);
const latest = latestOffering(offerings)!;

const comparisons = (await getCollection('comparisons')).filter(c => c.data.subjects.includes(course.id));
const narratives = await Promise.all(comparisons.map(async c => ({
  data: c.data, Content: (await render(c)).Content,
})));
const titleFor = (type: string) => type === 'evolution' ? '📈 Evolution' : '🔀 Similar courses';
---
<Base title={`${course.data.number} — ${course.data.title}`}>
  <h1 class="text-xl font-semibold">{course.data.number} — {course.data.title}</h1>
  <p class="text-sm text-gray-600">
    {course.data.institution}
    {course.data.crossListed && <span> · cross-listed {course.data.crossListed.join(', ')}</span>}
    {course.data.lineage?.note && <span> · 🧬 {course.data.lineage.note}</span>}
  </p>
  <div class="my-3">
    <VersionSwitcher courseId={course.id} entries={offerings} currentSlug={offeringSlug(latest.data)} />
  </div>
  <h2 class="text-sm uppercase text-gray-500">This version — {versionLabel(latest.data)}</h2>
  <OfferingDetail data={latest.data} allTopics={allTopics} />

  {narratives.map(n => (
    <NarrativeSection title={titleFor(n.data.type)} model={n.data.generatedBy.model} generatedAt={n.data.generatedBy.generatedAt}>
      <n.Content />
    </NarrativeSection>
  ))}
</Base>
```

- [ ] **Step 3: Implement `src/pages/courses/[id]/[version].astro`** (specific version, no narratives)

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../../layouts/Base.astro';
import OfferingDetail from '../../../components/OfferingDetail.astro';
import VersionSwitcher from '../../../components/VersionSwitcher.astro';
import { offeringSlug, versionLabel } from '../../../lib/offerings';

export async function getStaticPaths() {
  const courses = await getCollection('courses');
  const offerings = await getCollection('offerings');
  return offerings.map(o => {
    const course = courses.find(c => c.id === o.data.course)!;
    const siblings = offerings.filter(s => s.data.course === o.data.course);
    return {
      params: { id: o.data.course, version: offeringSlug(o.data) },
      props: { course, offering: o, siblings },
    };
  });
}

const { course, offering, siblings } = Astro.props;
const allTopics = (await getCollection('topics')).map(t => t.data);
---
<Base title={`${course.data.number} — ${versionLabel(offering.data)}`}>
  <h1 class="text-xl font-semibold">{course.data.number} — {course.data.title}</h1>
  <p class="text-sm text-gray-600">{course.data.institution}</p>
  <div class="my-3">
    <VersionSwitcher courseId={course.id} entries={siblings} currentSlug={offeringSlug(offering.data)} />
  </div>
  <h2 class="text-sm uppercase text-gray-500">{versionLabel(offering.data)}</h2>
  <OfferingDetail data={offering.data} allTopics={allTopics} />
</Base>
```

- [ ] **Step 4: Build and verify course pages**

Run: `npm run build`
Expected: build succeeds; these files exist:
- `dist/courses/stanford-cs224n/index.html` (contains "Evolution" and the model badge text "claude-opus-4-8")
- `dist/courses/stanford-cs224n/2023-winter/index.html` (contains "minBERT", does NOT contain "Evolution")

Run: `grep -l "Evolution" dist/courses/stanford-cs224n/index.html` → should match.
Run: `grep -L "Evolution" dist/courses/stanford-cs224n/2023-winter/index.html` → should match (no narrative on per-version page).

- [ ] **Step 5: Commit**

```bash
git add src/components/NarrativeSection.astro src/pages/courses/
git commit -m "feat: add course pages (latest + per-version)"
```

---

### Task 9: About page

**Files:**
- Create: `src/pages/about.astro`

**Interfaces:**
- Consumes: `Base` layout. Produces: `/about` route.

- [ ] **Step 1: Implement `src/pages/about.astro`**

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="About — Course Atlas">
  <h1 class="text-xl font-semibold">About Course Atlas</h1>
  <div class="prose prose-sm max-w-none mt-3">
    <p>
      Course Atlas tracks how university CS courses evolve over the years — their
      schedules, assignments, default projects, instructors, and topic coverage —
      treating each semester as a version of the course, like versioned documentation.
    </p>
    <p>
      Each course's structured data is the ground truth. The “Evolution” and
      “Similar courses” summaries are machine-generated narratives, clearly badged
      with the model that wrote them, grounded in that structured data.
    </p>
    <p>
      Data is seeded by hand today; a semi-automated harvesting pipeline is planned
      to expand coverage, with provenance recorded on every record.
    </p>
  </div>
</Base>
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: `dist/about/index.html` exists and contains "About Course Atlas".

- [ ] **Step 3: Commit**

```bash
git add src/pages/about.astro
git commit -m "feat: add about page"
```

---

### Task 10: CI + GitHub Pages deployment

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm test`, `npm run check`, `npm run build`. Produces: CI on push/PR and a Pages deploy on push to the default branch.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - run: npm run check
      - run: npm run build
```

- [ ] **Step 2: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: withastro/action@v3
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Verify the CI commands pass locally (the deploy job only runs on GitHub)**

Run: `npm ci && npm test && npm run check && npm run build`
Expected: all four succeed in sequence.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/
git commit -m "ci: add test workflow and GitHub Pages deploy"
```

- [ ] **Step 5: (Manual, post-merge) Enable Pages**

In the GitHub repo: Settings → Pages → Build and deployment → Source = "GitHub Actions". Then confirm `astro.config.mjs` `site`/`base` match the repo's Pages URL (project page → `base: '/<repo-name>'`; user/org page or custom domain → `base: '/'`).

---

## Self-Review (completed by author)

**Spec coverage:**
- Data model (4 collections, one-file-per-offering, controlled topics, sources provenance) → Tasks 2, 5. ✓
- `harvest` reserved block → Task 2 schema. ✓
- Version helpers / "latest" → Task 3. ✓
- Integrity (refs, topics, sources, subjects) → Task 4. ✓
- Catalog layout A (sidebar filters + cards) → Task 7. ✓
- Docs-style version toggle, single-version view → Tasks 6, 8. ✓
- Evolution + Similar-courses narratives on latest only, with model badge → Task 8 (`[id].astro` renders narratives; `[version].astro` does not). ✓
- Seed data incl. one non-AI course → Task 5. ✓
- Astro + Zod + Tailwind + Vitest + GitHub Pages → Tasks 1, 10. ✓
- About page with methodology/provenance → Task 9. ✓
- Future/Subsystem B → out of scope, documented in spec; no tasks (correct). ✓

**Placeholder scan:** No "TBD/TODO"; seed `schedule`/`assignments` are explicitly optional with full required-field values + source URLs provided (not placeholders).

**Type consistency:** `Offering`/`Course`/`Topic`/`Comparison` types flow from Task 2; helper names (`sortOfferings`, `latestOffering`, `offeringSlug`, `versionLabel`, `expectedOfferingId`, `topicLabel`, `checkIntegrity`) are used consistently across Tasks 3–8.
