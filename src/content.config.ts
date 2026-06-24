import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { courseSchema, offeringSchema, comparisonSchema, topicSchema } from './lib/schemas';

const courses = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/courses' }),
  schema: courseSchema,
});
const offerings = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/offerings' }),
  schema: offeringSchema,
});
const comparisons = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/comparisons' }),
  schema: comparisonSchema,
});
const topics = defineCollection({
  loader: file('./src/content/topics/topics.yaml'),
  schema: topicSchema,
});

export const collections = { courses, offerings, comparisons, topics };
