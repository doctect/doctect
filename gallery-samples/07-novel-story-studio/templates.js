const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  aubergine: '#4a405c',
  aubergineDeep: '#2e2639',
  gold: '#b18b54',
  goldDeep: '#765c38',
  paper: '#eee4d4',
  writing: '#fffaf3',
  ink: '#302c34',
  muted: '#716977',
  rule: '#aaa0a2',
  auberginePale: '#ded7e2',
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
    fontSize: 10,
    fontFamily: 'helvetica',
    textColor: COLORS.ink,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const grid = (templateId, role, x, y, cellW, cellH, cols, extra = {}) =>
  base(templateId, role, 'grid', x, y, cellW, cellH, {
    fill: COLORS.writing,
    fontSize: 8,
    fontFamily: 'helvetica',
    fontWeight: 'bold',
    textColor: COLORS.aubergineDeep,
    borderRadius: 1,
    gridConfig: {
      cols,
      gapX: 8,
      gapY: 8,
      sourceType: 'current',
      displayField: 'menu_label',
      gridBorderMode: 'all',
      gridBorderColor: COLORS.aubergine,
      gridBorderWidth: 0.8,
      gridBorderStyle: 'solid',
      gridBorderRadius: 1,
      showEmptyCellBorders: false,
      ...extra,
    },
  });

const field = (templateId, role, label, binding, x, y, w, h, extra = {}) => [
  text(templateId, `${role}_label`, x, y, w, 15, label.toUpperCase(), {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.goldDeep,
    characterSpacing: 0.8,
  }),
  rect(templateId, `writing_${role}`, x, y + 17, w, h - 17, COLORS.writing),
  text(templateId, `${role}_value`, x + 7, y + 21, w - 14, h - 25, `{{${binding}}}`, {
    dataBinding: binding,
    fontFamily: extra.fontFamily || 'georgia',
    fontSize: extra.fontSize || 9.5,
    verticalAlign: 'top',
    ...extra,
  }),
];

const manuscriptMotif = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 430">
  <g id="pages" transform="rotate(-5 170 210)">
    <rect x="72" y="46" width="205" height="300" rx="3" fill="#eee4d4" stroke="#b18b54" stroke-width="3"/>
    <rect x="53" y="65" width="205" height="300" rx="3" fill="#fffaf3" stroke="#4a405c" stroke-width="3"/>
    <path d="M86 119 H224 M86 151 H224 M86 183 H224 M86 215 H211 M86 247 H224 M86 279 H197" stroke="#aaa0a2" stroke-width="2"/>
    <path d="M79 65 V365" stroke="#b18b54" stroke-width="3"/>
  </g>
  <g id="thread" fill="none" stroke="#b18b54" stroke-width="5" stroke-linecap="round">
    <path d="M27 367 C76 324 79 274 128 291 C173 307 166 376 222 379 C267 381 286 342 303 302"/>
  </g>
  <g id="stitches" fill="#4a405c">
    <circle cx="45" cy="350" r="6"/><circle cx="101" cy="292" r="6"/><circle cx="166" cy="330" r="6"/><circle cx="235" cy="377" r="6"/><circle cx="290" cy="327" r="6"/>
  </g>
</svg>`;

const threadMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 45">
  <g fill="none" stroke-linecap="round">
    <path d="M6 28 C46 5 78 40 118 18 C160 -5 198 38 274 12" stroke="#4a405c" stroke-width="3"/>
    <path d="M6 28 C46 5 78 40 118 18 C160 -5 198 38 274 12" stroke="#b18b54" stroke-width="1" stroke-dasharray="3 8"/>
  </g>
</svg>`;

const pageBase = (templateId, section) => [
  rect(templateId, 'paper', 0, 0, W, H, COLORS.paper),
  rect(templateId, 'manuscript_margin', 24, 0, 1, H, COLORS.gold),
  rect(templateId, 'binding_margin', 29, 0, 1, H, COLORS.auberginePale),
  text(templateId, 'example', 36, 11, 96, 24, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.aubergine,
    characterSpacing: 1.2,
  }),
  text(templateId, 'skip', 230, 11, 251, 24, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.goldDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  text(templateId, 'section', 36, 45, 445, 18, section.toUpperCase(), {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.aubergine,
    characterSpacing: 1.4,
  }),
  svg(templateId, 'header_thread', 238, 42, 243, 32, threadMark),
  rect(templateId, 'footer_rule', 36, 624, 445, 1, COLORS.rule),
  text(templateId, 'home', 190, 634, 58, 26, 'HOME', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.aubergine,
    linkTarget: 'specific_node',
    linkValue: 'root',
  }),
  text(templateId, 'up', 263, 634, 58, 26, 'UP', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.aubergine,
    linkTarget: 'parent',
  }),
  text(templateId, 'folio', 36, 634, 132, 26, 'DRAFT / THREAD 01', {
    fontSize: 7,
    fontWeight: 'bold',
    textColor: COLORS.muted,
    align: 'left',
    characterSpacing: 0.5,
  }),
];

const titleBlock = (templateId, titleHeight = 36) => [
  text(templateId, 'title', 36, 80, 445, titleHeight, '{{title}}', {
    fontFamily: 'georgia',
    fontSize: 23,
    fontWeight: 'bold',
    textColor: COLORS.aubergineDeep,
  }),
  text(templateId, 'subtitle', 36, 119, 445, 31, '{{subtitle}}', {
    dataBinding: 'subtitle',
    fontFamily: 'georgia',
    fontSize: 9.5,
    textColor: COLORS.muted,
    verticalAlign: 'top',
  }),
];

const cover = {
  id: 'cover',
  name: 'Story Atelier Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'aubergine_field', 0, 0, W, H, COLORS.aubergineDeep),
    rect('cover', 'gold_spine', 34, 0, 8, H, COLORS.gold),
    text('cover', 'kicker', 68, 66, 300, 24, 'PREMISE / SCENE / CONTINUITY', {
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.paper,
      characterSpacing: 1.5,
    }),
    text('cover', 'title', 67, 105, 302, 115, 'Story\nAtelier', {
      fontFamily: 'georgia',
      fontSize: 43,
      fontWeight: 'bold',
      textColor: COLORS.writing,
      verticalAlign: 'top',
    }),
    text('cover', 'subtitle', 69, 238, 226, 70, 'An editorial studio for threading intention through every page of a novel.', {
      fontFamily: 'georgia',
      fontSize: 12,
      textColor: COLORS.paper,
      verticalAlign: 'top',
    }),
    svg('cover', 'manuscript', 194, 174, 286, 373, manuscriptMotif),
    text('cover', 'open', 68, 567, 197, 45, 'OPEN THE MANUSCRIPT  ->', {
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.aubergineDeep,
      fill: COLORS.paper,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
  ],
};

const start = {
  id: 'start',
  name: 'Start Here',
  width: W,
  height: H,
  elements: [
    ...pageBase('start', 'orientation'),
    ...titleBlock('start'),
    svg('start', 'thread_mark', 36, 158, 274, 44, threadMark),
    text('start', 'intro', 36, 213, 445, 68, 'Move from dramatic promise to structure, story-bible records, chapters, and scenes. End with continuity checks and deliberate revision passes.', {
      fontFamily: 'georgia',
      fontSize: 12,
      textColor: COLORS.aubergineDeep,
      verticalAlign: 'top',
    }),
    text('start', 'guided', 36, 313, 211, 91, 'EXPLORE GUIDED MYSTERY\nOne chapter / three linked scenes', {
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.writing,
      fill: COLORS.aubergine,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    text('start', 'blank', 270, 313, 211, 91, 'OPEN BLANK ATELIER\nThree acts / configurable banks', {
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.aubergineDeep,
      fill: COLORS.writing,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
    text('start', 'method', 36, 444, 445, 92, 'PREMISE  ->  STRUCTURE  ->  STORY BIBLE\nCHAPTER MAP  ->  SCENES  ->  CONTINUITY  ->  REVISION', {
      fontSize: 9.5,
      fontWeight: 'bold',
      textColor: COLORS.goldDeep,
      characterSpacing: 0.6,
      verticalAlign: 'top',
    }),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Story Workspace',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace', 'atelier index'),
    ...titleBlock('workspace'),
    text('workspace', 'mode', 36, 164, 445, 22, '{{workspace_mode}}', {
      dataBinding: 'workspace_mode',
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.goldDeep,
      characterSpacing: 1,
    }),
    text('workspace', 'hero', 36, 190, 445, 49, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 12,
      textColor: COLORS.aubergineDeep,
      verticalAlign: 'top',
    }),
    grid('workspace', 'navigator', 36, 254, 137, 35, 3),
    text('workspace', 'note', 36, 557, 445, 47, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontFamily: 'georgia',
      fontSize: 8.5,
      textColor: COLORS.muted,
      verticalAlign: 'top',
    }),
  ],
};

const premise = {
  id: 'premise',
  name: 'Premise',
  width: W,
  height: H,
  elements: [
    ...pageBase('premise', 'dramatic promise'),
    ...titleBlock('premise'),
    ...field('premise', 'logline', 'Logline', 'logline', 36, 163, 445, 86, { fontSize: 11 }),
    ...field('premise', 'promise', 'Reader promise', 'promise', 36, 263, 214, 92),
    ...field('premise', 'stakes', 'Stakes', 'stakes', 267, 263, 214, 92),
    ...field('premise', 'question', 'Dramatic question', 'question', 36, 369, 445, 100),
    ...field('premise', 'notes', 'Boundary / tone note', 'notes', 36, 483, 445, 121),
  ],
};

const structure = {
  id: 'structure',
  name: 'Act Structure',
  width: W,
  height: H,
  elements: [
    ...pageBase('structure', 'act structure'),
    ...titleBlock('structure'),
    ...field('structure', 'opening', 'Opening state', 'opening', 36, 160, 214, 83),
    ...field('structure', 'turn', 'Act turn', 'turn', 267, 160, 214, 83),
    ...field('structure', 'crisis', 'Pressure / crisis', 'crisis', 36, 257, 445, 82),
    ...field('structure', 'climax', 'Act climax', 'climax', 36, 353, 214, 91),
    ...field('structure', 'resolution', 'Exit state', 'resolution', 267, 353, 214, 91),
    ...field('structure', 'notes', 'Structural thread', 'notes', 36, 458, 445, 146),
  ],
};

const bank = {
  id: 'bank',
  name: 'Story Bible Bank',
  width: W,
  height: H,
  elements: [
    ...pageBase('bank', 'story bible'),
    ...titleBlock('bank'),
    text('bank', 'instruction', 36, 161, 445, 35, '{{bank_note}}', {
      dataBinding: 'bank_note',
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.muted,
      verticalAlign: 'top',
    }),
    grid('bank', 'navigator', 36, 207, 137, 31, 3),
  ],
};

const character = {
  id: 'character',
  name: 'Character Record',
  width: W,
  height: H,
  elements: [
    ...pageBase('character', 'character file'),
    ...titleBlock('character'),
    ...field('character', 'role', 'Story role', 'role', 36, 159, 214, 63),
    ...field('character', 'want', 'Wants', 'want', 267, 159, 214, 63),
    ...field('character', 'need', 'Needs', 'need', 36, 235, 214, 70),
    ...field('character', 'secret', 'Secret / pressure', 'secret', 267, 235, 214, 70),
    ...field('character', 'voice', 'Voice markers', 'voice', 36, 318, 214, 82),
    ...field('character', 'appearance', 'On-page detail', 'appearance', 267, 318, 214, 82),
    ...field('character', 'history', 'History and change', 'history', 36, 413, 445, 99),
    ...field('character', 'notes', 'Scene-use notes', 'notes', 36, 525, 445, 79),
  ],
};

const location = {
  id: 'location',
  name: 'Location Record',
  width: W,
  height: H,
  elements: [
    ...pageBase('location', 'location file'),
    ...titleBlock('location'),
    ...field('location', 'sensory', 'Sensory signature', 'sensory', 36, 163, 445, 93),
    ...field('location', 'function', 'Dramatic function', 'function', 36, 270, 214, 92),
    ...field('location', 'change', 'What can change here', 'change', 267, 270, 214, 92),
    ...field('location', 'history', 'History / social texture', 'history', 36, 376, 445, 105),
    ...field('location', 'notes', 'Continuity anchors', 'notes', 36, 495, 445, 109),
  ],
};

const chapter_map = {
  id: 'chapter_map',
  name: 'Chapter Map',
  width: W,
  height: H,
  elements: [
    ...pageBase('chapter_map', 'chapter map'),
    ...titleBlock('chapter_map'),
    text('chapter_map', 'instruction', 36, 161, 445, 40, 'Open any chapter directly. Each chapter holds its complete scene sequence without hidden continuation pages.', {
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.muted,
      verticalAlign: 'top',
    }),
    grid('chapter_map', 'navigator', 36, 216, 137, 39, 3),
    ...field('chapter_map', 'notes', 'Act-level chapter thread', 'notes', 36, 430, 445, 174),
  ],
};

const chapter = {
  id: 'chapter',
  name: 'Chapter Planner',
  width: W,
  height: H,
  elements: [
    ...pageBase('chapter', 'chapter assembly'),
    ...titleBlock('chapter'),
    ...field('chapter', 'goal', 'Chapter purpose', 'goal', 36, 159, 445, 69),
    ...field('chapter', 'beat_1', 'Entry beat', 'beat_1', 36, 241, 137, 74),
    ...field('chapter', 'beat_2', 'Pressure beat', 'beat_2', 190, 241, 137, 74),
    ...field('chapter', 'beat_3', 'Exit beat', 'beat_3', 344, 241, 137, 74),
    ...field('chapter', 'outcome', 'Chapter outcome', 'outcome', 36, 329, 445, 68),
    text('chapter', 'scene_label', 36, 412, 445, 18, 'SCENE CARDS', {
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.goldDeep,
      characterSpacing: 0.8,
    }),
    grid('chapter', 'navigator', 36, 437, 137, 38, 3),
    ...field('chapter', 'notes', 'Chapter continuity note', 'notes', 36, 531, 445, 73),
  ],
};

const scene = {
  id: 'scene',
  name: 'Scene Card',
  width: W,
  height: H,
  elements: [
    ...pageBase('scene', 'scene card'),
    ...titleBlock('scene'),
    ...field('scene', 'goal', 'Goal', 'goal', 36, 154, 445, 59, { fontSize: 9 }),
    ...field('scene', 'conflict', 'Conflict', 'conflict', 36, 222, 445, 59, { fontSize: 9 }),
    ...field('scene', 'outcome', 'Outcome / turn', 'outcome', 36, 290, 445, 59, { fontSize: 9 }),
    ...field('scene', 'pov', 'POV', 'pov', 36, 359, 214, 57, { fontSize: 8.5 }),
    ...field('scene', 'setting', 'Setting', 'setting', 267, 359, 214, 57, { fontSize: 8.5 }),
    ...field('scene', 'story_time', 'Story time', 'story_time', 36, 425, 214, 57, { fontSize: 8.5 }),
    ...field('scene', 'continuity', 'Continuity in / out', 'continuity', 267, 425, 214, 57, { fontSize: 8.5 }),
    text('scene', 'reference_label', 36, 494, 445, 17, 'LINKED STORY-BIBLE RECORDS', {
      fontSize: 7.5,
      fontWeight: 'bold',
      textColor: COLORS.goldDeep,
      characterSpacing: 0.7,
    }),
    grid('scene', 'navigator', 36, 518, 137, 35, 3),
  ],
};

const continuity = {
  id: 'continuity',
  name: 'Continuity Check',
  width: W,
  height: H,
  elements: [
    ...pageBase('continuity', 'continuity ledger'),
    ...titleBlock('continuity'),
    ...field('continuity', 'check_1', 'Time and sequence', 'check_1', 36, 161, 214, 91),
    ...field('continuity', 'check_2', 'Knowledge and reveals', 'check_2', 267, 161, 214, 91),
    ...field('continuity', 'check_3', 'Objects and appearance', 'check_3', 36, 266, 214, 91),
    ...field('continuity', 'check_4', 'Setting and movement', 'check_4', 267, 266, 214, 91),
    ...field('continuity', 'notes', 'Open continuity questions', 'notes', 36, 371, 445, 233),
  ],
};

const revision = {
  id: 'revision',
  name: 'Revision Pass',
  width: W,
  height: H,
  elements: [
    ...pageBase('revision', 'revision pass'),
    ...titleBlock('revision'),
    ...field('revision', 'pass_goal', 'Pass focus', 'pass_goal', 36, 162, 445, 90),
    ...field('revision', 'findings', 'Findings', 'findings', 36, 267, 445, 149),
    ...field('revision', 'actions', 'Actions', 'actions', 36, 431, 445, 173),
  ],
};

return {
  cover,
  start,
  workspace,
  premise,
  structure,
  bank,
  character,
  location,
  chapter_map,
  chapter,
  scene,
  continuity,
  revision,
};
