import * as cheerio from 'cheerio';
import type { CourseExtractor, ExtractedOffering, Term } from './contract';

// CS231n offering homepages share one template across years, but the People
// section's column markup drifts (col-md-2 vs col-md-4; TAs sometimes share the
// instructors column, separated only by an <h3>). So we walk #people in document
// order, tracking the active <h3>, and keep only names under "Instructors".
const TERM_RE = /Stanford\s*[-–]\s*(Spring|Summer|Fall|Autumn|Winter)\s+(\d{4})/i;

function asTerm(raw: string): Term {
  const lower = raw.toLowerCase();
  return (lower.charAt(0).toUpperCase() + lower.slice(1)) as Term;
}

export const extract: CourseExtractor = (pages) =>
  pages.map((page): ExtractedOffering => {
    const $ = cheerio.load(page.html);
    const bodyText = $('body').text();

    const term = bodyText.match(TERM_RE);
    if (!term) {
      throw new Error(`stanford-cs231n: no "Stanford - <Term> <Year>" found on ${page.url}`);
    }

    const instructors: { name: string; role?: string }[] = [];
    let active: string | null = null;
    $('#people')
      .find('h3, h4, .instructor')
      .each((_, el) => {
        const $el = $(el);
        if ($el.is('h3, h4')) {
          // Any heading other than "Instructors" (e.g. an <h4>Course Manager</h4>
          // or <h3>Teaching Assistants</h3>) ends the instructor run.
          active = $el.text().trim().toLowerCase() === 'instructors' ? 'instructor' : null;
          return;
        }
        if (active) {
          const name = $el.find('div').last().text().trim();
          if (name) instructors.push({ name, role: active });
        }
      });

    const offering: ExtractedOffering = {
      course: 'stanford-cs231n',
      year: Number(term[2]),
      term: asTerm(term[1]),
      instructors,
      frameworks: [],
      sources: [{ url: page.url, type: page.source }],
    };

    if (/Final Project/i.test(bodyText)) {
      offering.project = { type: 'final-project', title: 'Final Project' };
    }
    return offering;
  });
