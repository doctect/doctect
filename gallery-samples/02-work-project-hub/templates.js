const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  navy: '#263f52',
  navyDeep: '#172a38',
  navyPale: '#dbe3e6',
  ochre: '#c79b45',
  ochrePale: '#eadbbb',
  stone: '#eee9dd',
  paper: '#faf8f2',
  ink: '#1f2b32',
  muted: '#69747a',
  rule: '#aeb4b2',
};

let elementSequence = 0;
const elementId = (templateId, role) =>
  `${templateId}_${role}_${String(++elementSequence).padStart(3, '0')}`;

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
    fontSize: 12,
    fontFamily: 'work-sans',
    textColor: COLORS.ink,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const navGrid = (templateId, role, x, y, cellW, cellH, cols, extra = {}) =>
  base(templateId, role, 'grid', x, y, cellW, cellH, {
    fill: COLORS.paper,
    stroke: COLORS.navy,
    strokeWidth: 0.8,
    fontSize: 11,
    fontFamily: 'work-sans',
    fontWeight: 'bold',
    textColor: COLORS.navy,
    borderRadius: 2,
    gridConfig: {
      cols,
      gapX: 8,
      gapY: 8,
      sourceType: 'current',
      displayField: 'title',
      gridBorderMode: 'all',
      gridBorderColor: COLORS.navy,
      gridBorderWidth: 0.8,
      gridBorderStyle: 'solid',
      gridBorderRadius: 2,
      showEmptyCellBorders: false,
      ...extra,
    },
  });

const deskPlanArtwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 300">
  <g fill="none" stroke="#eee9dd" stroke-width="4" stroke-linejoin="miter">
    <path d="M24 50 H166 V116 H236 V250 H94 V194 H24 Z"/>
    <path d="M24 116 H166 M94 116 V250 M166 50 V194 M94 194 H236"/>
    <path d="M48 76 H136 M118 142 H210 M118 220 H210" stroke="#c79b45" stroke-width="9"/>
    <circle cx="50" cy="164" r="17" stroke="#c79b45"/>
    <path d="M42 164 L49 171 L61 154"/>
  </g>
</svg>`;

const moduleMarkArtwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 48">
  <g fill="none" stroke="#263f52" stroke-width="3">
    <rect x="3" y="3" width="40" height="18"/>
    <rect x="53" y="27" width="40" height="18"/>
    <path d="M43 12 H72 V27" stroke="#c79b45" stroke-width="5"/>
  </g>
</svg>`;

const pageFrame = (templateId, section) => [
  rect(templateId, 'stone', 0, 0, W, H, COLORS.stone),
  rect(templateId, 'rail', 0, 0, 22, H, COLORS.navy),
  rect(templateId, 'datum', 22, 0, 5, 77, COLORS.ochre),
  text(templateId, 'example', 39, 14, 94, 22, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.ochre,
  }),
  text(templateId, 'skip', 260, 13, 221, 24, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  text(templateId, 'section', 39, 48, 360, 18, section.toUpperCase(), {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    characterSpacing: 1.2,
  }),
  rect(templateId, 'header_rule', 39, 75, 442, 2, COLORS.navy),
  text(templateId, 'home', 39, 638, 66, 23, 'HOME', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    linkTarget: 'specific_node',
    linkValue: 'root',
  }),
  text(templateId, 'up', 116, 638, 54, 23, 'UP', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    linkTarget: 'parent',
  }),
  text(templateId, 'folio', 365, 638, 116, 23, 'PROJECT DESK', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.muted,
    align: 'right',
  }),
];

const titleBlock = (templateId, subtitle = '{{subtitle}}') => [
  text(templateId, 'title', 39, 87, 442, 38, '{{title}}', {
    dataBinding: 'title',
    fontSize: 25,
    fontFamily: 'montserrat',
    fontWeight: 'bold',
    textColor: COLORS.navyDeep,
  }),
  text(templateId, 'subtitle', 39, 126, 442, 28, subtitle, {
    dataBinding: subtitle === '{{subtitle}}' ? 'subtitle' : undefined,
    fontSize: 11,
    textColor: COLORS.muted,
    verticalAlign: 'top',
  }),
];

const field = (templateId, role, x, y, w, h, label, binding) => [
  rect(templateId, `${role}_surface`, x, y, w, h, COLORS.paper, {
    stroke: COLORS.rule,
    strokeWidth: 0.8,
  }),
  text(templateId, `${role}_label`, x + 12, y + 8, w - 24, 18, label.toUpperCase(), {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.ochre,
  }),
  text(templateId, `${role}_value`, x + 12, y + 31, w - 24, h - 40, `{{${binding}}}`, {
    dataBinding: binding,
    fontSize: 12,
    verticalAlign: 'top',
  }),
];

const coverElements = [
  rect('cover', 'stone', 0, 0, W, H, COLORS.stone),
  rect('cover', 'navy_field', 0, 0, 287, H, COLORS.navy),
  rect('cover', 'ochre_bar', 287, 0, 10, H, COLORS.ochre),
  svg('cover', 'desk_plan', 25, 246, 235, 279, deskPlanArtwork),
  text('cover', 'edition', 330, 54, 139, 36, 'WORK PROJECT HUB', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.ochre,
  }),
  text('cover', 'title', 326, 122, 150, 132, 'Project\nDesk', {
    fontSize: 37,
    fontFamily: 'montserrat',
    fontWeight: 'bold',
    textColor: COLORS.navyDeep,
    verticalAlign: 'top',
  }),
  text('cover', 'promise', 329, 289, 140, 108, 'Brief clearly.\nDecide once.\nMove work forward.', {
    fontSize: 14,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    verticalAlign: 'top',
  }),
  text('cover', 'open', 327, 521, 146, 52, 'OPEN PROJECT DESK', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.stone,
    fill: COLORS.navy,
    align: 'center',
    linkTarget: 'specific_node',
    linkValue: 'start_here',
  }),
  text('cover', 'device', 327, 595, 146, 28, 'Operational paper for focused teams', {
    fontSize: 10,
    textColor: COLORS.muted,
    verticalAlign: 'top',
  }),
];

const startElements = [
  ...pageFrame('start', 'Orientation'),
  ...titleBlock('start', 'One connected system for projects, meetings, decisions, and reviews.'),
  svg('start', 'module_mark', 385, 89, 88, 44, moduleMarkArtwork),
  rect('start', 'example_panel', 39, 190, 442, 142, COLORS.paper, {
    stroke: COLORS.ochre,
    strokeWidth: 1.2,
  }),
  rect('start', 'example_number', 39, 190, 58, 142, COLORS.ochre),
  text('start', 'example_number_text', 39, 212, 58, 40, '01', {
    fontSize: 25,
    fontFamily: 'montserrat',
    fontWeight: 'bold',
    textColor: COLORS.navyDeep,
    align: 'center',
  }),
  text('start', 'example_heading', 119, 207, 257, 23, 'EXPLORE WEBSITE LAUNCH', {
    fontSize: 12,
    fontWeight: 'bold',
    textColor: COLORS.navy,
  }),
  text('start', 'example_copy', 119, 239, 250, 56, 'Follow one meeting decision into its decision record and the board action that carries it forward.', {
    fontSize: 12,
    verticalAlign: 'top',
  }),
  text('start', 'example_open', 393, 220, 65, 62, 'OPEN', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.paper,
    fill: COLORS.navy,
    align: 'center',
    linkTarget: 'specific_node',
    linkValue: 'example_workspace',
  }),
  rect('start', 'blank_panel', 39, 361, 442, 142, COLORS.navy),
  rect('start', 'blank_number', 39, 361, 58, 142, COLORS.ochre),
  text('start', 'blank_number_text', 39, 383, 58, 40, '02', {
    fontSize: 25,
    fontFamily: 'montserrat',
    fontWeight: 'bold',
    textColor: COLORS.navyDeep,
    align: 'center',
  }),
  text('start', 'blank_heading', 119, 378, 257, 23, 'SKIP TO BLANK WORKSPACE', {
    fontSize: 12,
    fontWeight: 'bold',
    textColor: COLORS.stone,
  }),
  text('start', 'blank_copy', 119, 410, 250, 56, 'Open clean briefs, writable boards, meeting logs, registers, and a review cadence.', {
    fontSize: 12,
    textColor: COLORS.paper,
    verticalAlign: 'top',
  }),
  text('start', 'blank_open', 393, 391, 65, 62, 'OPEN', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navyDeep,
    fill: COLORS.ochre,
    align: 'center',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  text('start', 'method', 39, 538, 442, 45, 'METHOD  /  Brief → Board → Meeting → Decision → Action → Review', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    align: 'center',
  }),
];

const workspaceElements = [
  ...pageFrame('workspace', 'Workspace'),
  ...titleBlock('workspace'),
  rect('workspace', 'status_bar', 39, 180, 442, 52, COLORS.navy),
  text('workspace', 'mode', 55, 180, 180, 52, '{{workspace_mode}}', {
    dataBinding: 'workspace_mode',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.stone,
  }),
  text('workspace', 'capacity', 245, 180, 218, 52, '{{capacity}}', {
    dataBinding: 'capacity',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.ochrePale,
    align: 'right',
  }),
  text('workspace', 'hero', 39, 264, 352, 82, '{{hero}}', {
    dataBinding: 'hero',
    fontSize: 22,
    fontFamily: 'montserrat',
    fontWeight: 'bold',
    textColor: COLORS.navyDeep,
    verticalAlign: 'top',
  }),
  svg('workspace', 'module_mark', 387, 274, 88, 44, moduleMarkArtwork),
  ...field('workspace', 'operating_note', 39, 375, 442, 104, 'Operating note', 'workspace_note'),
  text('workspace', 'open_portfolio', 39, 518, 212, 56, 'OPEN PORTFOLIO', {
    fontSize: 12,
    fontWeight: 'bold',
    textColor: COLORS.stone,
    fill: COLORS.navy,
    align: 'center',
    linkTarget: 'child_index',
    linkValue: '0',
  }),
  text('workspace', 'route', 270, 518, 211, 56, 'PROJECTS + WEEKLY REVIEWS', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    fill: COLORS.ochrePale,
    align: 'center',
  }),
];

const portfolioElements = [
  ...pageFrame('portfolio', 'Portfolio'),
  ...titleBlock('portfolio'),
  rect('portfolio', 'metric_projects', 39, 172, 138, 54, COLORS.navy),
  text('portfolio', 'metric_projects_value', 51, 172, 114, 54, '{{project_summary}}', {
    dataBinding: 'project_summary',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.stone,
    align: 'center',
  }),
  rect('portfolio', 'metric_reviews', 187, 172, 138, 54, COLORS.ochre),
  text('portfolio', 'metric_reviews_value', 199, 172, 114, 54, '{{review_summary}}', {
    dataBinding: 'review_summary',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navyDeep,
    align: 'center',
  }),
  rect('portfolio', 'metric_focus', 335, 172, 146, 54, COLORS.paper, {
    stroke: COLORS.navy,
    strokeWidth: 0.8,
  }),
  text('portfolio', 'metric_focus_value', 347, 172, 122, 54, '{{focus}}', {
    dataBinding: 'focus',
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    align: 'center',
  }),
  text('portfolio', 'index_label', 39, 250, 442, 22, 'PROJECT DESKS + REVIEW CADENCE', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.ochre,
  }),
  navGrid('portfolio', 'navigation_grid', 39, 281, 217, 62, 2),
];

const briefElements = [
  ...pageFrame('brief', 'Project Brief + Outcomes'),
  ...titleBlock('brief'),
  ...field('brief', 'objective', 39, 169, 286, 104, 'Objective', 'objective'),
  ...field('brief', 'owner', 337, 169, 144, 104, 'Owner / horizon', 'owner_horizon'),
  ...field('brief', 'success', 39, 286, 442, 84, 'Success measure', 'success'),
  ...field('brief', 'boundaries', 39, 383, 442, 84, 'Boundaries / non-goals', 'boundaries'),
  text('brief', 'outcomes_label', 39, 486, 442, 18, 'OUTCOMES  /  write observable end states', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.ochre,
  }),
  rect('brief', 'outcome_row_1', 39, 512, 442, 25, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  rect('brief', 'outcome_row_2', 39, 540, 442, 25, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  rect('brief', 'outcome_row_3', 39, 568, 442, 25, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  text('brief', 'board_link', 39, 603, 96, 24, 'BOARD', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    linkTarget: 'child_index',
    linkValue: '0',
  }),
  text('brief', 'meetings_link', 145, 603, 96, 24, 'MEETINGS', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    linkTarget: 'child_index',
    linkValue: '1',
  }),
  text('brief', 'decisions_link', 251, 603, 96, 24, 'DECISIONS', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    linkTarget: 'child_index',
    linkValue: '2',
  }),
  text('brief', 'risks_link', 357, 603, 96, 24, 'RISKS', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    linkTarget: 'child_index',
    linkValue: '3',
  }),
];

const boardElements = [
  ...pageFrame('board', 'Paper Kanban'),
  ...titleBlock('board', 'Write directly in each lane. Move work by rewriting only when state changes.'),
  rect('board', 'action_surface', 39, 160, 442, 48, COLORS.ochrePale, {
    stroke: COLORS.ochre,
    strokeWidth: 0.8,
  }),
  text('board', 'action_label', 51, 160, 78, 48, 'NEXT ACTION', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.navy,
  }),
  text('board', 'action', 137, 160, 330, 48, '{{action}}', {
    dataBinding: 'action',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navyDeep,
  }),
  rect('board', 'lane_backlog', 39, 248, 139, 340, COLORS.paper, {
    stroke: COLORS.navy,
    strokeWidth: 1,
  }),
  rect('board', 'lane_doing', 190, 248, 139, 340, COLORS.paper, {
    stroke: COLORS.ochre,
    strokeWidth: 1.2,
  }),
  rect('board', 'lane_done', 341, 248, 140, 340, COLORS.paper, {
    stroke: COLORS.navy,
    strokeWidth: 1,
  }),
  rect('board', 'lane_header_backlog', 39, 218, 139, 30, COLORS.navy),
  rect('board', 'lane_header_doing', 190, 218, 139, 30, COLORS.ochre),
  rect('board', 'lane_header_done', 341, 218, 140, 30, COLORS.navy),
  text('board', 'lane_title_backlog', 50, 218, 78, 30, 'READY', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.stone,
  }),
  text('board', 'wip_backlog', 128, 218, 38, 30, 'WIP 5', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.ochrePale,
    align: 'right',
  }),
  text('board', 'lane_title_doing', 201, 218, 78, 30, 'DOING', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navyDeep,
  }),
  text('board', 'wip_doing', 279, 218, 38, 30, 'WIP 2', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.navyDeep,
    align: 'right',
  }),
  text('board', 'lane_title_done', 352, 218, 78, 30, 'DONE', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.stone,
  }),
  text('board', 'wip_done', 430, 218, 39, 30, 'WIP —', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.ochrePale,
    align: 'right',
  }),
  text('board', 'lane_prompt_backlog', 51, 263, 115, 30, 'Task / owner / due', { fontSize: 9, textColor: COLORS.muted }),
  text('board', 'lane_prompt_doing', 202, 263, 115, 30, 'Task / blocker / next', { fontSize: 9, textColor: COLORS.muted }),
  text('board', 'lane_prompt_done', 353, 263, 116, 30, 'Result / date / note', { fontSize: 9, textColor: COLORS.muted }),
];

const meetingIndexElements = [
  ...pageFrame('meeting_index', 'Meeting Index'),
  ...titleBlock('meeting_index'),
  rect('meeting_index', 'protocol', 39, 158, 442, 54, COLORS.navy),
  text('meeting_index', 'protocol_text', 54, 158, 412, 54, 'DECIDE IN THE ROOM  /  record rationale  /  name one owner  /  link the action', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.stone,
    align: 'center',
  }),
  text('meeting_index', 'index_label', 39, 231, 442, 20, 'MEETING LOGS', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.ochre,
  }),
  navGrid('meeting_index', 'meeting_grid', 39, 261, 217, 29, 2, { gapY: 7 }),
];

const meetingElements = [
  ...pageFrame('meeting', 'Meeting Log'),
  ...titleBlock('meeting'),
  rect('meeting', 'meta', 39, 160, 442, 46, COLORS.navy),
  text('meeting', 'meta_value', 54, 160, 412, 46, '{{meeting_meta}}', {
    dataBinding: 'meeting_meta',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.stone,
  }),
  ...field('meeting', 'agenda', 39, 221, 214, 112, 'Agenda / desired result', 'agenda'),
  ...field('meeting', 'notes', 267, 221, 214, 112, 'Discussion notes', 'notes'),
  ...field('meeting', 'decision', 39, 347, 442, 92, 'Decision made', 'decision'),
  ...field('meeting', 'actions', 39, 453, 442, 100, 'Actions / owner / due', 'actions'),
  text('meeting', 'decision_id', 39, 570, 160, 44, '{{decision_id}}', {
    dataBinding: 'decision_id',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    fill: COLORS.ochrePale,
    align: 'center',
  }),
  text('meeting', 'decision_link', 212, 570, 269, 44, 'OPEN REFERENCED DECISION RECORD', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.stone,
    fill: COLORS.navy,
    align: 'center',
    linkTarget: 'child_index',
    linkValue: '0',
  }),
];

const decisionsElements = [
  ...pageFrame('decisions', 'Decision Register'),
  ...titleBlock('decisions'),
  rect('decisions', 'record_band', 39, 160, 442, 46, COLORS.ochre),
  text('decisions', 'decision_id', 52, 160, 105, 46, '{{decision_id}}', {
    dataBinding: 'decision_id',
    fontSize: 12,
    fontWeight: 'bold',
    textColor: COLORS.navyDeep,
  }),
  text('decisions', 'decision_date', 178, 160, 288, 46, '{{decision_date}}', {
    dataBinding: 'decision_date',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navyDeep,
    align: 'right',
  }),
  ...field('decisions', 'decision', 39, 221, 442, 92, 'Decision', 'decision'),
  ...field('decisions', 'rationale', 39, 327, 442, 100, 'Rationale / evidence', 'rationale'),
  ...field('decisions', 'action', 39, 441, 442, 88, 'Action created', 'action'),
  rect('decisions', 'register_header', 39, 547, 442, 28, COLORS.navy),
  text('decisions', 'register_header_text', 51, 547, 418, 28, 'ID        DATE        DECISION        OWNER        STATUS', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.stone,
  }),
  rect('decisions', 'register_row_1', 39, 575, 442, 24, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  rect('decisions', 'register_row_2', 39, 599, 442, 24, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  text('decisions', 'action_link', 300, 590, 169, 25, 'OPEN BOARD ACTION', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    align: 'right',
    linkTarget: 'child_index',
    linkValue: '0',
  }),
];

const risksElements = [
  ...pageFrame('risks', 'Risk Register'),
  ...titleBlock('risks'),
  rect('risks', 'header', 39, 166, 442, 32, COLORS.navy),
  text('risks', 'header_text', 51, 166, 418, 32, 'RISK / SIGNAL                 IMPACT     OWNER     RESPONSE', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.stone,
  }),
  rect('risks', 'risk_row_1', 39, 198, 442, 79, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  rect('risks', 'risk_row_2', 39, 277, 442, 79, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  rect('risks', 'risk_row_3', 39, 356, 442, 79, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  rect('risks', 'risk_row_4', 39, 435, 442, 79, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  text('risks', 'risk', 51, 208, 406, 54, '{{risk}}', {
    dataBinding: 'risk',
    fontSize: 11,
    verticalAlign: 'top',
  }),
  text('risks', 'response_prompt', 39, 541, 442, 47, 'Escalation trigger  /  What evidence changes this rating?', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    fill: COLORS.ochrePale,
    align: 'center',
  }),
];

const weeklyReviewElements = [
  ...pageFrame('weekly_review', 'Weekly Review'),
  ...titleBlock('weekly_review'),
  rect('weekly_review', 'week_band', 39, 160, 442, 45, COLORS.navy),
  text('weekly_review', 'week_focus', 54, 160, 412, 45, '{{week_focus}}', {
    dataBinding: 'week_focus',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.stone,
  }),
  ...field('weekly_review', 'wins', 39, 222, 214, 129, 'Progress / evidence', 'wins'),
  ...field('weekly_review', 'friction', 267, 222, 214, 129, 'Friction / risks', 'friction'),
  ...field('weekly_review', 'decisions', 39, 365, 442, 91, 'Decisions needed', 'decisions_needed'),
  ...field('weekly_review', 'next', 39, 470, 442, 106, 'Next week / one outcome per project', 'next_week'),
  text('weekly_review', 'close', 39, 592, 286, 28, 'CLOSE LOOPS BEFORE OPENING NEW WORK', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    fill: COLORS.ochrePale,
    align: 'center',
  }),
  text('weekly_review', 'next_review', 337, 592, 144, 28, 'NEXT REVIEW →', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.stone,
    fill: COLORS.navy,
    align: 'center',
    linkTarget: 'child_index',
    linkValue: '0',
  }),
];

return {
  cover: { id: 'cover', name: 'Project Desk Cover', width: W, height: H, elements: coverElements },
  start: { id: 'start', name: 'Project Desk Start Here', width: W, height: H, elements: startElements },
  workspace: { id: 'workspace', name: 'Project Desk Workspace', width: W, height: H, elements: workspaceElements },
  portfolio: { id: 'portfolio', name: 'Project Portfolio', width: W, height: H, elements: portfolioElements },
  brief: { id: 'brief', name: 'Project Brief and Outcomes', width: W, height: H, elements: briefElements },
  board: { id: 'board', name: 'Paper Kanban Board', width: W, height: H, elements: boardElements },
  meeting_index: { id: 'meeting_index', name: 'Meeting Index', width: W, height: H, elements: meetingIndexElements },
  meeting: { id: 'meeting', name: 'Meeting Log', width: W, height: H, elements: meetingElements },
  decisions: { id: 'decisions', name: 'Decision Register', width: W, height: H, elements: decisionsElements },
  risks: { id: 'risks', name: 'Risk Register', width: W, height: H, elements: risksElements },
  weekly_review: { id: 'weekly_review', name: 'Weekly Review', width: W, height: H, elements: weeklyReviewElements },
};
