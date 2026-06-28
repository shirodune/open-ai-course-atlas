import * as cheerio from 'cheerio';
import { findWaybackSnapshot } from './wayback';
import type { FetchedPage } from '../extractors/contract';

export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

export interface FetchOptions {
  timeoutMs?: number;
  minTextLength?: number;
  now?: () => string;
  fetchImpl?: typeof fetch;
  waybackLookup?: (url: string) => Promise<string | null>;
}

async function fetchWithTimeout(f: typeof fetch, url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await f(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<FetchedPage> {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date().toISOString());
  const waybackLookup = opts.waybackLookup ?? ((u: string) => findWaybackSnapshot(u));
  const minText = opts.minTextLength ?? 200;

  let live: Response | null = null;
  try {
    live = await fetchWithTimeout(f, url, opts.timeoutMs ?? 15000);
  } catch {
    live = null;
  }
  if (live && live.ok) {
    const html = await live.text();
    const text = htmlToText(html);
    if (text.length >= minText) {
      return { url, html, text, retrievedAt: now(), source: 'official' };
    }
  }

  const snapshot = await waybackLookup(url);
  if (snapshot) {
    const res = await f(snapshot);
    if (res.ok) {
      const html = await res.text();
      return { url: snapshot, html, text: htmlToText(html), retrievedAt: now(), source: 'wayback' };
    }
  }

  throw new Error(`Could not fetch ${url}: live failed or too thin and no usable Wayback snapshot`);
}
