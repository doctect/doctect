const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  leaf: '#3d5c45',      // primary ink: rules, headers, table frames, text
  leafDeep: '#2b4232',  // engraved band heads, tap-target text
  terra: '#97622f',     // terracotta accent: kind tags, seed dots, soil band
  cream: '#f0eee0',     // page ground
  paper: '#faf8ee',     // writable cells and plates
  inkSoft: '#63685a',   // secondary text
  rule: '#c8c4ac',      // fine rules and writing lines
  haze: '#cfd8c8',      // light text on leaf bands
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
    textColor: COLORS.leaf,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const label = (templateId, role, x, y, w, value, extra = {}) =>
  text(templateId, role, x, y, w, 12, value, {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.leafDeep,
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

// --- Original artwork -------------------------------------------------------

const coverArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260">
  <g id="sun" stroke="#97622f" stroke-width="3" fill="none">
    <circle cx="250" cy="42" r="16"/>
    <path d="M250 14 V6"/><path d="M250 70 V78"/><path d="M222 42 H214"/><path d="M286 42 H278"/>
    <path d="M230 22 L224 16"/><path d="M270 22 L276 16"/><path d="M230 62 L224 68"/><path d="M270 62 L276 68"/>
  </g>
  <path id="soil_line" d="M14 168 H286" stroke="#3d5c45" stroke-width="3"/>
  <g id="furrows" stroke="#3d5c45" stroke-width="1.5" stroke-dasharray="2 10">
    <path d="M14 192 H286"/><path d="M14 214 H286"/><path d="M14 236 H286"/>
  </g>
  <g id="seedling">
    <path d="M150 168 V118" stroke="#3d5c45" stroke-width="3.5" fill="none"/>
    <path d="M150 132 C138 124 126 124 118 132 C128 142 144 142 150 132 Z" fill="#3d5c45"/>
    <path d="M150 120 C162 112 174 112 182 120 C172 130 156 130 150 120 Z" fill="#3d5c45"/>
  </g>
  <g id="carrot">
    <path d="M68 172 Q73 226 78 232 Q83 226 88 172 Z" fill="#97622f" stroke="#3d5c45" stroke-width="2"/>
    <path d="M72 168 L67 150" stroke="#3d5c45" stroke-width="2" fill="none"/>
    <path d="M78 168 V148" stroke="#3d5c45" stroke-width="2" fill="none"/>
    <path d="M84 168 L89 150" stroke="#3d5c45" stroke-width="2" fill="none"/>
  </g>
  <g id="bulb">
    <ellipse cx="222" cy="198" rx="16" ry="18" fill="#f0eee0" stroke="#3d5c45" stroke-width="2.5"/>
    <path d="M216 182 Q222 170 228 182" stroke="#3d5c45" stroke-width="2" fill="none"/>
    <path d="M222 182 V214" stroke="#3d5c45" stroke-width="1.4" fill="none"/>
    <path d="M214 186 Q211 198 216 212" stroke="#3d5c45" stroke-width="1.4" fill="none"/>
    <path d="M230 186 Q233 198 228 212" stroke="#3d5c45" stroke-width="1.4" fill="none"/>
    <path d="M216 216 L213 224 M222 217 V225 M228 216 L231 224" stroke="#3d5c45" stroke-width="1.4" fill="none"/>
  </g>
  <g id="seed_row" fill="#3d5c45">
    <circle cx="110" cy="190" r="2.8"/><circle cx="126" cy="190" r="2.8"/><circle cx="142" cy="190" r="2.8"/>
    <circle cx="158" cy="190" r="2.8"/><circle cx="174" cy="190" r="2.8"/><circle cx="190" cy="190" r="2.8"/>
  </g>
</svg>`;

const leafSprigLeft = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22">
  <path d="M2 19 Q16 15 30 6" stroke="#3d5c45" stroke-width="1.8" fill="none"/>
  <path d="M9 17 Q6 11 12 8 Q15 14 9 17 Z" fill="#3d5c45"/>
  <path d="M18 14 Q15 8 21 5 Q24 11 18 14 Z" fill="#3d5c45"/>
  <path d="M27 10 Q24 4 30 1 Q33 7 27 10 Z" fill="#3d5c45"/>
</svg>`;

const leafSprigRight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 22">
  <g transform="translate(32 0) scale(-1 1)">
    <path d="M2 19 Q16 15 30 6" stroke="#3d5c45" stroke-width="1.8" fill="none"/>
    <path d="M9 17 Q6 11 12 8 Q15 14 9 17 Z" fill="#3d5c45"/>
    <path d="M18 14 Q15 8 21 5 Q24 11 18 14 Z" fill="#3d5c45"/>
    <path d="M27 10 Q24 4 30 1 Q33 7 27 10 Z" fill="#3d5c45"/>
  </g>
</svg>`;

const sproutArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26">
  <path d="M2 24 Q13 17 24 24 Z" fill="#97622f"/>
  <path d="M13 21 V10" stroke="#3d5c45" stroke-width="2" fill="none"/>
  <path d="M13 13 C9 8 5 8 3 11 C7 15 11 15 13 13 Z" fill="#3d5c45"/>
  <path d="M13 10 C17 5 21 5 23 8 C19 12 15 12 13 10 Z" fill="#3d5c45"/>
</svg>`;

// --- Shared engraved-almanac chrome -----------------------------------------
// No solid bands up top: the header is an engraved pair of fine rules (leaf
// over terracotta) under a letterspaced masthead word flanked by the EXAMPLE
// and skip bindings, with a three-seed ornament on the centerline. The foot is
// a fine rule, a sprouting-seed mark at the right, and a thin terracotta soil
// band along the very bottom edge - engraved and horticultural, geometrically
// unlike the frames, spines, mastheads, and command bars of products 09-14.

const pageBase = (templateId) => [
  rect(templateId, 'ground', 0, 0, W, H, COLORS.cream),
  text(templateId, 'example', 30, 16, 120, 14, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.terra,
    characterSpacing: 1.5,
    align: 'left',
  }),
  text(templateId, 'masthead_word', 180, 18, 150, 12, 'THE GROWER\'S YEAR', {
    fontSize: 7,
    fontWeight: 'bold',
    textColor: COLORS.leaf,
    characterSpacing: 2.6,
    align: 'center',
  }),
  text(templateId, 'skip', 356, 16, 123, 14, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.leafDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  rect(templateId, 'seed_dot_a', 240.5, 33.5, 4, 4, COLORS.terra),
  rect(templateId, 'seed_dot_b', 252.5, 33.5, 4, 4, COLORS.terra),
  rect(templateId, 'seed_dot_c', 264.5, 33.5, 4, 4, COLORS.terra),
  rect(templateId, 'head_rule_a', 30, 44, 449, 1.2, COLORS.leaf),
  rect(templateId, 'head_rule_b', 30, 47.5, 449, 0.6, COLORS.terra),
  rect(templateId, 'foot_rule', 30, 634, 449, 0.8, COLORS.rule),
  svg(templateId, 'sprout_mark', 452, 640, 26, 26, sproutArt),
  rect(templateId, 'soil_band', 0, 670, W, 9, COLORS.terra),
];

const folio = (templateId) =>
  text(templateId, 'folio', 180, 646, 150, 12, 'SOW · PLANT · HARVEST', {
    fontSize: 6.5,
    fontWeight: 'bold',
    textColor: COLORS.inkSoft,
    characterSpacing: 2,
    align: 'center',
  });

const footerLink = (templateId, role, x, w, value, align, link) =>
  text(templateId, role, x, 642, w, 16, value, {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.leafDeep,
    align,
    ...link,
  });

const pageTitle = (templateId, value, extra = {}) =>
  text(templateId, 'page_title', 30, 56, 449, 24, value, {
    fontFamily: 'georgia',
    fontSize: 18,
    fontWeight: 'bold',
    textColor: COLORS.leaf,
    align: 'left',
    ...extra,
  });

const subtitle = (templateId, value) =>
  text(templateId, 'subtitle', 30, 84, 449, 14, value, {
    fontSize: 9,
    textColor: COLORS.inkSoft,
    align: 'left',
  });

// --- Templates --------------------------------------------------------------

const cover = {
  id: 'cover',
  name: 'Almanac Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'ground', 0, 0, W, H, COLORS.cream),
    base('cover', 'tap_anywhere', 'rect', 0, 0, W, H, {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    rect('cover', 'frame_outer', 20, 20, 469, 639, '', { stroke: COLORS.leaf, strokeWidth: 1.6 }),
    rect('cover', 'frame_inner', 27, 27, 455, 625, '', { stroke: COLORS.terra, strokeWidth: 0.7 }),
    text('cover', 'kicker', 60, 46, 389, 14, 'AN ALMANAC FOR THE KITCHEN GARDEN', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.terra,
      characterSpacing: 2.2,
      align: 'center',
    }),
    text('cover', 'title', 54, 64, 401, 54, 'The Grower\'s Year', {
      fontFamily: 'georgia',
      fontSize: 36,
      fontWeight: 'bold',
      textColor: COLORS.leaf,
      align: 'center',
    }),
    rect('cover', 'title_rule', 150, 126, 209, 1, COLORS.leaf),
    rect('cover', 'title_seed_a', 242.5, 132, 4, 4, COLORS.terra),
    rect('cover', 'title_seed_b', 252.5, 132, 4, 4, COLORS.terra),
    rect('cover', 'title_seed_c', 262.5, 132, 4, 4, COLORS.terra),
    rect('cover', 'plate', 84, 152, 341, 320, COLORS.paper, {
      stroke: COLORS.leaf,
      strokeWidth: 1.2,
    }),
    rect('cover', 'plate_inner', 92, 160, 325, 304, '', {
      stroke: COLORS.rule,
      strokeWidth: 0.7,
    }),
    svg('cover', 'cover_art', 104.5, 178, 300, 260, coverArt),
    text('cover', 'plate_caption', 96, 448, 317, 12, 'SIXTEEN PLANTS · TWELVE MONTHS · ONE PLOT', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1.4,
      align: 'center',
    }),
    text('cover', 'sub', 80, 494, 349, 66, 'Twelve month spreads that say what to sow, plant, and harvest – every line tapping through to an accurate card for the plant itself. Bed maps, harvest and pest ledgers, and a year review close the season.', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.leaf,
      align: 'center',
      verticalAlign: 'top',
    }),
    text('cover', 'open_cta', 164.5, 570, 180, 34, 'Open the almanac »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.cream,
      fill: COLORS.leaf,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'imprint', 96, 626, 317, 12, 'BEDS · MONTHS · PLANTS · LEDGERS', {
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
  name: 'Growing Guide',
  width: W,
  height: H,
  elements: [
    ...pageBase('start'),
    pageTitle('start', '{{title}}'),
    text('start', 'premise', 30, 84, 449, 60, 'The Grower\'s Year is written for northern-temperate gardens – roughly the climate of Britain, Ireland, and USDA zones 6 to 8, where the last frost falls in mid-to-late May and the first returns in October. Each month spread lists what to sow, plant, and harvest; every line taps through to that plant\'s card.', {
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.leaf,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'howto_label', 30, 152, 260, 'HOW TO WORK THE YEAR'),
    text('start', 'howto_steps', 30, 168, 449, 104, '1. Open this month\'s spread and read its sow / plant / harvest rows.\n2. Tap any row – the plant\'s card holds depth, spacing, sun, days, and companions.\n3. Sketch each bed on a bed map before anything goes in the ground.\n4. Weigh what you pick into the harvest ledger; log trouble in the pest ledger.\n5. In November, settle the season on the year review sheet.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.leaf,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'doors_label', 30, 282, 220, 'WHERE TO BEGIN'),
    text('start', 'example_chip', 30, 298, 215, 34, 'The worked example »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.leaf,
      fill: COLORS.paper,
      stroke: COLORS.leaf,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    text('start', 'garden_chip', 264, 298, 215, 34, 'Your garden »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.cream,
      fill: COLORS.leaf,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
    text('start', 'january_chip', 30, 340, 215, 34, 'January »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.leaf,
      fill: COLORS.paper,
      stroke: COLORS.leaf,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'month_01',
    }),
    text('start', 'index_chip', 264, 340, 215, 34, 'The plant index »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.leaf,
      fill: COLORS.paper,
      stroke: COLORS.leaf,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'plant_index',
    }),
    label('start', 'timing_label', 30, 392, 220, 'A NOTE ON TIMING'),
    text('start', 'timing_note', 30, 408, 449, 54, 'Dates here are the middle of the road. A sheltered city plot runs two weeks ahead of these pages; a frost pocket two weeks behind. Watch your soil, not the calendar – it should crumble, not smear, before you sow outdoors.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.leaf,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'frost_label', 30, 472, 300, 'FROST DATES, THIS GARDEN'),
    rect('start', 'frost_rule_last', 30, 506, 215, 0.9, COLORS.rule),
    text('start', 'frost_word_last', 30, 510, 215, 10, 'LAST SPRING FROST', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    rect('start', 'frost_rule_first', 264, 506, 215, 0.9, COLORS.rule),
    text('start', 'frost_word_first', 264, 510, 215, 10, 'FIRST AUTUMN FROST', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    label('start', 'notes_label', 30, 534, 200, 'NOTES'),
    writingLines('start', 'notes_lines', 30, 550, 449, 72, 24),
    footerLink('start', 'back_link', 30, 150, '« Cover', 'left', { linkTarget: 'parent' }),
    folio('start'),
    footerLink('start', 'months_link', 294, 150, 'THE MONTHS »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'month_01',
    }),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Garden Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace'),
    pageTitle('workspace', '{{title}}'),
    text('workspace', 'hero', 30, 84, 449, 44, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.leaf,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'note', 30, 130, 449, 26, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'table_label', 30, 164, 260, 'ON THIS TABLE'),
    text('workspace', 'slot_a_chip', 30, 180, 142, 32, '{{slot_a_label}}', {
      dataBinding: 'slot_a_label',
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'left',
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    text('workspace', 'slot_b_chip', 183.5, 180, 142, 32, '{{slot_b_label}}', {
      dataBinding: 'slot_b_label',
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'left',
      linkTarget: 'child_index',
      linkValue: '1',
    }),
    text('workspace', 'slot_c_chip', 337, 180, 142, 32, '{{slot_c_label}}', {
      dataBinding: 'slot_c_label',
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'left',
      linkTarget: 'child_index',
      linkValue: '2',
    }),
    label('workspace', 'almanac_label', 30, 224, 260, 'THE ALMANAC'),
    ...[
      ['months', 'hub_months_label', 'month_01'],
      ['index', 'hub_index_label', 'plant_index'],
      ['beds', 'hub_beds_label', 'bed_01'],
      ['harvest', 'hub_harvest_label', 'harvest_01'],
      ['pest', 'hub_pest_label', 'pest_01'],
      ['review', 'hub_review_label', 'year_review_01'],
    ].map(([role, labelField, target], index) =>
      text('workspace', `${role}_chip`, index % 2 === 0 ? 30 : 264, 240 + Math.floor(index / 2) * 40, 215, 32, `{{${labelField}}}`, {
        dataBinding: labelField,
        fontFamily: 'georgia',
        fontSize: 11,
        fontWeight: 'bold',
        textColor: COLORS.leafDeep,
        align: 'left',
        linkTarget: 'specific_node',
        linkValue: target,
      })),
    label('workspace', 'wiring_label', 30, 370, 300, 'HOW THE WIRING WORKS'),
    text('workspace', 'wiring_note', 30, 386, 449, 56, 'Month rows are reference chips – each one opens the same card the index lists, so a plant\'s page is one tap from anywhere. Cards link back to the index, months chain into one another, and every page returns here.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.leaf,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'notes_label', 30, 452, 200, 'GARDEN NOTES'),
    writingLines('workspace', 'notes_lines', 30, 468, 449, 144, 24),
    footerLink('workspace', 'back_link', 30, 150, '« The guide', 'left', { linkTarget: 'parent' }),
    folio('workspace'),
    footerLink('workspace', 'index_link', 294, 150, 'INDEX »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'plant_index',
    }),
  ],
};

// Month spread: engraved masthead, a tasks block, then eight sow/plant/harvest
// rows. Each row is an unfilled chip pair - the terracotta action tag binds
// {{row_N_kind}} and the plant chip binds {{row_N_label}}, both over
// child_index N-1 reference children. Unused rows bind '' on both, leaving the
// printed rule and done-box as a writable spare row.
const monthRows = () => {
  const elements = [];
  for (let n = 1; n <= 8; n += 1) {
    const y = 286 + (n - 1) * 33;
    elements.push(
      text('month', `row_kind_${n}`, 30, y + 2, 64, 18, `{{row_${n}_kind}}`, {
        dataBinding: `row_${n}_kind`,
        fontSize: 7.5,
        fontWeight: 'bold',
        textColor: COLORS.terra,
        characterSpacing: 1.2,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(n - 1),
      }),
      text('month', `row_chip_${n}`, 102, y, 210, 22, `{{row_${n}_label}}`, {
        dataBinding: `row_${n}_label`,
        fontFamily: 'georgia',
        fontSize: 10.5,
        fontWeight: 'bold',
        textColor: COLORS.leafDeep,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(n - 1),
      }),
      rect('month', `row_rule_${n}`, 320, y + 18, 124, 0.8, COLORS.rule),
      rect('month', `row_done_${n}`, 452, y + 3, 12, 12, COLORS.paper, {
        stroke: COLORS.leaf,
        strokeWidth: 1,
      }),
    );
  }
  return elements;
};

const month = {
  id: 'month',
  name: 'Month Spread',
  width: W,
  height: H,
  elements: [
    ...pageBase('month'),
    svg('month', 'masthead_leaf_l', 62, 62, 32, 22, leafSprigLeft),
    text('month', 'masthead_title', 104, 56, 301, 30, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 23,
      fontWeight: 'bold',
      textColor: COLORS.leaf,
      align: 'center',
    }),
    svg('month', 'masthead_leaf_r', 415, 62, 32, 22, leafSprigRight),
    rect('month', 'masthead_rule_a', 104, 90, 301, 1, COLORS.leaf),
    rect('month', 'masthead_rule_b', 104, 93, 301, 0.5, COLORS.terra),
    text('month', 'month_note', 30, 100, 449, 26, '{{month_note}}', {
      dataBinding: 'month_note',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.inkSoft,
      align: 'center',
    }),
    label('month', 'tasks_label', 30, 134, 260, 'TASKS THIS MONTH'),
    writingLines('month', 'tasks_lines', 30, 150, 449, 92, 23),
    text('month', 'month_tasks', 30, 150, 449, 92, '{{month_tasks}}', {
      dataBinding: 'month_tasks',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.leaf,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('month', 'rows_label', 30, 252, 300, 'SOW · PLANT · HARVEST'),
    text('month', 'col_action', 30, 270, 64, 10, 'ACTION', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    text('month', 'col_plant', 102, 270, 210, 10, 'PLANT · TAP FOR ITS CARD', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    text('month', 'col_notes', 320, 270, 124, 10, 'VARIETY · NOTES', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    text('month', 'col_done', 444, 270, 32, 10, 'DONE', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'right',
    }),
    ...monthRows(),
    text('month', 'spare_note', 30, 552, 449, 12, 'Unused rows are yours – pencil in extra sowings and the season\'s experiments.', {
      fontSize: 8,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    text('month', 'prev_chip', 30, 576, 170, 18, '{{month_prev_label}}', {
      dataBinding: 'month_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('month', 'next_chip', 309, 576, 170, 18, '{{month_next_label}}', {
      dataBinding: 'month_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('month', 'back_link', 30, 150, '« The hub', 'left', { linkTarget: 'parent' }),
    folio('month'),
    footerLink('month', 'index_link', 294, 150, 'INDEX »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'plant_index',
    }),
  ],
};

const SPEC_ROWS = [
  ['SOW DEPTH', 'spec_depth'],
  ['SPACING', 'spec_spacing'],
  ['SUN & SOIL', 'spec_sun'],
  ['DAYS TO MATURITY', 'spec_days'],
  ['COMPANIONS', 'spec_companions'],
];

const CALENDAR_CELLS = [
  ['SOW', 'when_sow', 30],
  ['PLANT OUT', 'when_plant', 184.5],
  ['HARVEST', 'when_harvest', 339],
];

const plantCard = {
  id: 'plant_card',
  name: 'Plant Card',
  width: W,
  height: H,
  elements: [
    ...pageBase('plant_card'),
    text('plant_card', 'card_title', 30, 56, 300, 24, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 19,
      fontWeight: 'bold',
      textColor: COLORS.leaf,
      align: 'left',
    }),
    text('plant_card', 'botanical', 30, 80, 300, 13, '{{botanical}}', {
      dataBinding: 'botanical',
      fontFamily: 'georgia',
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    text('plant_card', 'index_chip', 349, 58, 130, 30, 'Plant index »', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.leaf,
      fill: COLORS.paper,
      stroke: COLORS.leaf,
      strokeWidth: 1,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'plant_index',
    }),
    label('plant_card', 'variety_label', 30, 102, 60, 'VARIETY'),
    text('plant_card', 'variety', 96, 98, 377, 16, '{{variety}}', {
      dataBinding: 'variety',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.leaf,
      align: 'left',
    }),
    rect('plant_card', 'variety_rule', 96, 116, 377, 0.8, COLORS.rule),
    ...CALENDAR_CELLS.flatMap(([name, field, x]) => [
      rect('plant_card', `cal_cell_${field}`, x, 130, 140, 46, COLORS.paper, {
        stroke: COLORS.leaf,
        strokeWidth: 1,
      }),
      text('plant_card', `cal_word_${field}`, x, 136, 140, 10, name, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.terra,
        characterSpacing: 1.5,
        align: 'center',
      }),
      text('plant_card', `cal_value_${field}`, x + 6, 148, 128, 24, `{{${field}}}`, {
        dataBinding: field,
        fontSize: 8,
        textColor: COLORS.leaf,
        verticalAlign: 'top',
        align: 'center',
      }),
    ]),
    label('plant_card', 'spec_label', 30, 190, 220, 'THE SPECIFICS'),
    ...SPEC_ROWS.flatMap(([name, field], index) => [
      rect('plant_card', `spec_head_${field}`, 30, 206 + index * 30, 120, 30, COLORS.leafDeep),
      text('plant_card', `spec_word_${field}`, 37, 206 + index * 30, 108, 30, name, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.haze,
        characterSpacing: 1,
        align: 'left',
      }),
      rect('plant_card', `spec_cell_${field}`, 150, 206 + index * 30, 323, 30, COLORS.paper, {
        stroke: COLORS.leaf,
        strokeWidth: 0.9,
      }),
      text('plant_card', `spec_value_${field}`, 158, 206 + index * 30, 307, 30, `{{${field}}}`, {
        dataBinding: field,
        fontSize: 8.5,
        textColor: COLORS.leaf,
        align: 'left',
      }),
    ]),
    label('plant_card', 'notes_label', 30, 370, 200, 'FIELD NOTES'),
    writingLines('plant_card', 'notes_lines', 30, 386, 449, 148, 21),
    text('plant_card', 'card_notes', 30, 386, 449, 148, '{{card_notes}}', {
      dataBinding: 'card_notes',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.leaf,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('plant_card', 'prev_chip', 30, 556, 170, 18, '{{card_prev_label}}', {
      dataBinding: 'card_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('plant_card', 'next_chip', 309, 556, 170, 18, '{{card_next_label}}', {
      dataBinding: 'card_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('plant_card', 'back_link', 30, 150, '« Back', 'left', { linkTarget: 'parent' }),
    folio('plant_card'),
    footerLink('plant_card', 'beds_link', 294, 150, 'BED MAPS »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'bed_01',
    }),
  ],
};

const plantIndexRows = () => {
  const elements = [];
  for (let n = 1; n <= 16; n += 1) {
    const y = 124 + (n - 1) * 30;
    elements.push(
      text('plant_index', `ix_chip_${n}`, 30, y, 170, 20, `{{ix_${n}}}`, {
        dataBinding: `ix_${n}`,
        fontFamily: 'georgia',
        fontSize: 10,
        fontWeight: 'bold',
        textColor: COLORS.leafDeep,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(n - 1),
      }),
      rect('plant_index', `ix_dot_${n}`, 202, y + 7, 3, 3, COLORS.terra),
      rect('plant_index', `ix_rule_${n}`, 210, y + 16, 263, 0.8, COLORS.rule),
    );
  }
  return elements;
};

const plantIndex = {
  id: 'plant_index',
  name: 'Plant Index',
  width: W,
  height: H,
  elements: [
    ...pageBase('plant_index'),
    pageTitle('plant_index', '{{title}}'),
    subtitle('plant_index', 'Tap a plant for its card. The line beside each is for this year\'s variety and where it went.'),
    text('plant_index', 'col_plant', 30, 106, 170, 10, 'PLANT', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    text('plant_index', 'col_year', 210, 106, 263, 10, 'THIS YEAR', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    ...plantIndexRows(),
    footerLink('plant_index', 'back_link', 30, 150, '« The hub', 'left', { linkTarget: 'parent' }),
    folio('plant_index'),
    footerLink('plant_index', 'months_link', 294, 150, 'MONTHS »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'month_01',
    }),
  ],
};

const bedMap = {
  id: 'bed_map',
  name: 'Bed Map',
  width: W,
  height: H,
  elements: [
    ...pageBase('bed_map'),
    pageTitle('bed_map', '{{title}}'),
    subtitle('bed_map', 'Sketch what goes where on the dotted grid – one dot per hand\'s width.'),
    label('bed_map', 'size_label', 30, 106, 100, 'BED SIZE'),
    rect('bed_map', 'size_rule', 30, 126, 215, 0.8, COLORS.rule),
    label('bed_map', 'season_label', 264, 106, 100, 'SEASON'),
    rect('bed_map', 'season_rule', 264, 126, 215, 0.8, COLORS.rule),
    ...['A', 'B', 'C', 'D', 'E', 'F'].map((letter, index) =>
      text('bed_map', `col_${letter}`, 60 + index * 65, 138, 65, 10, letter, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.inkSoft,
        align: 'center',
      })),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((row, index) =>
      text('bed_map', `row_${row}`, 40, 152 + index * 41.25 + 14, 14, 12, String(row), {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.inkSoft,
        align: 'right',
      })),
    rect('bed_map', 'grid_frame', 60, 152, 390, 330, COLORS.paper, {
      stroke: COLORS.leaf,
      strokeWidth: 1.3,
    }),
    rect('bed_map', 'grid_dots', 68, 160, 374, 314, COLORS.leaf, {
      fillType: 'pattern',
      patternType: 'dots',
      patternSpacing: 26,
      patternWeight: 1.8,
    }),
    label('bed_map', 'key_label', 30, 496, 200, 'CROP KEY'),
    rect('bed_map', 'key_dot_1', 30, 518, 6, 6, COLORS.terra),
    rect('bed_map', 'key_rule_1', 44, 530, 201, 0.8, COLORS.rule),
    rect('bed_map', 'key_dot_2', 264, 518, 6, 6, COLORS.leaf),
    rect('bed_map', 'key_rule_2', 278, 530, 195, 0.8, COLORS.rule),
    rect('bed_map', 'key_dot_3', 30, 544, 6, 6, COLORS.leaf),
    rect('bed_map', 'key_rule_3', 44, 556, 201, 0.8, COLORS.rule),
    rect('bed_map', 'key_dot_4', 264, 544, 6, 6, COLORS.terra),
    rect('bed_map', 'key_rule_4', 278, 556, 195, 0.8, COLORS.rule),
    text('bed_map', 'map_note', 30, 572, 449, 22, 'Draw sowing rows as lines of dots and transplants as circles – date everything; the map is next year\'s memory.', {
      fontSize: 8,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('bed_map', 'prev_chip', 30, 604, 170, 16, '{{bed_prev_label}}', {
      dataBinding: 'bed_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('bed_map', 'next_chip', 309, 604, 170, 16, '{{bed_next_label}}', {
      dataBinding: 'bed_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('bed_map', 'back_link', 30, 150, '« The hub', 'left', { linkTarget: 'parent' }),
    folio('bed_map'),
    footerLink('bed_map', 'harvest_link', 294, 150, 'HARVEST »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'harvest_01',
    }),
  ],
};

const HARVEST_COLS = [
  ['DATE', 30, 70],
  ['CROP', 100, 150],
  ['WEIGHT · COUNT', 250, 100],
  ['NOTES', 350, 123],
];

const harvestLog = {
  id: 'harvest_log',
  name: 'Harvest Ledger',
  width: W,
  height: H,
  elements: [
    ...pageBase('harvest_log'),
    pageTitle('harvest_log', '{{title}}'),
    subtitle('harvest_log', 'Weigh it before the kitchen gets it – totals at the bottom, verdicts in the year review.'),
    ...HARVEST_COLS.map(([name, x, w]) =>
      rect('harvest_log', `head_${x}`, x, 108, w, 20, COLORS.leaf)),
    ...HARVEST_COLS.map(([name, x, w]) =>
      text('harvest_log', `head_word_${x}`, x + 7, 108, w - 14, 20, name, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.haze,
        characterSpacing: 1.2,
        align: 'left',
      })),
    ...Array.from({ length: 12 }, (unused, row) =>
      HARVEST_COLS.map(([name, x, w]) =>
        rect('harvest_log', `cell_${x}_${row + 1}`, x, 128 + row * 38, w, 38, COLORS.paper, {
          stroke: COLORS.leaf,
          strokeWidth: 0.8,
        }))).flat(),
    rect('harvest_log', 'total_head', 30, 584, 220, 24, COLORS.leafDeep),
    text('harvest_log', 'total_word', 37, 584, 206, 24, 'SEASON TOTAL, THIS PAGE', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.haze,
      characterSpacing: 1.2,
      align: 'left',
    }),
    rect('harvest_log', 'total_cell', 250, 584, 223, 24, COLORS.paper, {
      stroke: COLORS.leaf,
      strokeWidth: 0.9,
    }),
    text('harvest_log', 'prev_chip', 30, 616, 170, 14, '{{hl_prev_label}}', {
      dataBinding: 'hl_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('harvest_log', 'next_chip', 309, 616, 170, 14, '{{hl_next_label}}', {
      dataBinding: 'hl_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('harvest_log', 'back_link', 30, 150, '« The hub', 'left', { linkTarget: 'parent' }),
    folio('harvest_log'),
    footerLink('harvest_log', 'pest_link', 294, 150, 'PEST LEDGER »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'pest_01',
    }),
  ],
};

const PEST_COLS = [
  ['DATE', 30, 70],
  ['PLANT', 100, 120],
  ['PEST OR DISEASE', 220, 130],
  ['WHAT I DID', 350, 123],
];

const pestLog = {
  id: 'pest_log',
  name: 'Pest Ledger',
  width: W,
  height: H,
  elements: [
    ...pageBase('pest_log'),
    pageTitle('pest_log', '{{title}}'),
    subtitle('pest_log', 'Trouble writes patterns – the ledger catches them while the memory is fresh.'),
    label('pest_log', 'culprits_label', 30, 106, 260, 'COMMON CULPRITS, THESE LATITUDES'),
    text('pest_log', 'culprits', 30, 120, 449, 30, 'Slugs & snails · aphids · cabbage white caterpillars · carrot fly · flea beetle · tomato & potato blight · powdery mildew · allium rust', {
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.leaf,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...PEST_COLS.map(([name, x, w]) =>
      rect('pest_log', `head_${x}`, x, 158, w, 20, COLORS.leaf)),
    ...PEST_COLS.map(([name, x, w]) =>
      text('pest_log', `head_word_${x}`, x + 7, 158, w - 14, 20, name, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.haze,
        characterSpacing: 1.2,
        align: 'left',
      })),
    ...Array.from({ length: 9 }, (unused, row) =>
      PEST_COLS.map(([name, x, w]) =>
        rect('pest_log', `cell_${x}_${row + 1}`, x, 178 + row * 42, w, 42, COLORS.paper, {
          stroke: COLORS.leaf,
          strokeWidth: 0.8,
        }))).flat(),
    text('pest_log', 'ledger_note', 30, 566, 449, 24, 'One line per sighting. If the same pest fills three lines, the year review wants to know about it.', {
      fontSize: 8,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('pest_log', 'prev_chip', 30, 604, 170, 16, '{{pl_prev_label}}', {
      dataBinding: 'pl_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('pest_log', 'next_chip', 309, 604, 170, 16, '{{pl_next_label}}', {
      dataBinding: 'pl_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.leafDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('pest_log', 'back_link', 30, 150, '« The hub', 'left', { linkTarget: 'parent' }),
    folio('pest_log'),
    footerLink('pest_log', 'review_link', 294, 150, 'YEAR REVIEW »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'year_review_01',
    }),
  ],
};

const REVIEW_SECTIONS = [
  ['thrived', 'WHAT THRIVED', 'AND WHY, HONESTLY', 112],
  ['struggled', 'WHAT STRUGGLED', 'PEST, PLACE, OR PLAIN NEGLECT', 232],
  ['varieties', 'VARIETIES WORTH REPEATING', 'NAME · SOURCE · VERDICT', 352],
  ['changes', 'NEXT YEAR, DIFFERENTLY', 'THE THREE CHANGES THAT MATTER', 472],
];

const yearReview = {
  id: 'year_review',
  name: 'Year Review Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('year_review'),
    pageTitle('year_review', '{{title}}'),
    subtitle('year_review', 'Fill this in while the season is still under your fingernails – November, with tea.'),
    ...REVIEW_SECTIONS.flatMap(([role, name, hint, y]) => [
      rect('year_review', `${role}_band`, 30, y, 449, 18, COLORS.leaf),
      text('year_review', `${role}_name`, 38, y, 200, 18, name, {
        fontSize: 7,
        fontWeight: 'bold',
        textColor: COLORS.cream,
        characterSpacing: 1.6,
        align: 'left',
      }),
      text('year_review', `${role}_hint`, 231, y, 240, 18, hint, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.haze,
        characterSpacing: 1,
        align: 'right',
      }),
      writingLines('year_review', `${role}_lines`, 30, y + 28, 449, 80, 22),
    ]),
    footerLink('year_review', 'back_link', 30, 150, '« The hub', 'left', { linkTarget: 'parent' }),
    folio('year_review'),
    footerLink('year_review', 'months_link', 294, 150, 'THE MONTHS »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'month_01',
    }),
  ],
};

return {
  cover,
  start,
  workspace,
  bed_map: bedMap,
  month,
  plant_card: plantCard,
  plant_index: plantIndex,
  harvest_log: harvestLog,
  pest_log: pestLog,
  year_review: yearReview,
};
