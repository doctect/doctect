const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  olive: '#687b55',
  oliveDeep: '#3f5035',
  tomato: '#bc6549',
  tomatoDeep: '#864330',
  oat: '#f3ead9',
  paper: '#fcf8ef',
  ink: '#342f28',
  muted: '#756d60',
  rule: '#9a927f',
  leafPale: '#dce2d2',
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
    fontFamily: 'georgia',
    textColor: COLORS.oliveDeep,
    borderRadius: 3,
    gridConfig: {
      cols,
      gapX: 8,
      gapY: 8,
      sourceType: 'current',
      displayField: 'title',
      gridBorderMode: 'all',
      gridBorderColor: COLORS.olive,
      gridBorderWidth: 0.8,
      gridBorderStyle: 'solid',
      gridBorderRadius: 3,
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
    elements.push(rect(templateId, `table_cell_header_${group}_${column + 1}`, cursorX, y, width, rowHeight, COLORS.oliveDeep));
    elements.push(text(templateId, `table_header_${group}_${column + 1}`, cursorX + 5, y, width - 10, rowHeight, header, {
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.oat,
      align: alignments[column] || 'left',
    }));
    cursorX += width;
  });

  rows.forEach((row, rowIndex) => {
    cursorX = x;
    row.forEach((field, column) => {
      const width = widths[column];
      const rowY = y + rowHeight * (rowIndex + 1);
      const isLabel = field.startsWith('label:');
      const binding = isLabel ? undefined : field;
      const value = isLabel ? field.slice(6) : `{{${field}}}`;
      elements.push(rect(templateId, `table_cell_${group}_${rowIndex + 1}_${column + 1}`, cursorX, rowY, width, rowHeight, isLabel ? COLORS.leafPale : COLORS.paper));
      elements.push(text(templateId, `table_value_${group}_${rowIndex + 1}_${column + 1}`, cursorX + 5, rowY, width - 10, rowHeight, value, {
        dataBinding: binding,
        fontSize: isLabel ? 8 : 9,
        fontWeight: isLabel ? 'bold' : 'normal',
        textColor: isLabel ? COLORS.oliveDeep : COLORS.ink,
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
    elements.push(rect(templateId, `table_line_${group}_horizontal_${rowIndex + 1}`, x, y + rowHeight * (rowIndex + 1) - 0.4, totalWidth, 0.8, COLORS.rule));
  });
  elements.push(rect(templateId, `table_boundary_${group}`, x, y, totalWidth, totalHeight, '', {
    stroke: COLORS.rule,
    strokeWidth: 0.8,
  }));
  return elements;
};

const plateAndLeaves = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="148" cy="184" r="104" stroke="#f3ead9" stroke-width="5"/>
    <circle cx="148" cy="184" r="72" stroke="#bc6549" stroke-width="3"/>
    <path d="M148 80 C132 36 96 20 66 28 C70 62 95 84 148 80Z" fill="#687b55" stroke="#f3ead9" stroke-width="3"/>
    <path id="leaf-sprigs" d="M148 80 C126 58 105 45 78 36 M111 56 C104 35 89 24 70 24 M129 68 C130 45 141 29 158 19" stroke="#f3ead9" stroke-width="3"/>
    <path d="M48 298 C92 272 196 272 250 302" stroke="#bc6549" stroke-width="4"/>
    <path d="M76 318 H222" stroke="#f3ead9" stroke-width="3"/>
  </g>
</svg>`;

const leafDivider = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 50">
  <g fill="none" stroke="#687b55" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 31 C76 8 163 9 242 27"/>
    <path id="leaf-left" d="M68 18 C55 4 40 5 31 15 C42 27 54 29 68 18Z" fill="#dce2d2"/>
    <path id="leaf-right" d="M176 18 C188 3 204 4 214 14 C203 27 190 29 176 18Z" fill="#dce2d2"/>
    <circle cx="124" cy="13" r="5" fill="#bc6549" stroke="none"/>
  </g>
</svg>`;

const pageBase = (templateId, section) => [
  rect(templateId, 'paper', 0, 0, W, H, COLORS.oat),
  rect(templateId, 'olive_rail', 0, 0, 16, H, COLORS.oliveDeep),
  rect(templateId, 'tomato_tab', 16, 39, 8, 67, COLORS.tomato),
  text(templateId, 'example', 35, 12, 100, 24, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.tomatoDeep,
    characterSpacing: 1.1,
  }),
  text(templateId, 'skip', 244, 12, 237, 24, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.tomatoDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  text(templateId, 'section', 35, 46, 446, 18, section.toUpperCase(), {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.oliveDeep,
    characterSpacing: 1.4,
  }),
  rect(templateId, 'top_rule', 35, 71, 446, 2, COLORS.olive),
  rect(templateId, 'footer_rule', 35, 625, 446, 1, COLORS.rule),
  text(templateId, 'home', 35, 635, 62, 26, 'HOME', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.oliveDeep,
    linkTarget: 'specific_node',
    linkValue: 'root',
  }),
  text(templateId, 'up', 114, 635, 62, 26, 'UP', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.oliveDeep,
    linkTarget: 'parent',
  }),
  text(templateId, 'folio', 343, 635, 138, 26, 'SEASONAL KITCHEN', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.muted,
    align: 'right',
  }),
];

const titleBlock = (templateId) => [
  text(templateId, 'title', 35, 86, 446, 38, '{{title}}', {
    fontFamily: 'georgia',
    fontSize: 25,
    fontWeight: 'bold',
    textColor: COLORS.oliveDeep,
  }),
  text(templateId, 'subtitle', 35, 124, 446, 35, '{{subtitle}}', {
    dataBinding: 'subtitle',
    fontFamily: 'georgia',
    fontSize: 10,
    textColor: COLORS.muted,
  }),
];

const field = (templateId, role, label, binding, x, y, w, h, extra = {}) => [
  text(templateId, `${role}_label`, x, y, w, 18, label.toUpperCase(), {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.tomatoDeep,
    characterSpacing: 0.8,
  }),
  rect(templateId, `${role}_surface`, x, y + 20, w, h - 20, COLORS.paper),
  text(templateId, `${role}_value`, x + 7, y + 23, w - 14, h - 26, `{{${binding}}}`, {
    dataBinding: binding,
    fontFamily: extra.fontFamily || 'georgia',
    fontSize: extra.fontSize || 10,
    verticalAlign: extra.verticalAlign || 'top',
    ...extra,
  }),
];

const cover = {
  id: 'cover',
  name: 'Seasonal Kitchen Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'olive_field', 0, 0, W, H, COLORS.oliveDeep),
    rect('cover', 'tomato_band', 0, 0, 22, H, COLORS.tomato),
    text('cover', 'kicker', 50, 72, 220, 24, 'RECIPES / RHYTHMS / LISTS', {
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.oat,
      characterSpacing: 1.5,
    }),
    text('cover', 'title', 50, 112, 285, 122, 'Seasonal\nKitchen', {
      fontFamily: 'georgia',
      fontSize: 43,
      fontWeight: 'bold',
      textColor: COLORS.oat,
      verticalAlign: 'top',
    }),
    text('cover', 'subtitle', 52, 247, 242, 68, 'A working cookbook for cooking with the season, planning the week, and shopping once.', {
      fontFamily: 'georgia',
      fontSize: 13,
      textColor: COLORS.leafPale,
      verticalAlign: 'top',
    }),
    svg('cover', 'plate_leaf_art', 235, 171, 245, 306, plateAndLeaves),
    text('cover', 'open', 52, 557, 192, 49, 'OPEN THE KITCHEN  ->', {
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.oliveDeep,
      fill: COLORS.oat,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'edition', 52, 624, 200, 18, 'UNDATED / REUSABLE', {
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.leafPale,
      characterSpacing: 1.2,
    }),
  ],
};

const start = {
  id: 'start',
  name: 'Start Here',
  width: W,
  height: H,
  elements: [
    ...pageBase('start', 'mise en place'),
    ...titleBlock('start'),
    svg('start', 'leaf_divider', 130, 158, 250, 50, leafDivider),
    text('start', 'intro', 65, 205, 380, 64, 'Collect recipes by season. Pull favorites into a week. Check the pantry, then leave with one combined list.', {
      fontFamily: 'georgia',
      fontSize: 13,
      textColor: COLORS.ink,
      align: 'center',
      verticalAlign: 'top',
    }),
    rect('start', 'example_card', 48, 299, 196, 170, COLORS.paper, { stroke: COLORS.tomato, strokeWidth: 1 }),
    text('start', 'example_card_title', 65, 319, 162, 34, 'Taste the autumn example', {
      fontFamily: 'georgia', fontSize: 16, fontWeight: 'bold', textColor: COLORS.tomatoDeep,
    }),
    text('start', 'example_card_body', 65, 361, 162, 64, 'Three fictional recipes become one seven-day meal plan and one combined shopping list.', {
      fontSize: 10, textColor: COLORS.muted, verticalAlign: 'top',
    }),
    text('start', 'example_card_open', 65, 432, 162, 25, 'EXPLORE EXAMPLE  ->', {
      fontSize: 9, fontWeight: 'bold', textColor: COLORS.tomatoDeep,
      linkTarget: 'specific_node', linkValue: 'example_workspace',
    }),
    rect('start', 'blank_card', 265, 299, 196, 170, COLORS.oliveDeep),
    text('start', 'blank_card_title', 282, 319, 162, 34, 'Begin with clean pages', {
      fontFamily: 'georgia', fontSize: 16, fontWeight: 'bold', textColor: COLORS.oat,
    }),
    text('start', 'blank_card_body', 282, 361, 162, 64, 'Open recipe banks, weekly plans, pantry inventory, and grouped reusable lists.', {
      fontSize: 10, textColor: COLORS.leafPale, verticalAlign: 'top',
    }),
    text('start', 'blank_card_open', 282, 432, 162, 25, 'SKIP TO BLANK  ->', {
      fontSize: 9, fontWeight: 'bold', textColor: COLORS.oat,
      linkTarget: 'specific_node', linkValue: 'blank_workspace',
    }),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Kitchen Workspace',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace', 'kitchen table'),
    ...titleBlock('workspace'),
    text('workspace', 'mode', 35, 169, 446, 26, '{{workspace_mode}}', {
      dataBinding: 'workspace_mode', fontSize: 9, fontWeight: 'bold', textColor: COLORS.tomatoDeep,
    }),
    text('workspace', 'hero', 35, 198, 446, 58, '{{hero}}', {
      dataBinding: 'hero', fontFamily: 'georgia', fontSize: 17, textColor: COLORS.oliveDeep,
    }),
    grid('workspace', 'navigator', 35, 286, 215, 76, 2),
    text('workspace', 'note', 35, 555, 446, 44, '{{workspace_note}}', {
      dataBinding: 'workspace_note', fontSize: 9, textColor: COLORS.muted, align: 'center',
    }),
  ],
};

const seasonIndex = {
  id: 'season_index',
  name: 'Seasonal Index',
  width: W,
  height: H,
  elements: [
    ...pageBase('season_index', 'seasonal index'),
    ...titleBlock('season_index'),
    text('season_index', 'prompt', 35, 166, 446, 38, '{{index_note}}', {
      dataBinding: 'index_note', fontFamily: 'georgia', fontSize: 11, textColor: COLORS.tomatoDeep,
    }),
    grid('season_index', 'navigator', 35, 226, 137, 54, 3),
  ],
};

const category = {
  id: 'category',
  name: 'Recipe Category',
  width: W,
  height: H,
  elements: [
    ...pageBase('category', 'recipe shelf'),
    ...titleBlock('category'),
    text('category', 'prompt', 35, 166, 446, 34, '{{category_note}}', {
      dataBinding: 'category_note', fontFamily: 'georgia', fontSize: 11, textColor: COLORS.tomatoDeep,
    }),
    grid('category', 'navigator', 35, 222, 102, 58, 4),
  ],
};

const recipe = {
  id: 'recipe',
  name: 'Recipe Page',
  width: W,
  height: H,
  elements: [
    ...pageBase('recipe', 'recipe'),
    ...titleBlock('recipe'),
    text('recipe', 'fictional_notice', 35, 160, 446, 20, '{{fictional_notice}}', {
      dataBinding: 'fictional_notice', fontSize: 8, fontWeight: 'bold', textColor: COLORS.tomatoDeep,
    }),
    ...field('recipe', 'yield', 'Yield', 'yield', 35, 187, 102, 58, { verticalAlign: 'middle' }),
    ...field('recipe', 'prep', 'Prep', 'prep', 149, 187, 102, 58, { verticalAlign: 'middle' }),
    ...field('recipe', 'cook', 'Cook', 'cook', 263, 187, 102, 58, { verticalAlign: 'middle' }),
    ...field('recipe', 'difficulty', 'Difficulty', 'difficulty', 377, 187, 104, 58, { verticalAlign: 'middle' }),
    ...field('recipe', 'ingredients', 'Ingredients', 'ingredients', 35, 265, 210, 236, { fontSize: 9 }),
    ...field('recipe', 'method', 'Method', 'method', 257, 265, 224, 236, { fontSize: 9 }),
    ...field('recipe', 'notes', 'Cook notes', 'notes', 35, 515, 300, 84, { fontSize: 9 }),
    ...field('recipe', 'repeat', 'Repeat rating', 'repeat_rating', 347, 515, 134, 84, { verticalAlign: 'middle', align: 'center' }),
    text('recipe', 'meal_plan', 356, 602, 125, 20, 'OPEN MEAL PLAN  ->', {
      fontSize: 8, fontWeight: 'bold', textColor: COLORS.tomatoDeep, align: 'right',
      linkTarget: 'referrer',
    }),
  ],
};

const mealRows = Array.from({ length: 7 }, (_, index) => {
  const day = index + 1;
  return [`day_${day}`, `breakfast_${day}`, `lunch_${day}`, `dinner_${day}`];
});

const mealPlan = {
  id: 'meal_plan',
  name: 'Weekly Meal Plan',
  width: W,
  height: H,
  elements: [
    ...pageBase('meal_plan', 'weekly table'),
    ...titleBlock('meal_plan'),
    ...staticTable('meal_plan', 'meals', 35, 184, [61, 116, 116, 153], 36, ['DAY', 'BREAKFAST', 'LUNCH', 'DINNER'], mealRows),
    ...field('meal_plan', 'prep_note', 'Make-ahead and leftovers', 'prep_note', 35, 492, 446, 83, { fontSize: 9 }),
    text('meal_plan', 'shopping', 35, 586, 178, 30, 'OPEN COMBINED LIST  ->', {
      fontSize: 9, fontWeight: 'bold', textColor: COLORS.tomatoDeep,
      linkTarget: 'child_index', linkValue: '0',
    }),
    text('meal_plan', 'recipe', 303, 586, 178, 30, 'OPEN FIRST RECIPE  ->', {
      fontSize: 9, fontWeight: 'bold', textColor: COLORS.oliveDeep, align: 'right',
      linkTarget: 'child_index', linkValue: '1',
    }),
  ],
};

const pantryRows = Array.from({ length: 6 }, (_, index) => {
  const row = index + 1;
  return [`staple_${row}`, `freezer_${row}`, `use_first_${row}`];
});

const pantry = {
  id: 'pantry',
  name: 'Pantry Inventory',
  width: W,
  height: H,
  elements: [
    ...pageBase('pantry', 'pantry check'),
    ...titleBlock('pantry'),
    ...staticTable('pantry', 'inventory', 35, 196, [149, 149, 148], 48, ['STAPLES', 'FREEZER', 'USE FIRST'], pantryRows),
    ...field('pantry', 'pantry_note', 'Before shopping', 'pantry_note', 35, 560, 446, 58, { fontSize: 9, verticalAlign: 'middle' }),
  ],
};

const shoppingRows = ['produce', 'pantry', 'chilled', 'bakery', 'household'].map(categoryName => [
  `label:${categoryName.toUpperCase()}`,
  `${categoryName}_1`,
  `${categoryName}_2`,
  `${categoryName}_3`,
]);

const shopping = {
  id: 'shopping',
  name: 'Combined Shopping List',
  width: W,
  height: H,
  elements: [
    ...pageBase('shopping', 'combined list'),
    ...titleBlock('shopping'),
    ...staticTable('shopping', 'list', 35, 200, [88, 119, 119, 120], 62, ['SECTION', 'ITEM 1', 'ITEM 2', 'ITEM 3'], shoppingRows),
    ...field('shopping', 'list_note', 'Route / substitutions', 'list_note', 35, 586, 286, 34, { fontSize: 8, verticalAlign: 'middle' }),
    text('shopping', 'plan', 338, 586, 143, 34, 'BACK TO WEEK  ->', {
      fontSize: 9, fontWeight: 'bold', textColor: COLORS.tomatoDeep, align: 'right',
      linkTarget: 'parent',
    }),
  ],
};

return {
  cover,
  start,
  workspace,
  season_index: seasonIndex,
  category,
  recipe,
  meal_plan: mealPlan,
  pantry,
  shopping,
};
