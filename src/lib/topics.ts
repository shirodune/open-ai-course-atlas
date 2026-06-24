import type { Topic } from './schemas';

export function topicLabel(topics: Topic[], id: string): string {
  return topics.find(t => t.id === id)?.label ?? id;
}
