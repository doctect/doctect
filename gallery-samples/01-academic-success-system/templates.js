const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  eucalyptus: '#496f62',
  eucalyptusDark: '#29483f',
  terracotta: '#bd654f',
  terracottaSoft: '#ead3c9',
  parchment: '#f5f0e5',
  paper: '#fcfaf4',
  ink: '#26332f',
  muted: '#6d756f',
  rule: '#b9c1b8',
};

let elementSequence = 0;
const elementId = (templateId, role) => `${templateId}_${role}_${String(++elementSequence).padStart(3, '0')}`;

const base = (templateId, role, type, x, y, w, h, extra = {}) => {
  const element = {
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
  };
  // Drop explicitly-undefined props: the deployed generator sandbox rejects
  // non-JSON values with "Output contains a non-JSON value".
  Object.keys(element).forEach((key) => {
    if (element[key] === undefined) delete element[key];
  });
  return element;
};

const rect = (templateId, role, x, y, w, h, fill, extra = {}) =>
  base(templateId, role, 'rect', x, y, w, h, { fill, ...extra });

const text = (templateId, role, x, y, w, h, value, extra = {}) =>
  base(templateId, role, 'text', x, y, w, h, {
    text: value,
    fontSize: 12,
    fontFamily: 'helvetica',
    textColor: COLORS.ink,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const grid = (templateId, role, x, y, cellW, cellH, cols, extra = {}) =>
  base(templateId, role, 'grid', x, y, cellW, cellH, {
    fill: COLORS.paper,
    stroke: '',
    strokeWidth: 0,
    fontSize: 11,
    fontFamily: 'helvetica',
    textColor: COLORS.ink,
    borderRadius: 7,
    gridConfig: {
      cols,
      gapX: 10,
      gapY: 10,
      sourceType: 'current',
      displayField: 'title',
      gridBorderMode: 'all',
      gridBorderColor: COLORS.rule,
      gridBorderWidth: 0.8,
      gridBorderStyle: 'solid',
      gridBorderRadius: 7,
      showEmptyCellBorders: true,
      ...extra,
    },
  });

const compassArtwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 330">
  <g fill="none" stroke="#f5f0e5" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M48 249 Q78 220 102 236 Q119 246 132 230 Q145 213 163 222 Q183 233 210 203"/>
    <path d="M76 244 Q62 218 75 195 Q98 204 103 231"/>
    <path d="M172 218 Q174 187 197 174 Q210 199 192 215"/>
    <circle cx="132" cy="108" r="72"/>
    <circle cx="132" cy="108" r="54" stroke-width="2"/>
    <path d="M132 48 L151 111 L132 168 L113 105 Z"/>
    <path d="M132 48 L132 168 M72 108 H192" stroke-width="2"/>
    <path d="M83 275 Q108 260 132 276 Q156 260 181 275 V314 Q156 300 132 315 Q108 300 83 314 Z"/>
    <path d="M132 276 V315" stroke-width="3"/>
  </g>
</svg>`;

const leafBookArtwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 100">
  <g fill="none" stroke="#496f62" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 70 Q58 35 96 62 Q61 86 22 70 Z M25 69 Q54 66 82 56"/>
    <path d="M113 28 Q145 17 176 36 V79 Q145 63 113 76 Z M113 28 Q81 17 50 36"/>
    <path d="M113 28 V76 Q81 63 50 79 V36"/>
  </g>
</svg>`;

const pageBase = (templateId, section) => [
  rect(templateId, 'paper', 0, 0, W, H, COLORS.parchment),
  rect(templateId, 'spine', 0, 0, 15, H, COLORS.eucalyptus),
  text(templateId, 'example', 30, 15, 96, 22, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
  }),
  text(templateId, 'skip', 287, 14, 194, 24, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  text(templateId, 'section', 30, 49, 451, 18, section.toUpperCase(), {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
  }),
  rect(templateId, 'header_rule', 30, 73, 451, 2, COLORS.eucalyptus),
  text(templateId, 'home', 30, 637, 66, 24, 'HOME', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
    linkTarget: 'specific_node',
    linkValue: 'root',
  }),
  text(templateId, 'up', 105, 637, 56, 24, 'UP', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
    linkTarget: 'parent',
  }),
  text(templateId, 'folio', 423, 637, 58, 24, 'STUDY /', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.muted,
    align: 'right',
  }),
];

const titleBlock = (templateId, title = '{{title}}', subtitle = '{{subtitle}}') => [
  text(templateId, 'title', 30, 86, 451, 40, title, {
    dataBinding: title === '{{title}}' ? 'title' : undefined,
    fontSize: 25,
    fontFamily: 'georgia',
    fontWeight: 'bold',
    textColor: COLORS.eucalyptusDark,
  }),
  text(templateId, 'subtitle', 30, 127, 451, 27, subtitle, {
    dataBinding: subtitle === '{{subtitle}}' ? 'subtitle' : undefined,
    fontSize: 12,
    fontStyle: 'italic',
    textColor: COLORS.muted,
  }),
];

const coverElements = [
  rect('cover', 'paper', 0, 0, W, H, COLORS.parchment),
  rect('cover', 'field', 0, 0, 244, H, COLORS.eucalyptus),
  svg('cover', 'compass_book', 18, 245, 205, 292, compassArtwork),
  text('cover', 'edition', 278, 58, 177, 24, 'ACADEMIC SUCCESS SYSTEM', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
  }),
  text('cover', 'title', 276, 113, 190, 132, 'Study\nCompass', {
    fontSize: 38,
    fontFamily: 'georgia',
    fontWeight: 'bold',
    textColor: COLORS.eucalyptusDark,
    verticalAlign: 'top',
  }),
  rect('cover', 'rule', 278, 264, 58, 4, COLORS.terracotta),
  text('cover', 'promise', 278, 290, 184, 92, 'Plan the term.\nCapture what matters.\nRevise with direction.', {
    fontSize: 15,
    fontFamily: 'georgia',
    textColor: COLORS.ink,
    verticalAlign: 'top',
  }),
  text('cover', 'open', 278, 548, 178, 47, 'OPEN THE COMPASS', {
    fontSize: 12,
    fontWeight: 'bold',
    textColor: COLORS.parchment,
    fill: COLORS.terracotta,
    align: 'center',
    linkTarget: 'specific_node',
    linkValue: 'start_here',
  }),
  text('cover', 'device', 278, 608, 178, 20, 'Designed for focused study', {
    fontSize: 11,
    fontStyle: 'italic',
    textColor: COLORS.muted,
  }),
];

const startElements = [
  ...pageBase('start', 'Orientation'),
  ...titleBlock('start', 'Find your bearing', 'A guided route first, then a clean semester of your own.'),
  svg('start', 'leaf_book', 313, 80, 150, 70, leafBookArtwork),
  rect('start', 'example_panel', 30, 194, 451, 137, COLORS.paper, {
    stroke: COLORS.terracotta,
    strokeWidth: 1,
    borderRadius: 12,
  }),
  text('start', 'example_kicker', 54, 213, 260, 20, 'EXPLORE GUIDED EXAMPLE', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
  }),
  text('start', 'example_copy', 54, 242, 344, 48, 'Follow an environmental-science lecture from weekly plan to Cornell note, revision card, assignment, and exam review.', {
    fontSize: 13,
    fontFamily: 'georgia',
    verticalAlign: 'top',
  }),
  text('start', 'example_open', 398, 235, 58, 58, 'OPEN', {
    fontSize: 11,
    fontWeight: 'bold',
    align: 'center',
    textColor: COLORS.paper,
    fill: COLORS.terracotta,
    borderRadius: 29,
    linkTarget: 'specific_node',
    linkValue: 'example_workspace',
  }),
  rect('start', 'blank_panel', 30, 357, 451, 137, COLORS.eucalyptus, { borderRadius: 12 }),
  text('start', 'blank_kicker', 54, 376, 280, 20, 'SKIP TO BLANK WORKSPACE', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.parchment,
  }),
  text('start', 'blank_copy', 54, 405, 330, 48, 'Begin with an uncluttered semester, weekly plans, course notes, card decks, assignments, and exam maps.', {
    fontSize: 13,
    fontFamily: 'georgia',
    textColor: COLORS.paper,
    verticalAlign: 'top',
  }),
  text('start', 'blank_open', 398, 398, 58, 58, 'OPEN', {
    fontSize: 11,
    fontWeight: 'bold',
    align: 'center',
    textColor: COLORS.eucalyptusDark,
    fill: COLORS.parchment,
    borderRadius: 29,
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  text('start', 'route', 30, 535, 451, 45, 'TERM  /  COURSE  /  WEEK  /  NOTES  /  CARDS  /  EXAM', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
    align: 'center',
  }),
];

const workspaceElements = [
  ...pageBase('workspace', 'Workspace'),
  ...titleBlock('workspace'),
  rect('workspace', 'hero', 30, 184, 451, 151, COLORS.eucalyptus, { borderRadius: 12 }),
  text('workspace', 'hero_label', 54, 205, 160, 20, '{{workspace_mode}}', {
    dataBinding: 'workspace_mode',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.parchment,
  }),
  text('workspace', 'hero_title', 54, 239, 334, 52, '{{hero}}', {
    dataBinding: 'hero',
    fontSize: 23,
    fontFamily: 'georgia',
    fontWeight: 'bold',
    textColor: COLORS.paper,
    verticalAlign: 'top',
  }),
  text('workspace', 'enter', 391, 225, 65, 65, 'ENTER', {
    fontSize: 11,
    fontWeight: 'bold',
    align: 'center',
    textColor: COLORS.eucalyptusDark,
    fill: COLORS.parchment,
    borderRadius: 33,
    linkTarget: 'child_index',
    linkValue: '0',
  }),
  text('workspace', 'workflow_label', 30, 377, 451, 20, 'YOUR STUDY ROUTE', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
  }),
  text('workspace', 'workflow', 30, 412, 451, 94, '01  See the whole semester\n02  Set a useful plan for each week\n03  Capture ideas in Cornell notes\n04  Retrieve with two-sided revision cards\n05  Prepare assignments and exams', {
    fontSize: 13,
    fontFamily: 'georgia',
    textColor: COLORS.ink,
    verticalAlign: 'top',
  }),
  rect('workspace', 'note', 30, 545, 451, 47, COLORS.terracottaSoft, { borderRadius: 8 }),
  text('workspace', 'note_text', 47, 554, 417, 29, '{{workspace_note}}', {
    dataBinding: 'workspace_note',
    fontSize: 11,
    textColor: COLORS.eucalyptusDark,
  }),
];

const semesterElements = [
  ...pageBase('semester', 'Semester overview'),
  ...titleBlock('semester'),
  text('semester', 'metric_courses', 30, 173, 143, 42, '{{course_summary}}', {
    dataBinding: 'course_summary',
    fontSize: 13,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
    fill: COLORS.paper,
    align: 'center',
    borderRadius: 8,
  }),
  text('semester', 'metric_weeks', 183, 173, 143, 42, '{{week_summary}}', {
    dataBinding: 'week_summary',
    fontSize: 13,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
    fill: COLORS.paper,
    align: 'center',
    borderRadius: 8,
  }),
  text('semester', 'metric_focus', 336, 173, 145, 42, '{{term_focus}}', {
    dataBinding: 'term_focus',
    fontSize: 12,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
    fill: COLORS.paper,
    align: 'center',
    borderRadius: 8,
  }),
  grid('semester', 'dashboard', 30, 241, 143, 34, 3, {
    gapY: 5,
    gridBorderMode: 'none',
    gridBorderColor: COLORS.eucalyptus,
    gridBorderWidth: 0,
    gridBorderStyle: 'none',
    gridBorderRadius: 8,
  }),
  text('semester', 'dashboard_hint', 30, 584, 451, 28, 'Select a course or teaching week to continue.', {
    fontSize: 11,
    fontStyle: 'italic',
    textColor: COLORS.muted,
    align: 'center',
  }),
];

const courseElements = [
  ...pageBase('course', 'Course dashboard'),
  ...titleBlock('course'),
  rect('course', 'accent', 30, 169, 8, 104, COLORS.terracotta),
  text('course', 'question_label', 57, 169, 424, 18, 'GUIDING QUESTION', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
  }),
  text('course', 'question', 57, 195, 402, 65, '{{guiding_question}}', {
    dataBinding: 'guiding_question',
    fontSize: 17,
    fontFamily: 'georgia',
    fontStyle: 'italic',
    verticalAlign: 'top',
  }),
  text('course', 'materials', 30, 303, 451, 20, 'COURSE MATERIALS', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
  }),
  grid('course', 'materials_grid', 30, 338, 143, 38, 3, {
    gapY: 6,
    gridBorderMode: 'all',
    gridBorderColor: COLORS.rule,
    gridBorderWidth: 0.8,
    gridBorderStyle: 'solid',
    gridBorderRadius: 8,
  }),
  text('course', 'status', 30, 576, 451, 32, '{{course_status}}', {
    dataBinding: 'course_status',
    fontSize: 11,
    textColor: COLORS.muted,
    align: 'center',
  }),
];

const weekElements = [
  ...pageBase('week', 'Weekly plan'),
  ...titleBlock('week'),
  text('week', 'intent_label', 30, 172, 120, 20, 'ONE CLEAR INTENTION', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
  }),
  text('week', 'intent', 30, 199, 451, 57, '{{intention}}', {
    dataBinding: 'intention',
    fontSize: 16,
    fontFamily: 'georgia',
    fontStyle: 'italic',
    fill: COLORS.terracottaSoft,
    borderRadius: 9,
  }),
  text('week', 'learn_label', 30, 286, 214, 20, 'LEARN / ATTEND', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
  }),
  text('week', 'make_label', 267, 286, 214, 20, 'MAKE / SUBMIT', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
  }),
  rect('week', 'learn_box', 30, 316, 214, 187, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8, borderRadius: 8 }),
  rect('week', 'make_box', 267, 316, 214, 187, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8, borderRadius: 8 }),
  text('week', 'learn_content', 47, 331, 180, 155, '{{learn_plan}}', {
    dataBinding: 'learn_plan',
    fontSize: 12,
    verticalAlign: 'top',
  }),
  text('week', 'make_content', 284, 331, 180, 155, '{{make_plan}}', {
    dataBinding: 'make_plan',
    fontSize: 12,
    verticalAlign: 'top',
  }),
  text('week', 'review_label', 30, 535, 451, 20, 'FRIDAY CHECK: WHAT MOVES FORWARD?', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
  }),
  rect('week', 'review_line_1', 30, 571, 451, 1, COLORS.rule),
  rect('week', 'review_line_2', 30, 603, 451, 1, COLORS.rule),
];

const cornellElements = [
  ...pageBase('cornell', 'Cornell notes'),
  ...titleBlock('cornell'),
  text('cornell', 'cue_label', 30, 170, 128, 22, 'CUES / QUESTIONS', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
  }),
  text('cornell', 'note_label', 171, 170, 310, 22, 'NOTES / EVIDENCE / CONNECTIONS', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
  }),
  rect('cornell', 'cue_area', 30, 200, 128, 284, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  rect('cornell', 'note_area', 171, 200, 310, 284, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  text('cornell', 'cues', 43, 214, 102, 250, '{{cues}}', {
    dataBinding: 'cues',
    fontSize: 12,
    verticalAlign: 'top',
  }),
  text('cornell', 'notes', 186, 214, 280, 250, '{{notes}}', {
    dataBinding: 'notes',
    fontSize: 12,
    verticalAlign: 'top',
  }),
  text('cornell', 'summary_label', 30, 508, 100, 20, 'SUMMARY', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
  }),
  rect('cornell', 'summary_area', 30, 536, 326, 72, COLORS.terracottaSoft, { borderRadius: 8 }),
  text('cornell', 'summary', 44, 547, 298, 51, '{{summary}}', {
    dataBinding: 'summary',
    fontSize: 12,
    fontFamily: 'georgia',
    verticalAlign: 'top',
  }),
  text('cornell', 'card_link', 370, 536, 111, 72, 'OPEN LINKED\nREVISION CARD', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.paper,
    fill: COLORS.eucalyptus,
    align: 'center',
    linkTarget: 'child_index',
    linkValue: '0',
  }),
];

const deckElements = [
  ...pageBase('deck', 'Revision deck'),
  ...titleBlock('deck'),
  text('deck', 'instruction', 30, 170, 451, 38, 'Retrieve before you reveal. Open a card, answer aloud, then turn it over.', {
    fontSize: 12,
    fontFamily: 'georgia',
    fontStyle: 'italic',
    textColor: COLORS.muted,
  }),
  grid('deck', 'cards', 30, 229, 102, 58, 4, {
    gapX: 10,
    gapY: 5,
    gridBorderMode: 'all',
    gridBorderColor: COLORS.terracotta,
    gridBorderWidth: 0.9,
    gridBorderStyle: 'solid',
    gridBorderRadius: 9,
  }),
  text('deck', 'method', 30, 570, 451, 35, 'Mark confidence after each attempt: again / almost / secure.', {
    fontSize: 11,
    textColor: COLORS.eucalyptus,
    align: 'center',
  }),
];

const cardFrontElements = [
  ...pageBase('card_front', 'Revision card / question'),
  text('card_front', 'side', 30, 95, 451, 20, 'QUESTION SIDE', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
    align: 'center',
  }),
  rect('card_front', 'card', 49, 151, 411, 342, COLORS.terracotta, { borderRadius: 20 }),
  text('card_front', 'prompt', 78, 195, 353, 219, '{{question}}', {
    dataBinding: 'question',
    fontSize: 24,
    fontFamily: 'georgia',
    fontWeight: 'bold',
    textColor: COLORS.paper,
    align: 'center',
  }),
  text('card_front', 'cue', 92, 431, 325, 28, '{{memory_cue}}', {
    dataBinding: 'memory_cue',
    fontSize: 11,
    fontStyle: 'italic',
    textColor: COLORS.parchment,
    align: 'center',
  }),
  text('card_front', 'turn', 143, 530, 223, 48, 'TURN OVER FOR ANSWER', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptusDark,
    fill: COLORS.paper,
    align: 'center',
    borderRadius: 24,
    linkTarget: 'child_index',
    linkValue: '0',
  }),
];

const cardBackElements = [
  ...pageBase('card_back', 'Revision card / answer'),
  text('card_back', 'side', 30, 95, 451, 20, 'ANSWER SIDE', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
    align: 'center',
  }),
  rect('card_back', 'card', 49, 151, 411, 342, COLORS.eucalyptus, { borderRadius: 20 }),
  text('card_back', 'answer', 78, 187, 353, 201, '{{answer}}', {
    dataBinding: 'answer',
    fontSize: 18,
    fontFamily: 'georgia',
    textColor: COLORS.paper,
    align: 'center',
  }),
  rect('card_back', 'divider', 121, 411, 267, 2, COLORS.parchment),
  text('card_back', 'check', 82, 426, 345, 41, '{{check}}', {
    dataBinding: 'check',
    fontSize: 11,
    fontStyle: 'italic',
    textColor: COLORS.parchment,
    align: 'center',
  }),
  text('card_back', 'return', 143, 530, 223, 48, 'BACK TO QUESTION', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
    fill: COLORS.paper,
    align: 'center',
    borderRadius: 24,
    linkTarget: 'parent',
  }),
];

const assignmentElements = [
  ...pageBase('assignments', 'Assignments'),
  ...titleBlock('assignments'),
  text('assignments', 'next_label', 30, 171, 451, 20, 'NEXT DELIVERABLE', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
  }),
  text('assignments', 'next', 30, 199, 451, 61, '{{next_assignment}}', {
    dataBinding: 'next_assignment',
    fontSize: 17,
    fontFamily: 'georgia',
    fill: COLORS.terracottaSoft,
    borderRadius: 9,
  }),
  text('assignments', 'register_label', 30, 294, 451, 20, 'ASSIGNMENT REGISTER', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
  }),
  rect('assignments', 'register_header', 30, 326, 451, 30, COLORS.eucalyptus),
  text('assignments', 'register_task_label', 43, 331, 267, 20, 'TASK / DELIVERABLE', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.parchment,
  }),
  text('assignments', 'register_due_label', 329, 331, 63, 20, 'DUE', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.parchment,
  }),
  text('assignments', 'register_status_label', 410, 331, 58, 20, 'STATUS', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.parchment,
  }),
  ...[356, 406, 456, 506].flatMap((y, index) => [
    rect('assignments', `register_row_${index + 1}`, 30, y, 451, 44, COLORS.paper, {
      stroke: COLORS.rule,
      strokeWidth: 0.8,
    }),
    rect('assignments', `register_due_rule_${index + 1}`, 317, y, 1, 44, COLORS.rule),
    rect('assignments', `register_status_rule_${index + 1}`, 399, y, 1, 44, COLORS.rule),
  ]),
  text('assignments', 'prompt', 30, 589, 451, 23, 'Define done before work begins.', {
    fontSize: 11,
    fontStyle: 'italic',
    textColor: COLORS.muted,
    align: 'center',
  }),
];

const examElements = [
  ...pageBase('exam', 'Exam plan'),
  ...titleBlock('exam'),
  rect('exam', 'north', 30, 171, 451, 79, COLORS.eucalyptus, { borderRadius: 10 }),
  text('exam', 'north_label', 49, 183, 170, 18, 'NORTH STAR', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.parchment,
  }),
  text('exam', 'north_text', 49, 207, 413, 31, '{{exam_goal}}', {
    dataBinding: 'exam_goal',
    fontSize: 14,
    fontFamily: 'georgia',
    textColor: COLORS.paper,
  }),
  text('exam', 'map_label', 30, 283, 451, 20, 'REVIEW MAP', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.terracotta,
  }),
  rect('exam', 'review_region_concepts', 30, 317, 218, 92, COLORS.paper, {
    stroke: COLORS.eucalyptus,
    strokeWidth: 0.8,
    borderStyle: 'dashed',
    borderRadius: 8,
  }),
  rect('exam', 'review_region_connections', 263, 317, 218, 92, COLORS.paper, {
    stroke: COLORS.eucalyptus,
    strokeWidth: 0.8,
    borderStyle: 'dashed',
    borderRadius: 8,
  }),
  rect('exam', 'review_region_practice', 30, 421, 218, 92, COLORS.paper, {
    stroke: COLORS.eucalyptus,
    strokeWidth: 0.8,
    borderStyle: 'dashed',
    borderRadius: 8,
  }),
  rect('exam', 'review_region_evidence', 263, 421, 218, 92, COLORS.paper, {
    stroke: COLORS.eucalyptus,
    strokeWidth: 0.8,
    borderStyle: 'dashed',
    borderRadius: 8,
  }),
  text('exam', 'review_concepts_label', 44, 327, 190, 18, 'CORE CONCEPTS', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
  }),
  text('exam', 'review_connections_label', 277, 327, 190, 18, 'CONNECTIONS', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
  }),
  text('exam', 'review_practice_label', 44, 431, 190, 18, 'PRACTICE QUESTIONS', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
  }),
  text('exam', 'review_evidence_label', 277, 431, 190, 18, 'EVIDENCE / EXAMPLES', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
  }),
  text('exam', 'strategy_label', 30, 548, 120, 20, 'EXAM STRATEGY', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.eucalyptus,
  }),
  text('exam', 'strategy', 151, 542, 330, 46, '{{exam_strategy}}', {
    dataBinding: 'exam_strategy',
    fontSize: 11,
    textColor: COLORS.muted,
  }),
];

const template = (id, name, elements) => ({ id, name, width: W, height: H, elements });

return {
  cover: template('cover', 'Study Compass Cover', coverElements),
  start: template('start', 'Start Here', startElements),
  workspace: template('workspace', 'Workspace Gateway', workspaceElements),
  semester: template('semester', 'Semester Overview', semesterElements),
  course: template('course', 'Course Dashboard', courseElements),
  week: template('week', 'Weekly Plan', weekElements),
  cornell: template('cornell', 'Cornell Notes', cornellElements),
  deck: template('deck', 'Revision Deck', deckElements),
  card_front: template('card_front', 'Revision Card Question', cardFrontElements),
  card_back: template('card_back', 'Revision Card Answer', cardBackElements),
  assignments: template('assignments', 'Assignment Register', assignmentElements),
  exam: template('exam', 'Exam Plan', examElements),
};
