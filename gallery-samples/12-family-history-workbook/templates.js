const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  plum: '#53455c',
  plumSoft: '#867d90',
  gold: '#9c8354',
  goldDeep: '#7d6741',
  parchment: '#f1eae0',
  paper: '#faf7f0',
  rule: '#cec3b1',
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
    textColor: COLORS.plum,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const label = (templateId, role, x, y, w, value, extra = {}) =>
  text(templateId, role, x, y, w, 12, value, {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.goldDeep,
    characterSpacing: 1.6,
    align: 'left',
    ...extra,
  });

const writingLines = (templateId, role, x, y, w, h, spacing = 22) =>
  rect(templateId, role, x, y, w, h, COLORS.rule, {
    fillType: 'pattern',
    patternType: 'lines-h',
    patternSpacing: spacing,
    patternWeight: 0.8,
  });

// --- The pedigree geometry --------------------------------------------------
// Fifteen boxes in four columns: self, parents, grandparents, great-grand-
// parents. Box index i (0-based) follows the ahnentafel: the father of box i
// sits at 2i+1, the mother at 2i+2 (numbers on the page are 1-based, so a
// father is double his child's number). hierarchy.js states the same rule for
// the kin references; the chart draws it.

const BOX_W = 90;
const BOX_H = 44;
const CHART_LEFT = 34;
const CHART_TOP = 104;
const CHART_COLS = [34, 151, 268, 385];

const columnRows = [[], [], [], []];
columnRows[3] = Array.from({ length: 8 }, (unused, row) => CHART_TOP + row * 66);
columnRows[2] = [0, 1, 2, 3].map(pair => (columnRows[3][2 * pair] + columnRows[3][2 * pair + 1]) / 2);
columnRows[1] = [0, 1].map(pair => (columnRows[2][2 * pair] + columnRows[2][2 * pair + 1]) / 2);
columnRows[0] = [(columnRows[1][0] + columnRows[1][1]) / 2];

const boxPlace = (index) => {
  if (index === 0) return { col: 0, row: 0 };
  if (index <= 2) return { col: 1, row: index - 1 };
  if (index <= 6) return { col: 2, row: index - 3 };
  return { col: 3, row: index - 7 };
};

const BOXES = Array.from({ length: 15 }, (unused, index) => {
  const place = boxPlace(index);
  return { x: CHART_COLS[place.col], y: columnRows[place.col][place.row] };
});

// Bracket connectors drawn as one gold filigree SVG underneath the boxes.
const connectorPieces = [];
for (let index = 0; index < 7; index += 1) {
  const child = BOXES[index];
  const father = BOXES[2 * index + 1];
  const mother = BOXES[2 * index + 2];
  const sx = child.x + BOX_W - CHART_LEFT;
  const sy = child.y + BOX_H / 2 - CHART_TOP;
  const jx = sx + 13;
  const fy = father.y + BOX_H / 2 - CHART_TOP;
  const my = mother.y + BOX_H / 2 - CHART_TOP;
  const px = father.x - CHART_LEFT;
  connectorPieces.push(`<path d="M${sx} ${sy} H${jx} M${jx} ${fy} V${my} M${jx} ${fy} H${px} M${jx} ${my} H${px}" stroke="#9c8354" stroke-width="1.2" fill="none"/>`);
  connectorPieces.push(`<circle cx="${jx}" cy="${sy}" r="2" fill="#53455c"/>`);
}
const chartConnectorArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 441 506">${connectorPieces.join('')}</svg>`;

// --- Original artwork -------------------------------------------------------
// The cover tree is the pedigree itself grown as a tree: one plum trunk node,
// two parents, four grandparents, eight great-grandparent leaves, with gold
// roots reaching below the ground line.

const treeLevels = [
  [[140, 232]],
  [[92, 178], [188, 178]],
  [[52, 124], [112, 124], [168, 124], [228, 124]],
  [[24, 66], [56, 66], [88, 66], [120, 66], [160, 66], [192, 66], [224, 66], [256, 66]],
];

const treeBranches = [];
for (let level = 0; level < 3; level += 1) {
  const width = [3, 2.1, 1.3][level];
  treeLevels[level].forEach(([cx, cy], index) => {
    [treeLevels[level + 1][2 * index], treeLevels[level + 1][2 * index + 1]].forEach(([px, py]) => {
      treeBranches.push(`<path d="M${cx} ${cy - 8} C${cx} ${cy - 34} ${px} ${py + 32} ${px} ${py + 7}" stroke="#53455c" stroke-width="${width}" fill="none" stroke-linecap="round"/>`);
    });
  });
}

const treeMarks = [];
treeLevels.forEach((level, depth) => {
  const radius = [10, 8, 6.5, 5][depth];
  level.forEach(([cx, cy], index) => {
    if (depth === 0) {
      treeMarks.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#53455c"/>`);
    } else if (depth === 3 && index % 2 === 1) {
      treeMarks.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#9c8354" stroke="#53455c" stroke-width="1.2"/>`);
    } else {
      treeMarks.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#f1eae0" stroke="#53455c" stroke-width="1.6"/>`);
    }
  });
});

const coverArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 300">
  <path d="M28 258 H252" stroke="#9c8354" stroke-width="1.6" fill="none"/>
  <path d="M48 266 H232" stroke="#9c8354" stroke-width="0.8" fill="none"/>
  <path d="M140 242 V258" stroke="#53455c" stroke-width="3.4" fill="none"/>
  <path d="M140 258 C120 274 96 276 84 292" stroke="#7d6741" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M140 258 C160 274 204 276 216 292" stroke="#7d6741" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M140 258 C134 276 128 284 130 296" stroke="#7d6741" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  ${treeBranches.join('\n  ')}
  ${treeMarks.join('\n  ')}
</svg>`;

const dividerArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 20">
  <path d="M10 10 C40 4 70 16 94 10" stroke="#9c8354" stroke-width="1.2" fill="none"/>
  <path d="M106 10 C130 4 160 16 190 10" stroke="#9c8354" stroke-width="1.2" fill="none"/>
  <path d="M100 3 C104.5 7 104.5 13 100 17 C95.5 13 95.5 7 100 3" fill="#9c8354"/>
  <circle cx="10" cy="10" r="2" fill="#53455c"/>
  <circle cx="190" cy="10" r="2" fill="#53455c"/>
</svg>`;

// --- Shared chrome ----------------------------------------------------------
// Engraved-certificate framing: a heavy plum frame with a gold inner frame,
// double head and foot rules, the EXAMPLE and skip bindings in the head band.

const pageBase = (templateId) => [
  rect(templateId, 'ground', 0, 0, W, H, COLORS.parchment),
  rect(templateId, 'frame_outer', 14, 14, 481, 651, '', { stroke: COLORS.plum, strokeWidth: 1.6 }),
  rect(templateId, 'frame_inner', 20, 20, 469, 639, '', { stroke: COLORS.gold, strokeWidth: 0.8 }),
  text(templateId, 'example', 34, 28, 150, 14, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.plum,
    characterSpacing: 1.5,
    align: 'left',
  }),
  text(templateId, 'masthead_word', 184, 28, 140, 14, 'ROOTS & BRANCHES', {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.gold,
    characterSpacing: 2.4,
    align: 'center',
  }),
  text(templateId, 'skip', 324, 28, 151, 14, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.goldDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  rect(templateId, 'head_rule_a', 34, 46, 441, 1.1, COLORS.plum),
  rect(templateId, 'head_rule_b', 34, 49.5, 441, 0.7, COLORS.gold),
  rect(templateId, 'foot_rule_a', 34, 629, 441, 0.7, COLORS.gold),
  rect(templateId, 'foot_rule_b', 34, 632.5, 441, 1.1, COLORS.plum),
];

const folio = (templateId) =>
  text(templateId, 'folio', 164, 640, 180, 14, 'RECORD · REMEMBER · RETELL', {
    fontSize: 6.2,
    fontWeight: 'bold',
    textColor: COLORS.plumSoft,
    characterSpacing: 1.4,
    align: 'center',
  });

const footerLink = (templateId, role, x, w, value, align, link) =>
  text(templateId, role, x, 640, w, 14, value, {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.goldDeep,
    align,
    ...link,
  });

// --- Templates --------------------------------------------------------------

const cover = {
  id: 'cover',
  name: 'Workbook Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'ground', 0, 0, W, H, COLORS.parchment),
    rect('cover', 'tap_anywhere', 0, 0, W, H, '', {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    rect('cover', 'frame_heavy', 16, 16, 477, 647, '', { stroke: COLORS.plum, strokeWidth: 2 }),
    rect('cover', 'frame_gold', 24, 24, 461, 631, '', { stroke: COLORS.gold, strokeWidth: 0.9 }),
    rect('cover', 'frame_fine', 28, 28, 453, 623, '', { stroke: COLORS.plum, strokeWidth: 0.6 }),
    text('cover', 'kicker', 54, 64, 401, 15, 'A FAMILY HISTORY WORKBOOK', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.goldDeep,
      characterSpacing: 2.2,
      align: 'center',
    }),
    text('cover', 'title', 54, 88, 401, 52, 'Roots & Branches', {
      fontFamily: 'georgia',
      fontSize: 38,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      align: 'center',
    }),
    rect('cover', 'title_rule_a', 154, 150, 200, 1.2, COLORS.gold),
    rect('cover', 'title_rule_b', 154, 155, 200, 0.7, COLORS.gold),
    svg('cover', 'cover_tree', 114, 172, 280, 300, coverArt),
    text('cover', 'subtitle', 74, 488, 361, 56, 'Four generations of your family on one tappable chart: every box opens a person page, every person points to their parents, and the record sheets behind them hold the proof.', {
      fontFamily: 'georgia',
      fontSize: 11.5,
      textColor: COLORS.plum,
      align: 'center',
      verticalAlign: 'top',
    }),
    text('cover', 'open_cta', 144, 556, 220, 44, 'Open the workbook »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.parchment,
      fill: COLORS.plum,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'imprint', 54, 618, 401, 13, 'FIFTEEN ANCESTORS · FOUR GENERATIONS · ONE BOOK OF THE FAMILY', {
      fontSize: 6.8,
      fontWeight: 'bold',
      textColor: COLORS.plumSoft,
      characterSpacing: 1.3,
      align: 'center',
    }),
  ],
};

const start = {
  id: 'start',
  name: 'How To Begin',
  width: W,
  height: H,
  elements: [
    ...pageBase('start'),
    text('start', 'title', 34, 58, 441, 28, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 20,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      align: 'left',
    }),
    text('start', 'premise', 34, 90, 441, 48, 'This workbook keeps a family the way an archivist would: one chart of fifteen ancestors, one page per person, and record sheets that say where every date came from. Fill it in pencil at the kitchen table; ink what you can prove.', {
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.plum,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'howto_label', 34, 146, 240, 'HOW TO USE THIS BOOK'),
    text('start', 'howto_steps', 34, 160, 441, 100, '1. Open the pedigree chart and write the fifteen names you know - gaps are fine.\n2. Tap any box: the person page behind it holds their vitals, timeline and notes.\n3. Follow the kin chips - every page links to its father and mother on the chart.\n4. Sit with the living and work through the interview sheets while you can.\n5. Log every search in the research ledger and number every source you touch.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.plum,
      verticalAlign: 'top',
      align: 'left',
    }),
    svg('start', 'divider', 154, 268, 200, 20, dividerArt),
    text('start', 'example_chip', 34, 300, 213, 36, 'See the example pages »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      fill: COLORS.paper,
      stroke: COLORS.gold,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    text('start', 'archive_chip', 262, 300, 213, 36, 'Open the family archive »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.parchment,
      fill: COLORS.plum,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
    text('start', 'chart_chip', 34, 346, 213, 32, 'Go straight to the chart »', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      fill: COLORS.paper,
      stroke: COLORS.gold,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'pedigree_chart',
    }),
    text('start', 'prompts_chip', 262, 346, 213, 32, 'Interview prompts »', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      fill: COLORS.paper,
      stroke: COLORS.gold,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'prompt_01',
    }),
    label('start', 'anatomy_label', 34, 396, 240, 'HOW THE BOOK IS BUILT'),
    text('start', 'anatomy_text', 34, 410, 441, 90, 'The chart numbers its boxes 1 to 15 the way genealogists do: a father is double his child\'s number, a mother double plus one. Each person page repeats its chart number, and its kin chips quote the numbers they lead to, so chart and pages can never drift apart. Family group sheets hold each marriage and its children; the photo ledger captions pictures before the names are lost; the source index gives every fact a numbered receipt.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.plum,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'proof_label', 34, 512, 240, 'A NOTE ON PROOF'),
    text('start', 'proof_text', 34, 526, 441, 62, 'Memory is a source, not the source. Write what an aunt remembers in pencil, note who said it and when in the research ledger, and only ink a date once a register, certificate or ship manifest agrees. Future readers will thank you for every source number in a margin.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.plum,
      verticalAlign: 'top',
      align: 'left',
    }),
    footerLink('start', 'back_link', 34, 120, '« Cover', 'left', { linkTarget: 'parent' }),
    folio('start'),
    footerLink('start', 'archive_link', 355, 120, 'ARCHIVE »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Tree Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace'),
    text('workspace', 'title', 34, 58, 340, 26, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 19,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      align: 'left',
    }),
    text('workspace', 'hero', 34, 88, 441, 30, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.plum,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'chart_chip', 34, 126, 250, 38, 'Open the four-generation chart »', {
      fontFamily: 'georgia',
      fontSize: 11.5,
      fontWeight: 'bold',
      textColor: COLORS.parchment,
      fill: COLORS.plum,
      align: 'center',
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    text('workspace', 'chart_caption', 296, 128, 179, 36, 'Fifteen linked pages: every box on the chart opens the person behind it.', {
      fontSize: 8,
      textColor: COLORS.plumSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'records_label', 34, 178, 240, 'RECORD BOOKS'),
    ...[
      ['group', 'Family group sheets', 4, 1],
      ['photo', 'Photo ledgers', 4, 5],
      ['research', 'Research ledgers', 4, 9],
      ['sources', 'Source index', 2, 13],
    ].flatMap(([key, rowLabel, count, firstIndex], rowIndex) => [
      text('workspace', `${key}_row_label`, 34, 192 + rowIndex * 27 + 3, 150, 14, rowLabel, {
        fontFamily: 'georgia',
        fontSize: 10,
        textColor: COLORS.plum,
        align: 'left',
      }),
      ...Array.from({ length: count }, (unused, chip) =>
        text('workspace', `${key}_chip_${chip + 1}`, 196 + chip * 36, 192 + rowIndex * 27, 30, 22, String(chip + 1), {
          fontFamily: 'georgia',
          fontSize: 10,
          fontWeight: 'bold',
          textColor: COLORS.plum,
          fill: COLORS.paper,
          stroke: COLORS.gold,
          strokeWidth: 0.9,
          align: 'center',
          linkTarget: 'child_index',
          linkValue: String(firstIndex + chip),
        })),
    ]),
    label('workspace', 'voices_label', 34, 309, 240, 'FAMILY VOICES'),
    text('workspace', 'prompts_chip', 34, 323, 190, 30, 'Interview prompts »', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      fill: COLORS.paper,
      stroke: COLORS.gold,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'prompt_01',
    }),
    text('workspace', 'prompts_caption', 236, 325, 239, 28, 'Questions to ask the living while you can · two per sheet, with room to write the answers down.', {
      fontSize: 8,
      textColor: COLORS.plumSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'spare_label', 34, 369, 300, 'BLANK PERSON PAGES'),
    text('workspace', 'spare_note', 34, 381, 441, 13, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontSize: 7.5,
      textColor: COLORS.plumSoft,
      align: 'left',
    }),
    ...Array.from({ length: 16 }, (unused, slot) =>
      text('workspace', `spare_chip_${slot + 1}`, slot < 8 ? 34 : 262, 398 + (slot % 8) * 24, 213, 20, `{{spare_${slot + 1}_label}}`, {
        dataBinding: `spare_${slot + 1}_label`,
        fontFamily: 'georgia',
        fontSize: 10,
        fontWeight: 'bold',
        textColor: COLORS.goldDeep,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(15 + slot),
      })),
    footerLink('workspace', 'back_link', 34, 120, '« First steps', 'left', { linkTarget: 'parent' }),
    folio('workspace'),
    footerLink('workspace', 'chart_link', 355, 120, 'PEDIGREE CHART »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'pedigree_chart',
    }),
  ],
};

const chart = {
  id: 'chart',
  name: 'Pedigree Chart',
  width: W,
  height: H,
  elements: [
    ...pageBase('chart'),
    text('chart', 'eyebrow', 34, 58, 330, 11, 'FOUR GENERATIONS · EVERY BOX IS A PAGE', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.goldDeep,
      characterSpacing: 1.6,
      align: 'left',
    }),
    text('chart', 'title', 34, 70, 330, 22, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 16,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      align: 'left',
    }),
    text('chart', 'tap_note', 364, 74, 111, 14, 'Tap a box »', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.plumSoft,
      align: 'right',
    }),
    ...['SELF', 'PARENTS', 'GRANDPARENTS', 'GREAT-GRANDPARENTS'].map((caption, col) =>
      text('chart', `col_caption_${col + 1}`, CHART_COLS[col], 94, BOX_W, 8, caption, {
        fontSize: 5.8,
        fontWeight: 'bold',
        textColor: COLORS.goldDeep,
        characterSpacing: 0.6,
        align: 'center',
      })),
    svg('chart', 'connectors', CHART_LEFT, CHART_TOP, 441, 506, chartConnectorArt),
    ...BOXES.flatMap((box, index) => [
      rect('chart', `box_${index + 1}`, box.x, box.y, BOX_W, BOX_H, COLORS.paper, {
        stroke: COLORS.plum,
        strokeWidth: 1,
      }),
      rect('chart', `box_${index + 1}_inner`, box.x + 3, box.y + 3, BOX_W - 6, BOX_H - 6, '', {
        stroke: COLORS.gold,
        strokeWidth: 0.5,
      }),
      text('chart', `box_${index + 1}_no`, box.x + 5, box.y + 4, 18, 9, String(index + 1), {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.goldDeep,
        align: 'left',
      }),
      text('chart', `box_${index + 1}_chip`, box.x + 1, box.y + 12, BOX_W - 2, 30, `{{box_${index + 1}_label}}`, {
        dataBinding: `box_${index + 1}_label`,
        fontFamily: 'georgia',
        fontSize: 9,
        fontWeight: 'bold',
        textColor: COLORS.plum,
        align: 'center',
        linkTarget: 'child_index',
        linkValue: String(index),
      }),
    ]),
    text('chart', 'legend', 34, 613, 441, 13, 'Numbered the genealogist\'s way: a father is double his child\'s number, a mother double plus one.', {
      fontSize: 6.8,
      textColor: COLORS.plumSoft,
      align: 'center',
    }),
    footerLink('chart', 'back_link', 34, 120, '« Archive', 'left', { linkTarget: 'parent' }),
    folio('chart'),
    footerLink('chart', 'guide_link', 355, 120, 'FIRST STEPS »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
  ],
};

const person = {
  id: 'person',
  name: 'Person Page',
  width: W,
  height: H,
  elements: [
    ...pageBase('person'),
    text('person', 'role_line', 34, 58, 320, 11, '{{role_line}}', {
      dataBinding: 'role_line',
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.goldDeep,
      characterSpacing: 1.4,
      align: 'left',
    }),
    text('person', 'title', 34, 71, 320, 26, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 19,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      align: 'left',
    }),
    text('person', 'chart_chip', 364, 66, 111, 26, 'Pedigree chart »', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      fontWeight: 'bold',
      textColor: COLORS.parchment,
      fill: COLORS.plum,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'pedigree_chart',
    }),
    label('person', 'vitals_label', 34, 106, 120, 'VITALS'),
    ...[['BORN', 'born_value'], ['MARRIED', 'married_value'], ['DIED', 'died_value'], ['PLACES', 'places_value']].flatMap(([rowLabel, field], row) => [
      text('person', `${field}_label`, 34, 120 + row * 26 + 2, 72, 14, rowLabel, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.goldDeep,
        characterSpacing: 1.3,
        align: 'left',
      }),
      rect('person', `${field}_rule`, 112, 120 + row * 26 + 16, 363, 0.8, COLORS.gold),
      text('person', `${field}_value`, 112, 120 + row * 26, 363, 16, `{{${field}}}`, {
        dataBinding: field,
        fontFamily: 'georgia',
        fontSize: 10,
        textColor: COLORS.plum,
        align: 'left',
      }),
    ]),
    label('person', 'timeline_label', 34, 228, 160, 'TIMELINE'),
    ...[0, 1, 2, 3, 4].flatMap(row => [
      rect('person', `year_box_${row + 1}`, 34, 242 + row * 30, 52, 24, COLORS.paper, {
        stroke: COLORS.plum,
        strokeWidth: 0.9,
      }),
      text('person', `year_${row + 1}`, 34, 242 + row * 30, 52, 24, `{{year_${row + 1}}}`, {
        dataBinding: `year_${row + 1}`,
        fontFamily: 'georgia',
        fontSize: 10,
        fontWeight: 'bold',
        textColor: COLORS.plum,
        align: 'center',
      }),
      rect('person', `timeline_rule_${row + 1}`, 96, 242 + row * 30 + 21, 379, 0.8, COLORS.rule),
      text('person', `timeline_${row + 1}`, 96, 242 + row * 30 + 2, 379, 20, `{{timeline_${row + 1}}}`, {
        dataBinding: `timeline_${row + 1}`,
        fontFamily: 'georgia',
        fontSize: 9.5,
        textColor: COLORS.plum,
        align: 'left',
      }),
    ]),
    label('person', 'notes_label', 34, 398, 120, 'NOTES'),
    writingLines('person', 'notes_lines', 34, 412, 441, 64, 21),
    text('person', 'person_note', 34, 410, 441, 64, '{{person_note}}', {
      dataBinding: 'person_note',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.plum,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('person', 'kin_label', 34, 488, 240, 'FAMILY ON THE CHART'),
    ...[0, 1, 2, 3, 4, 5].map(slot =>
      text('person', `kin_chip_${slot + 1}`, slot < 3 ? 34 : 262, 502 + (slot % 3) * 25, 213, 21, `{{kin_${slot + 1}_label}}`, {
        dataBinding: `kin_${slot + 1}_label`,
        fontFamily: 'georgia',
        fontSize: 10,
        fontWeight: 'bold',
        textColor: COLORS.goldDeep,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(slot),
      })),
    text('person', 'proof_hint', 34, 584, 441, 14, 'Verify with a source before inking a date · the source index waits at the back of the book.', {
      fontSize: 7.5,
      textColor: COLORS.plumSoft,
      align: 'left',
    }),
    footerLink('person', 'back_link', 34, 120, '« Back', 'left', { linkTarget: 'parent' }),
    folio('person'),
    footerLink('person', 'archive_link', 355, 120, 'ARCHIVE »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
  ],
};

// --- Ledger construction ----------------------------------------------------
// Every table is explicit bordered rects - no grid elements in this product.

const ledgerTable = (templateId, y, cols, rowCount, rowHeight) => [
  ...cols.map((col, colIndex) =>
    rect(templateId, `head_${colIndex}`, col.x, y, col.w, 22, COLORS.plum)),
  ...cols.map((col, colIndex) =>
    text(templateId, `head_text_${colIndex}`, col.x + 6, y, col.w - 6, 22, col.head, {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.parchment,
      characterSpacing: 1,
      align: 'left',
    })),
  ...Array.from({ length: rowCount }, (unused, row) =>
    cols.map((col, colIndex) =>
      rect(templateId, `cell_${row + 1}_${colIndex}`, col.x, y + 22 + row * rowHeight, col.w, rowHeight, COLORS.paper, {
        stroke: COLORS.gold,
        strokeWidth: 0.8,
      }))).flat(),
];

const groupSheet = {
  id: 'group_sheet',
  name: 'Family Group Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('group_sheet'),
    text('group_sheet', 'title', 34, 58, 340, 24, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 17,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      align: 'left',
    }),
    text('group_sheet', 'subtitle', 34, 86, 441, 13, 'One marriage · the couple and their children together on one sheet.', {
      fontSize: 8.5,
      textColor: COLORS.plumSoft,
      align: 'left',
    }),
    ...[
      ['HUSBAND · FULL NAME', 'husband'],
      ['BORN · WHERE', 'husband_born'],
      ['WIFE · FULL NAME', 'wife'],
      ['BORN · WHERE', 'wife_born'],
      ['MARRIED · WHEN AND WHERE', 'married'],
    ].flatMap(([rowLabel, key], row) => [
      text('group_sheet', `${key}_label`, 34, 106 + row * 26, 130, 14, rowLabel, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.goldDeep,
        characterSpacing: 1.2,
        align: 'left',
      }),
      rect('group_sheet', `${key}_rule`, 170, 106 + row * 26 + 15, 305, 0.8, COLORS.gold),
    ]),
    label('group_sheet', 'children_label', 34, 244, 240, 'CHILDREN OF THIS MARRIAGE'),
    ...ledgerTable('group_sheet', 260, [
      { x: 34, w: 30, head: 'NO.' },
      { x: 64, w: 180, head: 'CHILD' },
      { x: 244, w: 80, head: 'BORN' },
      { x: 324, w: 80, head: 'MARRIED' },
      { x: 404, w: 71, head: 'DIED' },
    ], 8, 40),
    ...Array.from({ length: 8 }, (unused, row) =>
      text('group_sheet', `child_no_${row + 1}`, 34, 282 + row * 40, 30, 40, String(row + 1), {
        fontFamily: 'georgia',
        fontSize: 10,
        fontWeight: 'bold',
        textColor: COLORS.gold,
        align: 'center',
      })),
    text('group_sheet', 'margin_hint', 34, 610, 441, 13, 'Note adoptions, second marriages and changes of name in the margin they belong to.', {
      fontSize: 7.5,
      textColor: COLORS.plumSoft,
      align: 'left',
    }),
    footerLink('group_sheet', 'back_link', 34, 120, '« Archive', 'left', { linkTarget: 'parent' }),
    folio('group_sheet'),
    footerLink('group_sheet', 'chart_link', 355, 120, 'PEDIGREE CHART »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'pedigree_chart',
    }),
  ],
};

const prompts = {
  id: 'prompts',
  name: 'Story Prompts',
  width: W,
  height: H,
  elements: [
    ...pageBase('prompts'),
    text('prompts', 'eyebrow', 34, 58, 340, 11, 'FAMILY VOICES · ASK WHILE YOU CAN', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.goldDeep,
      characterSpacing: 1.6,
      align: 'left',
    }),
    text('prompts', 'title', 34, 70, 340, 22, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 16,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      align: 'left',
    }),
    label('prompts', 'q1_label', 34, 100, 200, 'FIRST QUESTION'),
    text('prompts', 'prompt_a', 34, 114, 441, 32, '{{prompt_a}}', {
      dataBinding: 'prompt_a',
      fontFamily: 'georgia',
      fontSize: 11,
      textColor: COLORS.plum,
      verticalAlign: 'top',
      align: 'left',
    }),
    writingLines('prompts', 'q1_lines', 34, 152, 441, 168, 24),
    label('prompts', 'q2_label', 34, 336, 200, 'SECOND QUESTION'),
    text('prompts', 'prompt_b', 34, 350, 441, 32, '{{prompt_b}}', {
      dataBinding: 'prompt_b',
      fontFamily: 'georgia',
      fontSize: 11,
      textColor: COLORS.plum,
      verticalAlign: 'top',
      align: 'left',
    }),
    writingLines('prompts', 'q2_lines', 34, 388, 441, 168, 24),
    text('prompts', 'spoke_label', 34, 572, 130, 13, 'WHO SPOKE · WHEN', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.goldDeep,
      characterSpacing: 1.2,
      align: 'left',
    }),
    rect('prompts', 'spoke_rule', 170, 584, 305, 0.8, COLORS.gold),
    text('prompts', 'prev_chip', 34, 600, 140, 16, '{{prev_label}}', {
      dataBinding: 'prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.goldDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('prompts', 'next_chip', 335, 600, 140, 16, '{{next_label}}', {
      dataBinding: 'next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.goldDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('prompts', 'back_link', 34, 120, '« Archive', 'left', { linkTarget: 'parent' }),
    folio('prompts'),
    footerLink('prompts', 'chart_link', 355, 120, 'PEDIGREE CHART »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'pedigree_chart',
    }),
  ],
};

const photoLog = {
  id: 'photo_log',
  name: 'Photo Ledger',
  width: W,
  height: H,
  elements: [
    ...pageBase('photo_log'),
    text('photo_log', 'title', 34, 58, 340, 24, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 17,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      align: 'left',
    }),
    text('photo_log', 'subtitle', 34, 86, 441, 13, 'Caption every photograph before the names are lost with the people who knew them.', {
      fontSize: 8.5,
      textColor: COLORS.plumSoft,
      align: 'left',
    }),
    ...ledgerTable('photo_log', 106, [
      { x: 34, w: 26, head: 'NO.' },
      { x: 60, w: 190, head: 'THE PHOTOGRAPH' },
      { x: 250, w: 64, head: 'TAKEN' },
      { x: 314, w: 161, head: 'PEOPLE PICTURED' },
    ], 10, 46),
    footerLink('photo_log', 'back_link', 34, 120, '« Archive', 'left', { linkTarget: 'parent' }),
    folio('photo_log'),
    footerLink('photo_log', 'chart_link', 355, 120, 'PEDIGREE CHART »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'pedigree_chart',
    }),
  ],
};

const researchLog = {
  id: 'research_log',
  name: 'Research Ledger',
  width: W,
  height: H,
  elements: [
    ...pageBase('research_log'),
    text('research_log', 'title', 34, 58, 340, 24, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 17,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      align: 'left',
    }),
    text('research_log', 'subtitle', 34, 86, 441, 13, 'Log every search - the empty-handed ones spare you repeating them next year.', {
      fontSize: 8.5,
      textColor: COLORS.plumSoft,
      align: 'left',
    }),
    ...ledgerTable('research_log', 106, [
      { x: 34, w: 58, head: 'DATE' },
      { x: 92, w: 150, head: 'WHERE SEARCHED' },
      { x: 242, w: 120, head: 'LOOKING FOR' },
      { x: 362, w: 113, head: 'FOUND' },
    ], 10, 46),
    footerLink('research_log', 'back_link', 34, 120, '« Archive', 'left', { linkTarget: 'parent' }),
    folio('research_log'),
    footerLink('research_log', 'chart_link', 355, 120, 'PEDIGREE CHART »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'pedigree_chart',
    }),
  ],
};

const sources = {
  id: 'sources',
  name: 'Source Index',
  width: W,
  height: H,
  elements: [
    ...pageBase('sources'),
    text('sources', 'title', 34, 58, 340, 24, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 17,
      fontWeight: 'bold',
      textColor: COLORS.plum,
      align: 'left',
    }),
    text('sources', 'subtitle', 34, 86, 441, 13, 'Number a source once · cite that number everywhere it proves a fact.', {
      fontSize: 8.5,
      textColor: COLORS.plumSoft,
      align: 'left',
    }),
    ...ledgerTable('sources', 106, [
      { x: 34, w: 34, head: 'NO.' },
      { x: 68, w: 277, head: 'THE SOURCE · WHAT AND WHERE IT IS' },
      { x: 345, w: 130, head: 'PROVES' },
    ], 12, 38),
    footerLink('sources', 'back_link', 34, 120, '« Archive', 'left', { linkTarget: 'parent' }),
    folio('sources'),
    footerLink('sources', 'chart_link', 355, 120, 'PEDIGREE CHART »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'pedigree_chart',
    }),
  ],
};

return {
  cover,
  start,
  workspace,
  chart,
  person,
  group_sheet: groupSheet,
  prompts,
  photo_log: photoLog,
  research_log: researchLog,
  sources,
};
