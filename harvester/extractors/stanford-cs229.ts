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

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

// "September 22, 2025" / "Jan 6, 2025" -> "2025-09-22". Returns undefined if the
// cell isn't a recognisable date (blank rows, merged header cells).
function toIsoDate(raw: string): string | undefined {
  const m = raw.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(20\d{2})/);
  if (!m) return undefined;
  const mm = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!mm) return undefined;
  return `${m[3]}-${mm}-${m[2].padStart(2, '0')}`;
}

// CS229's modern pages carry the full lecture schedule inline in a 4-column table
// (Date | Session | Topic | Details). We keep dated rows with a real Topic and use
// the Topic as the entry title; auxiliary "TBD" discussion rows are dropped. Pages
// early in the term (e.g. the Summer 2026 homepage) have no such table, so the
// schedule is simply omitted.
function extractSchedule($: cheerio.CheerioAPI): { date?: string; title: string }[] {
  const schedule: { date?: string; title: string }[] = [];
  $('table').each((_, table) => {
    const rows = $(table).find('tr');
    if (rows.length < 2) return;
    const headers = $(rows[0]).find('th, td').map((_, c) => $(c).text().trim().toLowerCase()).get();
    const dateCol = headers.indexOf('date');
    const topicCol = headers.indexOf('topic');
    if (dateCol === -1 || topicCol === -1) return;
    rows.slice(1).each((_, row) => {
      const cells = $(row).find('td, th');
      const date = toIsoDate($(cells[dateCol]).text().replace(/\s+/g, ' ').trim());
      const title = $(cells[topicCol]).text().replace(/\s+/g, ' ').trim();
      if (!date || !title || title.toUpperCase() === 'TBD') return;
      schedule.push({ date, title });
    });
  });
  return schedule;
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

    const schedule = extractSchedule($);
    if (schedule.length > 0) offering.schedule = schedule;

    return offering;
  });
