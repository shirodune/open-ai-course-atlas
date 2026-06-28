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
