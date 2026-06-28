import { offeringSchema } from '../../src/lib/schemas';
import { expectedOfferingId } from '../../src/lib/offerings';
import type { ExtractedOffering } from '../extractors/contract';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  id?: string;
}

export function validateOffering(o: ExtractedOffering, courseSlug: string): ValidationResult {
  const parsed = offeringSchema.safeParse(o);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  return { ok: true, errors: [], id: expectedOfferingId(courseSlug, parsed.data) };
}
