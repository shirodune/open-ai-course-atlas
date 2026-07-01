import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { extract } from '../../../harvester/extractors/stanford-cs229';
import { validateOffering } from '../../../harvester/lib/validate';
import type { FetchedPage } from '../../../harvester/extractors/contract';

const here = dirname(fileURLToPath(import.meta.url));

// CS229 runs several terms a year; each offering keeps its own archived URL, and
// the current offering (Summer 2026) lives at the site root.
const SOURCES: Record<string, string> = {
  '2025-winter': 'https://cs229.stanford.edu/w24-index.html',
  '2025-fall': 'https://cs229.stanford.edu/index.html-fall25',
  '2026-summer': 'https://cs229.stanford.edu/',
};

const fixture = (key: string): FetchedPage => ({
  url: SOURCES[key],
  html: readFileSync(resolve(here, `../fixtures/stanford-cs229-${key}.html`), 'utf8'),
  text: '',
  retrievedAt: '2026-07-01T00:00:00.000Z',
  source: 'official',
});

const KEYS = ['2026-summer', '2025-fall', '2025-winter'] as const;
const offerings = extract(KEYS.map(fixture));
const byKey = (year: number, term: string) =>
  offerings.find(o => o.year === year && o.term === term)!;

describe('stanford-cs229 extractor', () => {
  it('extracts one offering per fixture, all schema-valid', () => {
    expect(offerings).toHaveLength(3);
    for (const o of offerings) {
      expect(o.course).toBe('stanford-cs229');
      const v = validateOffering(o, 'stanford-cs229');
      expect(v.ok).toBe(true);
    }
  });

  it('reads term + year from the standalone "<Season> <Year>" heading', () => {
    expect(byKey(2026, 'Summer').term).toBe('Summer');
    expect(byKey(2025, 'Fall').term).toBe('Fall');
    expect(byKey(2025, 'Winter').term).toBe('Winter');
    expect(offerings.map(o => `${o.year}-${o.term}`).sort()).toEqual([
      '2025-Fall', '2025-Winter', '2026-Summer',
    ]);
  });

  it('reads instructors only from the Instructor(s) block, ignoring the Course Staff table', () => {
    expect(byKey(2025, 'Winter').instructors.map(i => i.name)).toEqual([
      'Sanmi Koyejo', 'Ludwig Schmidt',
    ]);
    expect(byKey(2025, 'Fall').instructors.map(i => i.name)).toEqual([
      'Moses Charikar', 'Carlos Guestrin', 'Andrew Ng',
    ]);
    expect(byKey(2026, 'Summer').instructors.map(i => i.name)).toEqual([
      'Jehangir Amjad', 'Anand Avati',
    ]);
    for (const o of offerings) {
      expect(o.instructors.every(i => i.role === 'instructor')).toBe(true);
    }
  });

  it('grounds a Final Project only where the page mentions one', () => {
    // Winter/Fall 2025 pages link "Final Project Information"; the Summer 2026
    // homepage (early in term) does not yet, so no project is claimed.
    expect(byKey(2025, 'Winter').project).toEqual({ type: 'final-project', title: 'Final Project' });
    expect(byKey(2025, 'Fall').project).toEqual({ type: 'final-project', title: 'Final Project' });
    expect(byKey(2026, 'Summer').project).toBeUndefined();
  });

  it('captures the inline lecture schedule where the page has one', () => {
    const winter = byKey(2025, 'Winter').schedule!;
    const fall = byKey(2025, 'Fall').schedule!;

    expect(winter).toHaveLength(28);
    expect(fall).toHaveLength(29);
    expect(winter[0]).toEqual({
      date: '2025-01-06',
      title: 'Introduction: What is Machine Learning, History of ML/AI',
    });
    expect(fall[0]).toEqual({ date: '2025-09-22', title: 'Introduction' });

    // Every captured entry has an ISO date and a non-empty title.
    for (const s of [...winter, ...fall]) {
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.title.length).toBeGreaterThan(0);
    }

    // The 2025 curriculum reaches modern LLMs — a grounded evolution signal.
    expect(fall.some(s => /large language models/i.test(s.title))).toBe(true);

    // The Summer 2026 homepage has no schedule table yet, so none is claimed.
    expect(byKey(2026, 'Summer').schedule).toBeUndefined();
  });

  it('records the fetched page as the official source', () => {
    expect(byKey(2026, 'Summer').sources).toEqual([
      { url: 'https://cs229.stanford.edu/', type: 'official' },
    ]);
    expect(byKey(2025, 'Fall').sources).toEqual([
      { url: 'https://cs229.stanford.edu/index.html-fall25', type: 'official' },
    ]);
  });
});
