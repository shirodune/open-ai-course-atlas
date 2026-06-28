import { stringify } from 'yaml';
import type { ExtractedOffering } from '../extractors/contract';

export interface HarvestProvenance {
  lastVerified: string;
  extractor: string;
  confidence: number;
}

export function offeringToYaml(o: ExtractedOffering, harvest: HarvestProvenance): string {
  const doc: Record<string, unknown> = {
    course: o.course,
    year: o.year,
    term: o.term,
    instructors: o.instructors,
    frameworks: o.frameworks ?? [],
  };
  if (o.schedule) doc.schedule = o.schedule;
  if (o.assignments) doc.assignments = o.assignments;
  if (o.project) doc.project = o.project;
  doc.sources = o.sources;
  if (o.notes) doc.notes = o.notes;
  doc.harvest = harvest;

  // defaultStringType QUOTE_DOUBLE on date-like values is unnecessary: the `yaml`
  // package (YAML 1.2 core) serializes/parses 'YYYY-MM-DD' as a plain string, and
  // `npm run check` parses offerings with this same library. The round-trip test guards this.
  return stringify(doc, { lineWidth: 0 });
}
