const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  ink: '#3f3a33',
  inkSoft: '#6e675c',
  leather: '#7c5c3a',
  leatherDeep: '#5a4128',
  parchment: '#efe7d6',
  parchmentDeep: '#e4d7ba',
  paper: '#f8f2e2',
  rule: '#b6a88d',
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
    textColor: COLORS.ink,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const label = (templateId, role, x, y, w, value, extra = {}) =>
  text(templateId, role, x, y, w, 12, value, {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.leatherDeep,
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

// --- Original artwork -------------------------------------------------------

const compassRoseArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 300">
  <g id="ring" fill="none" stroke="#3f3a33">
    <circle cx="160" cy="104" r="84" stroke-width="2.5"/>
    <circle cx="160" cy="104" r="74" stroke-width="1"/>
  </g>
  <g id="ticks" stroke="#3f3a33" stroke-width="1.5" fill="none">
    <path d="M160 20 V32"/><path d="M160 176 V188"/>
    <path d="M76 104 H88"/><path d="M232 104 H244"/>
    <path d="M100.6 44.6 L109 53"/><path d="M211 155 L219.4 163.4"/>
    <path d="M219.4 44.6 L211 53"/><path d="M109 155 L100.6 163.4"/>
  </g>
  <g id="rose">
    <path d="M160 40 L172 96 L160 108 L148 96 Z" fill="#7c5c3a"/>
    <path d="M160 168 L150 112 L160 100 L170 112 Z" fill="#efe7d6" stroke="#3f3a33" stroke-width="1.4"/>
    <path d="M96 104 L148 94 L160 104 L148 114 Z" fill="#e4d7ba" stroke="#3f3a33" stroke-width="1.2"/>
    <path d="M224 104 L172 94 L160 104 L172 114 Z" fill="#e4d7ba" stroke="#3f3a33" stroke-width="1.2"/>
    <circle cx="160" cy="104" r="7" fill="#efe7d6" stroke="#3f3a33" stroke-width="1.6"/>
  </g>
  <g id="forking_road" fill="none" stroke="#7c5c3a" stroke-linecap="round">
    <path d="M160 188 C160 214 158 228 150 244 C142 260 128 272 108 282" stroke-width="5"/>
    <path d="M156 236 C170 252 190 262 216 268" stroke-width="4"/>
    <path d="M158 226 L158 292" stroke-width="2" stroke-dasharray="2 7" stroke="#3f3a33"/>
  </g>
  <g id="waymarks">
    <circle cx="108" cy="282" r="5" fill="#7c5c3a"/>
    <circle cx="216" cy="268" r="5" fill="#efe7d6" stroke="#3f3a33" stroke-width="1.4"/>
    <circle cx="158" cy="292" r="4" fill="#3f3a33"/>
  </g>
  <g id="pines" fill="#3f3a33">
    <path d="M44 246 L54 224 L64 246 Z"/><rect x="52" y="246" width="4" height="8"/>
    <path d="M262 240 L272 218 L282 240 Z"/><rect x="270" y="240" width="4" height="8"/>
    <path d="M28 214 L36 198 L44 214 Z"/><rect x="34.5" y="214" width="3" height="6"/>
    <path d="M276 208 L284 192 L292 208 Z"/><rect x="282.5" y="208" width="3" height="6"/>
  </g>
</svg>`;

const forkDividerArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 24">
  <g fill="none" stroke="#7c5c3a" stroke-width="1.5" stroke-linecap="round">
    <path d="M12 12 H92"/>
    <path d="M100 12 C112 12 116 6 128 6 H204"/>
    <path d="M100 12 C112 12 116 18 128 18 H204"/>
  </g>
  <rect x="92" y="8" width="8" height="8" fill="#7c5c3a" transform="rotate(45 96 12)"/>
  <circle cx="12" cy="12" r="2.4" fill="#3f3a33"/>
  <circle cx="204" cy="6" r="2.4" fill="#3f3a33"/>
  <circle cx="204" cy="18" r="2.4" fill="#3f3a33"/>
</svg>`;

const compassMiniArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="none" stroke="#7c5c3a" stroke-width="1.5"/>
  <path d="M12 4 L15 12 L12 20 L9 12 Z" fill="#7c5c3a"/>
  <circle cx="12" cy="12" r="2" fill="#efe7d6"/>
</svg>`;

const roadsEndArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 84">
  <path d="M104 50 A16 16 0 0 1 136 50 Z" fill="#e4d7ba" stroke="#7c5c3a" stroke-width="1.5"/>
  <path d="M16 50 H224" stroke="#3f3a33" stroke-width="1.2" fill="none"/>
  <g fill="none" stroke="#7c5c3a" stroke-linecap="round">
    <path d="M92 84 L116 52" stroke-width="3"/>
    <path d="M148 84 L124 52" stroke-width="3"/>
    <path d="M120 80 L120 58" stroke-width="1.5" stroke-dasharray="2 6" stroke="#3f3a33"/>
  </g>
  <g fill="#3f3a33">
    <path d="M40 50 L48 32 L56 50 Z"/><rect x="46" y="50" width="4" height="6"/>
    <path d="M186 50 L194 32 L202 50 Z"/><rect x="192" y="50" width="4" height="6"/>
  </g>
</svg>`;

// --- Shared chrome ----------------------------------------------------------

const pageBase = (templateId) => [
  rect(templateId, 'parchment', 0, 0, W, H, COLORS.parchment),
  rect(templateId, 'top_rule', 34, 30, 441, 1.2, COLORS.leather),
  text(templateId, 'example', 34, 8, 140, 18, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.leatherDeep,
    characterSpacing: 1.2,
    align: 'left',
  }),
  text(templateId, 'skip', 250, 8, 225, 18, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.leatherDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  rect(templateId, 'footer_rule', 34, 640, 441, 1.2, COLORS.leather),
];

const folio = (templateId) =>
  text(templateId, 'folio', 34, 650, 441, 16, 'THE BRANCHING ROAD', {
    fontSize: 7,
    fontWeight: 'bold',
    textColor: COLORS.inkSoft,
    characterSpacing: 2,
    align: 'center',
  });

const readerFooter = (templateId) => [
  text(templateId, 'record_link', 34, 648, 160, 20, "TRAVELER'S RECORD »", {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.leatherDeep,
    align: 'left',
    linkTarget: 'specific_node',
    linkValue: 'tracking_sheet',
  }),
  svg(templateId, 'compass_mini', 242, 646, 26, 26, compassMiniArt),
  text(templateId, 'howto_link', 315, 648, 160, 20, 'HOW TO READ »', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.leatherDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'start_here',
  }),
];

const kitFooter = (templateId) => [
  text(templateId, 'back_link', 34, 648, 100, 20, '« BACK', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.leatherDeep,
    align: 'left',
    linkTarget: 'parent',
  }),
  folio(templateId),
];

const numberMasthead = (templateId, value) => [
  text(templateId, 'masthead', 34, 44, 441, 40, value, {
    fontFamily: 'georgia',
    fontSize: 27,
    fontWeight: 'bold',
    textColor: COLORS.ink,
    align: 'center',
  }),
  svg(templateId, 'divider', 155, 94, 200, 24, forkDividerArt),
];

const chooseRule = (templateId, y) => [
  rect(templateId, 'choose_rule_left', 56, y + 6, 110, 0.8, COLORS.rule),
  text(templateId, 'choose_heading', 34, y, 441, 14, 'CHOOSE YOUR ROAD', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.leatherDeep,
    characterSpacing: 2,
    align: 'center',
  }),
  rect(templateId, 'choose_rule_right', 343, y + 6, 110, 0.8, COLORS.rule),
];

// --- Templates --------------------------------------------------------------

const cover = {
  id: 'cover',
  name: 'Cover Plate',
  width: W,
  height: H,
  elements: [
    rect('cover', 'parchment', 0, 0, W, H, COLORS.parchment),
    rect('cover', 'tap_anywhere', 0, 0, W, H, '', {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    rect('cover', 'frame_outer', 18, 18, 473, 643, '', { stroke: COLORS.leather, strokeWidth: 2 }),
    rect('cover', 'frame_inner', 28, 28, 453, 623, '', { stroke: COLORS.ink, strokeWidth: 0.8 }),
    text('cover', 'kicker', 54, 64, 401, 16, 'A CHOOSE-YOUR-PATH GAMEBOOK', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      characterSpacing: 2,
      align: 'center',
    }),
    text('cover', 'title', 54, 92, 401, 48, 'The Branching Road', {
      fontFamily: 'georgia',
      fontSize: 36,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      align: 'center',
    }),
    svg('cover', 'title_divider', 154, 148, 200, 24, forkDividerArt),
    svg('cover', 'compass_art', 94, 186, 320, 300, compassRoseArt),
    text('cover', 'subtitle', 104, 500, 301, 56, 'Fifty numbered sections. Five endings. One letter that must reach Wrenfold by morning – and a road that will not stay where the maps put it.', {
      fontFamily: 'georgia',
      fontSize: 11.5,
      textColor: COLORS.ink,
      align: 'center',
      verticalAlign: 'top',
    }),
    text('cover', 'open_cta', 144, 570, 220, 46, 'Enter the forest »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.parchment,
      fill: COLORS.leather,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'imprint', 54, 630, 401, 14, 'BEGIN AT THE TRAILHEAD · SECTION 1', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1.5,
      align: 'center',
    }),
  ],
};

const start = {
  id: 'start',
  name: 'Start Here Guide',
  width: W,
  height: H,
  elements: [
    ...pageBase('start'),
    text('start', 'title', 34, 44, 441, 34, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 24,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      align: 'center',
    }),
    svg('start', 'divider', 155, 84, 200, 24, forkDividerArt),
    text('start', 'premise', 56, 120, 397, 76, 'You are the last post rider on the old foot-road through Hollowpine Forest, carrying one sealed letter for the warden of Wrenfold. The coach road has drowned in the floods. The forest road is older than any map of it – and it has stopped agreeing with the maps.', {
      fontFamily: 'georgia',
      fontSize: 11,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'howto_label', 56, 206, 200, 'HOW TO READ THIS ROAD'),
    text('start', 'howto_rules', 56, 224, 397, 116, "1. Read a numbered section, then tap one of its roads to turn there.\n2. Items work on your honor: take one only when a section offers it, note it on the record, and answer the road's questions truly.\n3. Shade each section you visit. Five sections end the story – two well, three badly.\n4. When your road ends, return to the beginning and choose differently.", {
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('start', 'begin_chip', 56, 356, 190, 50, 'Turn to Section 1 »', {
      fontFamily: 'georgia',
      fontSize: 12.5,
      fontWeight: 'bold',
      textColor: COLORS.parchment,
      fill: COLORS.leather,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'section_001',
    }),
    text('start', 'record_chip', 263, 356, 190, 50, "Traveler's Record »", {
      fontFamily: 'georgia',
      fontSize: 11.5,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      fill: COLORS.paper,
      stroke: COLORS.leather,
      strokeWidth: 1,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'tracking_sheet',
    }),
    text('start', 'map_chip', 56, 420, 190, 44, 'See the road mapped »', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      fill: COLORS.paper,
      stroke: COLORS.leather,
      strokeWidth: 1,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    text('start', 'author_chip', 263, 420, 190, 44, 'Write your own road »', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      fill: COLORS.paper,
      stroke: COLORS.leather,
      strokeWidth: 1,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
    label('start', 'items_label', 56, 492, 200, 'CARRY HONESTLY'),
    text('start', 'items_note', 56, 508, 397, 62, "Three items wait somewhere on the road: a shrine lantern, a brass toll-house key, and a whistle of ash wood. A gate that begins 'If you carry ...' asks only what you truly noted on your record.", {
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    folio('start'),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Authoring Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace'),
    text('workspace', 'title', 34, 44, 441, 30, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 22,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      align: 'center',
    }),
    text('workspace', 'subtitle', 34, 78, 441, 16, '{{subtitle}}', {
      dataBinding: 'subtitle',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.inkSoft,
      align: 'center',
    }),
    text('workspace', 'hero', 56, 104, 397, 44, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 11.5,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'note', 56, 156, 397, 44, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'kit_label', 41, 212, 200, 'THE KIT'),
    base('workspace', 'navigator', 'grid', 41, 232, 102, 30, {
      fill: COLORS.paper,
      fontSize: 7.5,
      fontFamily: 'helvetica',
      fontWeight: 'bold',
      textColor: COLORS.ink,
      gridConfig: {
        cols: 4,
        gapX: 6,
        gapY: 6,
        sourceType: 'current',
        displayField: 'menu_label',
        gridBorderMode: 'all',
        gridBorderColor: COLORS.leather,
        gridBorderWidth: 0.8,
        gridBorderStyle: 'solid',
        gridBorderRadius: 2,
        showEmptyCellBorders: false,
      },
    }),
    folio('workspace'),
  ],
};

const section = {
  id: 'section',
  name: 'Adventure Section',
  width: W,
  height: H,
  elements: [
    ...pageBase('section'),
    ...numberMasthead('section', '– {{title}} –'),
    text('section', 'prose', 56, 134, 397, 300, '{{prose}}', {
      dataBinding: 'prose',
      fontFamily: 'georgia',
      fontSize: 11.5,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...chooseRule('section', 444),
    ...[0, 1, 2, 3].map(index =>
      text('section', `choice_${index + 1}`, 56, 466 + index * 42, 397, 38, `{{choice_${index + 1}_label}}`, {
        dataBinding: `choice_${index + 1}_label`,
        fontFamily: 'georgia',
        fontSize: 10.5,
        fontWeight: 'bold',
        textColor: COLORS.leatherDeep,
        align: 'left',
        verticalAlign: 'middle',
        linkTarget: 'child_index',
        linkValue: String(index),
      })),
    ...readerFooter('section'),
  ],
};

const ending = {
  id: 'ending',
  name: 'Ending Page',
  width: W,
  height: H,
  elements: [
    ...pageBase('ending'),
    ...numberMasthead('ending', '– {{title}} –'),
    text('ending', 'kind_banner', 155, 138, 200, 34, '{{ending_kind}}', {
      dataBinding: 'ending_kind',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.parchment,
      fill: COLORS.leather,
      characterSpacing: 1.5,
      align: 'center',
    }),
    text('ending', 'prose', 56, 194, 397, 236, '{{prose}}', {
      dataBinding: 'prose',
      fontFamily: 'georgia',
      fontSize: 11.5,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    svg('ending', 'roads_end', 134, 446, 240, 84, roadsEndArt),
    text('ending', 'colophon', 34, 542, 441, 14, '· HERE ENDS THIS ROAD ·', {
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 2,
      align: 'center',
    }),
    text('ending', 'return_chip', 144, 572, 220, 44, 'Return to the beginning »', {
      fontFamily: 'georgia',
      fontSize: 12,
      fontWeight: 'bold',
      textColor: COLORS.parchment,
      fill: COLORS.leather,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    ...readerFooter('ending'),
  ],
};

const tracking = {
  id: 'tracking',
  name: 'Tracking Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('tracking'),
    text('tracking', 'title', 34, 44, 441, 30, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 22,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      align: 'center',
    }),
    text('tracking', 'subtitle', 34, 78, 441, 28, '{{subtitle}}', {
      dataBinding: 'subtitle',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.inkSoft,
      align: 'center',
      verticalAlign: 'top',
    }),
    label('tracking', 'visited_label', 36, 116, 220, 'SECTIONS VISITED'),
    base('tracking', 'visited_grid', 'grid', 36, 132, 40, 26, {
      fill: COLORS.paper,
      fontSize: 8,
      fontFamily: 'georgia',
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      gridConfig: {
        cols: 10,
        gapX: 4,
        gapY: 4,
        sourceType: 'specific',
        sourceId: 'start_here',
        dataSliceStart: 1,
        dataSliceCount: 50,
        displayField: 'map_no',
        gridBorderMode: 'all',
        gridBorderColor: COLORS.leather,
        gridBorderWidth: 0.8,
        gridBorderStyle: 'solid',
        gridBorderRadius: 0,
        showEmptyCellBorders: false,
      },
    }),
    text('tracking', 'visited_hint', 36, 286, 437, 14, 'Shade a number as you read it; tap a number to return to that section.', {
      fontFamily: 'georgia',
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    label('tracking', 'items_label', 36, 314, 220, 'ITEMS CARRIED'),
    ...[0, 1, 2].flatMap(row => [
      rect('tracking', `item_box_l_${row + 1}`, 36, 332 + row * 30, 12, 12, COLORS.paper, {
        stroke: COLORS.leather,
        strokeWidth: 0.9,
      }),
      rect('tracking', `item_line_l_${row + 1}`, 56, 342 + row * 30, 180, 0.8, COLORS.rule),
      rect('tracking', `item_box_r_${row + 1}`, 262, 332 + row * 30, 12, 12, COLORS.paper, {
        stroke: COLORS.leather,
        strokeWidth: 0.9,
      }),
      rect('tracking', `item_line_r_${row + 1}`, 282, 342 + row * 30, 191, 0.8, COLORS.rule),
    ]),
    label('tracking', 'notes_label', 36, 428, 240, 'NOTES FROM THE ROAD'),
    writingLines('tracking', 'notes_lines', 36, 444, 437, 154, 22),
    text('tracking', 'begin_link', 34, 648, 140, 20, 'BEGIN AT 1 »', {
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'left',
      linkTarget: 'specific_node',
      linkValue: 'section_001',
    }),
    svg('tracking', 'compass_mini', 242, 646, 26, 26, compassMiniArt),
    text('tracking', 'howto_link', 315, 648, 160, 20, 'HOW TO READ »', {
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'right',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
  ],
};

const storyMap = {
  id: 'story_map',
  name: 'Story Map Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('story_map'),
    text('story_map', 'title', 34, 42, 441, 28, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 20,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      align: 'center',
    }),
    text('story_map', 'subtitle', 34, 74, 441, 30, '{{subtitle}}', {
      dataBinding: 'subtitle',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.inkSoft,
      align: 'center',
      verticalAlign: 'top',
    }),
    label('story_map', 'act_1_head', 34, 112, 141, 'ACT I · SETTING OUT', { align: 'center', characterSpacing: 0.8 }),
    label('story_map', 'act_2_head', 192, 112, 141, 'ACT II · THE DEEP WOOD', { align: 'center', characterSpacing: 0.8 }),
    label('story_map', 'act_3_head', 350, 112, 141, 'ACT III · THE WAY OUT', { align: 'center', characterSpacing: 0.8 }),
    ...[34, 192, 350].map((x, index) =>
      rect('story_map', `act_panel_${index + 1}`, x, 128, 141, 268, COLORS.paper, {
        stroke: COLORS.rule,
        strokeWidth: 0.8,
      })),
    ...[34, 192, 350].map((x, index) =>
      text('story_map', `act_body_${index + 1}`, x + 6, 134, 129, 256, `{{map_act_${index + 1}}}`, {
        dataBinding: `map_act_${index + 1}`,
        fontSize: 7.5,
        textColor: COLORS.ink,
        verticalAlign: 'top',
        align: 'left',
      })),
    label('story_map', 'endings_label', 34, 408, 220, 'THE FIVE ENDINGS'),
    text('story_map', 'endings_body', 34, 422, 441, 26, '{{map_endings}}', {
      dataBinding: 'map_endings',
      fontSize: 8,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('story_map', 'loops_label', 34, 456, 240, 'LOOPS · GATES · ITEMS'),
    text('story_map', 'loops_body', 34, 470, 441, 26, '{{map_notes}}', {
      dataBinding: 'map_notes',
      fontSize: 8,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('story_map', 'working_label', 34, 506, 220, 'WORKING SPACE'),
    writingLines('story_map', 'working_lines', 34, 520, 441, 110, 22),
    ...kitFooter('story_map'),
  ],
};

const branchPlanner = {
  id: 'branch_planner',
  name: 'Branch Planner Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('branch_planner'),
    text('branch_planner', 'title', 34, 42, 441, 28, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 20,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      align: 'center',
    }),
    text('branch_planner', 'subtitle', 34, 74, 441, 16, 'Plan one crossroads: its scene, its roads, and what each road asks of the traveler.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.inkSoft,
      align: 'center',
    }),
    label('branch_planner', 'number_label', 56, 116, 84, 'SECTION No.'),
    rect('branch_planner', 'number_box', 144, 104, 56, 36, COLORS.paper, {
      stroke: COLORS.leather,
      strokeWidth: 1,
    }),
    label('branch_planner', 'scene_label', 56, 156, 120, 'THE SCENE'),
    writingLines('branch_planner', 'scene_lines', 56, 170, 397, 66, 22),
    ...[0, 1, 2, 3].flatMap(index => {
      const y = 252 + index * 74;
      return [
        label('branch_planner', `road_label_${index + 1}`, 56, y, 70, `ROAD ${index + 1}`),
        writingLines('branch_planner', `road_lines_${index + 1}`, 56, y + 14, 300, 44, 22),
        text('branch_planner', `road_page_${index + 1}`, 366, y + 26, 18, 16, 'p.', {
          fontSize: 8,
          textColor: COLORS.inkSoft,
          align: 'left',
        }),
        rect('branch_planner', `road_page_line_${index + 1}`, 386, y + 40, 67, 0.8, COLORS.rule),
      ];
    }),
    label('branch_planner', 'gates_label', 56, 548, 240, 'GATES · ITEMS · COSTS'),
    writingLines('branch_planner', 'gates_lines', 56, 562, 397, 66, 22),
    ...kitFooter('branch_planner'),
  ],
};

const blankSection = {
  id: 'blank_section',
  name: 'Blank Section Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('blank_section'),
    text('blank_section', 'masthead', 34, 44, 441, 40, '– {{kit_no}} –', {
      fontFamily: 'georgia',
      fontSize: 27,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      align: 'center',
    }),
    svg('blank_section', 'divider', 155, 94, 200, 24, forkDividerArt),
    label('blank_section', 'scene_label', 56, 130, 200, 'WRITE THE SCENE'),
    writingLines('blank_section', 'prose_lines', 56, 146, 397, 264, 22),
    rect('blank_section', 'choose_rule_left', 56, 430, 110, 0.8, COLORS.rule),
    text('blank_section', 'choose_heading', 34, 424, 441, 14, 'CHOOSE YOUR ROAD', {
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      characterSpacing: 2,
      align: 'center',
    }),
    rect('blank_section', 'choose_rule_right', 343, 430, 110, 0.8, COLORS.rule),
    ...[0, 1, 2, 3].flatMap(index => {
      const y = 446 + index * 46;
      return [
        text('blank_section', `choice_mark_${index + 1}`, 56, y, 16, 30, '»', {
          fontFamily: 'georgia',
          fontSize: 13,
          fontWeight: 'bold',
          textColor: COLORS.leatherDeep,
          align: 'left',
        }),
        rect('blank_section', `choice_line_${index + 1}`, 78, y + 26, 276, 0.8, COLORS.rule),
        text('blank_section', `choice_page_${index + 1}`, 362, y + 8, 56, 18, 'turn to p.', {
          fontSize: 8,
          textColor: COLORS.inkSoft,
          align: 'left',
        }),
        rect('blank_section', `choice_page_line_${index + 1}`, 420, y + 26, 33, 0.8, COLORS.rule),
      ];
    }),
    ...kitFooter('blank_section'),
  ],
};

return {
  cover,
  start,
  workspace,
  section,
  ending,
  tracking,
  story_map: storyMap,
  branch_planner: branchPlanner,
  blank_section: blankSection,
};
