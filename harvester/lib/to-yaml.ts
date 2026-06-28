import { stringify, Scalar } from 'yaml';
import type { ExtractedOffering } from '../extractors/contract';

export interface HarvestProvenance {
  lastVerified: string;
  extractor: string;
  confidence: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

// Astro's content loader coerces an unquoted `YYYY-MM-DD` scalar to a JS Date,
// which then fails the schema's `z.string()`. (The `yaml` package and `npm run
// check` parse it as a string, so the bug only surfaces at `astro build`.) Force
// any date-like string to a double-quoted scalar so every consumer reads a string.
function quoteIfDate(value: string): string | Scalar {
  if (!DATE_RE.test(value)) return value;
  const node = new Scalar(value);
  node.type = 'QUOTE_DOUBLE';
  return node;
}

export function offeringToYaml(o: ExtractedOffering, harvest: HarvestProvenance): string {
  const doc: Record<string, unknown> = {
    course: o.course,
    year: o.year,
    term: o.term,
    instructors: o.instructors,
    frameworks: o.frameworks ?? [],
  };
  if (o.schedule) {
    doc.schedule = o.schedule.map(s => (s.date ? { ...s, date: quoteIfDate(s.date) } : s));
  }
  if (o.assignments) doc.assignments = o.assignments;
  if (o.project) doc.project = o.project;
  doc.sources = o.sources;
  if (o.notes) doc.notes = o.notes;
  doc.harvest = { ...harvest, lastVerified: quoteIfDate(harvest.lastVerified) };

  return stringify(doc, { lineWidth: 0 });
}
