const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  forest: '#29483d',
  forestDeep: '#183128',
  brass: '#b68a4c',
  brassPale: '#e5d3b5',
  cream: '#f4eddf',
  paper: '#fbf8ef',
  ink: '#24322d',
  muted: '#66716c',
  rule: '#89978f',
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

const grid = (templateId, role, x, y, cellW, cellH, cols, extra = {}) =>
  base(templateId, role, 'grid', x, y, cellW, cellH, {
    fill: COLORS.paper,
    stroke: COLORS.rule,
    strokeWidth: 0.8,
    fontSize: 10,
    fontFamily: 'helvetica',
    textColor: COLORS.forestDeep,
    borderRadius: 2,
    gridConfig: {
      cols,
      gapX: 8,
      gapY: 5,
      sourceType: 'current',
      displayField: 'title',
      gridBorderMode: 'all',
      gridBorderColor: COLORS.forest,
      gridBorderWidth: 0.8,
      gridBorderStyle: 'solid',
      gridBorderRadius: 2,
      showEmptyCellBorders: false,
      ...extra,
    },
  });

const staticTable = (templateId, x, y, widths, rowHeight, headers, rows, alignments = []) => {
  const cells = [];
  let cursorX = x;
  headers.forEach((header, column) => {
    const width = widths[column];
    cells.push(rect(templateId, `table_cell_header_${column + 1}`, cursorX, y, width, rowHeight, COLORS.forest, {
      stroke: COLORS.rule,
      strokeWidth: 0.8,
    }));
    cells.push(text(templateId, `table_header_${column + 1}`, cursorX, y, width, rowHeight, header, {
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.cream,
      align: alignments[column] || 'left',
    }));
    cursorX += width;
  });

  rows.forEach((row, rowIndex) => {
    cursorX = x;
    row.forEach((field, column) => {
      const width = widths[column];
      const rowY = y + rowHeight * (rowIndex + 1);
      cells.push(rect(templateId, `table_cell_${rowIndex + 1}_${column + 1}`, cursorX, rowY, width, rowHeight, COLORS.paper, {
        stroke: COLORS.rule,
        strokeWidth: 0.8,
      }));
      cells.push(text(templateId, `table_value_${rowIndex + 1}_${column + 1}`, cursorX, rowY, width, rowHeight, `{{${field}}}`, {
        dataBinding: field,
        fontSize: 9,
        align: alignments[column] || 'left',
      }));
      cursorX += width;
    });
  });
  return cells;
};

const ledgerArtwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 310">
  <g fill="none" stroke="#b68a4c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="128" cy="137" r="91"/>
    <circle cx="128" cy="137" r="61" stroke-width="2"/>
    <path d="M39 137 H217 M128 48 V226" stroke-width="2"/>
    <path d="M67 103 C91 77 111 89 128 113 C147 139 169 151 194 128"/>
    <path d="M66 188 C94 164 117 176 135 195 C153 214 174 209 198 181"/>
    <path d="M76 266 H184 M92 284 H168"/>
  </g>
</svg>`;

const routeArtwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 70">
  <g fill="none" stroke="#29483d" stroke-width="3" stroke-linecap="round">
    <circle cx="18" cy="35" r="10" fill="#f4eddf"/>
    <circle cx="108" cy="35" r="10" fill="#f4eddf"/>
    <circle cx="202" cy="35" r="10" fill="#f4eddf"/>
    <path d="M28 35 H98 M118 35 H192"/>
    <path d="M52 35 C67 13 79 13 94 35 M140 35 C155 57 170 57 188 35" stroke="#b68a4c"/>
  </g>
</svg>`;

const pageBase = (templateId, section) => [
  rect(templateId, 'paper', 0, 0, W, H, COLORS.cream),
  rect(templateId, 'ledger_edge', 0, 0, 11, H, COLORS.forest),
  rect(templateId, 'brass_tick', 11, 46, 7, 66, COLORS.brass),
  text(templateId, 'example', 31, 14, 94, 22, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.brass,
  }),
  text(templateId, 'skip', 264, 13, 217, 24, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.brass,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  text(templateId, 'section', 31, 47, 450, 18, section.toUpperCase(), {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.forest,
    characterSpacing: 1.2,
  }),
  rect(templateId, 'top_rule', 31, 72, 450, 2, COLORS.forest),
  rect(templateId, 'footer_rule', 31, 625, 450, 1, COLORS.rule),
  text(templateId, 'home', 31, 635, 72, 26, 'HOME', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.forest,
    linkTarget: 'specific_node',
    linkValue: 'root',
  }),
  text(templateId, 'up', 114, 635, 60, 26, 'UP', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.forest,
    linkTarget: 'parent',
  }),
  text(templateId, 'folio', 376, 635, 105, 26, 'MONEY MAP', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.muted,
    align: 'right',
  }),
];

const titleBlock = (templateId, title = '{{title}}', subtitle = '{{subtitle}}') => [
  text(templateId, 'title', 31, 85, 450, 35, title, {
    dataBinding: title === '{{title}}' ? 'title' : undefined,
    fontSize: 24,
    fontFamily: 'georgia',
    fontWeight: 'bold',
    textColor: COLORS.forestDeep,
  }),
  text(templateId, 'subtitle', 31, 122, 450, 27, subtitle, {
    dataBinding: subtitle === '{{subtitle}}' ? 'subtitle' : undefined,
    fontSize: 10,
    fontStyle: 'italic',
    textColor: COLORS.muted,
  }),
];

const coverElements = [
  rect('cover', 'paper', 0, 0, W, H, COLORS.cream),
  rect('cover', 'forest_field', 0, 0, 226, H, COLORS.forest),
  rect('cover', 'brass_bar', 226, 0, 8, H, COLORS.brass),
  text('cover', 'edition', 268, 55, 194, 22, 'PERSONAL FINANCE PLANNER', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.brass,
    characterSpacing: 1.4,
  }),
  text('cover', 'title', 266, 105, 204, 116, 'Money\nMap', {
    fontSize: 40,
    fontFamily: 'georgia',
    fontWeight: 'bold',
    textColor: COLORS.forestDeep,
    verticalAlign: 'top',
  }),
  svg('cover', 'ledger_art', 15, 176, 196, 295, ledgerArtwork),
  rect('cover', 'promise_rule', 268, 251, 67, 3, COLORS.brass),
  text('cover', 'promise', 268, 277, 191, 97, 'Give every month\na direction, then\nfollow what happened.', {
    fontSize: 16,
    fontFamily: 'georgia',
    textColor: COLORS.ink,
    verticalAlign: 'top',
  }),
  text('cover', 'open', 268, 535, 194, 48, 'OPEN YOUR MAP', {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.cream,
    fill: COLORS.forest,
    align: 'center',
    linkTarget: 'specific_node',
    linkValue: 'start_here',
  }),
  text('cover', 'note', 268, 599, 194, 29, 'Plan. Record. Review.', {
    fontSize: 10,
    fontStyle: 'italic',
    textColor: COLORS.muted,
    align: 'center',
  }),
];

const startElements = [
  ...pageBase('start', 'Orientation'),
  ...titleBlock('start', 'Choose your route', 'See a completed January, or begin with twelve clean months.'),
  svg('start', 'route', 280, 91, 177, 55, routeArtwork),
  rect('start', 'example_panel', 31, 183, 450, 145, COLORS.paper, {
    stroke: COLORS.brass,
    strokeWidth: 1,
  }),
  text('start', 'example_kicker', 52, 201, 270, 18, 'EXPLORE GUIDED JANUARY', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.brass,
  }),
  text('start', 'example_copy', 52, 230, 320, 65, 'Follow a clearly fictional household from income plan through transactions, category review, sinking funds, and one savings goal.', {
    fontSize: 13,
    fontFamily: 'georgia',
    verticalAlign: 'top',
  }),
  text('start', 'example_open', 390, 221, 64, 64, 'OPEN', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.cream,
    fill: COLORS.brass,
    align: 'center',
    borderRadius: 32,
    linkTarget: 'specific_node',
    linkValue: 'example_workspace',
  }),
  rect('start', 'blank_panel', 31, 354, 450, 145, COLORS.forest),
  text('start', 'blank_kicker', 52, 372, 270, 18, 'SKIP TO BLANK WORKSPACE', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.brassPale,
  }),
  text('start', 'blank_copy', 52, 401, 320, 65, 'Open a complete year with twelve monthly plans, transaction logs, category reviews, funds, goals, and annual reflection.', {
    fontSize: 13,
    fontFamily: 'georgia',
    textColor: COLORS.paper,
    verticalAlign: 'top',
  }),
  text('start', 'blank_open', 390, 392, 64, 64, 'OPEN', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.forestDeep,
    fill: COLORS.cream,
    align: 'center',
    borderRadius: 32,
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  text('start', 'route_copy', 31, 538, 450, 43, 'OUTLOOK  /  MONTH  /  TRANSACTIONS  /  REVIEW  /  GOALS', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.forest,
    align: 'center',
  }),
];

const workspaceElements = [
  ...pageBase('workspace', 'Workspace'),
  ...titleBlock('workspace'),
  rect('workspace', 'hero', 31, 184, 450, 168, COLORS.forest),
  text('workspace', 'mode', 53, 204, 220, 20, '{{workspace_mode}}', {
    dataBinding: 'workspace_mode',
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.brassPale,
  }),
  text('workspace', 'hero_text', 53, 238, 319, 75, '{{hero}}', {
    dataBinding: 'hero',
    fontSize: 21,
    fontFamily: 'georgia',
    fontWeight: 'bold',
    textColor: COLORS.paper,
    verticalAlign: 'top',
  }),
  text('workspace', 'enter', 391, 232, 64, 64, 'ENTER', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.forestDeep,
    fill: COLORS.brassPale,
    align: 'center',
    borderRadius: 32,
    linkTarget: 'child_index',
    linkValue: '0',
  }),
  text('workspace', 'method_label', 31, 390, 450, 19, 'THE MONTHLY MONEY LOOP', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.brass,
  }),
  text('workspace', 'method', 31, 424, 450, 105, '01  Set expected income and category limits\n02  Record transactions without judgment\n03  Compare plan with actual movement\n04  Transfer toward funds and goals\n05  Carry one useful lesson forward', {
    fontSize: 13,
    fontFamily: 'georgia',
    verticalAlign: 'top',
  }),
  text('workspace', 'note', 31, 558, 450, 42, '{{workspace_note}}', {
    dataBinding: 'workspace_note',
    fontSize: 10,
    fontStyle: 'italic',
    textColor: COLORS.muted,
    fill: COLORS.brassPale,
    align: 'center',
  }),
];

const annualElements = [
  ...pageBase('annual', 'Annual outlook'),
  ...titleBlock('annual'),
  text('annual', 'cashflow_label', 31, 158, 450, 18, 'QUARTERLY CASH-FLOW OUTLOOK', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.brass,
  }),
  ...staticTable('annual', 31, 182, [86, 122, 122, 120], 22,
    ['PERIOD', 'PLANNED', 'ACTUAL', 'VARIANCE'],
    [
      ['quarter_1', 'planned_q1', 'actual_q1', 'difference_q1'],
      ['quarter_2', 'planned_q2', 'actual_q2', 'difference_q2'],
      ['quarter_3', 'planned_q3', 'actual_q3', 'difference_q3'],
      ['quarter_4', 'planned_q4', 'actual_q4', 'difference_q4'],
    ],
    ['left', 'right', 'right', 'right']),
  text('annual', 'navigator_label', 31, 292, 450, 18, 'OPEN A MONTH, FUND, GOAL, OR YEAR REVIEW', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.forest,
  }),
  grid('annual', 'navigator', 31, 315, 139, 27, 3),
];

const monthRows = [
  ['category_housing', 'planned_housing', 'actual_housing', 'difference_housing'],
  ['category_food', 'planned_food', 'actual_food', 'difference_food'],
  ['category_transport', 'planned_transport', 'actual_transport', 'difference_transport'],
  ['category_leisure', 'planned_leisure', 'actual_leisure', 'difference_leisure'],
  ['category_savings', 'planned_savings', 'actual_savings', 'difference_savings'],
  ['category_other', 'planned_other', 'actual_other', 'difference_other'],
];

const monthElements = [
  ...pageBase('month', 'Monthly plan'),
  ...titleBlock('month'),
  text('month', 'fictional', 31, 151, 450, 20, '{{fictional_notice}}', {
    dataBinding: 'fictional_notice',
    fontSize: 9,
    fontStyle: 'italic',
    textColor: COLORS.brass,
  }),
  text('month', 'income_label', 31, 179, 128, 17, 'PLANNED INCOME', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.muted,
  }),
  text('month', 'income', 31, 198, 128, 37, '{{planned_income}}', {
    dataBinding: 'planned_income',
    fontSize: 17,
    fontFamily: 'georgia',
    fontWeight: 'bold',
    textColor: COLORS.forest,
    fill: COLORS.paper,
    align: 'center',
  }),
  text('month', 'actual_income_label', 171, 179, 128, 17, 'ACTUAL INCOME', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.muted,
  }),
  text('month', 'actual_income', 171, 198, 128, 37, '{{actual_income}}', {
    dataBinding: 'actual_income',
    fontSize: 17,
    fontFamily: 'georgia',
    fontWeight: 'bold',
    textColor: COLORS.forest,
    fill: COLORS.paper,
    align: 'center',
  }),
  text('month', 'intention_label', 311, 179, 170, 17, 'MONTH INTENTION', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.muted,
  }),
  text('month', 'intention', 311, 198, 170, 37, '{{month_intention}}', {
    dataBinding: 'month_intention',
    fontSize: 10,
    fontStyle: 'italic',
    fill: COLORS.brassPale,
    align: 'center',
  }),
  ...staticTable('month', 31, 254, [130, 107, 107, 106], 35,
    ['CATEGORY', 'PLANNED', 'ACTUAL', 'DIFFERENCE'], monthRows,
    ['left', 'right', 'right', 'right']),
  text('month', 'open_log', 329, 574, 152, 34, 'OPEN TRANSACTION LOG', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.cream,
    fill: COLORS.forest,
    align: 'center',
    linkTarget: 'child_index',
    linkValue: '0',
  }),
];

const transactionRows = Array.from({ length: 8 }, (_, index) => {
  const row = index + 1;
  return [`date_${row}`, `description_${row}`, `category_${row}`, `amount_${row}`];
});

const transactionElements = [
  ...pageBase('transactions', 'Transaction log'),
  ...titleBlock('transactions'),
  text('transactions', 'instruction', 31, 156, 450, 21, 'Record movement as it happens. Use one line per transaction.', {
    fontSize: 10,
    fontStyle: 'italic',
    textColor: COLORS.muted,
  }),
  ...staticTable('transactions', 31, 190, [69, 190, 100, 91], 40,
    ['DATE', 'DESCRIPTION', 'CATEGORY', 'AMOUNT'], transactionRows,
    ['left', 'left', 'left', 'right']),
  text('transactions', 'continue', 329, 574, 152, 34, 'NEXT LOG / REVIEW', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.cream,
    fill: COLORS.forest,
    align: 'center',
    linkTarget: 'child_index',
    linkValue: '0',
  }),
];

const categoryElements = [
  ...pageBase('category_review', 'Category review'),
  ...titleBlock('category_review'),
  text('category_review', 'prompt', 31, 156, 450, 21, 'Compare without blame. Circle one adjustment worth carrying forward.', {
    fontSize: 10,
    fontStyle: 'italic',
    textColor: COLORS.muted,
  }),
  ...staticTable('category_review', 31, 190, [130, 107, 107, 106], 39,
    ['CATEGORY', 'PLANNED', 'ACTUAL', 'DIFFERENCE'], monthRows,
    ['left', 'right', 'right', 'right']),
  text('category_review', 'reflection_label', 31, 486, 450, 18, 'WHAT CHANGED, AND WHAT WILL YOU TRY NEXT?', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.brass,
  }),
  rect('category_review', 'reflection_box', 31, 511, 450, 83, COLORS.paper, {
    stroke: COLORS.rule,
    strokeWidth: 0.8,
  }),
  text('category_review', 'reflection', 42, 521, 428, 62, '{{reflection}}', {
    dataBinding: 'reflection',
    fontSize: 10,
    verticalAlign: 'top',
  }),
];

const sinkingRows = Array.from({ length: 6 }, (_, index) => {
  const row = index + 1;
  return [`fund_${row}`, `target_${row}`, `saved_${row}`, `next_${row}`];
});

const sinkingElements = [
  ...pageBase('sinking_funds', 'Sinking funds'),
  ...titleBlock('sinking_funds'),
  text('sinking_funds', 'instruction', 31, 156, 450, 23, 'Turn irregular costs into small, deliberate transfers.', {
    fontSize: 10,
    fontStyle: 'italic',
    textColor: COLORS.muted,
  }),
  ...staticTable('sinking_funds', 31, 195, [143, 103, 103, 101], 48,
    ['FUND', 'TARGET', 'SAVED', 'NEXT TRANSFER'], sinkingRows,
    ['left', 'right', 'right', 'right']),
  text('sinking_funds', 'check_label', 31, 550, 450, 18, 'NEXT CHECK-IN', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.brass,
  }),
  text('sinking_funds', 'check', 31, 574, 450, 30, '{{next_check}}', {
    dataBinding: 'next_check',
    fontSize: 11,
    fill: COLORS.brassPale,
    align: 'center',
  }),
];

const goalRows = Array.from({ length: 5 }, (_, index) => {
  const row = index + 1;
  return [`milestone_${row}`, `target_${row}`, `saved_${row}`, `next_${row}`];
});

const goalElements = [
  ...pageBase('goal', 'Debt / savings goal'),
  ...titleBlock('goal'),
  text('goal', 'goal_label', 31, 157, 94, 18, 'GOAL', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.brass,
  }),
  text('goal', 'goal_name', 31, 180, 286, 48, '{{goal_name}}', {
    dataBinding: 'goal_name',
    fontSize: 18,
    fontFamily: 'georgia',
    fontWeight: 'bold',
    textColor: COLORS.forest,
    fill: COLORS.paper,
  }),
  text('goal', 'target_label', 329, 157, 152, 18, 'TARGET / DATE', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.brass,
  }),
  text('goal', 'target_summary', 329, 180, 152, 48, '{{target_summary}}', {
    dataBinding: 'target_summary',
    fontSize: 11,
    fontWeight: 'bold',
    fill: COLORS.brassPale,
    align: 'center',
  }),
  ...staticTable('goal', 31, 255, [146, 102, 102, 100], 49,
    ['MILESTONE', 'TARGET', 'SAVED', 'NEXT ACTION'], goalRows,
    ['left', 'right', 'right', 'left']),
  text('goal', 'why_label', 31, 563, 74, 18, 'WHY THIS MATTERS', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.brass,
  }),
  text('goal', 'why', 119, 554, 362, 49, '{{goal_why}}', {
    dataBinding: 'goal_why',
    fontSize: 10,
    fontStyle: 'italic',
    fill: COLORS.paper,
  }),
];

const reviewRows = [
  ['review_lens_income', 'planned_income', 'actual_income'],
  ['review_lens_spending', 'planned_spending', 'actual_spending'],
  ['review_lens_savings', 'planned_savings', 'actual_savings'],
  ['review_lens_debt', 'planned_debt', 'actual_debt'],
];

const yearReviewElements = [
  ...pageBase('year_review', 'Year review'),
  ...titleBlock('year_review'),
  text('year_review', 'summary_label', 31, 157, 450, 18, 'YEAR AT A GLANCE', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.brass,
  }),
  ...staticTable('year_review', 31, 183, [190, 130, 130], 38,
    ['LENS', 'PLANNED', 'ACTUAL'], reviewRows,
    ['left', 'right', 'right']),
  text('year_review', 'wins_label', 31, 386, 213, 18, 'WINS TO KEEP', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.forest,
  }),
  text('year_review', 'lesson_label', 268, 386, 213, 18, 'LESSON TO CARRY', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.forest,
  }),
  rect('year_review', 'table_cell_wins', 31, 412, 213, 113, COLORS.paper, {
    stroke: COLORS.rule,
    strokeWidth: 0.8,
  }),
  rect('year_review', 'table_cell_lesson', 268, 412, 213, 113, COLORS.paper, {
    stroke: COLORS.rule,
    strokeWidth: 0.8,
  }),
  text('year_review', 'wins', 43, 424, 189, 89, '{{wins}}', {
    dataBinding: 'wins',
    fontSize: 11,
    verticalAlign: 'top',
  }),
  text('year_review', 'lesson', 280, 424, 189, 89, '{{lesson}}', {
    dataBinding: 'lesson',
    fontSize: 11,
    verticalAlign: 'top',
  }),
  text('year_review', 'reflection_label', 31, 551, 151, 18, 'NEXT YEAR, I WANT TO...', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.brass,
  }),
  text('year_review', 'reflection', 192, 542, 289, 48, '{{reflection}}', {
    dataBinding: 'reflection',
    fontSize: 10,
    fontStyle: 'italic',
    fill: COLORS.brassPale,
  }),
];

const template = (id, name, elements) => ({ id, name, width: W, height: H, elements });

return {
  cover: template('cover', 'Money Map Cover', coverElements),
  start: template('start', 'Start Here', startElements),
  workspace: template('workspace', 'Workspace Gateway', workspaceElements),
  annual: template('annual', 'Annual Outlook', annualElements),
  month: template('month', 'Monthly Plan', monthElements),
  transactions: template('transactions', 'Transaction Log', transactionElements),
  category_review: template('category_review', 'Category Review', categoryElements),
  sinking_funds: template('sinking_funds', 'Sinking Funds', sinkingElements),
  goal: template('goal', 'Debt or Savings Goal', goalElements),
  year_review: template('year_review', 'Year Review', yearReviewElements),
};
