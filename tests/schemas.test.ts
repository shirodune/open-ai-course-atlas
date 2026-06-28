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
