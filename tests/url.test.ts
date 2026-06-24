import { describe, it, expect } from 'vitest';
import { withBase } from '../src/lib/url';

// In the test environment BASE_URL defaults to '/', i.e. root hosting (Vercel).
describe('withBase (root base)', () => {
  it('returns a single-slash root for "/"', () => {
    expect(withBase('/')).toBe('/');
  });

  it('does not double the slash for a sub-path', () => {
    expect(withBase('/courses/stanford-cs224n')).toBe('/courses/stanford-cs224n');
  });

  it('adds a leading slash when missing', () => {
    expect(withBase('about')).toBe('/about');
  });
});
