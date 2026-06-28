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
