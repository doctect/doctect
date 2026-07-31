const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  blue: '#2e4a66',     // blueprint blue: primary ink, frames, table heads, text
  blueDeep: '#243c54', // deep blue: band heads, tap-target text
  mist: '#8a9aa8',     // graphite mist: secondary text, construction lines
  paper: '#eef3f7',    // drafting paper: page ground
  sheet: '#fbfdff',    // writable cells and plates
  rule: '#c5d2dd',     // fine rules and writing lines
  haze: '#dce6ee',     // light text on blueprint-blue bands
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
    textColor: COLORS.blue,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

// Stencil section label: letterspaced caps behind a small blueprint pip.
const label = (templateId, role, x, y, w, value, extra = {}) => [
  rect(templateId, `${role}_pip`, x, y + 3.5, 5, 5, COLORS.blue),
  text(templateId, role, x + 11, y, w - 11, 12, value, {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.blueDeep,
    characterSpacing: 1.8,
    align: 'left',
    ...extra,
  }),
];

const writingLines = (templateId, role, x, y, w, h, spacing = 24) =>
  rect(templateId, role, x, y, w, h, COLORS.rule, {
    fillType: 'pattern',
    patternType: 'lines-h',
    patternSpacing: spacing,
    patternWeight: 0.8,
  });

// Dashed rules are the product's signature stroke; rect fills cannot dash, so
// each rule is a tiny inline SVG line with a dash array.
const dashedRule = (templateId, role, x, y, w, color = '#2e4a66', weight = 1.4, dash = '7 5') =>
  svg(templateId, role, x, y, w, 3,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 3"><path d="M0 1.5 H${w}" stroke="${color}" stroke-width="${weight}" stroke-dasharray="${dash}" fill="none"/></svg>`);

const checkbox = (templateId, role, x, y, size = 12) =>
  rect(templateId, role, x, y, size, size, COLORS.sheet, {
    stroke: COLORS.blue,
    strokeWidth: 1,
  });

// --- Original artwork -------------------------------------------------------
// Isometric house on a drafting sheet: graphite-mist construction lines, a
// dimension line with end ticks, blueprint-blue walls and roof.

const isoHouseArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260">
  <g id="construction" stroke="#8a9aa8" stroke-width="1" stroke-dasharray="3 6" fill="none">
    <path d="M20 121 L150 196 L280 121"/>
    <path d="M150 196 V26"/>
    <path d="M46 136 L98 166"/>
    <path d="M219 156 L262 131"/>
    <path d="M124 91 L193 51 L232 28"/>
  </g>
  <g id="walls" stroke="#2e4a66" stroke-width="2.5" stroke-linejoin="round">
    <path d="M150 196 L98 166 L98 111 L150 141 Z" fill="#fbfdff"/>
    <path d="M150 196 L219 156 L219 101 L150 141 Z" fill="#eef3f7"/>
  </g>
  <path id="gable" d="M98 111 L150 141 L124 91 Z" fill="#fbfdff" stroke="#2e4a66" stroke-width="2.5" stroke-linejoin="round"/>
  <path id="roof_front" d="M150 141 L219 101 L193 51 L124 91 Z" fill="#2e4a66" stroke="#2e4a66" stroke-width="2.5" stroke-linejoin="round"/>
  <path id="roof_edge" d="M98 111 L124 91" stroke="#2e4a66" stroke-width="2.5" fill="none"/>
  <g id="chimney">
    <path d="M196 74 L196 52 L208 45 L208 67 Z" fill="#8a9aa8" stroke="#2e4a66" stroke-width="2"/>
    <path d="M196 52 L202 49 L208 45" fill="none" stroke="#2e4a66" stroke-width="2"/>
  </g>
  <g id="door">
    <path d="M163 189 L175 182 L175 152 L163 159 Z" fill="#2e4a66"/>
    <circle cx="172" cy="171" r="1.6" fill="#fbfdff"/>
  </g>
  <g id="window_right" stroke="#2e4a66" stroke-width="1.8" fill="#fbfdff">
    <path d="M188 174 L204 165 L204 143 L188 152 Z"/>
    <path d="M196 170 L196 148" stroke-width="1.1"/>
    <path d="M188 163 L204 154" stroke-width="1.1"/>
  </g>
  <g id="window_left" stroke="#2e4a66" stroke-width="1.8" fill="#fbfdff">
    <path d="M111 156 L132 168 L132 146 L111 134 Z"/>
    <path d="M121.5 162 L121.5 140" stroke-width="1.1"/>
    <path d="M111 145 L132 157" stroke-width="1.1"/>
  </g>
  <g id="dimension" stroke="#2e4a66" stroke-width="1.2" fill="none">
    <path d="M98 172 V234"/>
    <path d="M219 162 V234"/>
    <path d="M98 228 H219"/>
    <path d="M98 228 l7 -3 M98 228 l7 3"/>
    <path d="M219 228 l-7 -3 M219 228 l-7 3"/>
  </g>
  <g id="scale_bar">
    <rect x="20" y="246" width="16" height="5" fill="#2e4a66"/>
    <rect x="36" y="246" width="16" height="5" fill="none" stroke="#2e4a66" stroke-width="1.2"/>
    <rect x="52" y="246" width="16" height="5" fill="#2e4a66"/>
    <rect x="68" y="246" width="16" height="5" fill="none" stroke="#2e4a66" stroke-width="1.2"/>
  </g>
  <g id="north_arrow" stroke="#2e4a66" stroke-width="1.4" fill="none">
    <circle cx="262" cy="226" r="13"/>
    <path d="M262 236 V218"/>
    <path d="M262 216 l-4.5 7 h9 Z" fill="#2e4a66"/>
  </g>
</svg>`;

const bracketTL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><path d="M16 2 H2 V16" stroke="#2e4a66" stroke-width="2" fill="none"/></svg>`;
const bracketTR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><path d="M2 2 H16 V16" stroke="#2e4a66" stroke-width="2" fill="none"/></svg>`;
const bracketBL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><path d="M2 2 V16 H16" stroke="#2e4a66" stroke-width="2" fill="none"/></svg>`;
const bracketBR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><path d="M16 2 V16 H2" stroke="#2e4a66" stroke-width="2" fill="none"/></svg>`;

const dashedPocket = (w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" fill="none" stroke="#8a9aa8" stroke-width="1.6" stroke-dasharray="8 6"/></svg>`;

// --- Shared drafting-sheet chrome -------------------------------------------
// Head: corner registration brackets, the EXAMPLE and skip bindings flanking a
// stencilled masthead word, then the product's signature dashed rule over a
// mist hairline. Foot: an engineering-drawing title block - a bordered strip
// split into three cells (back link, drawing legend, dashboard jump) with
// bottom corner brackets. Geometrically unlike the engraved rules, soil bands,
// bookplates, mastheads, frames, and command bars of products 09-16.

const pageBase = (templateId, backLabel) => [
  rect(templateId, 'ground', 0, 0, W, H, COLORS.paper),
  svg(templateId, 'bracket_tl', 12, 12, 16, 16, bracketTL),
  svg(templateId, 'bracket_tr', 481, 12, 16, 16, bracketTR),
  text(templateId, 'example', 34, 15, 110, 13, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.blue,
    characterSpacing: 1.5,
    align: 'left',
  }),
  text(templateId, 'masthead_word', 180, 17, 150, 11, 'THE HOUSE BOOK', {
    fontSize: 7,
    fontWeight: 'bold',
    textColor: COLORS.mist,
    characterSpacing: 2.8,
    align: 'center',
  }),
  text(templateId, 'skip', 345, 15, 130, 13, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.blueDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  dashedRule(templateId, 'head_dash', 30, 34, 449),
  rect(templateId, 'head_hair', 30, 40, 449, 0.5, COLORS.mist),
  rect(templateId, 'block_frame', 30, 634, 449, 26, COLORS.sheet, {
    stroke: COLORS.blue,
    strokeWidth: 1.1,
  }),
  rect(templateId, 'block_div_a', 170, 634, 0.8, 26, COLORS.blue),
  rect(templateId, 'block_div_b', 339, 634, 0.8, 26, COLORS.blue),
  text(templateId, 'block_back', 38, 634, 124, 26, backLabel, {
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.blueDeep,
    align: 'left',
    linkTarget: 'parent',
  }),
  text(templateId, 'block_legend', 174, 634, 161, 26, 'DWG · HOME OPERATIONS', {
    fontSize: 6,
    fontWeight: 'bold',
    textColor: COLORS.mist,
    characterSpacing: 1.4,
    align: 'center',
  }),
  text(templateId, 'block_jump', 345, 634, 126, 26, 'DASHBOARD »', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.blueDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'dashboard',
  }),
  svg(templateId, 'bracket_bl', 12, 651, 16, 16, bracketBL),
  svg(templateId, 'bracket_br', 481, 651, 16, 16, bracketBR),
];

const pageTitle = (templateId, value, extra = {}) =>
  text(templateId, 'page_title', 30, 50, 449, 22, value, {
    fontSize: 17,
    fontWeight: 'bold',
    textColor: COLORS.blue,
    characterSpacing: 1.2,
    align: 'left',
    ...extra,
  });

const subtitle = (templateId, value, extra = {}) =>
  text(templateId, 'subtitle', 30, 76, 449, 13, value, {
    fontSize: 8.5,
    textColor: COLORS.mist,
    align: 'left',
    ...extra,
  });

const doorChip = (templateId, role, x, y, value, link, extra = {}) =>
  text(templateId, role, x, y, 215, 34, value, {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.blue,
    fill: COLORS.sheet,
    stroke: COLORS.blue,
    strokeWidth: 0.9,
    align: 'center',
    ...link,
    ...extra,
  });

// --- Templates --------------------------------------------------------------

const cover = {
  id: 'cover',
  name: 'Manual Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'ground', 0, 0, W, H, COLORS.paper),
    base('cover', 'tap_anywhere', 'rect', 0, 0, W, H, {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    svg('cover', 'bracket_tl', 10, 10, 18, 18, bracketTL),
    svg('cover', 'bracket_tr', 481, 10, 18, 18, bracketTR),
    svg('cover', 'bracket_bl', 10, 651, 18, 18, bracketBL),
    svg('cover', 'bracket_br', 481, 651, 18, 18, bracketBR),
    rect('cover', 'frame_outer', 22, 22, 465, 635, '', { stroke: COLORS.blue, strokeWidth: 1.6 }),
    rect('cover', 'frame_inner', 29, 29, 451, 621, '', { stroke: COLORS.mist, strokeWidth: 0.7 }),
    text('cover', 'kicker', 60, 46, 389, 13, 'A HOME OPERATIONS MANUAL · SHEET NO. 01', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 2.2,
      align: 'center',
    }),
    text('cover', 'title', 54, 66, 401, 42, 'THE HOUSE BOOK', {
      fontSize: 29,
      fontWeight: 'bold',
      textColor: COLORS.blue,
      characterSpacing: 3,
      align: 'center',
    }),
    dashedRule('cover', 'title_dash', 150, 118, 209),
    rect('cover', 'title_pip_a', 242.5, 127, 4, 4, COLORS.mist),
    rect('cover', 'title_pip_b', 252.5, 127, 4, 4, COLORS.blue),
    rect('cover', 'title_pip_c', 262.5, 127, 4, 4, COLORS.mist),
    rect('cover', 'plate', 84, 144, 341, 320, COLORS.sheet, {
      stroke: COLORS.blue,
      strokeWidth: 1.2,
    }),
    rect('cover', 'plate_inner', 92, 152, 325, 304, '', {
      stroke: COLORS.rule,
      strokeWidth: 0.7,
    }),
    svg('cover', 'cover_art', 104.5, 166, 300, 260, isoHouseArt),
    text('cover', 'plate_caption', 96, 440, 317, 12, 'ISOMETRIC VIEW · NOT TO SCALE', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 1.6,
      align: 'center',
    }),
    text('cover', 'sub', 76, 484, 357, 72, 'Every room, every system, every serial number – filed. Rooms carry their paint codes, measurements, and appliance cards; systems carry shutoffs, specs, and inspections; four season checklists carry the maintenance year. When something breaks at nine on a Sunday night, this book knows.', {
      fontSize: 10,
      textColor: COLORS.blue,
      align: 'center',
      verticalAlign: 'top',
    }),
    text('cover', 'open_cta', 164.5, 566, 180, 34, 'Open the manual »', {
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.haze,
      fill: COLORS.blue,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'imprint', 96, 622, 317, 12, 'ROOMS · SYSTEMS · APPLIANCES · SEASONS', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 1.8,
      align: 'center',
    }),
  ],
};

const start = {
  id: 'start',
  name: 'Owner Guide',
  width: W,
  height: H,
  elements: [
    ...pageBase('start', '« Cover'),
    pageTitle('start', '{{title}}'),
    text('start', 'premise', 30, 78, 449, 58, 'The House Book is the binder your house never came with. Rooms hold paint codes, measurements, and the appliances that live in them; five system pages hold shutoffs, specs, and inspection checklists; four season checklists carry the maintenance year. Fill it in over one afternoon – thank yourself for a decade.', {
      fontSize: 10,
      textColor: COLORS.blue,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('start', 'howto_label', 30, 146, 260, 'HOW TO WORK THE BOOK'),
    text('start', 'howto_steps', 30, 162, 449, 102, '1. Walk the house once with this book – serials, paint codes, and shutoffs in one pass.\n2. Tap a room on the dashboard; its page holds finishes, measurements, and appliance cards.\n3. Tap a system for its shutoff callout, specs, and inspection checklist.\n4. Open the season checklist at each equinox and solstice – tick, date, move on.\n5. Log every repair in the ledger and keep contractor numbers where panic can find them.', {
      fontSize: 9.5,
      textColor: COLORS.blue,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('start', 'doors_label', 30, 272, 220, 'WHERE TO BEGIN'),
    doorChip('start', 'example_chip', 30, 288, 'The worked example »', {
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    doorChip('start', 'house_chip', 264, 288, 'Your house »', {
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }, {
      textColor: COLORS.haze,
      fill: COLORS.blue,
      stroke: '',
      strokeWidth: 0,
    }),
    doorChip('start', 'dashboard_chip', 30, 330, 'The dashboard »', {
      linkTarget: 'specific_node',
      linkValue: 'dashboard',
    }),
    doorChip('start', 'seasons_chip', 264, 330, 'The seasons »', {
      linkTarget: 'specific_node',
      linkValue: 'season_spring',
    }),
    ...label('start', 'shutoff_label', 30, 384, 320, 'EMERGENCY SHUTOFFS · FILL THESE IN FIRST'),
    ...[['WATER MAIN', 30], ['GAS VALVE', 183.5], ['MAIN BREAKER', 337]].flatMap(([word, x]) => [
      rect('start', `shutoff_rule_${x}`, x, 422, 142, 0.9, COLORS.blue),
      text('start', `shutoff_word_${x}`, x, 426, 142, 10, word, {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.mist,
        characterSpacing: 1.2,
        align: 'left',
      }),
    ]),
    text('start', 'shutoff_note', 30, 444, 449, 30, 'Ninety seconds hunting for a valve is fine on a Tuesday afternoon and very bad with water coming through a ceiling. These three lines are the whole point of the book.', {
      fontSize: 8,
      textColor: COLORS.mist,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('start', 'notes_label', 30, 484, 200, 'NOTES'),
    writingLines('start', 'notes_lines', 30, 500, 449, 112, 24),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'House Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace', '« The guide'),
    pageTitle('workspace', '{{title}}'),
    text('workspace', 'hero', 30, 78, 449, 46, '{{hero}}', {
      dataBinding: 'hero',
      fontSize: 10,
      textColor: COLORS.blue,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'note', 30, 126, 449, 24, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontSize: 8.5,
      textColor: COLORS.mist,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('workspace', 'desk_label', 30, 158, 260, 'ON THE DESK'),
    text('workspace', 'slot_a_chip', 30, 174, 215, 32, '{{slot_a_label}}', {
      dataBinding: 'slot_a_label',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.blueDeep,
      align: 'left',
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    text('workspace', 'slot_b_chip', 264, 174, 215, 32, '{{slot_b_label}}', {
      dataBinding: 'slot_b_label',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.blueDeep,
      align: 'left',
      linkTarget: 'specific_node',
      linkValue: 'example_appliance',
    }),
    ...label('workspace', 'manual_label', 30, 216, 260, 'THE MANUAL'),
    ...[
      ['dashboard', 'hub_dashboard_label', 'dashboard'],
      ['rooms', 'hub_rooms_label', 'room_01'],
      ['systems', 'hub_systems_label', 'system_hvac'],
      ['seasons', 'hub_seasons_label', 'season_spring'],
      ['repairs', 'hub_repairs_label', 'repair_01'],
      ['contacts', 'hub_contacts_label', 'contractor_01'],
    ].map(([role, labelField, target], index) =>
      text('workspace', `${role}_chip`, index % 2 === 0 ? 30 : 264, 232 + Math.floor(index / 2) * 40, 215, 32, `{{${labelField}}}`, {
        dataBinding: labelField,
        fontSize: 11,
        fontWeight: 'bold',
        textColor: COLORS.blueDeep,
        align: 'left',
        linkTarget: 'specific_node',
        linkValue: target,
      })),
    ...label('workspace', 'wiring_label', 30, 360, 300, 'HOW THE WIRING WORKS'),
    text('workspace', 'wiring_note', 30, 376, 449, 58, 'The dashboard chips land on the same room and system pages this hub lists – every card is one tap from anywhere. Rooms own their appliance cards, so the page order reads room, its appliances, next room. The seasons chain into one another, and every title block returns here.', {
      fontSize: 9.5,
      textColor: COLORS.blue,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('workspace', 'notes_label', 30, 444, 200, 'HOUSE NOTES'),
    writingLines('workspace', 'notes_lines', 30, 460, 449, 150, 24),
  ],
};

// Dashboard: rooms band (12 unfilled chips over child_index 5-16 - the room
// reference children sit after the five fixed system references) and a systems
// band (child_index 0-4). Unused room slots bind '' and print as blank
// writable slots over their underline rules.
const dashboardRoomChips = () => {
  const elements = [];
  for (let n = 1; n <= 12; n += 1) {
    const col = (n - 1) % 3;
    const row = Math.floor((n - 1) / 3);
    const x = 30 + col * 156;
    const y = 116 + row * 38;
    elements.push(
      text('dashboard', `room_chip_${n}`, x, y, 142, 24, `{{room_${n}}}`, {
        dataBinding: `room_${n}`,
        fontSize: 10,
        fontWeight: 'bold',
        textColor: COLORS.blueDeep,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(4 + n),
      }),
      rect('dashboard', `room_rule_${n}`, x, y + 25, 142, 0.8, COLORS.rule),
    );
  }
  return elements;
};

const dashboardSystemChips = () => {
  const elements = [];
  for (let n = 1; n <= 5; n += 1) {
    const x = 30 + (n - 1) * 91.75;
    elements.push(
      text('dashboard', `sys_chip_${n}`, x, 306, 82, 24, `{{sys_${n}}}`, {
        dataBinding: `sys_${n}`,
        fontSize: 9,
        fontWeight: 'bold',
        textColor: COLORS.blueDeep,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(n - 1),
      }),
      rect('dashboard', `sys_rule_${n}`, x, 331, 82, 0.8, COLORS.rule),
    );
  }
  return elements;
};

const dashboard = {
  id: 'dashboard',
  name: 'Home Dashboard',
  width: W,
  height: H,
  elements: [
    ...pageBase('dashboard', '« Hub'),
    pageTitle('dashboard', '{{title}}'),
    subtitle('dashboard', 'Every room and every system, one tap away. Empty slots stay blank until you add rooms.'),
    ...label('dashboard', 'rooms_label', 30, 98, 200, 'ROOMS'),
    ...dashboardRoomChips(),
    ...label('dashboard', 'systems_label', 30, 288, 200, 'SYSTEMS'),
    ...dashboardSystemChips(),
    ...label('dashboard', 'vitals_label', 30, 350, 200, 'HOUSE VITALS'),
    ...[
      ['YEAR BUILT', 30, 368], ['FLOOR AREA', 264, 368],
      ['ROOF AGE', 30, 408], ['HEATING PLANT AGE', 264, 408],
      ['WATER SHUTOFF', 30, 448], ['MAIN PANEL', 264, 448],
    ].flatMap(([word, x, y]) => [
      rect('dashboard', `vital_rule_${x}_${y}`, x, y + 18, 215, 0.9, COLORS.rule),
      text('dashboard', `vital_word_${x}_${y}`, x, y + 22, 215, 10, word, {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.mist,
        characterSpacing: 1.2,
        align: 'left',
      }),
    ]),
    ...label('dashboard', 'month_label', 30, 498, 200, 'THIS MONTH'),
    writingLines('dashboard', 'month_lines', 30, 514, 449, 96, 24),
  ],
};

const PAINT_ROWS = [
  ['WALLS', 'paint_walls'],
  ['TRIM', 'paint_trim'],
  ['FLOOR', 'paint_floor'],
];

const room = {
  id: 'room',
  name: 'Room Page',
  width: W,
  height: H,
  elements: [
    ...pageBase('room', '« Hub'),
    pageTitle('room', '{{title}}'),
    ...label('room', 'paint_label', 30, 80, 220, 'PAINT & FINISH'),
    ...PAINT_ROWS.flatMap(([word, field], index) => [
      rect('room', `paint_head_${field}`, 30, 96 + index * 28, 110, 24, COLORS.blueDeep),
      text('room', `paint_word_${field}`, 38, 96 + index * 28, 96, 24, word, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.haze,
        characterSpacing: 1.2,
        align: 'left',
      }),
      rect('room', `paint_cell_${field}`, 140, 96 + index * 28, 339, 24, COLORS.sheet, {
        stroke: COLORS.blue,
        strokeWidth: 0.9,
      }),
      text('room', `paint_value_${field}`, 148, 96 + index * 28, 323, 24, `{{${field}}}`, {
        dataBinding: field,
        fontSize: 8.5,
        textColor: COLORS.blue,
        align: 'left',
      }),
    ]),
    ...label('room', 'measure_label', 30, 190, 264, 'MEASUREMENTS · SKETCH THE PLAN'),
    rect('room', 'measure_frame', 30, 206, 264, 152, COLORS.sheet, {
      stroke: COLORS.blue,
      strokeWidth: 1.2,
    }),
    rect('room', 'measure_dots', 38, 214, 248, 136, COLORS.rule, {
      fillType: 'pattern',
      patternType: 'dots',
      patternSpacing: 22,
      patternWeight: 1.6,
    }),
    text('room', 'measurements', 38, 212, 248, 30, '{{measurements}}', {
      dataBinding: 'measurements',
      fontSize: 8,
      textColor: COLORS.blue,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('room', 'fixtures_label', 306, 190, 173, 'FIXTURES & FITTINGS'),
    // Rule spacing is twice the 10.8 text line height, so the worked example's
    // fixture lines sit between rules instead of being struck through by them.
    writingLines('room', 'fixtures_lines', 306, 206, 173, 152, 21.6),
    text('room', 'fixtures', 306, 206, 173, 152, '{{fixtures}}', {
      dataBinding: 'fixtures',
      fontSize: 9,
      textColor: COLORS.blue,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('room', 'appl_label', 30, 372, 300, 'APPLIANCES IN THIS ROOM'),
    text('room', 'appl_hint', 330, 372, 149, 12, 'TAP A CARD', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 1.2,
      align: 'right',
    }),
    ...[0, 1, 2, 3].flatMap(slot => {
      const x = slot % 2 === 0 ? 30 : 264;
      const y = 390 + Math.floor(slot / 2) * 38;
      return [
        text('room', `appl_chip_${slot + 1}`, x, y, 215, 28, `{{appl_${slot + 1}}}`, {
          dataBinding: `appl_${slot + 1}`,
          fontSize: 10,
          fontWeight: 'bold',
          textColor: COLORS.blueDeep,
          align: 'left',
          linkTarget: 'child_index',
          linkValue: String(slot),
        }),
        rect('room', `appl_rule_${slot + 1}`, x, y + 29, 215, 0.8, COLORS.rule),
      ];
    }),
    ...label('room', 'notes_label', 30, 476, 300, 'BULBS, QUIRKS & CONSUMABLES'),
    writingLines('room', 'notes_lines', 30, 492, 449, 112, 25),
    text('room', 'room_notes', 30, 494, 449, 110, '{{room_notes}}', {
      dataBinding: 'room_notes',
      fontSize: 9,
      textColor: COLORS.blue,
      verticalAlign: 'top',
      align: 'left',
    }),
  ],
};

const SYSTEM_SPECS = ['spec_1_label', 'spec_2_label', 'spec_3_label'];

const system = {
  id: 'system',
  name: 'System Page',
  width: W,
  height: H,
  elements: [
    ...pageBase('system', '« Hub'),
    pageTitle('system', '{{title}}'),
    text('system', 'sys_note', 30, 76, 449, 24, '{{sys_note}}', {
      dataBinding: 'sys_note',
      fontSize: 8.5,
      textColor: COLORS.mist,
      verticalAlign: 'top',
      align: 'left',
    }),
    rect('system', 'callout_frame', 30, 108, 449, 64, COLORS.sheet, {
      stroke: COLORS.blue,
      strokeWidth: 1.4,
    }),
    rect('system', 'callout_band', 30, 108, 132, 64, COLORS.blue),
    text('system', 'callout_label', 38, 114, 116, 52, '{{callout_label}}', {
      dataBinding: 'callout_label',
      fontSize: 7.5,
      fontWeight: 'bold',
      textColor: COLORS.haze,
      characterSpacing: 1.2,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('system', 'callout_hint', 172, 114, 299, 22, '{{callout_hint}}', {
      dataBinding: 'callout_hint',
      fontSize: 8,
      textColor: COLORS.mist,
      verticalAlign: 'top',
      align: 'left',
    }),
    rect('system', 'callout_rule_a', 172, 148, 297, 0.9, COLORS.blue),
    rect('system', 'callout_rule_b', 172, 164, 297, 0.9, COLORS.blue),
    ...label('system', 'spec_label', 30, 188, 220, 'SPECIFICATIONS'),
    ...SYSTEM_SPECS.flatMap((field, index) => [
      rect('system', `spec_head_${field}`, 30, 204 + index * 28, 150, 24, COLORS.blueDeep),
      text('system', `spec_word_${field}`, 38, 204 + index * 28, 136, 24, `{{${field}}}`, {
        dataBinding: field,
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.haze,
        characterSpacing: 1,
        align: 'left',
      }),
      rect('system', `spec_cell_${field}`, 180, 204 + index * 28, 299, 24, COLORS.sheet, {
        stroke: COLORS.blue,
        strokeWidth: 0.9,
      }),
    ]),
    text('system', 'lines_label_text', 41, 300, 300, 12, '{{lines_label}}', {
      dataBinding: 'lines_label',
      fontSize: 7.5,
      fontWeight: 'bold',
      textColor: COLORS.blueDeep,
      characterSpacing: 1.8,
      align: 'left',
    }),
    rect('system', 'lines_label_pip', 30, 303.5, 5, 5, COLORS.blue),
    writingLines('system', 'lines_area', 30, 316, 449, 120, 24),
    ...label('system', 'inspect_label', 30, 452, 300, 'INSPECTION · TICK AND DATE'),
    ...[0, 1, 2, 3, 4, 5].flatMap(index => [
      checkbox('system', `check_box_${index + 1}`, 30, 468 + index * 24 + 2),
      text('system', `check_item_${index + 1}`, 50, 468 + index * 24, 292, 16, `{{check_${index + 1}}}`, {
        dataBinding: `check_${index + 1}`,
        fontSize: 8.5,
        textColor: COLORS.blue,
        align: 'left',
      }),
      rect('system', `check_rule_${index + 1}`, 350, 468 + index * 24 + 13, 129, 0.8, COLORS.rule),
    ]),
  ],
};

const IDENTITY_ROWS = [
  ['MAKE', 'make'],
  ['MODEL', 'model'],
  ['SERIAL NO.', 'serial'],
  ['PURCHASED', 'purchased'],
  ['WARRANTY ENDS', 'warranty'],
];

const appliance = {
  id: 'appliance',
  name: 'Appliance Card',
  width: W,
  height: H,
  elements: [
    ...pageBase('appliance', '« Room'),
    text('appliance', 'card_title', 30, 50, 300, 22, '{{title}}', {
      fontSize: 15,
      fontWeight: 'bold',
      textColor: COLORS.blue,
      characterSpacing: 1,
      align: 'left',
    }),
    text('appliance', 'room_chip', 349, 48, 130, 28, '« Its room', {
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.haze,
      fill: COLORS.blue,
      align: 'center',
      linkTarget: 'parent',
    }),
    ...label('appliance', 'identity_label', 30, 88, 220, 'IDENTITY PLATE'),
    ...IDENTITY_ROWS.flatMap(([word, field], index) => [
      rect('appliance', `id_head_${field}`, 30, 104 + index * 26, 130, 24, COLORS.blueDeep),
      text('appliance', `id_word_${field}`, 38, 104 + index * 26, 116, 24, word, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.haze,
        characterSpacing: 1.2,
        align: 'left',
      }),
      rect('appliance', `id_cell_${field}`, 160, 104 + index * 26, 319, 24, COLORS.sheet, {
        stroke: COLORS.blue,
        strokeWidth: 0.9,
      }),
      text('appliance', `id_value_${field}`, 168, 104 + index * 26, 303, 24, `{{${field}}}`, {
        dataBinding: field,
        fontFamily: 'courier',
        fontSize: 8.5,
        textColor: COLORS.blue,
        align: 'left',
      }),
    ]),
    ...label('appliance', 'manual_label', 30, 246, 260, 'WHERE THE MANUAL LIVES'),
    rect('appliance', 'manual_cell', 30, 262, 449, 24, COLORS.sheet, {
      stroke: COLORS.blue,
      strokeWidth: 0.9,
    }),
    text('appliance', 'manual_value', 38, 262, 433, 24, '{{manual_location}}', {
      dataBinding: 'manual_location',
      fontSize: 8.5,
      textColor: COLORS.blue,
      align: 'left',
    }),
    ...label('appliance', 'service_label', 30, 302, 260, 'SERVICE HISTORY'),
    rect('appliance', 'svc_head_band', 30, 318, 449, 18, COLORS.blue),
    text('appliance', 'svc_head_date', 38, 318, 90, 18, 'DATE', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.haze,
      characterSpacing: 1.2,
      align: 'left',
    }),
    text('appliance', 'svc_head_note', 138, 318, 333, 18, 'WORK DONE · PARTS · COST', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.haze,
      characterSpacing: 1.2,
      align: 'left',
    }),
    ...[0, 1, 2, 3].flatMap(index => [
      rect('appliance', `svc_date_cell_${index + 1}`, 30, 336 + index * 30, 100, 30, COLORS.sheet, {
        stroke: COLORS.blue,
        strokeWidth: 0.8,
      }),
      text('appliance', `svc_date_${index + 1}`, 36, 336 + index * 30, 90, 30, `{{svc_${index + 1}_date}}`, {
        dataBinding: `svc_${index + 1}_date`,
        fontFamily: 'courier',
        fontSize: 7.5,
        textColor: COLORS.blue,
        align: 'left',
      }),
      rect('appliance', `svc_note_cell_${index + 1}`, 130, 336 + index * 30, 349, 30, COLORS.sheet, {
        stroke: COLORS.blue,
        strokeWidth: 0.8,
      }),
      text('appliance', `svc_note_${index + 1}`, 138, 336 + index * 30, 333, 30, `{{svc_${index + 1}_note}}`, {
        dataBinding: `svc_${index + 1}_note`,
        fontSize: 8,
        textColor: COLORS.blue,
        align: 'left',
      }),
    ]),
    ...label('appliance', 'quirks_label', 30, 472, 260, 'QUIRKS & SETTINGS'),
    writingLines('appliance', 'quirks_lines', 30, 488, 449, 96, 24),
    text('appliance', 'appl_notes', 30, 490, 449, 94, '{{appl_notes}}', {
      dataBinding: 'appl_notes',
      fontSize: 9,
      textColor: COLORS.blue,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('appliance', 'prev_chip', 30, 600, 170, 16, '{{ap_prev_label}}', {
      dataBinding: 'ap_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.blueDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('appliance', 'next_chip', 309, 600, 170, 16, '{{ap_next_label}}', {
      dataBinding: 'ap_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.blueDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
  ],
};

const seasonal = {
  id: 'seasonal',
  name: 'Season Checklist',
  width: W,
  height: H,
  elements: [
    ...pageBase('seasonal', '« Hub'),
    dashedRule('seasonal', 'mast_dash_l', 30, 64, 64),
    text('seasonal', 'mast_title', 104, 50, 301, 30, '{{title}}', {
      fontSize: 22,
      fontWeight: 'bold',
      textColor: COLORS.blue,
      characterSpacing: 3,
      align: 'center',
    }),
    dashedRule('seasonal', 'mast_dash_r', 415, 64, 64),
    text('seasonal', 'season_note', 30, 84, 449, 13, '{{season_note}}', {
      dataBinding: 'season_note',
      fontSize: 8.5,
      textColor: COLORS.mist,
      align: 'center',
    }),
    ...label('seasonal', 'list_label', 30, 108, 220, 'THE CHECKLIST'),
    text('seasonal', 'list_hint', 330, 108, 149, 12, 'TICK · DATE', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 1.2,
      align: 'right',
    }),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(index => [
      checkbox('seasonal', `item_box_${index + 1}`, 30, 126 + index * 28 + 1, 13),
      text('seasonal', `item_text_${index + 1}`, 52, 126 + index * 28, 306, 16, `{{item_${index + 1}}}`, {
        dataBinding: `item_${index + 1}`,
        fontSize: 9,
        textColor: COLORS.blue,
        align: 'left',
      }),
      rect('seasonal', `item_rule_${index + 1}`, 366, 126 + index * 28 + 13, 113, 0.8, COLORS.rule),
    ]),
    ...label('seasonal', 'also_label', 30, 416, 260, 'ALSO THIS SEASON'),
    writingLines('seasonal', 'also_lines', 30, 432, 449, 96, 24),
    text('seasonal', 'done_note', 30, 544, 449, 26, 'Date the ticks. "When did we last do that?" is the question this page exists to answer.', {
      fontSize: 8,
      textColor: COLORS.mist,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('seasonal', 'next_chip', 309, 584, 170, 20, '{{season_next_label}}', {
      dataBinding: 'season_next_label',
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.blueDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
  ],
};

const REPAIR_COLS = [
  ['DATE', 30, 70],
  ['WHAT & WHERE', 100, 190],
  ['WHO', 290, 80],
  ['COST', 370, 109],
];

const repairLog = {
  id: 'repair_log',
  name: 'Repair Ledger',
  width: W,
  height: H,
  elements: [
    ...pageBase('repair_log', '« Hub'),
    pageTitle('repair_log', '{{title}}'),
    subtitle('repair_log', 'One line per repair or improvement – date it, price it, and name who did it.'),
    ...REPAIR_COLS.map(([word, x, w]) =>
      rect('repair_log', `head_${x}`, x, 104, w, 18, COLORS.blue)),
    ...REPAIR_COLS.map(([word, x, w]) =>
      text('repair_log', `head_word_${x}`, x + 7, 104, w - 14, 18, word, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.haze,
        characterSpacing: 1.2,
        align: 'left',
      })),
    ...Array.from({ length: 12 }, (unused, row) =>
      REPAIR_COLS.map(([word, x, w]) =>
        rect('repair_log', `cell_${x}_${row + 1}`, x, 122 + row * 38, w, 38, COLORS.sheet, {
          stroke: COLORS.blue,
          strokeWidth: 0.8,
        }))).flat(),
    text('repair_log', 'prev_chip', 30, 592, 170, 16, '{{rl_prev_label}}', {
      dataBinding: 'rl_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.blueDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('repair_log', 'next_chip', 309, 592, 170, 16, '{{rl_next_label}}', {
      dataBinding: 'rl_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.blueDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
  ],
};

const CONTACT_COLS = [
  ['TRADE', 30, 92],
  ['NAME', 122, 130],
  ['PHONE', 252, 102],
  ['CALL-OUT NOTES', 354, 125],
];

const contacts = {
  id: 'contacts',
  name: 'Contractor List',
  width: W,
  height: H,
  elements: [
    ...pageBase('contacts', '« Hub'),
    pageTitle('contacts', '{{title}}'),
    subtitle('contacts', 'The people who already know this house – the plumber\'s number where panic can find it.'),
    ...CONTACT_COLS.map(([word, x, w]) =>
      rect('contacts', `head_${x}`, x, 104, w, 18, COLORS.blue)),
    ...CONTACT_COLS.map(([word, x, w]) =>
      text('contacts', `head_word_${x}`, x + 7, 104, w - 14, 18, word, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.haze,
        characterSpacing: 1.2,
        align: 'left',
      })),
    ...Array.from({ length: 10 }, (unused, row) =>
      CONTACT_COLS.map(([word, x, w]) =>
        rect('contacts', `cell_${x}_${row + 1}`, x, 122 + row * 34, w, 34, COLORS.sheet, {
          stroke: COLORS.blue,
          strokeWidth: 0.8,
        }))).flat(),
    svg('contacts', 'card_pocket', 30, 478, 449, 100, dashedPocket(449, 100)),
    text('contacts', 'pocket_word', 30, 520, 449, 14, 'STAPLE BUSINESS CARDS HERE', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 2.2,
      align: 'center',
    }),
    text('contacts', 'prev_chip', 30, 592, 170, 16, '{{cl_prev_label}}', {
      dataBinding: 'cl_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.blueDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('contacts', 'next_chip', 309, 592, 170, 16, '{{cl_next_label}}', {
      dataBinding: 'cl_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.blueDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
  ],
};

return {
  cover,
  start,
  workspace,
  dashboard,
  room,
  system,
  appliance,
  seasonal,
  repair_log: repairLog,
  contacts,
};
