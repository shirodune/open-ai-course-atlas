import { TERMS } from '../../src/lib/schemas';

export type Term = (typeof TERMS)[number];

export interface FetchedPage {
  url: string;
  html: string;
  text: string;
  retrievedAt: string; // ISO 8601
  source: 'official' | 'wayback';
}

export interface ExtractedOffering {
  course: string;
  year: number;
  term: Term;
  instructors: { name: string; role?: string }[];
  frameworks: string[];
  schedule?: { week?: number; date?: string; title: string }[];
  assignments?: { name: string; title: string; framework?: string; weight?: number }[];
  project?: { type: string; title: string };
  sources: { url: string; type: 'official' | 'wayback' | 'youtube' | 'other' }[];
  notes?: string;
}

export type CourseExtractor = (pages: FetchedPage[]) => ExtractedOffering[];
