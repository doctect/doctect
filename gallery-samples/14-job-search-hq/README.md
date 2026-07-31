# Offer Track

A job-search command center for reMarkable Paper Pro. Every company gets a dossier, every dossier reports to one pipeline board with five stage bands and a writable stage column, and the prep bank holds six STAR story sheets, a two-page question bank, and an ask bank so interview day is a re-read, not a scramble. Contact ledgers, chained weekly reviews, and a four-column offer matrix close the loop.

## Why you'll like it

- **One board over everything.** The pipeline board enumerates every dossier as a tappable chip under Wishlist / Applied / Interviewing / Offer / Closed bands – and its STAGE column is writable, because the board should hold the truth, not pretend to know it.
- **Dossiers that carry their own prep.** Each dossier has a role/source/salary header, a five-step stage timeline, a next-action box, contact rows, and always-labelled chips straight to the question bank, the ask bank, and the contact log.
- **A prep bank you fill once.** Six STAR worksheets (Situation / Task / Action / Result, with a question-it-answers box), ten real interview questions with answer-sketch space, and six genuinely good questions to ask interviewers.
- **A worked example that shows the whole system.** A dossier filled end to end for the fictional Meridian Data Co. and one finished STAR story, both clearly marked EXAMPLE with a skip link to your live workspace.
- **An honest endgame.** Four offer columns crossed with base, bonus, equity, benefits, growth, and the gut call – plus a decision box that demands one sentence of why.

## Workflow

1. Read the briefing, then flip through the Meridian dossier and the finished STAR story.
2. When a company gets interesting, open a blank dossier: role, source, salary, next action.
3. Find it on the pipeline board, write the company on its line and its true stage in the STAGE column.
4. Bank six STAR stories once; sketch question answers before every loop; tick asks as they are answered.
5. Log every human in the contact ledger and close each week with a review sheet.
6. When paper arrives, take the endgame to the offer matrix and write the deciding sentence.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { dossierCount: 10, reviewWeeks: 8 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `dossierCount` | 4-16 | Blank company dossiers wired to the pipeline board |
| `reviewWeeks` | 4-16 | Chained weekly review sheets |

Unsupported values fail with a clear `Offer Track config` error.

## Inventory

Default configuration exports 39 pages:

- 1 cover and 1 briefing
- 1 worked-example desk with the filled Meridian Data Co. dossier and a finished STAR story, all EXAMPLE-labelled
- 1 Search HQ hub and 1 pipeline board (16 slot rows across five stage bands; rows past `dossierCount` print blank)
- 10 blank company dossiers, each already on the board via reference nodes
- 6 STAR story sheets, 2 question bank pages (10 authored questions), 1 ask bank (6 authored asks)
- 4 contact ledger pages (8-row table each) and 1 offer matrix (4 offers × 6 factors)
- 8 weekly review sheets chained prev/next

Minimum configuration (`dossierCount: 4, reviewWeeks: 4`) exports 29 pages; maximum exports 53.

## Navigation

- Cover (full-page tap and CTA) -> `start_here`
- Briefing -> worked example, Search HQ, `pipeline_board`, `prep_questions`, `comparison_sheet`, `review_w01`
- Search HQ desk chips -> pipeline board, STAR stories, question/ask banks, contacts, matrix, reviews by stable id; the worked-example hub's two slot chips (`child_index` 0/1) open its dossier and story
- Pipeline board slot chips -> the dossiers via reference-node children (`child_index` 0-15; slots past `dossierCount` bind `''` and vanish)
- Dossier prep chips -> `prep_questions` / `prep_asks` / `contacts_01` (always labelled); prev/next dossiers chain with `sibling` links whose end-of-run labels bind `''`
- STAR sheets, question bank pages, contact pages, and weekly reviews chain with `sibling` links; every dead end binds `''`
- Every page's footer returns to its hub (`parent`) and most carry a `PIPELINE »` or matrix shortcut
- The worked example shows **EXAMPLE** chrome with a working skip link to the blank workspace

## Visual And Border Construction

Original cover artwork (dossier sheet, briefcase, five-node pipeline run) and the mini briefcase mark were newly authored for this product. Navy `#23364c` carries the command bar, footer band, table heads, and primary text; steel `#7d9ab5` carries the accent rail, stage stubs, and highlights; paper `#f0f2f5` is the page ground with near-white `#fafbfc` writable cells – the tones stay distinct in grayscale. The chrome is a full-width navy command bar with a steel accent rail, five stage tally stubs, and a solid navy footer band – tabular and ledger-like, geometrically unlike the spines, frames, and mastheads of products 09-13. Every table (pipeline stage cells, contact ledger, offer matrix, ask ticks) is explicit bordered rects; the product uses no grid elements.

## Publishing

Suggested tags: `job-search, career, interviews, planner, tracker, work`

Suggested preview pages (six, by template tab): Tracker Cover, Pipeline Board, Company Dossier, Star Story Sheet, Offer Comparison, Weekly Review Sheet.
