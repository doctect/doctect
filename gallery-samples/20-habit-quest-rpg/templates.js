const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  rubric: '#5a2f2b',    // primary ink: rubricated banners, borders, text
  gold: '#9c7c2e',      // illumination: diamonds, rules, accents
  vellum: '#f3ecda',    // page ground
  parchment: '#fbf7ec', // writable cells and plates
  faded: '#8a7a5c',     // soft labels and captions
  line: '#d9cca9',      // hairlines and writing lines
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
    textColor: COLORS.rubric,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const label = (templateId, role, x, y, w, value, extra = {}) =>
  text(templateId, role, x, y, w, 12, value, {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.faded,
    characterSpacing: 1.6,
    align: 'left',
    ...extra,
  });

const writingLines = (templateId, role, x, y, w, h, spacing = 24) =>
  rect(templateId, role, x, y, w, h, COLORS.line, {
    fillType: 'pattern',
    patternType: 'lines-h',
    patternSpacing: spacing,
    patternWeight: 0.8,
  });

// --- Original artwork -------------------------------------------------------
// Illuminated-manuscript motifs: XP diamonds, rubricated banner trims, a guild
// emblem, and a trophy shield - all deterministic inline markup.

const diamondMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M12 1.4 L22.6 12 L12 22.6 L1.4 12 Z" fill="${COLORS.parchment}" stroke="${COLORS.gold}" stroke-width="1.6"/>
  <path d="M12 4.6 L19.4 12 L12 19.4 L4.6 12 Z" fill="none" stroke="${COLORS.gold}" stroke-width="0.6"/>
</svg>`;

const circleMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
  <circle cx="9" cy="9" r="7.4" fill="${COLORS.parchment}" stroke="${COLORS.rubric}" stroke-width="1.3"/>
  <circle cx="9" cy="9" r="4.6" fill="none" stroke="${COLORS.line}" stroke-width="0.7"/>
</svg>`;

// Head flourish: hairline - diamond - hairline, the rubricator's section mark.
const headFlourish = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 10">
  <path d="M0 5 H31" stroke="${COLORS.gold}" stroke-width="1"/>
  <path d="M40 0.8 L44.2 5 L40 9.2 L35.8 5 Z" fill="${COLORS.gold}"/>
  <path d="M49 5 H80" stroke="${COLORS.gold}" stroke-width="1"/>
</svg>`;

// Foot mark: one XP diamond flanked by dashes on the centerline.
const footDiamond = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 14">
  <path d="M0 7 H6" stroke="${COLORS.gold}" stroke-width="0.9"/>
  <path d="M12 1.6 L17.4 7 L12 12.4 L6.6 7 Z" fill="none" stroke="${COLORS.gold}" stroke-width="1.2"/>
  <path d="M18 7 H24" stroke="${COLORS.gold}" stroke-width="0.9"/>
</svg>`;

// Banner trim: an inset gold frame with corner diamonds, laid over rubric.
const bannerTrim = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <rect x="3.5" y="3.5" width="${w - 7}" height="${h - 7}" fill="none" stroke="${COLORS.gold}" stroke-width="0.9"/>
  <path d="M3.5 0.5 L6.5 3.5 L3.5 6.5 L0.5 3.5 Z" fill="${COLORS.gold}"/>
  <path d="M${w - 3.5} 0.5 L${w - 0.5} 3.5 L${w - 3.5} 6.5 L${w - 6.5} 3.5 Z" fill="${COLORS.gold}"/>
  <path d="M3.5 ${h - 6.5} L6.5 ${h - 3.5} L3.5 ${h - 0.5} L0.5 ${h - 3.5} Z" fill="${COLORS.gold}"/>
  <path d="M${w - 3.5} ${h - 6.5} L${w - 0.5} ${h - 3.5} L${w - 3.5} ${h - 0.5} L${w - 6.5} ${h - 3.5} Z" fill="${COLORS.gold}"/>
</svg>`;

// The cover's illuminated frame: double border with corner diamonds.
const coverFrame = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 477 647">
  <rect x="2" y="2" width="473" height="643" fill="none" stroke="${COLORS.gold}" stroke-width="2"/>
  <rect x="9" y="9" width="459" height="629" fill="none" stroke="${COLORS.gold}" stroke-width="0.7"/>
  <path d="M9 2 L16 9 L9 16 L2 9 Z" fill="${COLORS.gold}"/>
  <path d="M468 2 L475 9 L468 16 L461 9 Z" fill="${COLORS.gold}"/>
  <path d="M9 631 L16 638 L9 645 L2 638 Z" fill="${COLORS.gold}"/>
  <path d="M468 631 L475 638 L468 645 L461 638 Z" fill="${COLORS.gold}"/>
</svg>`;

// The mark of the guild: nested XP diamonds around a ring, points capped.
const guildEmblem = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 250">
  <path d="M125 8 L242 125 L125 242 L8 125 Z" fill="none" stroke="${COLORS.gold}" stroke-width="2.4"/>
  <path d="M125 18 L232 125 L125 232 L18 125 Z" fill="none" stroke="${COLORS.gold}" stroke-width="0.8"/>
  <path d="M125 56 L194 125 L125 194 L56 125 Z" fill="${COLORS.gold}" opacity="0.26"/>
  <circle cx="125" cy="125" r="27" fill="none" stroke="${COLORS.vellum}" stroke-width="2"/>
  <circle cx="125" cy="125" r="20" fill="none" stroke="${COLORS.vellum}" stroke-width="0.7"/>
  <path d="M125 0.8 L130 5.8 L125 10.8 L120 5.8 Z" fill="${COLORS.gold}"/>
  <path d="M125 239.2 L130 244.2 L125 249.2 L120 244.2 Z" fill="${COLORS.gold}"/>
  <path d="M0.8 125 L5.8 120 L10.8 125 L5.8 130 Z" fill="${COLORS.gold}"/>
  <path d="M239.2 125 L244.2 120 L249.2 125 L244.2 130 Z" fill="${COLORS.gold}"/>
</svg>`;

// Trophy shield: a plinth-ready escutcheon with a gold diamond charge.
const trophyShield = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 56">
  <path d="M25 2 L46 9 V28 C46 42 37 51 25 54 C13 51 4 42 4 28 V9 Z" fill="${COLORS.vellum}" stroke="${COLORS.gold}" stroke-width="1.6"/>
  <path d="M25 12 L34 21 L25 30 L16 21 Z" fill="${COLORS.gold}"/>
  <path d="M10 38 H40" stroke="${COLORS.gold}" stroke-width="0.8"/>
</svg>`;

// Three small diamonds under the cover title.
const titleDiamonds = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 10">
  <path d="M5 1 L9 5 L5 9 L1 5 Z" fill="${COLORS.gold}"/>
  <path d="M15 1 L19 5 L15 9 L11 5 Z" fill="${COLORS.gold}"/>
  <path d="M25 1 L29 5 L25 9 L21 5 Z" fill="${COLORS.gold}"/>
</svg>`;

// XP diamond with its value inked on top; ink text over a parchment lozenge.
const xpDiamond = (templateId, role, x, y, value, size = 24, fontSize = 7.5) => [
  svg(templateId, `${role}_mark`, x, y, size, size, diamondMark),
  text(templateId, `${role}_value`, x, y, size, size, value, {
    fontSize,
    fontWeight: 'bold',
    textColor: COLORS.rubric,
    align: 'center',
  }),
];

const checkCircle = (templateId, role, x, y, size = 16) =>
  svg(templateId, role, x, y, size, size, circleMark);

// --- Shared rubricated chrome ------------------------------------------------
// Head: two full-width hairline bands (rubric over gold) pinned to the very
// top edge, a small centered section flourish, EXAMPLE at left, skip at right.
// Foot: a gold hairline with a single XP diamond on the centerline. Unlike the
// slabs, full-bleed bands, frames, and command bars of products 09-19.

const pageBase = (templateId, backLabel, rightLabel, rightLink) => [
  rect(templateId, 'ground', 0, 0, W, H, COLORS.vellum),
  rect(templateId, 'head_band_a', 0, 0, W, 3.5, COLORS.rubric),
  rect(templateId, 'head_band_b', 0, 5.5, W, 1.2, COLORS.gold),
  text(templateId, 'example', 30, 12, 120, 14, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.rubric,
    characterSpacing: 1.5,
    align: 'left',
  }),
  text(templateId, 'masthead', 180, 12, 149, 12, 'THE QUEST LEDGER', {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.rubric,
    characterSpacing: 2.4,
    align: 'center',
  }),
  text(templateId, 'masthead_sub', 180, 26, 149, 10, 'A BOOK OF DEEDS & DAYS', {
    fontSize: 5.5,
    fontWeight: 'bold',
    textColor: COLORS.faded,
    characterSpacing: 2,
    align: 'center',
  }),
  svg(templateId, 'head_flourish', 214.5, 40, 80, 10, headFlourish),
  text(templateId, 'skip', 349, 12, 130, 14, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.rubric,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  rect(templateId, 'foot_rule', 30, 632, 449, 0.8, COLORS.gold),
  svg(templateId, 'foot_mark', 242.5, 640, 24, 14, footDiamond),
  text(templateId, 'foot_back', 30, 640, 150, 16, backLabel, {
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.rubric,
    align: 'left',
    linkTarget: 'parent',
  }),
  text(templateId, 'foot_right', 329, 640, 150, 16, rightLabel, {
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.rubric,
    align: 'right',
    ...rightLink,
  }),
];

const pageTitle = (templateId, value, extra = {}) =>
  text(templateId, 'page_title', 30, 64, 449, 24, value, {
    fontFamily: 'georgia',
    fontSize: 18,
    fontWeight: 'bold',
    textColor: COLORS.rubric,
    align: 'left',
    ...extra,
  });

// Unfilled tap chip over a hairline: ink text only, so a '' binding vanishes.
const slotChip = (templateId, role, x, y, w, field, link, extra = {}) => [
  text(templateId, role, x, y, w, 24, `{{${field}}}`, {
    dataBinding: field,
    fontFamily: 'georgia',
    fontSize: 10.5,
    fontWeight: 'bold',
    textColor: COLORS.rubric,
    align: 'left',
    ...link,
    ...extra,
  }),
  rect(templateId, `${role}_rule`, x, y + 25, w, 0.8, COLORS.line),
];

const doorChip = (templateId, role, x, y, value, link, filled = false) =>
  text(templateId, role, x, y, 215, 34, value, {
    fontFamily: 'georgia',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: filled ? COLORS.vellum : COLORS.rubric,
    fill: filled ? COLORS.rubric : COLORS.parchment,
    stroke: filled ? '' : COLORS.rubric,
    strokeWidth: filled ? 0 : 0.9,
    align: 'center',
    ...link,
  });

// --- Templates --------------------------------------------------------------

const cover = {
  id: 'cover',
  name: 'Ledger Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'ground', 0, 0, W, H, COLORS.rubric),
    base('cover', 'tap_anywhere', 'rect', 0, 0, W, H, {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    svg('cover', 'frame', 16, 16, 477, 647, coverFrame),
    text('cover', 'kicker', 60, 54, 389, 14, 'EVERY HABIT AN ADVENTURE · EVERY GOAL A BOSS', {
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.gold,
      characterSpacing: 2,
      align: 'center',
    }),
    text('cover', 'title', 54, 74, 401, 50, 'The Quest Ledger', {
      fontFamily: 'georgia',
      fontSize: 34,
      fontWeight: 'bold',
      textColor: COLORS.vellum,
      align: 'center',
    }),
    rect('cover', 'title_rule', 180, 132, 149, 1, COLORS.gold),
    svg('cover', 'title_diamonds', 239.5, 138, 30, 10, titleDiamonds),
    svg('cover', 'emblem', 129.5, 168, 250, 250, guildEmblem),
    text('cover', 'emblem_caption', 96, 430, 317, 12, 'THE MARK OF THE GUILD · TEN LEVELS · FOUR VIRTUES', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.gold,
      characterSpacing: 1.6,
      align: 'center',
    }),
    text('cover', 'sub', 74, 458, 361, 66, 'Write three small quests every morning, hunt bosses of your own naming, and bank every deed in an illuminated ledger of XP – four skill trees, ten levels, and a trophy hall wait for the proof.', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.vellum,
      align: 'center',
      verticalAlign: 'top',
    }),
    text('cover', 'open_cta', 164.5, 540, 180, 34, 'Open the ledger »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.rubric,
      fill: COLORS.vellum,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'imprint', 96, 600, 317, 12, 'CHARACTER · TREES · QUESTS · BOSSES · TROPHIES', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.gold,
      characterSpacing: 1.8,
      align: 'center',
    }),
  ],
};

const XP_TABLE = [
  ['xp_daily', 30, 278, '10', 'Daily quest kept – 10 XP'],
  ['xp_side', 30, 306, '5', 'Side quest done – 5 XP'],
  ['xp_phase', 264, 278, '25', 'Boss phase cleared – 25 XP'],
  ['xp_defeat', 264, 306, '100', 'Boss defeated – 100 XP'],
];

const levelCells = (templateId, y) => {
  const step = (449 - 41 * 10) / 9 + 41;
  const cells = [];
  for (let n = 1; n <= 10; n += 1) {
    const x = 30 + (n - 1) * step;
    cells.push(
      rect(templateId, `level_cell_${n}`, x, y, 41, 40, COLORS.parchment, {
        stroke: COLORS.gold,
        strokeWidth: 1,
      }),
      text(templateId, `level_num_${n}`, x, y + 4, 41, 16, String(n), {
        fontFamily: 'georgia',
        fontSize: 11,
        fontWeight: 'bold',
        textColor: COLORS.rubric,
        align: 'center',
      }),
      text(templateId, `level_at_${n}`, x, y + 22, 41, 12, String(n * 100), {
        fontSize: 5.5,
        fontWeight: 'bold',
        textColor: COLORS.faded,
        align: 'center',
      }),
    );
  }
  return cells;
};

const start = {
  id: 'start',
  name: 'Rulebook',
  width: W,
  height: H,
  elements: [
    ...pageBase('start', '« Cover', 'THE GUILD HUB »', {
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
    pageTitle('start', '{{title}}'),
    text('start', 'premise', 30, 94, 449, 44, 'The Quest Ledger plays your real days as a tabletop campaign. Habits are daily quests, big goals are bosses, and every kept promise banks experience points – the ledger only ever counts what you actually did.', {
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.rubric,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'howto_label', 30, 146, 260, 'HOW THE GAME IS PLAYED'),
    text('start', 'howto_steps', 30, 162, 449, 96, '1. Name your adventurer on the character sheet – the four virtues are its stats.\n2. Each morning, write three daily quests and one side quest on the day\'s page.\n3. Tick what you keep and enter the points in the XP ledger the same night.\n4. Break every big goal into four phases on a boss page mustered on the quest board.\n5. When the ledger crosses a level line, shade the box, log it, and claim a reward.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.rubric,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'earning_label', 30, 262, 220, 'EARNING XP'),
    ...XP_TABLE.flatMap(([role, x, y, value, caption]) => [
      ...xpDiamond('start', role, x, y, value, 24, value.length > 2 ? 6.5 : 7.5),
      text('start', `${role}_caption`, x + 32, y, 183, 24, caption, {
        fontFamily: 'georgia',
        fontSize: 9.5,
        textColor: COLORS.rubric,
        align: 'left',
      }),
    ]),
    label('start', 'spending_label', 30, 344, 300, 'SPENDING XP · THE SKILL TREES'),
    text('start', 'spending_note', 30, 360, 449, 30, 'XP is also coin. Unlock a tier-one skill for 100 XP, tier two for 250, tier three for 500 – spent points stay on your lifetime total; the trees share one purse.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.rubric,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'level_label', 30, 400, 220, 'THE LEVEL TABLE'),
    text('start', 'level_rule_note', 30, 416, 449, 14, 'Level N falls when your lifetime total crosses N x 100 XP – one hundred points a level, always.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      fontWeight: 'bold',
      textColor: COLORS.rubric,
      align: 'left',
    }),
    ...levelCells('start', 436),
    label('start', 'doors_label', 30, 494, 220, 'WHERE TO BEGIN'),
    doorChip('start', 'example_chip', 30, 510, 'The worked example »', {
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    doorChip('start', 'hub_chip', 264, 510, 'Your guild hub »', {
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }, true),
    doorChip('start', 'character_chip', 30, 552, 'The character sheet »', {
      linkTarget: 'specific_node',
      linkValue: 'character_sheet',
    }),
    doorChip('start', 'board_chip', 264, 552, 'The quest board »', {
      linkTarget: 'specific_node',
      linkValue: 'quest_board',
    }),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Guild Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace', '« The rulebook', 'CHARACTER SHEET »', {
      linkTarget: 'specific_node',
      linkValue: 'character_sheet',
    }),
    pageTitle('workspace', '{{title}}'),
    text('workspace', 'hero', 30, 94, 449, 44, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.rubric,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'note', 30, 140, 449, 26, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontSize: 8.5,
      textColor: COLORS.faded,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'bench_label', 30, 174, 260, 'ON THE BENCH'),
    ...slotChip('workspace', 'slot_a_chip', 30, 190, 215, 'slot_a_label', {
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    ...slotChip('workspace', 'slot_b_chip', 264, 190, 215, 'slot_b_label', {
      linkTarget: 'child_index',
      linkValue: '1',
    }),
    label('workspace', 'guild_label', 30, 238, 260, 'THE GUILD'),
    ...[
      ['character', 'hub_character_label', 'character_sheet'],
      ['board', 'hub_board_label', 'quest_board'],
      ['dailies', 'hub_daily_label', 'daily_01'],
      ['ledger', 'hub_ledger_label', 'xp_ledger_01'],
      ['levels', 'hub_levels_label', 'level_log_01'],
      ['trophies', 'hub_trophy_label', 'trophy_01'],
    ].flatMap(([role, labelField, target], index) =>
      slotChip('workspace', `${role}_chip`, index % 2 === 0 ? 30 : 264, 254 + Math.floor(index / 2) * 40, 215, labelField, {
        linkTarget: 'specific_node',
        linkValue: target,
      })),
    label('workspace', 'wiring_label', 30, 382, 300, 'HOW THE TABLE IS SET'),
    text('workspace', 'wiring_note', 30, 398, 449, 56, 'The character sheet\'s chips open the four skill trees and the ledger; the quest board\'s roster rows are reference chips to the same boss pages the trophies celebrate. Daily pages chain morning into morning, and every page returns here.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.rubric,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'notes_label', 30, 464, 260, 'GUILD NOTES'),
    writingLines('workspace', 'notes_lines', 30, 480, 449, 134, 24),
  ],
};

const VIRTUES = ['HEALTH', 'MIND', 'CRAFT', 'SOCIAL'];

const character = {
  id: 'character',
  name: 'Character Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('character', '« The hub', 'QUEST BOARD »', {
      linkTarget: 'specific_node',
      linkValue: 'quest_board',
    }),
    rect('character', 'name_box', 30, 64, 449, 50, COLORS.parchment, {
      stroke: COLORS.rubric,
      strokeWidth: 1.2,
    }),
    svg('character', 'name_trim', 30, 64, 449, 50, bannerTrim(449, 50)),
    label('character', 'name_label', 44, 71, 240, 'ADVENTURER · WRITE YOUR NAME IN'),
    rect('character', 'name_rule', 44, 100, 421, 0.8, COLORS.line),
    label('character', 'class_label', 30, 126, 214, 'CLASS · THE KIND OF HERO'),
    rect('character', 'class_rule', 30, 156, 214, 0.8, COLORS.line),
    label('character', 'motto_label', 264, 126, 215, 'MOTTO · THE WORDS YOU RIDE UNDER'),
    rect('character', 'motto_rule', 264, 156, 215, 0.8, COLORS.line),
    label('character', 'level_label', 30, 170, 400, 'LEVEL · SHADE EACH BOX AS THE LEDGER CROSSES ITS LINE'),
    ...levelCells('character', 186),
    label('character', 'virtues_label', 30, 240, 320, 'THE FOUR VIRTUES · ONE ROW PER TREE'),
    ...VIRTUES.flatMap((virtue, index) => [
      text('character', `virtue_word_${virtue.toLowerCase()}`, 30, 256 + index * 34, 96, 20, virtue, {
        fontSize: 8,
        fontWeight: 'bold',
        textColor: COLORS.rubric,
        characterSpacing: 1.8,
        align: 'left',
      }),
      rect('character', `virtue_rule_${virtue.toLowerCase()}`, 136, 272 + index * 34, 343, 0.8, COLORS.line),
    ]),
    label('character', 'links_label', 30, 396, 320, 'THE TREES & THE LEDGER · TAP THROUGH'),
    ...slotChip('character', 'link_1_chip', 30, 412, 215, 'sheet_link_1', {
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    ...slotChip('character', 'link_2_chip', 264, 412, 215, 'sheet_link_2', {
      linkTarget: 'child_index',
      linkValue: '1',
    }),
    ...slotChip('character', 'link_3_chip', 30, 452, 215, 'sheet_link_3', {
      linkTarget: 'child_index',
      linkValue: '2',
    }),
    ...slotChip('character', 'link_4_chip', 264, 452, 215, 'sheet_link_4', {
      linkTarget: 'child_index',
      linkValue: '3',
    }),
    ...slotChip('character', 'link_5_chip', 30, 492, 215, 'sheet_link_5', {
      linkTarget: 'child_index',
      linkValue: '4',
    }),
    label('character', 'deeds_label', 30, 536, 260, 'DEEDS WORTH REMEMBERING'),
    writingLines('character', 'deeds_lines', 30, 552, 449, 62, 20),
  ],
};

// Skill tree: three tiers of unlock boxes joined by thin gold connectors.
// Tier captions and diamond costs are printed; the name lines stay writable -
// the skills are the player's to invent.

const skillBox = (templateId, role, x, y, tierWord, cost) => [
  rect(templateId, `${role}_box`, x, y, 139, 74, COLORS.parchment, {
    stroke: COLORS.rubric,
    strokeWidth: 1,
  }),
  text(templateId, `${role}_tier`, x + 8, y + 6, 123, 10, `${tierWord} · ${cost} XP`, {
    fontSize: 5.5,
    fontWeight: 'bold',
    textColor: COLORS.faded,
    characterSpacing: 1,
    align: 'left',
  }),
  rect(templateId, `${role}_name_rule`, x + 8, y + 40, 123, 0.8, COLORS.line),
  ...xpDiamond(templateId, `${role}_cost`, x + 8, y + 46, cost, 22, cost.length > 2 ? 5.5 : 6.5),
  checkCircle(templateId, `${role}_done`, x + 112, y + 50, 16),
];

// Connectors between tiers: stubs into a bus, then drops to the next tier.
const treeGapOne = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 449 48">
  <g stroke="${COLORS.gold}" stroke-width="1.1" fill="none">
    <path d="M69.5 0 V16"/><path d="M224.5 0 V16"/><path d="M379.5 0 V16"/>
    <path d="M69.5 16 H379.5"/>
    <path d="M146.5 16 V48"/><path d="M302.5 16 V48"/>
  </g>
  <path d="M146.5 28 L150 31.5 L146.5 35 L143 31.5 Z" fill="${COLORS.gold}"/>
  <path d="M302.5 28 L306 31.5 L302.5 35 L299 31.5 Z" fill="${COLORS.gold}"/>
</svg>`;

const treeGapTwo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 449 48">
  <g stroke="${COLORS.gold}" stroke-width="1.1" fill="none">
    <path d="M146.5 0 V16"/><path d="M302.5 0 V16"/>
    <path d="M146.5 16 H302.5"/>
    <path d="M224.5 16 V48"/>
  </g>
  <path d="M224.5 28 L228 31.5 L224.5 35 L221 31.5 Z" fill="${COLORS.gold}"/>
</svg>`;

const skillTree = {
  id: 'skill_tree',
  name: 'Skill Tree',
  width: W,
  height: H,
  elements: [
    ...pageBase('skill_tree', '« The hub', 'CHARACTER SHEET »', {
      linkTarget: 'specific_node',
      linkValue: 'character_sheet',
    }),
    pageTitle('skill_tree', '{{title}}'),
    text('skill_tree', 'tree_note', 30, 92, 449, 30, '{{tree_note}}', {
      dataBinding: 'tree_note',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.faded,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('skill_tree', 'tier1_label', 30, 128, 300, 'TIER I · THE ROOTS'),
    ...skillBox('skill_tree', 't1_a', 30, 144, 'TIER I', '100'),
    ...skillBox('skill_tree', 't1_b', 185, 144, 'TIER I', '100'),
    ...skillBox('skill_tree', 't1_c', 340, 144, 'TIER I', '100'),
    svg('skill_tree', 'gap_one', 30, 218, 449, 48, treeGapOne),
    ...skillBox('skill_tree', 't2_a', 107, 266, 'TIER II', '250'),
    ...skillBox('skill_tree', 't2_b', 263, 266, 'TIER II', '250'),
    svg('skill_tree', 'gap_two', 30, 340, 449, 48, treeGapTwo),
    ...skillBox('skill_tree', 't3_a', 185, 388, 'TIER III', '500'),
    label('skill_tree', 'unlock_label', 30, 478, 260, 'HOW UNLOCKS WORK'),
    text('skill_tree', 'unlock_note', 30, 494, 449, 44, 'The skills are yours to invent – name each on its line. To unlock one, pay the diamond\'s price from XP already banked in the ledger, then ink the circle. Roots cost 100, the middle boughs 250, the crown 500.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.rubric,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('skill_tree', 'mastery_label', 30, 546, 260, 'MASTERY NOTES'),
    writingLines('skill_tree', 'mastery_lines', 30, 562, 449, 52, 26),
  ],
};

const questBoardRows = () => {
  const elements = [];
  for (let n = 1; n <= 16; n += 1) {
    const y = 134 + (n - 1) * 27;
    elements.push(
      text('quest_board', `board_chip_${n}`, 30, y, 300, 18, `{{board_${n}}}`, {
        dataBinding: `board_${n}`,
        fontFamily: 'georgia',
        fontSize: 10.5,
        fontWeight: 'bold',
        textColor: COLORS.rubric,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(n - 1),
      }),
      rect('quest_board', `board_rule_${n}`, 30, y + 18, 330, 0.8, COLORS.line),
      checkCircle('quest_board', `board_begun_${n}`, 384, y + 2, 15),
      checkCircle('quest_board', `board_felled_${n}`, 452, y + 2, 15),
    );
  }
  return elements;
};

const questBoard = {
  id: 'quest_board',
  name: 'Quest Board',
  width: W,
  height: H,
  elements: [
    ...pageBase('quest_board', '« The hub', 'TROPHY HALL »', {
      linkTarget: 'specific_node',
      linkValue: 'trophy_01',
    }),
    pageTitle('quest_board', '{{title}}'),
    text('quest_board', 'subtitle', 30, 92, 449, 14, 'Every boss in the campaign, mustered on one page – tap a row for its battle.', {
      fontSize: 9,
      textColor: COLORS.faded,
      align: 'left',
    }),
    text('quest_board', 'col_boss', 30, 118, 300, 10, 'BOSS · TAP FOR ITS BATTLE PAGE', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.faded,
      characterSpacing: 1,
      align: 'left',
    }),
    text('quest_board', 'col_begun', 368, 118, 47, 10, 'BEGUN', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.faded,
      characterSpacing: 1,
      align: 'center',
    }),
    text('quest_board', 'col_felled', 436, 118, 43, 10, 'FELLED', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.faded,
      characterSpacing: 1,
      align: 'right',
    }),
    ...questBoardRows(),
    text('quest_board', 'spare_note', 30, 572, 449, 12, 'Empty rows are open contracts – name a new boss on the line whenever one shows itself.', {
      fontSize: 8,
      textColor: COLORS.faded,
      align: 'left',
    }),
  ],
};

const dailyRow = (role, y, value, field) => [
  ...xpDiamond('daily', role, 30, y, value, 24, 7.5),
  text('daily', `${role}_name`, 64, y + 1, 336, 20, `{{${field}}}`, {
    dataBinding: field,
    fontFamily: 'georgia',
    fontSize: 10,
    textColor: COLORS.rubric,
    align: 'left',
  }),
  rect('daily', `${role}_rule`, 64, y + 22, 336, 0.8, COLORS.line),
  checkCircle('daily', `${role}_done`, 452, y + 4, 16),
];

const daily = {
  id: 'daily',
  name: 'Daily Quest',
  width: W,
  height: H,
  elements: [
    ...pageBase('daily', '« The hub', 'XP LEDGER »', {
      linkTarget: 'specific_node',
      linkValue: 'xp_ledger_01',
    }),
    rect('daily', 'drop_cell', 30, 64, 64, 52, COLORS.rubric),
    text('daily', 'drop_ordinal', 30, 68, 64, 44, '{{day_ordinal}}', {
      dataBinding: 'day_ordinal',
      fontFamily: 'georgia',
      fontSize: 22,
      fontWeight: 'bold',
      textColor: COLORS.vellum,
      align: 'center',
    }),
    rect('daily', 'date_box', 94, 64, 385, 52, COLORS.parchment, {
      stroke: COLORS.rubric,
      strokeWidth: 1,
    }),
    label('daily', 'date_label', 104, 70, 200, 'THE DAY & DATE'),
    text('daily', 'date_line', 104, 84, 365, 20, '{{date_line}}', {
      dataBinding: 'date_line',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.rubric,
      align: 'left',
    }),
    rect('daily', 'date_rule', 104, 106, 365, 0.8, COLORS.line),
    label('daily', 'daily_label', 30, 130, 260, 'DAILY QUESTS · 10 XP EACH'),
    ...dailyRow('quest_1', 146, '10', 'daily_1'),
    ...dailyRow('quest_2', 184, '10', 'daily_2'),
    ...dailyRow('quest_3', 222, '10', 'daily_3'),
    label('daily', 'side_label', 30, 262, 220, 'SIDE QUEST · 5 XP'),
    ...dailyRow('side', 278, '5', 'side_quest'),
    rect('daily', 'tally_box', 30, 318, 449, 58, COLORS.parchment, {
      stroke: COLORS.rubric,
      strokeWidth: 1.2,
    }),
    label('daily', 'tally_label', 40, 324, 160, 'XP EARNED TODAY'),
    text('daily', 'tally_value', 40, 338, 240, 30, '{{day_total}}', {
      dataBinding: 'day_total',
      fontFamily: 'georgia',
      fontSize: 15,
      fontWeight: 'bold',
      textColor: COLORS.rubric,
      align: 'left',
    }),
    text('daily', 'tally_note', 266, 324, 203, 46, 'FULL CLEAR · THREE DAILIES\nAT 10 + THE SIDE QUEST 5\n= 35 XP', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.faded,
      characterSpacing: 1,
      align: 'right',
    }),
    label('daily', 'margin_label', 30, 390, 260, 'THE DAY, IN THE MARGIN'),
    writingLines('daily', 'margin_lines', 30, 406, 449, 168, 24),
    text('daily', 'daily_notes', 30, 406, 449, 168, '{{daily_notes}}', {
      dataBinding: 'daily_notes',
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.rubric,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('daily', 'prev_chip', 30, 584, 170, 18, '{{day_prev_label}}', {
      dataBinding: 'day_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.rubric,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('daily', 'next_chip', 309, 584, 170, 18, '{{day_next_label}}', {
      dataBinding: 'day_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.rubric,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
  ],
};

const PHASE_WORDS = ['PHASE I', 'PHASE II', 'PHASE III', 'PHASE IV'];

const boss = {
  id: 'boss',
  name: 'Boss Battle',
  width: W,
  height: H,
  elements: [
    ...pageBase('boss', '« The hub', 'THE LEVEL LOG »', {
      linkTarget: 'specific_node',
      linkValue: 'level_log_01',
    }),
    rect('boss', 'banner', 30, 64, 449, 52, COLORS.rubric),
    svg('boss', 'banner_trim', 30, 64, 449, 52, bannerTrim(449, 52)),
    text('boss', 'banner_kicker', 46, 71, 200, 10, 'BOSS BATTLE', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.gold,
      characterSpacing: 2,
      align: 'left',
    }),
    text('boss', 'banner_title', 46, 82, 300, 28, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 17,
      fontWeight: 'bold',
      textColor: COLORS.vellum,
      align: 'left',
    }),
    text('boss', 'board_chip', 366, 76, 100, 28, 'Quest board »', {
      fontFamily: 'georgia',
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.rubric,
      fill: COLORS.vellum,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'quest_board',
    }),
    label('boss', 'goal_label', 30, 128, 200, 'THE BIG GOAL'),
    text('boss', 'big_goal', 30, 142, 449, 22, '{{big_goal}}', {
      dataBinding: 'big_goal',
      fontFamily: 'georgia',
      fontSize: 11,
      textColor: COLORS.rubric,
      align: 'left',
    }),
    rect('boss', 'goal_rule', 30, 166, 449, 0.8, COLORS.line),
    label('boss', 'phases_label', 30, 182, 280, 'FOUR PHASES · 25 XP EACH'),
    ...PHASE_WORDS.flatMap((word, index) => [
      text('boss', `phase_word_${index + 1}`, 30, 202 + index * 40, 52, 12, word, {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.faded,
        characterSpacing: 1,
        align: 'left',
      }),
      ...xpDiamond('boss', `phase_xp_${index + 1}`, 88, 198 + index * 40, '25', 24, 7.5),
      text('boss', `phase_text_${index + 1}`, 122, 199 + index * 40, 278, 20, `{{phase_${index + 1}}}`, {
        dataBinding: `phase_${index + 1}`,
        fontFamily: 'georgia',
        fontSize: 10,
        textColor: COLORS.rubric,
        align: 'left',
      }),
      rect('boss', `phase_rule_${index + 1}`, 122, 220 + index * 40, 278, 0.8, COLORS.line),
      checkCircle('boss', `phase_done_${index + 1}`, 452, 202 + index * 40, 16),
    ]),
    rect('boss', 'victory_box', 30, 360, 449, 64, COLORS.parchment, {
      stroke: COLORS.rubric,
      strokeWidth: 1.2,
    }),
    label('boss', 'victory_label', 40, 366, 380, 'VICTORY CONDITION · THE KILLING BLOW · 100 XP'),
    text('boss', 'victory_text', 40, 380, 429, 38, '{{victory}}', {
      dataBinding: 'victory',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.rubric,
      verticalAlign: 'top',
      align: 'left',
    }),
    rect('boss', 'loot_box', 30, 434, 449, 54, COLORS.parchment, {
      stroke: COLORS.rubric,
      strokeWidth: 1,
    }),
    label('boss', 'loot_label', 40, 440, 320, 'THE LOOT · CLAIMED WHEN THE BOSS FALLS'),
    text('boss', 'loot_text', 40, 454, 429, 28, '{{loot}}', {
      dataBinding: 'loot',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.rubric,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('boss', 'math_note', 30, 498, 449, 12, 'Four phases at 25 and the killing blow at 100 – a felled boss banks 200 XP in all.', {
      fontSize: 8,
      textColor: COLORS.faded,
      align: 'left',
    }),
    label('boss', 'battle_label', 30, 518, 260, 'BATTLE NOTES'),
    writingLines('boss', 'battle_lines', 30, 534, 449, 80, 20),
    text('boss', 'boss_notes', 30, 534, 449, 80, '{{boss_notes}}', {
      dataBinding: 'boss_notes',
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.rubric,
      verticalAlign: 'top',
      align: 'left',
    }),
  ],
};

const LEDGER_COLS = [
  ['DATE', 30, 64],
  ['THE DEED', 102, 228],
  ['XP', 338, 52],
  ['RUNNING TOTAL', 398, 81],
];

const xpLedgerRows = () => {
  const elements = [];
  for (let n = 1; n <= 16; n += 1) {
    const y = 134 + (n - 1) * 27;
    LEDGER_COLS.forEach(([, x, w]) => {
      elements.push(rect('xp_ledger', `row_${n}_${x}`, x, y + 18, w, 0.8, COLORS.line));
    });
  }
  return elements;
};

const xpLedger = {
  id: 'xp_ledger',
  name: 'XP Ledger',
  width: W,
  height: H,
  elements: [
    ...pageBase('xp_ledger', '« The hub', 'LEVEL LOG »', {
      linkTarget: 'specific_node',
      linkValue: 'level_log_01',
    }),
    pageTitle('xp_ledger', '{{title}}'),
    text('xp_ledger', 'subtitle', 30, 92, 449, 14, 'Every point earned, entered the night it lands – the running total feeds the level log.', {
      fontSize: 9,
      textColor: COLORS.faded,
      align: 'left',
    }),
    ...LEDGER_COLS.map(([word, x, w]) =>
      text('xp_ledger', `col_${x}`, x, 118, w, 10, word, {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.faded,
        characterSpacing: 1,
        align: 'left',
      })),
    ...xpLedgerRows(),
    text('xp_ledger', 'carry_word', 250, 572, 140, 14, 'CARRIED FORWARD »', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.faded,
      characterSpacing: 1.2,
      align: 'right',
    }),
    rect('xp_ledger', 'carry_rule', 398, 586, 81, 0.8, COLORS.line),
    text('xp_ledger', 'prev_chip', 30, 598, 170, 16, '{{ledger_prev_label}}', {
      dataBinding: 'ledger_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.rubric,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('xp_ledger', 'next_chip', 309, 598, 170, 16, '{{ledger_next_label}}', {
      dataBinding: 'ledger_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.rubric,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
  ],
};

const levelLogRows = () => {
  const elements = [];
  for (let n = 1; n <= 10; n += 1) {
    const y = 136 + (n - 1) * 45;
    elements.push(
      rect('level_log', `lvl_box_${n}`, 30, y, 38, 34, COLORS.rubric),
      text('level_log', `lvl_num_${n}`, 30, y + 2, 38, 30, String(n), {
        fontFamily: 'georgia',
        fontSize: 14,
        fontWeight: 'bold',
        textColor: COLORS.vellum,
        align: 'center',
      }),
      text('level_log', `lvl_at_${n}`, 78, y + 8, 62, 18, `${n * 100} XP`, {
        fontFamily: 'georgia',
        fontSize: 10,
        fontWeight: 'bold',
        textColor: COLORS.rubric,
        align: 'left',
      }),
      rect('level_log', `lvl_date_rule_${n}`, 150, y + 28, 140, 0.8, COLORS.line),
      rect('level_log', `lvl_reward_rule_${n}`, 306, y + 28, 173, 0.8, COLORS.line),
    );
  }
  return elements;
};

const levelLog = {
  id: 'level_log',
  name: 'Level Log',
  width: W,
  height: H,
  elements: [
    ...pageBase('level_log', '« The hub', 'TROPHY HALL »', {
      linkTarget: 'specific_node',
      linkValue: 'trophy_01',
    }),
    pageTitle('level_log', '{{title}}'),
    text('level_log', 'subtitle', 30, 92, 449, 14, 'Level N falls when the lifetime total crosses N x 100 XP – shade the sheet, claim the reward.', {
      fontSize: 9,
      textColor: COLORS.faded,
      align: 'left',
    }),
    text('level_log', 'col_level', 30, 120, 110, 10, 'LEVEL · AT', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.faded,
      characterSpacing: 1,
      align: 'left',
    }),
    text('level_log', 'col_date', 150, 120, 140, 10, 'DATE REACHED', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.faded,
      characterSpacing: 1,
      align: 'left',
    }),
    text('level_log', 'col_reward', 306, 120, 173, 10, 'THE REWARD I CLAIMED', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.faded,
      characterSpacing: 1,
      align: 'left',
    }),
    ...levelLogRows(),
    text('level_log', 'flat_note', 30, 592, 449, 12, 'One hundred points a level, always – the climb never steepens.', {
      fontSize: 8,
      textColor: COLORS.faded,
      align: 'left',
    }),
  ],
};

const trophyPlinths = () => {
  const elements = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const n = row * 3 + col + 1;
      const x = 30 + col * 155;
      const y = 124 + row * 122;
      elements.push(
        rect('trophy', `plinth_${n}`, x, y, 139, 110, COLORS.parchment, {
          stroke: COLORS.rubric,
          strokeWidth: 0.9,
        }),
        svg('trophy', `shield_${n}`, x + 44.5, y + 10, 50, 56, trophyShield),
        rect('trophy', `who_rule_${n}`, x + 10, y + 82, 119, 0.8, COLORS.line),
        rect('trophy', `when_rule_${n}`, x + 10, y + 100, 119, 0.8, COLORS.line),
      );
    }
  }
  return elements;
};

const trophy = {
  id: 'trophy',
  name: 'Trophy Hall',
  width: W,
  height: H,
  elements: [
    ...pageBase('trophy', '« The hub', 'QUEST BOARD »', {
      linkTarget: 'specific_node',
      linkValue: 'quest_board',
    }),
    pageTitle('trophy', '{{title}}'),
    text('trophy', 'subtitle', 30, 92, 449, 14, 'A plinth for every boss felled – draw the trophy on the shield, then name and date the deed.', {
      fontSize: 9,
      textColor: COLORS.faded,
      align: 'left',
    }),
    ...trophyPlinths(),
    text('trophy', 'overflow_note', 30, 600, 449, 12, 'Twelve plinths filled? The margins of this hall have room for a victory lap or two more.', {
      fontSize: 8,
      textColor: COLORS.faded,
      align: 'left',
    }),
  ],
};

return {
  cover,
  start,
  workspace,
  character,
  skill_tree: skillTree,
  quest_board: questBoard,
  daily,
  boss,
  xp_ledger: xpLedger,
  level_log: levelLog,
  trophy,
};
