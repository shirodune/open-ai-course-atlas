import * as cheerio from 'cheerio';
import type { CourseExtractor, ExtractedOffering, Term } from './contract';

// CS229's modern offering pages (Winter 2025 onward) share one template:
//   - a standalone "<Season> <Year>" heading directly under the course title,
//   - an "Instructor(s)" heading followed by a <table> of div.instructor cards,
//   - a separate "Course Staff" section that REUSES the div.instructor class,
// so instructors must be read strictly from the block between the "Instructor(s)"
// heading and the next heading — a page-wide $('.instructor') sweep would also
// pull in every TA.
const TERM_HEADING_RE = /^(Winter|Spring|Summer|Fall|Autumn)\s+(20\d{2})$/i;

function asTerm(raw: string): Term {
  const lower = raw.toLowerCase();
  return (lower.charAt(0).toUpperCase() + lower.slice(1)) as Term;
}

function headingText($: cheerio.CheerioAPI, el: cheerio.Element): string {
  return $(el).text().replace(/\s+/g, ' ').trim();
}

export const extract: CourseExtractor = (pages) =>
  pages.map((page): ExtractedOffering => {
    const $ = cheerio.load(page.html);
    const bodyText = $('body').text();

    // Term + year from the standalone "<Season> <Year>" heading.
    let term: { season: Term; year: number } | null = null;
    $('h1, h2, h3, h4').each((_, el) => {
      if (term) return;
      const m = headingText($, el).match(TERM_HEADING_RE);
      if (m) term = { season: asTerm(m[1]), year: Number(m[2]) };
    });
    if (!term) {
      throw new Error(`stanford-cs229: no "<Season> <Year>" heading found on ${page.url}`);
    }

    // Instructors: only names under the "Instructor(s)" heading, up to the next heading.
    const instructors: { name: string; role?: string }[] = [];
    $('h1, h2, h3, h4').each((_, el) => {
      if (!/^Instructors?$/i.test(headingText($, el))) return;
      $(el)
        .nextUntil('h1, h2, h3, h4')
        .find('.instructor')
        .each((_, card) => {
          const name = $(card).find('div').last().text().replace(/\s+/g, ' ').trim();
          if (name) instructors.push({ name, role: 'instructor' });
        });
    });

    const offering: ExtractedOffering = {
      course: 'stanford-cs229',
      year: term.year,
      term: term.season,
      instructors,
      frameworks: [],
      sources: [{ url: page.url, type: page.source }],
    };

    if (/Final Project/i.test(bodyText)) {
      offering.project = { type: 'final-project', title: 'Final Project' };
    }
    return offering;
  });
