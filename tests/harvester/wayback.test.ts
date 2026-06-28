import { describe, it, expect, vi } from 'vitest';
import { findWaybackSnapshot } from '../../harvester/lib/wayback';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('findWaybackSnapshot', () => {
  it('returns the closest snapshot url forced to https', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      archived_snapshots: { closest: { available: true, url: 'http://web.archive.org/web/2021/https://x.edu/' } },
    })) as unknown as typeof fetch;
    const out = await findWaybackSnapshot('https://x.edu/', { fetchImpl });
    expect(out).toBe('https://web.archive.org/web/2021/https://x.edu/');
  });

  it('returns null when no snapshot is available', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ archived_snapshots: {} })) as unknown as typeof fetch;
    expect(await findWaybackSnapshot('https://x.edu/', { fetchImpl })).toBeNull();
  });

  it('returns null on a non-ok API response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 })) as unknown as typeof fetch;
    expect(await findWaybackSnapshot('https://x.edu/', { fetchImpl })).toBeNull();
  });
});
