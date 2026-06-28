import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { extract } from '../../../harvester/extractors/stanford-cs231n';
import { validateOffering } from '../../../harvester/lib/validate';
import type { FetchedPage } from '../../../harvester/extractors/contract';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (year: number): FetchedPage => ({
  url: `https://cs231n.stanford.edu/${year}/`,
  html: readFileSync(resolve(here, `../fixtures/stanford-cs231n-${year}.html`), 'utf8'),
  text: '',
  retrievedAt: '2026-06-29T00:00:00.000Z',
  source: 'official',
});

const YEARS = [2025, 2024, 2023, 2022] as const;
const offerings = extract(YEARS.map(fixture));
const byYear = (y: number) => offerings.find(o => o.year === y)!;

describe('stanford-cs231n extractor', () => {
  it('extracts one Spring offering per fixture, all schema-valid', () => {
    expect(offerings).toHaveLength(4);
    for (const o of offerings) {
      expect(o.course).toBe('stanford-cs231n');
      expect(o.term).toBe('Spring');
      const v = validateOffering(o, 'stanford-cs231n');
      expect(v.ok).toBe(true);
    }
  });

  it('reads year + term from the "Stanford - Spring <year>" banner', () => {
    expect(offerings.map(o => o.year).sort()).toEqual([2022, 2023, 2024, 2025]);
  });

  it('captures only faculty under the "Instructors" heading (ignores TAs and commented-out names)', () => {
    // 2022 has a commented-out "Course Coordinator" that cheerio must ignore.
    expect(byYear(2022).instructors.map(i => i.name)).toEqual(['Fei-Fei Li', 'Jiajun Wu', 'Ruohan Gao']);
    expect(byYear(2024).instructors.map(i => i.name)).toEqual(['Fei-Fei Li', 'Ehsan Adeli']);
    // 2023 has an <h4>Course Manager</h4> (Amelie Byun) that must NOT be read as an instructor.
    expect(byYear(2023).instructors.map(i => i.name)).toEqual(['Fei-Fei Li', 'Yunzhu Li', 'Ruohan Gao']);
    expect(byYear(2025).instructors.map(i => i.name)).toEqual([
      'Fei-Fei Li', 'Ehsan Adeli', 'Justin Johnson', 'Zane Durante',
    ]);
    for (const o of offerings) {
      expect(o.instructors.every(i => i.role === 'instructor')).toBe(true);
      expect(o.instructors[0].name).toBe('Fei-Fei Li');
    }
  });

  it('grounds a Final Project on every offering', () => {
    for (const o of offerings) {
      expect(o.project).toEqual({ type: 'final-project', title: 'Final Project' });
    }
  });

  it('records the fetched page as the official source', () => {
    expect(byYear(2023).sources).toEqual([
      { url: 'https://cs231n.stanford.edu/2023/', type: 'official' },
    ]);
  });
});
