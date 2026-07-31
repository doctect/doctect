import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'fs';

const projects = [
  { dir: 'gallery-samples/09-adventure-gamebook', slug: 'adventure-gamebook',
    shots: [['Cover Plate', 'cover'], ['Adventure Section', 'section'], ['Ending Page', 'ending'], ['Tracking Sheet', 'tracking'], ['Story Map Sheet', 'story_map'], ['Authoring Hub', 'hub']] },
  { dir: 'gallery-samples/10-trivia-quiz-night', slug: 'trivia-quiz-night',
    shots: [['Quiz Cover', 'cover'], ['Round Hub', 'round'], ['Question Card', 'question'], ['Answer Card', 'answer'], ['Score Sheet', 'score'], ['Host Kit Hub', 'hub']] },
  { dir: 'gallery-samples/11-chess-opening-repertoire', slug: 'chess-opening-repertoire',
    shots: [['Atlas Cover', 'cover'], ['Repertoire Hub', 'repertoire'], ['Chapter Opener', 'chapter'], ['Position Page', 'position'], ['Line Worksheet', 'worksheet'], ['Practice Hub', 'hub']] },
  { dir: 'gallery-samples/12-family-history-workbook', slug: 'family-history-workbook',
    shots: [['Workbook Cover', 'cover'], ['Pedigree Chart', 'chart'], ['Person Page', 'person'], ['Family Group Sheet', 'group'], ['Story Prompts', 'prompts'], ['Research Ledger', 'research']] },
  { dir: 'gallery-samples/13-language-learning-lab', slug: 'language-learning-lab',
    shots: [['Lab Cover', 'cover'], ['Deck Hub', 'deck'], ['Card Front', 'front'], ['Card Back', 'back'], ['Grammar Sheet', 'grammar'], ['Drill Sheet', 'drill']] },
  { dir: 'gallery-samples/14-job-search-hq', slug: 'job-search-hq',
    shots: [['Tracker Cover', 'cover'], ['Pipeline Board', 'pipeline'], ['Company Dossier', 'dossier'], ['Star Story Sheet', 'star'], ['Offer Comparison', 'comparison'], ['Weekly Review Sheet', 'review']] },
  { dir: 'gallery-samples/15-garden-almanac', slug: 'garden-almanac',
    shots: [['Almanac Cover', 'cover'], ['Bed Map', 'bed'], ['Month Spread', 'month'], ['Plant Card', 'plant'], ['Plant Index', 'index'], ['Harvest Ledger', 'harvest']] },
  { dir: 'gallery-samples/16-reading-journal', slug: 'reading-journal',
    shots: [['Room Cover', 'cover'], ['Bookshelf', 'shelf'], ['Book Page', 'book'], ['Quote Leaf', 'quote'], ['Series Ledger', 'series'], ['Wrap Up Sheet', 'wrapup']] },
  { dir: 'gallery-samples/17-home-owners-manual', slug: 'home-owners-manual',
    shots: [['Manual Cover', 'cover'], ['Home Dashboard', 'dashboard'], ['Room Page', 'room'], ['System Page', 'system'], ['Appliance Card', 'appliance'], ['Season Checklist', 'season']] },
  { dir: 'gallery-samples/18-music-practice-studio', slug: 'music-practice-studio',
    shots: [['Shed Cover', 'cover'], ['Repertoire Rack', 'rack'], ['Piece Page', 'piece'], ['Session Log', 'session'], ['Chord Sheet', 'chord'], ['Gig Planner', 'gig']] },
  { dir: 'gallery-samples/19-astronomy-observation-log', slug: 'astronomy-observation-log',
    shots: [['Dome Cover', 'cover'], ['Month Sky', 'month'], ['Target Card', 'target'], ['Observation Sheet', 'observation'], ['Life List', 'lifelist'], ['Observatory Hub', 'hub']] },
  { dir: 'gallery-samples/20-habit-quest-rpg', slug: 'habit-quest-rpg',
    shots: [['Ledger Cover', 'cover'], ['Character Sheet', 'character'], ['Skill Tree', 'tree'], ['Daily Quest', 'daily'], ['Boss Battle', 'boss'], ['Trophy Hall', 'trophy']] },
].filter(p => existsSync(p.dir)).filter(p => !process.argv[2] || p.slug === process.argv[2]);

if (projects.length === 0) {
  console.log('no expansion products found');
  process.exit(0);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2, acceptDownloads: true });
const p = await ctx.newPage();
p.on('dialog', d => d.accept()); // accept the Replace Current Project confirm

for (const proj of projects) {
  const out = `${proj.dir}/samples`;
  mkdirSync(out, { recursive: true });
  const t = readFileSync(`${proj.dir}/templates.js`, 'utf8');
  const h = readFileSync(`${proj.dir}/hierarchy.js`, 'utf8');

  await p.goto('http://localhost:3002/app', { waitUntil: 'load' });
  await p.getByRole('button', { name: /^Generator/i }).first().click();
  await p.waitForTimeout(400);
  await p.evaluate(({ t, h }) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    const tas = [...document.querySelectorAll('textarea')].filter(e => e.className.includes('caret-white'));
    setter.call(tas[0], t); tas[0].dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(tas[1], h); tas[1].dispatchEvent(new Event('input', { bubbles: true }));
  }, { t, h });
  // Current generator flow: Preview (sandbox) -> visual preview modal -> Replace Current Project (+confirm)
  await p.getByRole('button', { name: 'Preview', exact: true }).click();
  await p.getByRole('button', { name: /Replace Current Project/i }).click({ timeout: 120000 });
  await p.waitForTimeout(2600);

  // PNG samples (Templates view)
  await p.getByText('Templates', { exact: true }).click();
  await p.waitForTimeout(300);
  let n = 1;
  for (const [tab, label] of proj.shots) {
    await p.getByText(tab, { exact: true }).first().click();
    await p.waitForTimeout(400);
    const clip = await p.evaluate(() => {
      const els = [...document.querySelectorAll('[data-element-id]')];
      if (!els.length) return null;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const e of els) { const r = e.getBoundingClientRect(); x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
      const m = 12; return { x: Math.max(0, x0 - m), y: Math.max(0, y0 - m), width: (x1 - x0) + 2 * m, height: (y1 - y0) + 2 * m };
    });
    const file = `${out}/${String(n).padStart(2, '0')}_${label}.png`;
    await p.screenshot({ path: file, clip });
    n++;
  }

  // PDF export
  const [download] = await Promise.all([
    p.waitForEvent('download', { timeout: 300000 }),
    p.getByRole('button', { name: /Export PDF/i }).click(),
  ]);
  await download.saveAs(`${out}/${proj.slug}.pdf`);
  console.log(`${proj.slug}: ${n - 1} PNGs + PDF`);
}

await browser.close();
