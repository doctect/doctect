const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  sea: '#356f66',
  seaDeep: '#214c47',
  rust: '#b46148',
  rustDeep: '#7d3f31',
  sand: '#eadbc2',
  paper: '#fffaf1',
  ink: '#2f3532',
  muted: '#6f6b63',
  rule: '#9e988b',
  seaPale: '#d9e5df',
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
    fontSize: 9,
    fontFamily: 'helvetica',
    fontWeight: 'bold',
    textColor: COLORS.seaDeep,
    borderRadius: 2,
    gridConfig: {
      cols,
      gapX: 8,
      gapY: 8,
      sourceType: 'current',
      displayField: 'menu_label',
      gridBorderMode: 'all',
      gridBorderColor: COLORS.sea,
      gridBorderWidth: 0.8,
      gridBorderStyle: 'solid',
      gridBorderRadius: 2,
      showEmptyCellBorders: false,
      ...extra,
    },
  });

const field = (templateId, role, label, binding, x, y, w, h, extra = {}) => [
  text(templateId, `${role}_label`, x, y, w, 17, label.toUpperCase(), {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.rustDeep,
    characterSpacing: 0.7,
  }),
  rect(templateId, `writing_${role}`, x, y + 19, w, h - 19, COLORS.paper),
  text(templateId, `${role}_value`, x + 7, y + 23, w - 14, h - 27, `{{${binding}}}`, {
    dataBinding: binding,
    fontFamily: extra.fontFamily || 'georgia',
    fontSize: extra.fontSize || 10,
    verticalAlign: 'top',
    ...extra,
  }),
];

const staticTable = (templateId, group, x, y, widths, rowHeight, headers, rows) => {
  const elements = [];
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const totalHeight = rowHeight * (rows.length + 1);
  let cursorX = x;

  headers.forEach((header, column) => {
    const width = widths[column];
    elements.push(rect(templateId, `table_cell_header_${group}_${column + 1}`, cursorX, y, width, rowHeight, COLORS.seaDeep));
    elements.push(text(templateId, `table_header_${group}_${column + 1}`, cursorX + 4, y, width - 8, rowHeight, header, {
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.paper,
    }));
    cursorX += width;
  });

  rows.forEach((row, rowIndex) => {
    cursorX = x;
    row.forEach((binding, column) => {
      const width = widths[column];
      const rowY = y + rowHeight * (rowIndex + 1);
      elements.push(rect(templateId, `table_cell_${group}_${rowIndex + 1}_${column + 1}`, cursorX, rowY, width, rowHeight, COLORS.paper));
      elements.push(text(templateId, `table_value_${group}_${rowIndex + 1}_${column + 1}`, cursorX + 4, rowY, width - 8, rowHeight, `{{${binding}}}`, {
        dataBinding: binding,
        fontSize: 9,
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

const routeAtlas = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 430">
  <g id="contours" fill="none" stroke="#eadbc2" stroke-linecap="round">
    <path d="M24 93 C74 25 168 20 292 62 C226 97 203 149 216 207 C146 170 74 178 23 225" stroke-width="3"/>
    <path d="M45 117 C94 63 171 57 264 83 C216 112 196 151 199 183 C141 151 86 159 43 195" stroke-width="2"/>
    <path d="M57 140 C106 99 163 94 235 105 C201 130 184 154 182 166 C140 141 99 148 57 176" stroke-width="1.5"/>
  </g>
  <g id="route" fill="none" stroke="#b46148" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M48 356 C76 311 119 325 139 281 C158 239 123 221 154 184 C183 149 235 180 272 124"/>
    <circle cx="48" cy="356" r="9" fill="#356f66" stroke="#eadbc2" stroke-width="3"/>
    <circle cx="154" cy="184" r="8" fill="#b46148" stroke="#eadbc2" stroke-width="3"/>
    <circle cx="272" cy="124" r="9" fill="#356f66" stroke="#eadbc2" stroke-width="3"/>
  </g>
  <g id="compass" transform="translate(252 320)" fill="none" stroke="#eadbc2" stroke-linejoin="round">
    <circle cx="0" cy="0" r="48" stroke-width="3"/>
    <path d="M0 -39 L11 -8 L0 1 L-11 -8 Z" fill="#b46148" stroke-width="2"/>
    <path d="M0 39 L-9 8 L0 1 L9 8 Z" stroke-width="2"/>
    <path d="M-39 0 H39 M0 -39 V39" stroke-width="1"/>
  </g>
</svg>`;

const routeMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 55">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 39 C55 7 93 47 136 23 C176 1 215 35 272 14" stroke="#356f66" stroke-width="3"/>
    <circle cx="8" cy="39" r="5" fill="#b46148" stroke="#fffaf1" stroke-width="2"/>
    <circle cx="136" cy="23" r="5" fill="#eadbc2" stroke="#356f66" stroke-width="2"/>
    <circle cx="272" cy="14" r="5" fill="#b46148" stroke="#fffaf1" stroke-width="2"/>
  </g>
</svg>`;

const pageBase = (templateId, section) => [
  rect(templateId, 'sand', 0, 0, W, H, COLORS.sand),
  rect(templateId, 'sea_rail', 0, 0, 14, H, COLORS.seaDeep),
  rect(templateId, 'rust_waypoint', 14, 43, 8, 57, COLORS.rust),
  text(templateId, 'example', 34, 12, 100, 24, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.rustDeep,
    characterSpacing: 1,
  }),
  text(templateId, 'skip', 234, 12, 247, 24, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 10,
    fontWeight: 'bold',
    textColor: COLORS.rustDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  text(templateId, 'section', 34, 47, 447, 18, section.toUpperCase(), {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.seaDeep,
    characterSpacing: 1.3,
  }),
  rect(templateId, 'top_rule', 34, 72, 447, 2, COLORS.sea),
  rect(templateId, 'footer_rule', 34, 625, 447, 1, COLORS.rule),
  text(templateId, 'home', 34, 635, 62, 26, 'HOME', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.seaDeep,
    linkTarget: 'specific_node',
    linkValue: 'root',
  }),
  text(templateId, 'up', 110, 635, 62, 26, 'UP', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.seaDeep,
    linkTarget: 'parent',
  }),
  text(templateId, 'folio', 298, 635, 183, 26, 'FIELD NOTES FROM ELSEWHERE', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.muted,
    align: 'right',
  }),
];

const titleBlock = (templateId) => [
  text(templateId, 'title', 34, 84, 447, 40, '{{title}}', {
    fontFamily: 'georgia',
    fontSize: 25,
    fontWeight: 'bold',
    textColor: COLORS.seaDeep,
  }),
  text(templateId, 'subtitle', 34, 124, 447, 36, '{{subtitle}}', {
    dataBinding: 'subtitle',
    fontFamily: 'georgia',
    fontSize: 10,
    textColor: COLORS.muted,
    verticalAlign: 'top',
  }),
];

const cover = {
  id: 'cover',
  name: 'Field Notes Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'sea_field', 0, 0, W, H, COLORS.seaDeep),
    rect('cover', 'rust_meridian', 31, 0, 9, H, COLORS.rust),
    text('cover', 'kicker', 66, 68, 250, 24, 'ROUTES / DAYS / REMEMBERING', {
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.sand,
      characterSpacing: 1.4,
    }),
    text('cover', 'title', 65, 105, 300, 154, 'Field Notes\nfrom Elsewhere', {
      fontFamily: 'georgia',
      fontSize: 39,
      fontWeight: 'bold',
      textColor: COLORS.paper,
      verticalAlign: 'top',
    }),
    text('cover', 'subtitle', 67, 273, 218, 75, 'A destination-led journal for making a route, noticing a place, and carrying something home.', {
      fontFamily: 'georgia',
      fontSize: 12,
      textColor: COLORS.sand,
      verticalAlign: 'top',
    }),
    svg('cover', 'route_atlas', 199, 181, 282, 365, routeAtlas),
    text('cover', 'open', 66, 566, 196, 46, 'BEGIN THE ROUTE  ->', {
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.seaDeep,
      fill: COLORS.sand,
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
    svg('start', 'route_mark', 34, 166, 260, 52, routeMark),
    text('start', 'intro', 34, 224, 447, 64, 'Plan practical details first. Then use each day page as a timeline and a quiet place to notice what maps leave out.', {
      fontFamily: 'georgia',
      fontSize: 13,
      textColor: COLORS.seaDeep,
      verticalAlign: 'top',
    }),
    text('start', 'guided', 34, 319, 212, 91, 'EXPLORE GUIDED LISBON\nA fictional three-day route', {
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.paper,
      fill: COLORS.sea,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    text('start', 'blank', 269, 319, 212, 91, 'OPEN BLANK WORKSPACE\nConfigure 1-6 journeys', {
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.seaDeep,
      fill: COLORS.paper,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
    text('start', 'method', 34, 446, 447, 91, 'DASHBOARD  ->  RESERVATIONS  ->  ITINERARY  ->  FIELD NOTES\nPACKING  ->  EXPENSES  ->  HIGHLIGHTS', {
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.rustDeep,
      characterSpacing: 0.5,
      verticalAlign: 'top',
    }),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Journey Workspace',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace', 'journey shelf'),
    ...titleBlock('workspace'),
    text('workspace', 'mode', 34, 176, 447, 23, '{{workspace_mode}}', {
      dataBinding: 'workspace_mode',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.rustDeep,
      characterSpacing: 1,
    }),
    text('workspace', 'hero', 34, 202, 447, 54, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 15,
      textColor: COLORS.seaDeep,
      verticalAlign: 'top',
    }),
    grid('workspace', 'navigator', 34, 287, 137, 62, 3),
    text('workspace', 'note', 34, 476, 447, 71, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.muted,
      verticalAlign: 'top',
    }),
  ],
};

const trip = {
  id: 'trip',
  name: 'Journey Dashboard',
  width: W,
  height: H,
  elements: [
    ...pageBase('trip', 'journey dashboard'),
    ...titleBlock('trip'),
    ...field('trip', 'destination', 'Destination', 'destination', 34, 174, 270, 66),
    ...field('trip', 'dates', 'Dates', 'dates', 322, 174, 159, 66),
    ...field('trip', 'base', 'Home base', 'base', 34, 252, 447, 68),
    grid('trip', 'navigator', 34, 350, 137, 62, 3),
    ...field('trip', 'travel_note', 'Route note', 'travel_note', 34, 508, 447, 92, { fontSize: 9 }),
  ],
};

const reservations = {
  id: 'reservations',
  name: 'Reservations Index',
  width: W,
  height: H,
  elements: [
    ...pageBase('reservations', 'bookings + practicalities'),
    ...titleBlock('reservations'),
    text('reservations', 'instruction', 34, 171, 447, 35, 'Keep only useful arrival details here. Do not store sensitive identity or payment data.', {
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.muted,
    }),
    grid('reservations', 'navigator', 34, 226, 210, 50, 2),
    text('reservations', 'empty_state', 34, 462, 447, 48, '{{empty_state}}', {
      dataBinding: 'empty_state',
      fontFamily: 'georgia',
      fontSize: 12,
      textColor: COLORS.rustDeep,
      align: 'center',
    }),
    ...field('reservations', 'notes', 'Practical notes', 'notes', 34, 520, 447, 80, { fontSize: 9 }),
  ],
};

const reservation = {
  id: 'reservation',
  name: 'Reservation Record',
  width: W,
  height: H,
  elements: [
    ...pageBase('reservation', 'reservation record'),
    ...titleBlock('reservation'),
    text('reservation', 'kind', 34, 169, 122, 28, '{{kind}}', {
      dataBinding: 'kind',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.paper,
      fill: COLORS.rust,
      align: 'center',
    }),
    ...field('reservation', 'provider', 'Place / service', 'provider', 34, 215, 447, 64),
    ...field('reservation', 'address', 'Address / meeting point', 'address', 34, 291, 447, 66),
    ...field('reservation', 'arrival', 'Arrival', 'arrival', 34, 369, 214, 62),
    ...field('reservation', 'departure', 'Departure', 'departure', 267, 369, 214, 62),
    ...field('reservation', 'booking_reference', 'Reference', 'booking_reference', 34, 443, 214, 62, { fontSize: 9 }),
    ...field('reservation', 'contact', 'Contact / access', 'contact', 267, 443, 214, 62, { fontSize: 9 }),
    ...field('reservation', 'notes', 'Useful notes only', 'notes', 34, 517, 447, 83, { fontSize: 9 }),
  ],
};

const itinerary = {
  id: 'itinerary',
  name: 'Itinerary',
  width: W,
  height: H,
  elements: [
    ...pageBase('itinerary', 'route at a glance'),
    ...titleBlock('itinerary'),
    svg('itinerary', 'route_mark', 34, 162, 260, 52, routeMark),
    text('itinerary', 'instruction', 34, 211, 447, 35, 'Open a day card. Twenty-one days fit without clipping; labels stay concise for quick scanning.', {
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.muted,
    }),
    grid('itinerary', 'navigator', 34, 260, 137, 34, 3),
  ],
};

const day = {
  id: 'day',
  name: 'Daily Field Notes',
  width: W,
  height: H,
  elements: [
    ...pageBase('day', 'daily field notes'),
    ...titleBlock('day'),
    text('day', 'date_label', 34, 164, 447, 24, '{{date_label}}', {
      dataBinding: 'date_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.rustDeep,
      characterSpacing: 0.8,
    }),
    rect('day', 'timeline_route', 47, 208, 3, 178, COLORS.sea),
    ...[226, 276, 326, 376].map((y, index) => rect('day', `timeline_waypoint_${index + 1}`, 40, y, 17, 17, index === 0 ? COLORS.rust : COLORS.seaPale, {
      stroke: COLORS.sea,
      strokeWidth: 1,
    })),
    ...field('day', 'timeline', 'Timeline / route', 'timeline', 72, 198, 409, 194, { fontSize: 10 }),
    ...field('day', 'field_notes', 'Field notes - details, sounds, fragments', 'field_notes', 34, 410, 447, 118, { fontSize: 10 }),
    ...field('day', 'weather', 'Weather / light', 'weather', 34, 541, 214, 59, { fontSize: 9 }),
    ...field('day', 'moment', 'One moment to keep', 'moment', 267, 541, 214, 59, { fontSize: 9 }),
  ],
};

const packing = {
  id: 'packing',
  name: 'Packing List',
  width: W,
  height: H,
  elements: [
    ...pageBase('packing', 'packing'),
    ...titleBlock('packing'),
    ...field('packing', 'pack_1', 'Wear + layers', 'pack_1', 34, 177, 214, 112),
    ...field('packing', 'pack_2', 'Carry each day', 'pack_2', 267, 177, 214, 112),
    ...field('packing', 'pack_3', 'Documents + access', 'pack_3', 34, 307, 214, 112),
    ...field('packing', 'pack_4', 'Care + comfort', 'pack_4', 267, 307, 214, 112),
    ...field('packing', 'pack_5', 'Leave room for', 'pack_5', 34, 437, 447, 163),
  ],
};

const expenses = {
  id: 'expenses',
  name: 'Expense Ledger',
  width: W,
  height: H,
  elements: [
    ...pageBase('expenses', 'expense ledger'),
    ...titleBlock('expenses'),
    grid('expenses', 'expense_grid', 34, 164, 137, 38, 3, {
      showEmptyCellBorders: true,
      dataSliceCount: 3,
    }),
    ...staticTable('expenses', 'ledger', 34, 220, [74, 183, 100, 90], 32, ['DAY', 'ITEM', 'CATEGORY', 'AMOUNT'],
      Array.from({ length: 8 }, (_, index) => {
        const row = index + 1;
        return [`day_${row}`, `item_${row}`, `category_${row}`, `amount_${row}`];
      })),
    ...field('expenses', 'expense_note', 'Budget / currency note', 'expense_note', 34, 527, 447, 73, { fontSize: 9 }),
  ],
};

const highlights = {
  id: 'highlights',
  name: 'Highlights',
  width: W,
  height: H,
  elements: [
    ...pageBase('highlights', 'what remains'),
    ...titleBlock('highlights'),
    ...field('highlights', 'highlight_1', 'A place', 'highlight_1', 34, 177, 214, 103),
    ...field('highlights', 'highlight_2', 'A taste', 'highlight_2', 267, 177, 214, 103),
    ...field('highlights', 'highlight_3', 'A detail', 'highlight_3', 34, 298, 214, 103),
    ...field('highlights', 'highlight_4', 'A conversation', 'highlight_4', 267, 298, 214, 103),
    ...field('highlights', 'bring_home', 'What came home with me', 'bring_home', 34, 419, 447, 82),
    ...field('highlights', 'next_time', 'Next time', 'next_time', 34, 519, 447, 81),
  ],
};

return {
  cover,
  start,
  workspace,
  trip,
  reservations,
  reservation,
  itinerary,
  day,
  packing,
  expenses,
  highlights,
};
