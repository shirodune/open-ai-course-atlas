import { z } from 'astro/zod';

export const TERMS = ['Winter', 'Spring', 'Summer', 'Fall', 'Autumn'] as const;

export const courseSchema = z.object({
  title: z.string(),
  number: z.string(),
  institution: z.string(),
  fields: z.array(z.string()).min(1),
  homepage: z.string().url(),
  summary: z.string(),
  crossListed: z.array(z.string()).optional(),
  lineage: z.object({
    predecessors: z.array(z.string()).optional(),
    note: z.string().optional(),
  }).optional(),
});

const sourceSchema = z.object({
  url: z.string().url(),
  type: z.enum(['official', 'wayback', 'youtube', 'other']),
});

export const offeringSchema = z.object({
  course: z.string(),
  year: z.number().int(),
  term: z.enum(TERMS),
  instructors: z.array(z.object({ name: z.string(), role: z.string().optional() })).min(1),
  frameworks: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  schedule: z.array(z.object({
    week: z.number().optional(),
    date: z.string().optional(),
    title: z.string(),
  })).optional(),
  assignments: z.array(z.object({
    name: z.string(),
    title: z.string(),
    framework: z.string().optional(),
    weight: z.number().optional(),
  })).optional(),
  project: z.object({ type: z.string(), title: z.string() }).optional(),
  sources: z.array(sourceSchema).min(1),
  notes: z.string().optional(),
  // Reserved for Subsystem B; not populated in the slice.
  harvest: z.object({
    lastVerified: z.string().optional(),
    extractor: z.string().optional(),
    confidence: z.number().optional(),
  }).optional(),
});

export const comparisonSchema = z.object({
  type: z.enum(['evolution', 'similar-courses']),
  subjects: z.array(z.string()).min(1),
  generatedBy: z.object({ model: z.string(), generatedAt: z.string() }),
});

export const topicSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.string(),
});

export type Course = z.infer<typeof courseSchema>;
export type Offering = z.infer<typeof offeringSchema>;
export type Comparison = z.infer<typeof comparisonSchema>;
export type Topic = z.infer<typeof topicSchema>;
