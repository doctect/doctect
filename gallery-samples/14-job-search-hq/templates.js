const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  navy: '#23364c',      // command ink: bands, frames, primary text
  navyDeep: '#16283c',  // pressed table headers
  steel: '#7d9ab5',     // stage accent: ticks, rules, highlights
  steelDeep: '#3f5a76', // tap-target text
  paper: '#f0f2f5',     // page ground
  card: '#fafbfc',      // writable cells and plates
  inkSoft: '#5c6670',   // secondary text
  rule: '#c3ccd6',      // fine table rules
  mist: '#aebfd2',      // masthead text on navy
};

let elementSequence = 0;
const elementId = (templateId, role) => `${templateId}_${role}_${String(++elementSequence).padStart(3, '0')}`;

const base = (templateId, role, type, x, y, w, h, extra = {}) => ({
  id: elementId(templateId, role),
  type,
  x,
  y,
  w,
  h,
  rotation: 0,
  fill: '',
  stroke: '',
  strokeWidth: 0,
  opacity: 1,
  ...extra,
});

const rect = (templateId, role, x, y, w, h, fill, extra = {}) =>
  base(templateId, role, 'rect', x, y, w, h, { fill, ...extra });

const text = (templateId, role, x, y, w, h, value, extra = {}) =>
  base(templateId, role, 'text', x, y, w, h, {
    text: value,
    fontSize: 11,
    fontFamily: 'helvetica',
    textColor: COLORS.navy,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const label = (templateId, role, x, y, w, value, extra = {}) =>
  text(templateId, role, x, y, w, 12, value, {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.steelDeep,
    characterSpacing: 1.6,
    align: 'left',
    ...extra,
  });

const writingLines = (templateId, role, x, y, w, h, spacing = 24) =>
  rect(templateId, role, x, y, w, h, COLORS.rule, {
    fillType: 'pattern',
    patternType: 'lines-h',
    patternSpacing: spacing,
    patternWeight: 0.8,
  });

const bandHead = (templateId, role, x, y, w, name, hint) => [
  rect(templateId, `${role}_band`, x, y, w, 18, COLORS.navy),
  text(templateId, `${role}_name`, x + 8, y + 3, 160, 12, name, {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.card,
    characterSpacing: 1.8,
    align: 'left',
  }),
  text(templateId, `${role}_hint`, x + w - 248, y + 3, 240, 12, hint, {
    fontSize: 6.5,
    fontWeight: 'bold',
    textColor: COLORS.mist,
    characterSpacing: 1,
    align: 'right',
  }),
];

// --- Original artwork -------------------------------------------------------

const coverArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260">
  <g id="ledger_columns" stroke="#c3ccd6" stroke-width="1" fill="none">
    <path d="M64 12 V196"/><path d="M124 12 V196"/><path d="M184 12 V196"/><path d="M244 12 V196"/>
  </g>
  <g id="dossier_sheet">
    <rect x="26" y="30" width="128" height="164" fill="#fafbfc" stroke="#23364c" stroke-width="4" stroke-linejoin="round"/>
    <rect x="26" y="30" width="128" height="24" fill="#23364c"/>
    <circle cx="40" cy="42" r="4" fill="#7d9ab5"/>
    <g stroke="#23364c" stroke-width="3" stroke-linecap="round">
      <path d="M42 74 H138"/><path d="M42 92 H120"/><path d="M42 110 H130"/>
    </g>
    <g stroke="#7d9ab5" stroke-width="3" stroke-linecap="round">
      <path d="M42 134 H96"/><path d="M42 152 H108"/>
    </g>
    <rect x="42" y="166" width="14" height="14" fill="none" stroke="#23364c" stroke-width="3"/>
    <path d="M45 173 L48 177 L54 168" fill="none" stroke="#23364c" stroke-width="3" stroke-linecap="round"/>
  </g>
  <g id="briefcase">
    <rect x="186" y="66" width="88" height="64" rx="7" fill="#f0f2f5" stroke="#23364c" stroke-width="4.5"/>
    <path d="M214 66 V54 Q214 48 220 48 H240 Q246 48 246 54 V66" fill="none" stroke="#23364c" stroke-width="4.5"/>
    <path d="M186 92 H274" stroke="#23364c" stroke-width="3"/>
    <rect x="222" y="86" width="16" height="12" rx="2" fill="#7d9ab5" stroke="#23364c" stroke-width="3"/>
  </g>
  <path id="carry_line" d="M158 118 Q172 118 182 104" fill="none" stroke="#7d9ab5" stroke-width="2.4" stroke-dasharray="1 6" stroke-linecap="round"/>
  <g id="pipeline_run">
    <path d="M36 228 H264" stroke="#23364c" stroke-width="3"/>
    <g fill="#fafbfc" stroke="#23364c" stroke-width="3.5">
      <circle cx="48" cy="228" r="9"/><circle cx="100" cy="228" r="9"/><circle cx="152" cy="228" r="9"/><circle cx="256" cy="228" r="9"/>
    </g>
    <circle cx="204" cy="228" r="12" fill="#7d9ab5" stroke="#23364c" stroke-width="3.5"/>
    <circle cx="204" cy="228" r="4" fill="#fafbfc"/>
  </g>
</svg>`;

const caseMarkArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 22">
  <rect x="2" y="7" width="24" height="13" rx="2.5" fill="none" stroke="#23364c" stroke-width="2.2"/>
  <path d="M10 7 V4.5 Q10 3 11.5 3 H16.5 Q18 3 18 4.5 V7" fill="none" stroke="#23364c" stroke-width="2.2"/>
  <path d="M2 12.5 H26" stroke="#23364c" stroke-width="1.6"/>
  <rect x="11.5" y="10.5" width="5" height="4" fill="#7d9ab5"/>
</svg>`;

// --- Shared command-desk chrome ---------------------------------------------
// A solid navy command bar spans the full top edge (EXAMPLE and skip bindings
// print inside it in light ink), a steel accent rail runs beneath it with five
// stage tally stubs, a mini briefcase mark hangs at the right, and a solid navy
// footer band carries the folio and footer links. Tabular, ledger-like, and
// geometrically unlike the spines, frames, and mastheads of products 09-13.

const pageBase = (templateId) => [
  rect(templateId, 'ground', 0, 0, W, H, COLORS.paper),
  rect(templateId, 'command_bar', 0, 0, W, 30, COLORS.navy),
  text(templateId, 'example', 36, 8, 120, 14, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.card,
    characterSpacing: 1.5,
    align: 'left',
  }),
  text(templateId, 'masthead_word', 178, 8, 150, 14, 'OFFER TRACK', {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.mist,
    characterSpacing: 2.8,
    align: 'center',
  }),
  text(templateId, 'skip', 336, 8, 137, 14, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.card,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  rect(templateId, 'accent_rail', 0, 32, W, 2.5, COLORS.steel),
  rect(templateId, 'stage_stub_1', 36, 38, 14, 4, COLORS.navy),
  rect(templateId, 'stage_stub_2', 58, 38, 14, 4, COLORS.steel),
  rect(templateId, 'stage_stub_3', 80, 38, 14, 4, COLORS.navy),
  rect(templateId, 'stage_stub_4', 102, 38, 14, 4, COLORS.steel),
  rect(templateId, 'stage_stub_5', 124, 38, 14, 4, COLORS.navy),
  svg(templateId, 'case_mark', 445, 36, 28, 22, caseMarkArt),
  rect(templateId, 'foot_band', 0, 652, W, 27, COLORS.navy),
];

const folio = (templateId) =>
  text(templateId, 'folio', 180, 659, 150, 14, 'OFFER TRACK', {
    fontSize: 7,
    fontWeight: 'bold',
    textColor: COLORS.mist,
    characterSpacing: 2.4,
    align: 'center',
  });

const footerLink = (templateId, role, x, w, value, align, link) =>
  text(templateId, role, x, 658, w, 16, value, {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.card,
    align,
    ...link,
  });

const pageTitle = (templateId, value, extra = {}) =>
  text(templateId, 'page_title', 36, 50, 437, 26, value, {
    fontFamily: 'georgia',
    fontSize: 18,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    align: 'left',
    ...extra,
  });

const subtitle = (templateId, value) =>
  text(templateId, 'subtitle', 36, 80, 437, 15, value, {
    fontSize: 9,
    textColor: COLORS.inkSoft,
    align: 'left',
  });

// --- Templates --------------------------------------------------------------

const cover = {
  id: 'cover',
  name: 'Tracker Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'ground', 0, 0, W, H, COLORS.paper),
    base('cover', 'tap_anywhere', 'rect', 0, 0, W, H, {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    rect('cover', 'top_field', 0, 0, W, 138, COLORS.navy),
    text('cover', 'kicker', 54, 28, 401, 14, 'A COMMAND CENTER FOR THE JOB SEARCH', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 2.2,
      align: 'center',
    }),
    text('cover', 'title', 54, 48, 401, 58, 'Offer Track', {
      fontFamily: 'georgia',
      fontSize: 42,
      fontWeight: 'bold',
      textColor: COLORS.card,
      align: 'center',
    }),
    rect('cover', 'top_rail', 0, 138, W, 3, COLORS.steel),
    rect('cover', 'plate', 76, 168, 357, 330, COLORS.card, {
      stroke: COLORS.navy,
      strokeWidth: 1.5,
    }),
    rect('cover', 'plate_inner', 84, 176, 341, 314, '', {
      stroke: COLORS.rule,
      strokeWidth: 0.8,
    }),
    svg('cover', 'cover_art', 104, 194, 300, 260, coverArt),
    text('cover', 'plate_caption', 96, 462, 317, 12, 'WISHLIST · APPLIED · INTERVIEWING · OFFER · CLOSED', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1.2,
      align: 'center',
    }),
    text('cover', 'sub', 96, 514, 317, 60, 'A dossier for every company, one pipeline board over all of them, a prep bank of STAR stories and interview questions, weekly reviews, and an offer matrix for the endgame – pre-linked and ready to write in.', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.navy,
      align: 'center',
      verticalAlign: 'top',
    }),
    text('cover', 'open_cta', 159, 584, 190, 36, 'Open the briefing »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.card,
      fill: COLORS.navy,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'imprint', 96, 638, 317, 12, 'PIPELINE · DOSSIERS · PREP · OFFERS', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1.8,
      align: 'center',
    }),
  ],
};

const start = {
  id: 'start',
  name: 'Field Guide',
  width: W,
  height: H,
  elements: [
    ...pageBase('start'),
    pageTitle('start', '{{title}}'),
    text('start', 'premise', 36, 84, 437, 56, 'Offer Track treats your search like the operation it is. Every company gets a dossier, every dossier reports to one pipeline board, and the prep bank holds your STAR stories and question sheets so interview day is a re-read, not a scramble.', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.navy,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'howto_label', 36, 148, 220, 'HOW TO RUN THE SEARCH'),
    text('start', 'howto_steps', 36, 164, 437, 112, "1. Open a blank dossier when a company gets interesting – write the role, the source, the money.\n2. Put it on the pipeline board and write its true stage in the STAGE column.\n3. Bank six STAR stories once; sketch answers in the question bank before every loop.\n4. Log every human in the contact ledger – warm intros beat cold applies.\n5. Close each week with a review, and settle the endgame on the offer matrix.", {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.navy,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'desks_label', 36, 288, 220, 'THE DESKS'),
    text('start', 'example_chip', 36, 304, 212, 34, 'Worked example »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.navy,
      fill: COLORS.card,
      stroke: COLORS.navy,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    text('start', 'hq_chip', 261, 304, 212, 34, 'Your search HQ »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.card,
      fill: COLORS.navy,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
    text('start', 'pipeline_chip', 36, 346, 212, 34, 'Pipeline board »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.navy,
      fill: COLORS.card,
      stroke: COLORS.navy,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'pipeline_board',
    }),
    text('start', 'prep_chip', 261, 346, 212, 34, 'Prep bank »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.navy,
      fill: COLORS.card,
      stroke: COLORS.navy,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'prep_questions',
    }),
    text('start', 'matrix_chip', 36, 388, 212, 34, 'Offer matrix »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.navy,
      fill: COLORS.card,
      stroke: COLORS.navy,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'comparison_sheet',
    }),
    text('start', 'reviews_chip', 261, 388, 212, 34, 'Weekly reviews »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.navy,
      fill: COLORS.card,
      stroke: COLORS.navy,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'review_w01',
    }),
    label('start', 'board_label', 36, 442, 300, 'HOW THE BOARD STAYS HONEST'),
    text('start', 'board_note', 36, 458, 437, 64, 'The board lists every dossier under five stage bands – Wishlist, Applied, Interviewing, Offer, Closed. Chips fill the bands top to bottom as you open dossiers; the STAGE column beside each chip is where you write where things truly stand. The board never pretends to know.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.navy,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'notes_label', 36, 532, 200, 'STANDING ORDERS'),
    writingLines('start', 'notes_lines', 36, 548, 437, 88, 22),
    footerLink('start', 'back_link', 36, 150, '« Cover', 'left', { linkTarget: 'parent' }),
    folio('start'),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Search Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace'),
    pageTitle('workspace', '{{title}}'),
    text('workspace', 'hero', 36, 84, 437, 44, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.navy,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'note', 36, 130, 437, 28, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'worked_label', 36, 166, 260, 'ON THIS DESK'),
    text('workspace', 'slot_a_chip', 36, 182, 212, 32, '{{slot_a_label}}', {
      dataBinding: 'slot_a_label',
      fontFamily: 'georgia',
      fontSize: 11.5,
      fontWeight: 'bold',
      textColor: COLORS.steelDeep,
      align: 'left',
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    text('workspace', 'slot_b_chip', 261, 182, 212, 32, '{{slot_b_label}}', {
      dataBinding: 'slot_b_label',
      fontFamily: 'georgia',
      fontSize: 11.5,
      fontWeight: 'bold',
      textColor: COLORS.steelDeep,
      align: 'left',
      linkTarget: 'child_index',
      linkValue: '1',
    }),
    label('workspace', 'desks_label', 36, 226, 260, 'THE DESKS'),
    ...[
      ['pipeline', 'pipeline_label'],
      ['stars', 'stars_label'],
      ['questions', 'questions_label'],
      ['asks', 'asks_label'],
      ['contacts', 'contacts_label'],
      ['comparison', 'comparison_label'],
      ['reviews', 'reviews_label'],
    ].map(([role, labelField], index) =>
      text('workspace', `${role}_chip`, index % 2 === 0 ? 36 : 261, 242 + Math.floor(index / 2) * 40, 212, 32, `{{${labelField}}}`, {
        dataBinding: labelField,
        fontFamily: 'georgia',
        fontSize: 11,
        fontWeight: 'bold',
        textColor: COLORS.steelDeep,
        align: 'left',
        linkTarget: 'specific_node',
        linkValue: {
          pipeline: 'pipeline_board',
          stars: 'star_01',
          questions: 'prep_questions',
          asks: 'prep_asks',
          contacts: 'contacts_01',
          comparison: 'comparison_sheet',
          reviews: 'review_w01',
        }[role],
      })),
    label('workspace', 'wiring_label', 36, 414, 300, 'HOW THE WIRING WORKS'),
    text('workspace', 'wiring_note', 36, 430, 437, 56, 'Every dossier is already on the pipeline board, every dossier carries chips to the question and ask banks, and the weekly reviews chain into one another. Write in the pages – the navigation was finished before you started.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.navy,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'notes_label', 36, 498, 200, 'DESK NOTES'),
    writingLines('workspace', 'notes_lines', 36, 514, 437, 120, 24),
    footerLink('workspace', 'back_link', 36, 150, '« The briefing', 'left', { linkTarget: 'parent' }),
    folio('workspace'),
    footerLink('workspace', 'pipeline_link', 333, 140, 'PIPELINE »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'pipeline_board',
    }),
  ],
};

// Pipeline board: sixteen dossier rows distributed across the five stage bands.
// Chips bind slot_1..slot_16 labels over child_index 0..15 (labels bind '' past
// the configured dossier count, so those rows print as blank writable lines).
const PIPELINE_BANDS = [
  ['WISHLIST', 'TARGETS TO CHASE', 4],
  ['APPLIED', 'APPLICATION OUT', 4],
  ['INTERVIEWING', 'IN THE LOOP', 3],
  ['OFFER', 'PAPER IN HAND', 2],
  ['CLOSED', 'REJECTED · WITHDREW · DONE', 3],
];

const pipelineRows = () => {
  const elements = [];
  let slot = 0;
  let y = 122;
  PIPELINE_BANDS.forEach(([name, hint, rowCount], bandIndex) => {
    elements.push(...bandHead('pipeline', `band_${bandIndex + 1}`, 36, y, 437, name, hint));
    y += 18;
    for (let row = 0; row < rowCount; row += 1) {
      slot += 1;
      elements.push(
        text('pipeline', `slot_no_${slot}`, 40, y + 5, 18, 12, String(slot).padStart(2, '0'), {
          fontSize: 7,
          fontWeight: 'bold',
          textColor: COLORS.inkSoft,
          align: 'left',
        }),
        text('pipeline', `slot_chip_${slot}`, 62, y + 2, 94, 20, `{{slot_${slot}_label}}`, {
          dataBinding: `slot_${slot}_label`,
          fontSize: 9,
          fontWeight: 'bold',
          textColor: COLORS.steelDeep,
          align: 'left',
          linkTarget: 'child_index',
          linkValue: String(slot - 1),
        }),
        rect('pipeline', `slot_company_rule_${slot}`, 162, y + 18, 178, 0.9, COLORS.rule),
        rect('pipeline', `slot_stage_cell_${slot}`, 350, y + 1, 123, 22, COLORS.card, {
          stroke: COLORS.rule,
          strokeWidth: 0.9,
        }),
      );
      y += 24;
    }
    y += 4;
  });
  return elements;
};

const pipeline = {
  id: 'pipeline',
  name: 'Pipeline Board',
  width: W,
  height: H,
  elements: [
    ...pageBase('pipeline'),
    pageTitle('pipeline', '{{title}}'),
    subtitle('pipeline', 'Tap a dossier chip to open it. Write the company on the line, the true stage in the box.'),
    label('pipeline', 'col_open', 62, 104, 90, 'OPEN'),
    label('pipeline', 'col_company', 162, 104, 120, 'COMPANY'),
    label('pipeline', 'col_stage', 350, 104, 123, 'STAGE · WRITE IT', { align: 'center' }),
    ...pipelineRows(),
    text('pipeline', 'board_note', 36, 618, 437, 26, 'Chips fill the bands top to bottom as you open dossiers – the STAGE column holds the truth, not the band a chip happens to sit in.', {
      fontSize: 8,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    footerLink('pipeline', 'back_link', 36, 150, '« Search HQ', 'left', { linkTarget: 'parent' }),
    folio('pipeline'),
    footerLink('pipeline', 'matrix_link', 333, 140, 'OFFER MATRIX »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'comparison_sheet',
    }),
  ],
};

const DOSSIER_STAGES = ['WISH', 'APPLIED', 'LOOP', 'OFFER', 'CLOSED'];

const dossier = {
  id: 'dossier',
  name: 'Company Dossier',
  width: W,
  height: H,
  elements: [
    ...pageBase('dossier'),
    pageTitle('dossier', '{{title}}'),
    label('dossier', 'role_label', 36, 82, 44, 'ROLE'),
    text('dossier', 'role', 84, 78, 389, 18, '{{role}}', {
      dataBinding: 'role',
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.navy,
      align: 'left',
    }),
    rect('dossier', 'role_rule', 84, 98, 389, 0.9, COLORS.rule),
    label('dossier', 'source_label', 36, 110, 58, 'SOURCE'),
    text('dossier', 'source', 100, 106, 148, 18, '{{source}}', {
      dataBinding: 'source',
      fontSize: 9,
      textColor: COLORS.navy,
      align: 'left',
    }),
    rect('dossier', 'source_rule', 100, 126, 148, 0.9, COLORS.rule),
    label('dossier', 'salary_label', 261, 110, 60, 'SALARY'),
    text('dossier', 'salary', 327, 106, 146, 18, '{{salary}}', {
      dataBinding: 'salary',
      fontSize: 9,
      textColor: COLORS.navy,
      align: 'left',
    }),
    rect('dossier', 'salary_rule', 327, 126, 146, 0.9, COLORS.rule),
    label('dossier', 'timeline_label', 36, 140, 200, 'STAGE TIMELINE'),
    rect('dossier', 'timeline_wire', 52, 165, 352, 1.2, COLORS.steel),
    ...DOSSIER_STAGES.flatMap((stage, index) => [
      rect('dossier', `stage_box_${index + 1}`, 44 + index * 88, 158, 16, 16, COLORS.card, {
        stroke: COLORS.navy,
        strokeWidth: 1.1,
      }),
      text('dossier', `stage_mark_${index + 1}`, 44 + index * 88, 159, 16, 14, `{{stage_mark_${index + 1}}}`, {
        dataBinding: `stage_mark_${index + 1}`,
        fontSize: 10,
        fontWeight: 'bold',
        textColor: COLORS.navy,
        align: 'center',
      }),
      text('dossier', `stage_word_${index + 1}`, 24 + index * 88, 178, 56, 10, stage, {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.inkSoft,
        characterSpacing: 0.8,
        align: 'center',
      }),
    ]),
    label('dossier', 'action_label', 36, 198, 200, 'NEXT ACTION'),
    rect('dossier', 'action_box', 36, 214, 437, 62, COLORS.card, {
      stroke: COLORS.navy,
      strokeWidth: 1.1,
    }),
    text('dossier', 'next_action', 44, 220, 421, 50, '{{next_action}}', {
      dataBinding: 'next_action',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.navy,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('dossier', 'contacts_label', 36, 288, 200, 'PEOPLE INSIDE'),
    text('dossier', 'contact_1', 36, 304, 437, 16, '{{contact_1}}', {
      dataBinding: 'contact_1',
      fontSize: 9,
      textColor: COLORS.navy,
      align: 'left',
    }),
    rect('dossier', 'contact_rule_1', 36, 322, 437, 0.9, COLORS.rule),
    text('dossier', 'contact_2', 36, 330, 437, 16, '{{contact_2}}', {
      dataBinding: 'contact_2',
      fontSize: 9,
      textColor: COLORS.navy,
      align: 'left',
    }),
    rect('dossier', 'contact_rule_2', 36, 348, 437, 0.9, COLORS.rule),
    label('dossier', 'prep_label', 36, 362, 200, 'PREP DESK'),
    text('dossier', 'questions_chip', 36, 378, 212, 32, 'Question bank »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.navy,
      fill: COLORS.card,
      stroke: COLORS.navy,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'prep_questions',
    }),
    text('dossier', 'asks_chip', 261, 378, 212, 32, 'Asks to raise »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.navy,
      fill: COLORS.card,
      stroke: COLORS.navy,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'prep_asks',
    }),
    label('dossier', 'notes_label', 36, 424, 200, 'FIELD NOTES'),
    writingLines('dossier', 'notes_lines', 36, 440, 437, 152, 22),
    text('dossier', 'prev_chip', 36, 606, 160, 18, '{{dossier_prev_label}}', {
      dataBinding: 'dossier_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.steelDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('dossier', 'next_chip', 313, 606, 160, 18, '{{dossier_next_label}}', {
      dataBinding: 'dossier_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.steelDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('dossier', 'back_link', 36, 150, '« The hub', 'left', { linkTarget: 'parent' }),
    folio('dossier'),
    footerLink('dossier', 'pipeline_link', 333, 140, 'PIPELINE »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'pipeline_board',
    }),
  ],
};

const STAR_FRAMES = [
  ['situation', 'SITUATION', 'THE SETTING, IN ONE BREATH', 142, 64],
  ['task', 'TASK', 'WHAT WAS ON YOU, SPECIFICALLY', 236, 64],
  ['action', 'ACTION', 'WHAT YOU DID – VERBS, NOT WE', 330, 92],
  ['result', 'RESULT', 'THE NUMBER, THE CHANGE, THE PROOF', 452, 74],
];

const starStory = {
  id: 'star_story',
  name: 'Star Story Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('star_story'),
    pageTitle('star_story', '{{title}}'),
    label('star_story', 'question_label', 36, 82, 300, 'THE QUESTION IT ANSWERS'),
    rect('star_story', 'question_box', 36, 96, 437, 36, COLORS.card, {
      stroke: COLORS.navy,
      strokeWidth: 1.1,
    }),
    text('star_story', 'star_question', 44, 100, 421, 28, '{{star_question}}', {
      dataBinding: 'star_question',
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.navy,
      align: 'left',
    }),
    ...STAR_FRAMES.flatMap(([field, name, hint, y, boxH]) => [
      ...bandHead('star_story', `${field}_head`, 36, y, 437, name, hint),
      rect('star_story', `${field}_box`, 36, y + 18, 437, boxH, COLORS.card, {
        stroke: COLORS.rule,
        strokeWidth: 0.9,
      }),
      text('star_story', `star_${field}`, 44, y + 22, 421, boxH - 8, `{{star_${field}}}`, {
        dataBinding: `star_${field}`,
        fontFamily: 'georgia',
        fontSize: 9.5,
        textColor: COLORS.navy,
        verticalAlign: 'top',
        align: 'left',
      }),
    ]),
    text('star_story', 'rehearse_note', 36, 556, 437, 26, 'Rehearse it aloud at ninety seconds. If they are rushed, tell the result first and offer the rest.', {
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('star_story', 'prev_chip', 36, 606, 160, 18, '{{star_prev_label}}', {
      dataBinding: 'star_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.steelDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('star_story', 'next_chip', 313, 606, 160, 18, '{{star_next_label}}', {
      dataBinding: 'star_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.steelDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('star_story', 'back_link', 36, 150, '« The hub', 'left', { linkTarget: 'parent' }),
    folio('star_story'),
    footerLink('star_story', 'questions_link', 333, 140, 'QUESTIONS »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'prep_questions',
    }),
  ],
};

const questionBank = {
  id: 'question_bank',
  name: 'Question Bank',
  width: W,
  height: H,
  elements: [
    ...pageBase('question_bank'),
    pageTitle('question_bank', '{{title}}'),
    subtitle('question_bank', 'Sketch the shape of an answer – bullets and STAR pointers, never a script.'),
    ...[1, 2, 3, 4, 5].flatMap((n) => {
      const y = 104 + (n - 1) * 100;
      return [
        text('question_bank', `q_no_${n}`, 36, y + 2, 22, 14, String(n).padStart(2, '0'), {
          fontSize: 9,
          fontWeight: 'bold',
          textColor: COLORS.steel,
          align: 'left',
        }),
        text('question_bank', `q_text_${n}`, 62, y, 411, 32, `{{q${n}}}`, {
          dataBinding: `q${n}`,
          fontFamily: 'georgia',
          fontSize: 10.5,
          fontWeight: 'bold',
          textColor: COLORS.navy,
          verticalAlign: 'top',
          align: 'left',
        }),
        writingLines('question_bank', `q_lines_${n}`, 62, y + 36, 411, 54, 18),
      ];
    }),
    text('question_bank', 'prev_chip', 36, 616, 160, 18, '{{qb_prev_label}}', {
      dataBinding: 'qb_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.steelDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('question_bank', 'next_chip', 313, 616, 160, 18, '{{qb_next_label}}', {
      dataBinding: 'qb_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.steelDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('question_bank', 'back_link', 36, 150, '« Search HQ', 'left', { linkTarget: 'parent' }),
    folio('question_bank'),
    footerLink('question_bank', 'asks_link', 333, 140, 'ASK BANK »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'prep_asks',
    }),
  ],
};

const ASK_SECTIONS = [
  ['ABOUT THE WORK', 118, [
    'What would the first ninety days of this role look like, concretely?',
    'What is the hardest problem on this team right now, and why is it still open?',
  ]],
  ['ABOUT THE TEAM', 216, [
    'How does work actually get decided here – who says no, and how often?',
    'When someone leaves this team, what is usually the reason?',
  ]],
  ['ABOUT THE FUTURE', 314, [
    'How was the last person in this role promoted – what did that take?',
    'A year from now, what would make you say this hire was a great call?',
  ]],
];

const askBank = {
  id: 'ask_bank',
  name: 'Ask Bank',
  width: W,
  height: H,
  elements: [
    ...pageBase('ask_bank'),
    pageTitle('ask_bank', '{{title}}'),
    subtitle('ask_bank', 'Good questions are diligence – you are deciding too. Tick each ask once it has been answered.'),
    ...ASK_SECTIONS.flatMap(([name, y, asks]) => [
      label('ask_bank', `${name.toLowerCase().replace(/[^a-z]+/g, '_')}_label`, 36, y, 260, name),
      ...asks.flatMap((ask, index) => [
        rect('ask_bank', `${name.toLowerCase().replace(/[^a-z]+/g, '_')}_tick_${index + 1}`, 36, y + 18 + index * 38, 12, 12, COLORS.card, {
          stroke: COLORS.navy,
          strokeWidth: 1,
        }),
        text('ask_bank', `${name.toLowerCase().replace(/[^a-z]+/g, '_')}_ask_${index + 1}`, 58, y + 14 + index * 38, 415, 32, ask, {
          fontFamily: 'georgia',
          fontSize: 10,
          textColor: COLORS.navy,
          verticalAlign: 'top',
          align: 'left',
        }),
      ]),
    ]),
    label('ask_bank', 'answers_label', 36, 412, 320, 'ANSWERS WORTH KEEPING'),
    writingLines('ask_bank', 'answers_lines', 36, 428, 437, 88, 22),
    label('ask_bank', 'own_label', 36, 530, 200, 'YOUR OWN ASKS'),
    writingLines('ask_bank', 'own_lines', 36, 546, 437, 88, 22),
    footerLink('ask_bank', 'back_link', 36, 150, '« Search HQ', 'left', { linkTarget: 'parent' }),
    folio('ask_bank'),
    footerLink('ask_bank', 'questions_link', 333, 140, 'QUESTIONS »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'prep_questions',
    }),
  ],
};

const CONTACT_COLS = [
  ['NAME', 36, 118],
  ['COMPANY', 154, 106],
  ['HOW WE KNOW', 260, 120],
  ['LAST TOUCH', 380, 93],
];

const contacts = {
  id: 'contacts',
  name: 'Contact Ledger',
  width: W,
  height: H,
  elements: [
    ...pageBase('contacts'),
    pageTitle('contacts', '{{title}}'),
    subtitle('contacts', 'A warm intro beats a cold apply – log every touch, and give before you ask.'),
    ...CONTACT_COLS.map(([name, x, w]) =>
      rect('contacts', `head_${name.toLowerCase().replace(/[^a-z]+/g, '_')}`, x, 104, w, 22, COLORS.navyDeep)),
    ...CONTACT_COLS.map(([name, x, w]) =>
      text('contacts', `head_word_${name.toLowerCase().replace(/[^a-z]+/g, '_')}`, x + 7, 108, w - 14, 14, name, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.mist,
        characterSpacing: 1.2,
        align: 'left',
      })),
    ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap(row =>
      CONTACT_COLS.map(([name, x, w]) =>
        rect('contacts', `cell_${name.toLowerCase().replace(/[^a-z]+/g, '_')}_${row + 1}`, x, 126 + row * 56, w, 56, COLORS.card, {
          stroke: COLORS.navy,
          strokeWidth: 0.8,
        }))),
    text('contacts', 'ledger_note', 36, 584, 437, 14, 'One row per person. When a row fills up, that relationship deserves its own page of notes.', {
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    text('contacts', 'prev_chip', 36, 616, 160, 18, '{{ct_prev_label}}', {
      dataBinding: 'ct_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.steelDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('contacts', 'next_chip', 313, 616, 160, 18, '{{ct_next_label}}', {
      dataBinding: 'ct_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.steelDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('contacts', 'back_link', 36, 150, '« Search HQ', 'left', { linkTarget: 'parent' }),
    folio('contacts'),
  ],
};

const COMPARISON_ROWS = [
  ['BASE SALARY', 'the number on the letter'],
  ['BONUS · VARIABLE', 'target and how real it is'],
  ['EQUITY · VESTING', 'grant, schedule, cliff'],
  ['BENEFITS · TIME OFF', 'health, leave, retirement'],
  ['GROWTH · TRAJECTORY', 'who you become there'],
  ['THE GUT CALL', 'the feeling you keep denying'],
];

const comparison = {
  id: 'comparison',
  name: 'Offer Comparison',
  width: W,
  height: H,
  elements: [
    ...pageBase('comparison'),
    pageTitle('comparison', '{{title}}'),
    subtitle('comparison', 'One column per offer – write the company in the header, then fill the rows straight across.'),
    rect('comparison', 'head_factor', 36, 104, 114, 30, COLORS.navyDeep),
    text('comparison', 'head_factor_word', 43, 112, 100, 14, 'FACTOR', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 1.4,
      align: 'left',
    }),
    ...[0, 1, 2, 3].map(col =>
      rect('comparison', `head_offer_${col + 1}`, 150 + col * 80.75, 104, 80.75, 30, COLORS.card, {
        stroke: COLORS.navy,
        strokeWidth: 1,
      })),
    ...[0, 1, 2, 3].map(col =>
      text('comparison', `head_offer_word_${col + 1}`, 154 + col * 80.75, 108, 72, 10, `OFFER ${col + 1}`, {
        fontSize: 5.5,
        fontWeight: 'bold',
        textColor: COLORS.inkSoft,
        characterSpacing: 1,
        align: 'center',
      })),
    ...COMPARISON_ROWS.flatMap(([name, hint], row) => [
      rect('comparison', `row_label_${row + 1}`, 36, 134 + row * 56, 114, 56, COLORS.paper, {
        stroke: COLORS.navy,
        strokeWidth: 1,
      }),
      text('comparison', `row_name_${row + 1}`, 43, 140 + row * 56, 100, 24, name, {
        fontSize: 7,
        fontWeight: 'bold',
        textColor: COLORS.navy,
        characterSpacing: 0.6,
        verticalAlign: 'top',
        align: 'left',
      }),
      text('comparison', `row_hint_${row + 1}`, 43, 164 + row * 56, 100, 22, hint, {
        fontSize: 6.5,
        textColor: COLORS.inkSoft,
        verticalAlign: 'top',
        align: 'left',
      }),
      ...[0, 1, 2, 3].map(col =>
        rect('comparison', `cell_${row + 1}_${col + 1}`, 150 + col * 80.75, 134 + row * 56, 80.75, 56, COLORS.card, {
          stroke: COLORS.navy,
          strokeWidth: 1,
        })),
    ]),
    label('comparison', 'decision_label', 36, 484, 300, 'THE DECISION'),
    rect('comparison', 'decision_box', 36, 500, 437, 64, COLORS.card, {
      stroke: COLORS.navy,
      strokeWidth: 1.2,
    }),
    text('comparison', 'decision_prompt', 44, 505, 421, 14, 'The offer I am taking, and the sentence that says why:', {
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    writingLines('comparison', 'decision_lines', 44, 522, 421, 36, 18),
    text('comparison', 'weight_note', 36, 576, 437, 26, 'Not every row weighs the same – circle the two that decide it for you before you compare numbers.', {
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    footerLink('comparison', 'back_link', 36, 150, '« Search HQ', 'left', { linkTarget: 'parent' }),
    folio('comparison'),
    footerLink('comparison', 'pipeline_link', 333, 140, 'PIPELINE »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'pipeline_board',
    }),
  ],
};

const REVIEW_COUNTERS = [
  ['APPS SENT', 36],
  ['REPLIES', 147],
  ['INTERVIEWS', 258],
  ['ASKS MADE', 369],
];

const REVIEW_SECTIONS = [
  ['wins', 'WINS THIS WEEK', 'MOVEMENT, NOT JUST MOTION', 168],
  ['owed', 'FOLLOW-UPS OWED', 'WHO IS WAITING ON YOU', 312],
  ['push', 'NEXT WEEK, THE PUSH', 'THE THREE THAT MATTER MOST', 456],
];

const weeklyReview = {
  id: 'weekly_review',
  name: 'Weekly Review Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('weekly_review'),
    pageTitle('weekly_review', '{{title}}'),
    subtitle('weekly_review', 'Twenty minutes on Friday keeps the search honest. Count first, then write.'),
    ...REVIEW_COUNTERS.flatMap(([name, x]) => [
      rect('weekly_review', `counter_box_${name.toLowerCase().replace(/[^a-z]+/g, '_')}`, x, 104, 104, 40, COLORS.card, {
        stroke: COLORS.navy,
        strokeWidth: 1.1,
      }),
      text('weekly_review', `counter_word_${name.toLowerCase().replace(/[^a-z]+/g, '_')}`, x, 148, 104, 10, name, {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.inkSoft,
        characterSpacing: 1,
        align: 'center',
      }),
    ]),
    ...REVIEW_SECTIONS.flatMap(([role, name, hint, y]) => [
      ...bandHead('weekly_review', `${role}_head`, 36, y, 437, name, hint),
      rect('weekly_review', `${role}_box`, 36, y + 18, 437, 108, COLORS.card, {
        stroke: COLORS.rule,
        strokeWidth: 0.9,
      }),
      writingLines('weekly_review', `${role}_lines`, 44, y + 26, 421, 92, 22),
    ]),
    text('weekly_review', 'prev_chip', 36, 616, 160, 18, '{{wr_prev_label}}', {
      dataBinding: 'wr_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.steelDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('weekly_review', 'next_chip', 313, 616, 160, 18, '{{wr_next_label}}', {
      dataBinding: 'wr_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.steelDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('weekly_review', 'back_link', 36, 150, '« Search HQ', 'left', { linkTarget: 'parent' }),
    folio('weekly_review'),
    footerLink('weekly_review', 'pipeline_link', 333, 140, 'PIPELINE »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'pipeline_board',
    }),
  ],
};

return {
  cover,
  start,
  workspace,
  pipeline,
  dossier,
  star_story: starStory,
  question_bank: questionBank,
  ask_bank: askBank,
  contacts,
  comparison,
  weekly_review: weeklyReview,
};
