import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parse } from 'yaml';
import matter from 'gray-matter';
import { checkIntegrity } from '../src/lib/integrity';

const idOf = (p: string) => basename(p).replace(/\.(yaml|md)$/, '');

function loadYaml(dir: string) {
  return fg.sync(`${dir}/**/*.yaml`).map(p => ({ id: idOf(p), data: parse(readFileSync(p, 'utf8')) }));
}

const courses = loadYaml('src/content/courses');
const offerings = loadYaml('src/content/offerings');
const comparisons = fg.sync('src/content/comparisons/**/*.md').map(p => ({
  id: idOf(p), data: matter(readFileSync(p, 'utf8')).data as { subjects: string[] },
}));
const topicsFile = fg.sync('src/content/topics/topics.yaml')[0];
const topics = topicsFile ? (parse(readFileSync(topicsFile, 'utf8')) as { id: string }[]) : [];

const errors = checkIntegrity({ courses, offerings, comparisons, topics } as any);
if (errors.length) {
  console.error(`Integrity check failed (${errors.length}):`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Integrity check passed.');
