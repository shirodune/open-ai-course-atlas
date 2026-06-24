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
