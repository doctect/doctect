const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  clay: '#a96551',
  clayDeep: '#744436',
  sage: '#7f9473',
  sageDeep: '#53654c',
  warmGray: '#f1e7df',
  paper: '#fbf8f3',
  ink: '#383633',
  muted: '#716d68',
  rule: '#9b978f',
  sagePale: '#dce3d7',
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
    fontSize: 10,
    fontFamily: 'helvetica',
    textColor: COLORS.sageDeep,
    borderRadius: 5,
    gridConfig: {
      cols,
      gapX: 7,
      gapY: 7,
      sourceType: 'current',
      displayField: 'title',
      gridBorderMode: 'all',
      gridBorderColor: COLORS.sage,
      gridBorderWidth: 0.8,
      gridBorderStyle: 'solid',
      gridBorderRadius: 5,
      showEmptyCellBorders: false,
      ...extra,
    },
  });

const staticTable = (templateId, group, x, y, widths, rowHeight, headers, rows, alignments = []) => {
  const elements = [];
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const totalHeight = rowHeight * (rows.length + 1);
  let cursorX = x;

  headers.forEach((header, column) => {
    const width = widths[column];
    elements.push(rect(templateId, `table_cell_header_${group}_${column + 1}`, cursorX, y, width, rowHeight, COLORS.sageDeep));
    elements.push(text(templateId, `table_header_${group}_${column + 1}`, cursorX + 4, y, width - 8, rowHeight, header, {
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.paper,
      align: alignments[column] || 'left',
    }));
    cursorX += width;
  });

  rows.forEach((row, rowIndex) => {
    cursorX = x;
    row.forEach((field, column) => {
      const width = widths[column];
      const rowY = y + rowHeight * (rowIndex + 1);
      elements.push(rect(templateId, `table_cell_${group}_${rowIndex + 1}_${column + 1}`, cursorX, rowY, width, rowHeight, COLORS.paper));
      elements.push(text(templateId, `table_value_${group}_${rowIndex + 1}_${column + 1}`, cursorX + 4, rowY, width - 8, rowHeight, `{{${field}}}`, {
        dataBinding: field,
        fontSize: 9,
        align: alignments[column] || 'left',
      }));
      cursorX += width;
    });
  });

  cursorX = x;
  widths.slice(0, -1).forEach((width, column) => {
    cursorX += width;
    elements.push(rect(templateId, `table_line_${group}_vertical_${column + 1}`, cursorX - 0.4, y, 0.8, totalHeight, COLORS.rule));
  });
  rows.forEach((_, rowIndex) => {
    const lineY = y + rowHeight * (rowIndex + 1) - 0.4;
    elements.push(rect(templateId, `table_line_${group}_horizontal_${rowIndex + 1}`, x, lineY, totalWidth, 0.8, COLORS.rule));
  });
  elements.push(rect(templateId, `table_boundary_${group}`, x, y, totalWidth, totalHeight, '', {
    stroke: COLORS.rule,
    strokeWidth: 0.8,
  }));
  return elements;
};

const habitMatrix = (group, days, y) => {
  const templateId = 'month_habits';
  const elements = [];
  const x = 31;
  const totalWidth = 450;
  const labelWidth = 90;
  const dayWidth = (totalWidth - labelWidth) / days.length;
  const rowHeight = 20;
  const totalHeight = rowHeight * 7;
  const widths = [labelWidth, ...days.map(() => dayWidth)];
  let cursorX = x;

  widths.forEach((width, column) => {
    elements.push(rect(templateId, `table_cell_header_${group}_${column}`, cursorX, y, width, rowHeight, COLORS.sageDeep));
    const value = column === 0 ? 'HABIT' : String(days[column - 1]);
    elements.push(text(templateId, column === 0 ? `table_header_${group}` : `day_header_${value}`, cursorX, y, width, rowHeight, value, {
      fontSize: column === 0 ? 8 : 8,
      fontWeight: 'bold',
      textColor: COLORS.paper,
      align: 'center',
    }));
    cursorX += width;
  });

  for (let row = 1; row <= 6; row += 1) {
    cursorX = x;
    widths.forEach((width, column) => {
      const rowY = y + rowHeight * row;
      elements.push(rect(templateId, `table_cell_${group}_${row}_${column}`, cursorX, rowY, width, rowHeight, COLORS.paper));
      const field = column === 0 ? `habit_label_${row}` : `habit_${row}_day_${days[column - 1]}`;
      elements.push(text(templateId, `table_value_${group}_${row}_${column}`, cursorX + (column === 0 ? 5 : 0), rowY, width - (column === 0 ? 8 : 0), rowHeight, `{{${field}}}`, {
        dataBinding: field,
        fontSize: column === 0 ? 8 : 9,
        fontWeight: column === 0 ? 'bold' : 'normal',
        textColor: column === 0 ? COLORS.sageDeep : COLORS.clayDeep,
        align: column === 0 ? 'left' : 'center',
      }));
      cursorX += width;
    });
  }

  cursorX = x;
  widths.slice(0, -1).forEach((width, column) => {
    cursorX += width;
    elements.push(rect(templateId, `table_line_${group}_vertical_${column + 1}`, cursorX - 0.4, y, 0.8, totalHeight, COLORS.rule));
  });
  for (let row = 1; row <= 6; row += 1) {
    elements.push(rect(templateId, `table_line_${group}_horizontal_${row}`, x, y + rowHeight * row - 0.4, totalWidth, 0.8, COLORS.rule));
  }
  elements.push(rect(templateId, `table_boundary_${group}`, x, y, totalWidth, totalHeight, '', {
    stroke: COLORS.rule,
    strokeWidth: 0.8,
  }));
  return elements;
};

const botanicalArc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 330">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M38 288 C38 118 115 44 230 37" stroke="#f1e7df" stroke-width="5"/>
    <path d="M72 282 C72 145 131 83 222 73" stroke="#dce3d7" stroke-width="2"/>
    <path d="M75 236 C104 228 117 209 119 181 C88 184 70 202 75 236Z" stroke="#f1e7df" stroke-width="3"/>
    <path d="M114 171 C143 164 157 145 158 116 C128 120 111 140 114 171Z" stroke="#f1e7df" stroke-width="3"/>
    <path d="M156 110 C184 103 201 83 201 55 C172 59 156 79 156 110Z" stroke="#f1e7df" stroke-width="3"/>
    <circle cx="38" cy="288" r="13" fill="#a96551" stroke="#f1e7df" stroke-width="3"/>
  </g>
</svg>`;

const smallArc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 70">
  <g fill="none" stroke="#7f9473" stroke-width="3" stroke-linecap="round">
    <path d="M8 57 C43 9 97 3 170 18"/>
    <path d="M26 58 C55 28 91 22 138 29" stroke="#a96551"/>
    <circle cx="8" cy="57" r="6" fill="#f1e7df"/>
    <circle cx="170" cy="18" r="6" fill="#f1e7df"/>
  </g>
</svg>`;

const pageBase = (templateId, section) => [
  rect(templateId, 'paper', 0, 0, W, H, COLORS.warmGray),
  rect(templateId, 'left_soft_tab', 0, 126, 18, 86, COLORS.sage, { borderRadius: 9 }),
  rect(templateId, 'right_soft_tab', 491, 236, 18, 86, COLORS.clay, { borderRadius: 9 }),
  svg(templateId, 'header_arc', 294, 39, 187, 34, smallArc),
  text(templateId, 'example', 32, 13, 91, 23, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.clay,
  }),
  text(templateId, 'skip', 258, 12, 223, 25, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.clayDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  text(templateId, 'section', 32, 47, 449, 18, section.toUpperCase(), {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.sageDeep,
    characterSpacing: 1.2,
  }),
  rect(templateId, 'footer_rule', 32, 625, 449, 1, COLORS.rule),
  text(templateId, 'home', 8, 635, 62, 26, 'HOME', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.sageDeep,
    linkTarget: 'specific_node',
    linkValue: 'root',
  }),
  text(templateId, 'previous', 421, 635, 72, 26, 'UP', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.sageDeep,
    linkTarget: 'parent',
  }),
  text(templateId, 'folio', 173, 635, 163, 26, 'BREATHE / MOVE / REST', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.muted,
    align: 'center',
  }),
];

const titleBlock = (templateId, title = '{{title}}', subtitle = '{{subtitle}}') => [
  text(templateId, 'title', 32, 85, 449, 35, title, {
    dataBinding: title === '{{title}}' ? 'title' : undefined,
    fontSize: 24,
    fontFamily: 'georgia',
    fontWeight: 'bold',
    textColor: COLORS.clayDeep,
  }),
  text(templateId, 'subtitle', 32, 122, 449, 26, subtitle, {
    dataBinding: subtitle === '{{subtitle}}' ? 'subtitle' : undefined,
    fontSize: 10,
    fontStyle: 'italic',
    textColor: COLORS.muted,
  }),
];

const navChips = (templateId, { prev = true, next = true } = {}) => {
  const chips = [];
  if (prev) {
    chips.push(text(templateId, 'nav_prev', 336, 88, 70, 26, '{{nav_prev_label}}', {
      dataBinding: 'nav_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.sageDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '-1',
    }));
  }
  if (next) {
    chips.push(text(templateId, 'nav_next', 411, 88, 70, 26, '{{nav_next_label}}', {
      dataBinding: 'nav_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.clayDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }));
  }
  return chips;
};

const coverElements = [
  rect('cover', 'paper', 0, 0, W, H, COLORS.warmGray),
  rect('cover', 'sage_field', 0, 0, 214, H, COLORS.sageDeep),
  rect('cover', 'clay_spine', 214, 0, 9, H, COLORS.clay),
  svg('cover', 'botanical_arc', 7, 179, 199, 318, botanicalArc),
  text('cover', 'edition', 260, 58, 200, 22, 'WELLNESS + FITNESS JOURNAL', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.sageDeep,
    characterSpacing: 1.2,
  }),
  text('cover', 'title', 258, 111, 209, 111, 'Wellbeing\nRhythm', {
    fontSize: 37,
    fontFamily: 'georgia',
    fontWeight: 'bold',
    textColor: COLORS.clayDeep,
    verticalAlign: 'top',
  }),
  rect('cover', 'title_rule', 260, 249, 69, 3, COLORS.clay),
  text('cover', 'promise', 260, 277, 199, 94, 'Notice patterns.\nMove with intention.\nRecover without judgment.', {
    fontSize: 15,
    fontFamily: 'georgia',
    textColor: COLORS.ink,
    verticalAlign: 'top',
  }),
  text('cover', 'open', 260, 535, 200, 49, 'BEGIN THE RHYTHM', {
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.paper,
    fill: COLORS.clay,
    align: 'center',
    borderRadius: 24,
    linkTarget: 'specific_node',
    linkValue: 'start_here',
  }),
  text('cover', 'note', 260, 603, 200, 25, 'Habits | movement | energy | recovery', {
    fontSize: 9,
    fontStyle: 'italic',
    textColor: COLORS.muted,
    align: 'center',
  }),
];

const startElements = [
  ...pageBase('start', 'Orientation'),
  ...titleBlock('start', 'Choose a gentle starting point', 'Explore one balanced week, or open a clean journal for your own rhythm.'),
  svg('start', 'arc', 292, 91, 165, 55, smallArc),
  rect('start', 'example_panel', 32, 180, 449, 145, COLORS.paper, { stroke: COLORS.clay, strokeWidth: 1 }),
  text('start', 'example_kicker', 52, 199, 290, 18, 'EXPLORE GUIDED EXAMPLE', {
    fontSize: 10, fontWeight: 'bold', textColor: COLORS.clay,
  }),
  text('start', 'example_copy', 52, 229, 316, 64, 'See sleep rhythm, hydration, walking, two strength sessions, energy, and recovery recorded as one workable week.', {
    fontSize: 13, fontFamily: 'georgia', verticalAlign: 'top',
  }),
  text('start', 'example_open', 391, 218, 62, 62, 'OPEN', {
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.paper, fill: COLORS.clay, align: 'center', borderRadius: 31,
    linkTarget: 'specific_node', linkValue: 'example_workspace',
  }),
  rect('start', 'blank_panel', 32, 350, 449, 145, COLORS.sageDeep),
  text('start', 'blank_kicker', 52, 369, 290, 18, 'SKIP TO BLANK WORKSPACE', {
    fontSize: 10, fontWeight: 'bold', textColor: COLORS.sagePale,
  }),
  text('start', 'blank_copy', 52, 399, 316, 64, 'Use monthly habit dashboards, weekly movement plans, workout logs, energy notes, and separate recovery reflections.', {
    fontSize: 13, fontFamily: 'georgia', textColor: COLORS.paper, verticalAlign: 'top',
  }),
  text('start', 'blank_open', 391, 388, 62, 62, 'OPEN', {
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.sageDeep, fill: COLORS.warmGray, align: 'center', borderRadius: 31,
    linkTarget: 'specific_node', linkValue: 'blank_workspace',
  }),
  text('start', 'route', 32, 536, 449, 40, 'BASELINE  /  HABITS  /  WEEK  /  STRENGTH  /  RECOVERY', {
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.sageDeep, align: 'center',
  }),
];

const workspaceElements = [
  ...pageBase('workspace', 'Workspace'),
  ...titleBlock('workspace'),
  rect('workspace', 'hero', 32, 176, 449, 154, COLORS.clay),
  text('workspace', 'mode', 54, 195, 230, 19, '{{workspace_mode}}', {
    dataBinding: 'workspace_mode', fontSize: 9, fontWeight: 'bold', textColor: COLORS.warmGray,
  }),
  text('workspace', 'hero_text', 54, 228, 312, 66, '{{hero}}', {
    dataBinding: 'hero', fontSize: 20, fontFamily: 'georgia', fontWeight: 'bold', textColor: COLORS.paper, verticalAlign: 'top',
  }),
  text('workspace', 'enter', 393, 222, 62, 62, 'ENTER', {
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.clayDeep, fill: COLORS.warmGray, align: 'center', borderRadius: 31,
    linkTarget: 'child_index', linkValue: '0',
  }),
  text('workspace', 'index_label', 32, 355, 449, 18, 'OPEN BASELINE OR MONTH', {
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.sageDeep,
  }),
  grid('workspace', 'navigator', 32, 386, 139, 31, 3),
];

const baselineElements = [
  ...pageBase('baseline', 'Starting baseline'),
  ...titleBlock('baseline'),
  text('baseline', 'note', 32, 155, 449, 31, 'Describe what is true now. No scoring, diagnosis, or ideal version required.', {
    fontSize: 10, fontStyle: 'italic', textColor: COLORS.muted, fill: COLORS.sagePale, align: 'center',
  }),
  text('baseline', 'rhythm_label', 32, 210, 210, 18, 'CURRENT RHYTHM', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.clay }),
  rect('baseline', 'rhythm_box', 32, 236, 210, 118, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  text('baseline', 'rhythm', 44, 247, 186, 95, '{{current_rhythm}}', { dataBinding: 'current_rhythm', fontSize: 11, verticalAlign: 'top' }),
  text('baseline', 'support_label', 270, 210, 211, 18, 'WHAT SUPPORTS ME', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.clay }),
  rect('baseline', 'support_box', 270, 236, 211, 118, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  text('baseline', 'support', 282, 247, 187, 95, '{{support}}', { dataBinding: 'support', fontSize: 11, verticalAlign: 'top' }),
  text('baseline', 'movement_label', 32, 389, 449, 18, 'MOVEMENT I WANT MORE ROOM FOR', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.sageDeep }),
  rect('baseline', 'movement_box', 32, 415, 449, 74, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  text('baseline', 'movement', 44, 425, 425, 53, '{{movement_focus}}', { dataBinding: 'movement_focus', fontSize: 11, verticalAlign: 'top' }),
  text('baseline', 'intention_label', 32, 518, 449, 18, 'A KIND, PRACTICAL INTENTION', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.clay }),
  text('baseline', 'intention', 32, 544, 449, 48, '{{intention}}', { dataBinding: 'intention', fontSize: 12, fontFamily: 'georgia', fontStyle: 'italic', fill: COLORS.sagePale, align: 'center' }),
];

const monthHabitElements = [
  ...pageBase('month_habits', 'Monthly habits'),
  ...titleBlock('month_habits'),
  text('month_habits', 'intention_label', 32, 151, 93, 18, 'INTENTION', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.clay }),
  text('month_habits', 'intention', 132, 146, 349, 30, '{{intention}}', { dataBinding: 'intention', fontSize: 10, fontStyle: 'italic', fill: COLORS.sagePale }),
  text('month_habits', 'matrix_note', 32, 184, 449, 19, 'Mark what happened. Empty squares are information, not failure.', { fontSize: 9, fontStyle: 'italic', textColor: COLORS.muted }),
  ...habitMatrix('days_01_16', Array.from({ length: 16 }, (_, index) => index + 1), 213),
  ...habitMatrix('days_17_31', Array.from({ length: 15 }, (_, index) => index + 17), 377),
  text('month_habits', 'index_label', 32, 524, 200, 14, 'OPEN A WEEK', {
    fontSize: 8, fontWeight: 'bold', textColor: COLORS.sageDeep,
  }),
  (() => {
    const navigator = grid('month_habits', 'navigator', 32, 543, 47, 14, 9, {
      gapX: 3, gapY: 3, dataSliceCount: 27,
    });
    navigator.fontSize = 6.5;
    navigator.borderRadius = 3;
    return navigator;
  })(),
  text('month_habits', 'continue', 328, 524, 153, 26, 'BEGIN MONTH →', {
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.paper, fill: COLORS.sageDeep, align: 'center', borderRadius: 13,
    linkTarget: 'child_index', linkValue: '0',
  }),
];

const weekRows = Array.from({ length: 7 }, (_, index) => {
  const row = index + 1;
  return [`weekday_${row}`, `movement_${row}`, `energy_${row}`, `note_${row}`];
});

const weekElements = [
  ...pageBase('week', 'Weekly movement'),
  ...titleBlock('week'),
  text('week', 'rhythm_label', 32, 154, 104, 17, 'SLEEP RHYTHM', { fontSize: 8, fontWeight: 'bold', textColor: COLORS.sageDeep }),
  text('week', 'rhythm', 32, 174, 142, 42, '{{sleep_rhythm}}', { dataBinding: 'sleep_rhythm', fontSize: 9, fill: COLORS.paper, align: 'center' }),
  text('week', 'hydration_label', 185, 154, 104, 17, 'HYDRATION CUE', { fontSize: 8, fontWeight: 'bold', textColor: COLORS.sageDeep }),
  text('week', 'hydration', 185, 174, 142, 42, '{{hydration}}', { dataBinding: 'hydration', fontSize: 9, fill: COLORS.paper, align: 'center' }),
  text('week', 'walking_label', 339, 154, 104, 17, 'WALKING', { fontSize: 8, fontWeight: 'bold', textColor: COLORS.sageDeep }),
  text('week', 'walking', 339, 174, 142, 42, '{{walking}}', { dataBinding: 'walking', fontSize: 9, fill: COLORS.paper, align: 'center' }),
  ...staticTable('week', 'movement', 32, 238, [65, 170, 76, 138], 34,
    ['DAY', 'MOVEMENT / REST', 'ENERGY', 'NOTE'], weekRows),
  text('week', 'energy_label', 32, 530, 73, 17, 'ENERGY', { fontSize: 8, fontWeight: 'bold', textColor: COLORS.clay }),
  text('week', 'energy', 105, 521, 121, 35, '{{energy}}', { dataBinding: 'energy', fontSize: 10, fontWeight: 'bold', fill: COLORS.sagePale, align: 'center' }),
  text('week', 'recovery_label', 240, 530, 88, 17, 'RECOVERY NOTE', { fontSize: 8, fontWeight: 'bold', textColor: COLORS.clay }),
  text('week', 'recovery_note', 329, 521, 152, 35, '{{recovery_note}}', { dataBinding: 'recovery_note', fontSize: 9, fill: COLORS.paper, align: 'center' }),
  text('week', 'continue', 328, 574, 153, 32, '{{continue_label}}', {
    dataBinding: 'continue_label',
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.paper, fill: COLORS.clay, align: 'center', borderRadius: 16,
    linkTarget: 'child_index', linkValue: '0',
  }),
  ...navChips('week'),
];

const workoutRows = Array.from({ length: 6 }, (_, index) => {
  const row = index + 1;
  return [`movement_${row}`, `sets_${row}`, `reps_${row}`, `load_${row}`, `rpe_${row}`, `notes_${row}`];
});

const workoutElements = [
  ...pageBase('workout', 'Strength log'),
  ...titleBlock('workout'),
  text('workout', 'session_label', 32, 153, 90, 17, 'SESSION FOCUS', { fontSize: 8, fontWeight: 'bold', textColor: COLORS.clay }),
  text('workout', 'session', 32, 174, 284, 40, '{{session_focus}}', { dataBinding: 'session_focus', fontSize: 12, fontFamily: 'georgia', fill: COLORS.paper }),
  text('workout', 'readiness_label', 329, 153, 152, 17, 'READINESS / ENERGY', { fontSize: 8, fontWeight: 'bold', textColor: COLORS.clay }),
  text('workout', 'readiness', 329, 174, 152, 40, '{{readiness}}', { dataBinding: 'readiness', fontSize: 10, fill: COLORS.sagePale, align: 'center' }),
  ...staticTable('workout', 'strength', 32, 240, [132, 50, 50, 66, 46, 105], 43,
    ['MOVEMENT', 'SETS', 'REPS', 'LOAD', 'RPE', 'NOTES'], workoutRows,
    ['left', 'center', 'center', 'center', 'center', 'left']),
  text('workout', 'closing_label', 32, 554, 112, 17, 'HOW IT FELT', { fontSize: 8, fontWeight: 'bold', textColor: COLORS.sageDeep }),
  text('workout', 'closing', 145, 545, 177, 36, '{{session_note}}', { dataBinding: 'session_note', fontSize: 9, fill: COLORS.paper }),
  text('workout', 'continue', 328, 550, 153, 32, '{{continue_label}}', {
    dataBinding: 'continue_label',
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.paper, fill: COLORS.sageDeep, align: 'center', borderRadius: 16,
    linkTarget: 'sibling', linkValue: '1',
  }),
];

const recoveryElements = [
  ...pageBase('recovery', 'Recovery notes'),
  ...titleBlock('recovery'),
  text('recovery', 'prompt', 32, 153, 449, 28, 'Recovery is part of the rhythm. Notice what restored capacity and what asked for less.', {
    fontSize: 10, fontStyle: 'italic', textColor: COLORS.muted, fill: COLORS.sagePale, align: 'center',
  }),
  text('recovery', 'restored_label', 32, 207, 211, 18, 'WHAT RESTORED ME', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.sageDeep }),
  rect('recovery', 'restored_box', 32, 233, 211, 111, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  text('recovery', 'restored', 44, 244, 187, 88, '{{restored}}', { dataBinding: 'restored', fontSize: 11, verticalAlign: 'top' }),
  text('recovery', 'heavy_label', 270, 207, 211, 18, 'WHAT FELT HEAVY', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.clay }),
  rect('recovery', 'heavy_box', 270, 233, 211, 111, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  text('recovery', 'heavy', 282, 244, 187, 88, '{{felt_heavy}}', { dataBinding: 'felt_heavy', fontSize: 11, verticalAlign: 'top' }),
  text('recovery', 'energy_label', 32, 374, 211, 18, 'ENERGY PATTERN', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.sageDeep }),
  text('recovery', 'energy_pattern', 32, 400, 211, 59, '{{energy_pattern}}', { dataBinding: 'energy_pattern', fontSize: 10, fill: COLORS.paper, verticalAlign: 'top' }),
  text('recovery', 'recovery_label', 270, 374, 211, 18, 'RECOVERY PATTERN', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.sageDeep }),
  text('recovery', 'recovery_pattern', 270, 400, 211, 59, '{{recovery_pattern}}', { dataBinding: 'recovery_pattern', fontSize: 10, fill: COLORS.paper, verticalAlign: 'top' }),
  text('recovery', 'adjustment_label', 32, 493, 449, 18, 'ONE ADJUSTMENT FOR NEXT MONTH', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.clay }),
  text('recovery', 'adjustment', 32, 520, 449, 48, '{{adjustment}}', { dataBinding: 'adjustment', fontSize: 11, fontFamily: 'georgia', fontStyle: 'italic', fill: COLORS.sagePale, align: 'center' }),
  text('recovery', 'continue', 328, 578, 153, 28, '{{nav_next_label}}', {
    dataBinding: 'nav_next_label',
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.paper, fill: COLORS.clay, align: 'center', borderRadius: 14,
    linkTarget: 'sibling', linkValue: '1',
  }),
  ...navChips('recovery', { next: false }),
];

const reflectionElements = [
  ...pageBase('month_reflection', 'Monthly reflection'),
  ...titleBlock('month_reflection'),
  svg('month_reflection', 'arc', 306, 91, 151, 55, smallArc),
  text('month_reflection', 'win_label', 32, 174, 449, 18, 'A WIN WORTH NOTICING', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.clay }),
  rect('month_reflection', 'win_box', 32, 201, 449, 94, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  text('month_reflection', 'win', 45, 213, 423, 69, '{{win}}', { dataBinding: 'win', fontSize: 12, fontFamily: 'georgia', verticalAlign: 'top' }),
  text('month_reflection', 'lesson_label', 32, 326, 449, 18, 'WHAT THE PATTERN TAUGHT ME', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.sageDeep }),
  rect('month_reflection', 'lesson_box', 32, 353, 449, 94, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  text('month_reflection', 'lesson', 45, 365, 423, 69, '{{lesson}}', { dataBinding: 'lesson', fontSize: 12, fontFamily: 'georgia', verticalAlign: 'top' }),
  text('month_reflection', 'carry_label', 32, 478, 449, 18, 'WHAT I WILL CARRY FORWARD', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.clay }),
  text('month_reflection', 'carry', 32, 505, 449, 53, '{{carry_forward}}', { dataBinding: 'carry_forward', fontSize: 11, fontStyle: 'italic', fill: COLORS.sagePale, align: 'center' }),
  text('month_reflection', 'workspace', 328, 574, 153, 32, 'MONTH INDEX', {
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.paper, fill: COLORS.sageDeep, align: 'center', borderRadius: 16,
    linkTarget: 'specific_node', linkValue: 'blank_workspace',
  }),
  ...navChips('month_reflection', { next: false }),
];

const template = (id, name, elements) => ({ id, name, width: W, height: H, elements });

return {
  cover: template('cover', 'Wellbeing Rhythm Cover', coverElements),
  start: template('start', 'Start Here', startElements),
  workspace: template('workspace', 'Wellbeing Workspace', workspaceElements),
  baseline: template('baseline', 'Starting Baseline', baselineElements),
  month_habits: template('month_habits', 'Monthly Habit Rhythm', monthHabitElements),
  week: template('week', 'Weekly Movement Plan', weekElements),
  workout: template('workout', 'Strength Session Log', workoutElements),
  recovery: template('recovery', 'Recovery Notes', recoveryElements),
  month_reflection: template('month_reflection', 'Monthly Reflection', reflectionElements),
};
