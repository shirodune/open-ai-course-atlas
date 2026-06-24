import type { Offering } from './schemas';

const TERM_ORDER: Record<string, number> = {
  Winter: 1, Spring: 2, Summer: 3, Fall: 4, Autumn: 4,
};

export function offeringSlug(data: Offering): string {
  return `${data.year}-${data.term.toLowerCase()}`;
}

export function expectedOfferingId(courseSlug: string, data: Offering): string {
  return `${courseSlug}-${offeringSlug(data)}`;
}

export function versionLabel(data: Offering): string {
  return `${data.term} ${data.year}`;
}

export function sortOfferings<T extends { data: Offering }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (b.data.year !== a.data.year) return b.data.year - a.data.year;
    return (TERM_ORDER[b.data.term] ?? 0) - (TERM_ORDER[a.data.term] ?? 0);
  });
}

export function latestOffering<T extends { data: Offering }>(entries: T[]): T | undefined {
  return sortOfferings(entries)[0];
}
