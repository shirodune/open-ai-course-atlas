import { describe, it, expect } from 'vitest';
import { topicLabel } from '../src/lib/topics';

const topics = [{ id: 'rlhf', label: 'RLHF', category: 'post-training' }];

describe('topicLabel', () => {
  it('returns the label for a known topic', () => {
    expect(topicLabel(topics, 'rlhf')).toBe('RLHF');
  });
  it('falls back to the id for an unknown topic', () => {
    expect(topicLabel(topics, 'mystery')).toBe('mystery');
  });
});
