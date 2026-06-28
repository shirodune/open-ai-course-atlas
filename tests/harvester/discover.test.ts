import { describe, it, expect } from 'vitest';
import { discoverOfferingUrls } from '../../harvester/lib/discover';

const HTML = `
  <html><body>
    <a href="/class/cs224n/2023/">Winter 2023</a>
    <a href="archive/2021/index.html">2021 offering</a>
    <a href="https://web.stanford.edu/class/cs224n/2024/">2024</a>
    <a href="https://youtube.com/watch?v=abc">Lectures 2022</a>
    <a href="/about">About</a>
  </body></html>`;

describe('discoverOfferingUrls', () => {
  const out = discoverOfferingUrls(HTML, 'https://web.stanford.edu/class/cs224n/');

  it('keeps same-host links carrying a year, newest first', () => {
    const urls = out.map(o => o.url);
    expect(urls).toEqual([
      'https://web.stanford.edu/class/cs224n/2024/',
      'https://web.stanford.edu/class/cs224n/2023/',
      'https://web.stanford.edu/class/cs224n/archive/2021/index.html',
    ]);
  });

  it('drops off-host links even when they carry a year', () => {
    expect(out.some(o => o.url.includes('youtube.com'))).toBe(false);
  });

  it('drops links with no year', () => {
    expect(out.some(o => o.url.endsWith('/about'))).toBe(false);
  });
});
