import { describe, it, expect, vi } from 'vitest';
import { htmlToText, fetchPage } from '../../harvester/lib/fetch';

const RICH = '<html><body>' + 'word '.repeat(100) + '<script>var x=1</script></body></html>';
const THIN = '<html><body><div id="app"></div></body></html>';
const NOW = () => '2026-06-24T00:00:00.000Z';

describe('htmlToText', () => {
  it('drops scripts and collapses whitespace', () => {
    const text = htmlToText('<body><script>junk()</script><p>Hello   world</p></body>');
    expect(text).toBe('Hello world');
  });
});

describe('fetchPage', () => {
  it('returns the live page when it has enough text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(RICH, { status: 200 })) as unknown as typeof fetch;
    const page = await fetchPage('https://x.edu/', { fetchImpl, now: NOW });
    expect(page.source).toBe('official');
    expect(page.url).toBe('https://x.edu/');
    expect(page.retrievedAt).toBe('2026-06-24T00:00:00.000Z');
    expect(page.text.length).toBeGreaterThan(200);
  });

  it('falls back to Wayback when the live page is too thin', async () => {
    const fetchImpl = vi.fn(async (u: string) =>
      u.includes('snapshot') ? new Response(RICH, { status: 200 }) : new Response(THIN, { status: 200 }),
    ) as unknown as typeof fetch;
    const waybackLookup = vi.fn().mockResolvedValue('https://web.archive.org/snapshot/x');
    const page = await fetchPage('https://x.edu/', { fetchImpl, waybackLookup, now: NOW });
    expect(page.source).toBe('wayback');
    expect(page.url).toBe('https://web.archive.org/snapshot/x');
  });

  it('falls back to Wayback when the live fetch throws', async () => {
    const fetchImpl = vi.fn(async (u: string) => {
      if (u.includes('snapshot')) return new Response(RICH, { status: 200 });
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const waybackLookup = vi.fn().mockResolvedValue('https://web.archive.org/snapshot/x');
    const page = await fetchPage('https://x.edu/', { fetchImpl, waybackLookup, now: NOW });
    expect(page.source).toBe('wayback');
  });

  it('throws when neither live nor Wayback works', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(THIN, { status: 200 })) as unknown as typeof fetch;
    const waybackLookup = vi.fn().mockResolvedValue(null);
    await expect(fetchPage('https://x.edu/', { fetchImpl, waybackLookup, now: NOW })).rejects.toThrow();
  });
});
