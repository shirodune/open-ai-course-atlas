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
