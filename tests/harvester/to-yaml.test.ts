import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { offeringToYaml } from '../../harvester/lib/to-yaml';
import { offeringSchema } from '../../src/lib/schemas';
import type { ExtractedOffering } from '../../harvester/extractors/contract';
import { checkIntegrity } from '../../src/lib/integrity';

const o: ExtractedOffering = {
  course: 'stanford-cs224n',
  year: 2024,
  term: 'Winter',
  instructors: [{ name: 'Chris Manning', role: 'instructor' }],
  frameworks: ['pytorch'],
  sources: [{ url: 'https://web.stanford.edu/class/cs224n/', type: 'official' }],
};
const harvest = { lastVerified: '2026-06-24', extractor: 'stanford-cs224n', confidence: 0.95 };

describe('offeringToYaml', () => {
  const yaml = offeringToYaml(o, harvest);

  it('round-trips through yaml.parse and offeringSchema', () => {
    const parsedBack = offeringSchema.safeParse(parse(yaml));
    expect(parsedBack.success).toBe(true);
  });

  it('keeps lastVerified a string after parsing', () => {
    const back = parse(yaml) as { harvest: { lastVerified: unknown } };
    expect(typeof back.harvest.lastVerified).toBe('string');
    expect(back.harvest.lastVerified).toBe('2026-06-24');
  });

  it('double-quotes the date so Astro\'s loader does not coerce it to a Date', () => {
    // The yaml lib parses unquoted YYYY-MM-DD as a string, but Astro\'s content
    // loader coerces it to a Date and fails z.string(). Quoting is the guard.
    expect(yaml).toContain('lastVerified: "2026-06-24"');
  });

  it('double-quotes schedule dates too', () => {
    const withSchedule = offeringToYaml(
      { ...o, schedule: [{ week: 1, date: '2024-01-09', title: 'Intro' }] },
      harvest,
    );
    expect(withSchedule).toContain('date: "2024-01-09"');
  });

  it('omits optional fields that are absent', () => {
    expect(yaml).not.toContain('project:');
    expect(yaml).not.toContain('assignments:');
  });

  it('stamps the harvest provenance block', () => {
    expect(yaml).toContain('extractor: stanford-cs224n');
    expect(yaml).toContain('confidence: 0.95');
  });

  it('passes the real integrity check (no topics key)', () => {
    const data = parse(yaml);
    const errors = checkIntegrity({
      courses: [{ id: 'stanford-cs224n' }],
      topics: [],
      offerings: [{ id: 'stanford-cs224n-2024-winter', data }],
      comparisons: [],
    } as any);
    expect(errors).toEqual([]);
  });
});
