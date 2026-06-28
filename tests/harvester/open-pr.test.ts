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
