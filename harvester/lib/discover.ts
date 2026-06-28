import * as cheerio from 'cheerio';

export interface DiscoveredUrl {
  url: string;
  year?: number;
}

const YEAR_RE = /\b(20\d{2})\b/;

export function discoverOfferingUrls(homepageHtml: string, baseUrl: string): DiscoveredUrl[] {
  const $ = cheerio.load(homepageHtml);
  const base = new URL(baseUrl);
  const seen = new Map<string, DiscoveredUrl>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let abs: string;
    try {
      abs = new URL(href, base).toString();
    } catch {
      return;
    }
    if (new URL(abs).host !== base.host) return;
    const text = $(el).text();
    const m = abs.match(YEAR_RE) ?? text.match(YEAR_RE);
    if (!m) return;
    if (!seen.has(abs)) seen.set(abs, { url: abs, year: Number(m[1]) });
  });

  return [...seen.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}
