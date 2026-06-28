export interface WaybackOptions {
  fetchImpl?: typeof fetch;
  timestamp?: string; // YYYYMMDD; ask Wayback for the snapshot closest to this date
}

interface WaybackResponse {
  archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string } };
}

export async function findWaybackSnapshot(url: string, opts: WaybackOptions = {}): Promise<string | null> {
  const f = opts.fetchImpl ?? fetch;
  const ts = opts.timestamp ? `&timestamp=${opts.timestamp}` : '';
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}${ts}`;
  let res: Response;
  try {
    res = await f(api);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json()) as WaybackResponse;
  const closest = data.archived_snapshots?.closest;
  if (closest?.available && closest.url) {
    return closest.url.replace(/^http:/, 'https:');
  }
  return null;
}
