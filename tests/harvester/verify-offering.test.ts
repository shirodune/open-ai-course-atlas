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
