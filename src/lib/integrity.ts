import { expectedOfferingId } from './offerings';

interface IntegrityInput {
  courses: { id: string }[];
  topics: { id: string }[];
  offerings: { id: string; data: { course: string; year: number; term: string; topics?: string[]; sources: unknown[] } }[];
  comparisons: { id: string; data: { subjects: string[] } }[];
}

export function checkIntegrity(input: IntegrityInput): string[] {
  const errors: string[] = [];
  const courseIds = new Set(input.courses.map(c => c.id));
  const topicIds = new Set(input.topics.map(t => t.id));

  for (const o of input.offerings) {
    const expected = expectedOfferingId(o.data.course, o.data as any);
    if (o.id !== expected) {
      errors.push(`offering "${o.id}" filename mismatch: expected "${expected}" (course="${o.data.course}", year=${o.data.year}, term="${o.data.term}")`);
    }
    if (!courseIds.has(o.data.course)) {
      errors.push(`offering "${o.id}" references unknown course "${o.data.course}"`);
    }
    for (const t of o.data.topics ?? []) {
      if (!topicIds.has(t)) errors.push(`offering "${o.id}" references unknown topic "${t}"`);
    }
    if (!o.data.sources || o.data.sources.length === 0) {
      errors.push(`offering "${o.id}" has no sources`);
    }
  }

  for (const c of input.comparisons) {
    for (const s of c.data.subjects) {
      if (!courseIds.has(s)) errors.push(`comparison "${c.id}" references unknown subject "${s}"`);
    }
  }

  return errors;
}
