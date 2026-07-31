const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  leather: '#533b33',     // primary ink: frames, rules, spines, text
  leatherDeep: '#3a2822', // engraved band heads, tap-target text
  lamp: '#37564e',        // lamp-green accent: plate marks, ornaments, ticks
  page: '#f3ecdf',        // page ground
  paper: '#fbf6ec',       // writable cells and plates
  inkSoft: '#6d6254',     // secondary text
  rule: '#cdc3ae',        // writing lines and fine rules
  gilt: '#dccfb4',        // light text on leather boards and bands
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
    textColor: COLORS.leather,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const label = (templateId, role, x, y, w, value, extra = {}) =>
  text(templateId, role, x, y, w, 11, value, {
    fontSize: 6.5,
    fontWeight: 'bold',
    textColor: COLORS.inkSoft,
    characterSpacing: 1.4,
    align: 'left',
    ...extra,
  });

const writingLines = (templateId, role, x, y, w, h, spacing = 24) =>
  rect(templateId, role, x, y, w, h, COLORS.rule, {
    fillType: 'pattern',
    patternType: 'lines-h',
    patternSpacing: spacing,
    patternWeight: 0.8,
  });

// The book page's title line and the shelf's spine chips read the same slot
// field (spine_N_label, kept on the book node itself); a book only ever
// defines its own slot, every other placeholder resolves to '', so this
// concatenation prints exactly the book's title.
const SPINE_FIELDS = Array.from({ length: 12 }, (unused, index) => `spine_${index + 1}_label`);
const TITLE_BINDING = SPINE_FIELDS.map(field => `{{${field}}}`).join('');

// --- Original artwork -------------------------------------------------------

const coverArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260">
  <path id="floor" d="M10 244 H290" stroke="#533b33" stroke-width="3"/>
  <g id="bookcase" fill="none" stroke="#533b33">
    <rect x="46" y="26" width="168" height="218" stroke-width="4"/>
    <path d="M50 134 H210" stroke-width="6"/>
  </g>
  <g id="upper_row">
    <rect x="58" y="58" width="18" height="73" fill="#533b33"/>
    <rect x="80" y="66" width="14" height="65" fill="none" stroke="#533b33" stroke-width="2.5"/>
    <rect x="98" y="52" width="20" height="79" fill="#37564e"/>
    <rect x="122" y="62" width="15" height="69" fill="none" stroke="#533b33" stroke-width="2.5"/>
    <rect x="141" y="56" width="19" height="75" fill="#533b33"/>
    <path d="M166 131 L186 62 L200 67 L182 131 Z" fill="none" stroke="#533b33" stroke-width="2.5"/>
  </g>
  <g id="lower_row">
    <rect x="58" y="168" width="16" height="72" fill="#37564e"/>
    <rect x="78" y="176" width="20" height="64" fill="none" stroke="#533b33" stroke-width="2.5"/>
    <rect x="102" y="164" width="15" height="76" fill="#533b33"/>
    <rect x="126" y="228" width="52" height="12" fill="none" stroke="#533b33" stroke-width="2.5"/>
    <rect x="132" y="214" width="46" height="12" fill="#37564e"/>
    <rect x="128" y="200" width="40" height="12" fill="none" stroke="#533b33" stroke-width="2.5"/>
  </g>
  <g id="lamp">
    <path d="M262 244 V96" stroke="#533b33" stroke-width="4"/>
    <path d="M262 96 Q262 72 242 68" stroke="#533b33" stroke-width="4" fill="none"/>
    <path d="M246 58 L222 86 L260 94 Z" fill="#37564e"/>
    <g stroke="#37564e" stroke-width="1.5" stroke-dasharray="3 6">
      <path d="M232 96 L206 130"/>
      <path d="M240 102 L226 142"/>
    </g>
    <path d="M246 244 H278" stroke="#533b33" stroke-width="4"/>
  </g>
  <g id="mug" stroke="#533b33" stroke-width="2.5" fill="none">
    <rect x="20" y="228" width="14" height="16"/>
    <path d="M34 233 q7 3.5 0 7"/>
  </g>
</svg>`;

const plateMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 26">
  <circle cx="12" cy="3.5" r="2" fill="#37564e"/>
  <path d="M2 9 Q7 6 12 9 Q17 6 22 9 V21 Q17 18 12 21 Q7 18 2 21 Z" fill="none" stroke="#533b33" stroke-width="1.6"/>
  <path d="M12 9 V21" stroke="#533b33" stroke-width="1.1"/>
</svg>`;

// Bookcase for the shelf page: two bays of six ghost spines standing on
// leather boards, drawn 1:1 under the tappable spine chips.
const shelfSpineGhosts = (bayTop) => {
  const pieces = [];
  for (let slot = 0; slot < 6; slot += 1) {
    const x = 11 + slot * 73;
    pieces.push(
      `<rect x="${x}" y="${bayTop}" width="62" height="156" rx="3" fill="#fbf6ec" stroke="#533b33" stroke-width="1.2"/>`,
      `<path d="M${x + 7} ${bayTop + 14} H${x + 55}" stroke="#533b33" stroke-width="1"/>`,
      `<path d="M${x + 7} ${bayTop + 142} H${x + 55}" stroke="#533b33" stroke-width="1"/>`,
    );
  }
  return pieces.join('\n  ');
};

const shelfCaseArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 449 420">
  <rect x="2" y="2" width="445" height="416" fill="none" stroke="#533b33" stroke-width="3"/>
  <rect x="9" y="9" width="431" height="402" fill="none" stroke="#533b33" stroke-width="1"/>
  ${shelfSpineGhosts(34)}
  ${shelfSpineGhosts(244)}
  <rect x="9" y="190" width="431" height="9" fill="#533b33"/>
  <rect x="9" y="400" width="431" height="9" fill="#533b33"/>
</svg>`;

// --- Shared ex-libris chrome -------------------------------------------------
// A library-plate head: the EXAMPLE and skip bindings flank a small open-book
// bookplate mark over a single inset rule pinned by two lamp-green nails. The
// foot is a split pair of fine rules around an EX LIBRIS folio with lamp-green
// plate ticks in the bottom corners - geometrically unlike the engraved double
// rules, mastheads, frames, spines, and command bars of products 09-15.

const pageBase = (templateId) => [
  rect(templateId, 'ground', 0, 0, W, H, COLORS.page),
  text(templateId, 'example', 30, 18, 110, 13, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.lamp,
    characterSpacing: 1.5,
    align: 'left',
  }),
  svg(templateId, 'plate_mark', 242.5, 10, 24, 26, plateMark),
  text(templateId, 'skip', 349, 18, 130, 13, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.leatherDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  rect(templateId, 'nail_l', 30, 45, 4, 4, COLORS.lamp),
  rect(templateId, 'nail_r', 475, 45, 4, 4, COLORS.lamp),
  rect(templateId, 'head_rule', 40, 46.5, 429, 1.4, COLORS.leather),
  rect(templateId, 'foot_rule_l', 30, 647, 180, 0.8, COLORS.rule),
  rect(templateId, 'foot_rule_r', 299, 647, 180, 0.8, COLORS.rule),
  text(templateId, 'folio', 212, 641, 85, 12, 'EX LIBRIS', {
    fontSize: 6.5,
    fontWeight: 'bold',
    textColor: COLORS.inkSoft,
    characterSpacing: 2,
    align: 'center',
  }),
  rect(templateId, 'tick_l', 30, 658, 5, 5, COLORS.lamp),
  rect(templateId, 'tick_r', 474, 658, 5, 5, COLORS.lamp),
];

const footerBack = (templateId, value, extra = {}) =>
  text(templateId, 'back_link', 30, 614, 150, 16, value, {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.leatherDeep,
    align: 'left',
    linkTarget: 'parent',
    ...extra,
  });

const footerJump = (templateId, value, link) =>
  text(templateId, 'jump_link', 329, 614, 150, 16, value, {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.leatherDeep,
    align: 'right',
    ...link,
  });

const pageTitle = (templateId, value, extra = {}) =>
  text(templateId, 'page_title', 30, 60, 449, 24, value, {
    fontFamily: 'georgia',
    fontSize: 18,
    fontWeight: 'bold',
    textColor: COLORS.leather,
    align: 'left',
    ...extra,
  });

const subtitle = (templateId, value, extra = {}) =>
  text(templateId, 'subtitle', 30, 88, 449, 14, value, {
    fontSize: 9,
    textColor: COLORS.inkSoft,
    align: 'left',
    ...extra,
  });

const doorChip = (templateId, role, x, y, value, link, extra = {}) =>
  text(templateId, role, x, y, 215, 34, value, {
    fontFamily: 'georgia',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.leather,
    fill: COLORS.paper,
    stroke: COLORS.leather,
    strokeWidth: 0.9,
    align: 'center',
    ...link,
    ...extra,
  });

// --- Templates --------------------------------------------------------------

const cover = {
  id: 'cover',
  name: 'Room Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'ground', 0, 0, W, H, COLORS.page),
    base('cover', 'tap_anywhere', 'rect', 0, 0, W, H, {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    rect('cover', 'corner_tl', 17, 17, 6, 6, COLORS.lamp),
    rect('cover', 'corner_tr', 486, 17, 6, 6, COLORS.lamp),
    rect('cover', 'corner_bl', 17, 656, 6, 6, COLORS.lamp),
    rect('cover', 'corner_br', 486, 656, 6, 6, COLORS.lamp),
    rect('cover', 'frame_outer', 20, 20, 469, 639, '', { stroke: COLORS.leather, strokeWidth: 1.6 }),
    rect('cover', 'frame_inner', 27, 27, 455, 625, '', { stroke: COLORS.lamp, strokeWidth: 0.7 }),
    text('cover', 'kicker', 60, 46, 389, 14, 'EX LIBRIS · A JOURNAL OF THE HOUSE LIBRARY', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.lamp,
      characterSpacing: 2.2,
      align: 'center',
    }),
    text('cover', 'title', 54, 64, 401, 52, 'The Reading Room', {
      fontFamily: 'georgia',
      fontSize: 36,
      fontWeight: 'bold',
      textColor: COLORS.leather,
      align: 'center',
    }),
    rect('cover', 'title_rule', 150, 124, 209, 1, COLORS.leather),
    svg('cover', 'title_mark', 241.5, 130, 26, 28, plateMark),
    rect('cover', 'plate', 84, 166, 341, 314, COLORS.paper, {
      stroke: COLORS.leather,
      strokeWidth: 1.2,
    }),
    rect('cover', 'plate_inner', 92, 174, 325, 298, '', {
      stroke: COLORS.rule,
      strokeWidth: 0.7,
    }),
    svg('cover', 'cover_art', 104.5, 182, 300, 260, coverArt),
    text('cover', 'plate_caption', 92, 452, 325, 12, 'TWO SHELVES · A QUOTE VAULT · ONE GREEN LAMP', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1.4,
      align: 'center',
    }),
    text('cover', 'sub', 80, 494, 349, 56, 'A reading journal built around a tappable bookshelf – every spine opens that book\'s page, with a vault for copied-out quotes, ledgers for series, a TBR stack, and a wrap up sheet for the year\'s reckoning.', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.leather,
      align: 'center',
      verticalAlign: 'top',
    }),
    text('cover', 'open_cta', 154.5, 560, 200, 34, 'Open the reading room »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.page,
      fill: COLORS.leather,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'imprint', 96, 620, 317, 12, 'SHELVES · QUOTES · SERIES · WRAP UP', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1.8,
      align: 'center',
    }),
  ],
};

const start = {
  id: 'start',
  name: 'Reader Guide',
  width: W,
  height: H,
  elements: [
    ...pageBase('start'),
    pageTitle('start', '{{title}}'),
    text('start', 'premise', 30, 88, 449, 58, 'The Reading Room keeps a house library on paper: shelves of tappable spines, a book page behind every slot, a vault of copied-out quotes, series ledgers, a TBR stack, and a wrap up sheet for December. A spine and its book page share one title line – write it once and the shelf stays true.', {
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.leather,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'howto_label', 30, 154, 260, 'HOW TO KEEP THE ROOM'),
    text('start', 'howto_steps', 30, 168, 449, 104, '1. Claim a spine – open a shelf, tap a slot, and write the book\'s title into the title line.\n2. Keep the book page as you read: dates, rating dots, format, the review, one quote worth keeping.\n3. Copy longer passages into the quote vault, one leaf at a time, with book and page noted.\n4. Track series in the ledgers; feed the TBR stack from whatever the vault makes you want next.\n5. In December, settle the year on the wrap up sheet – counts, the top five, the honest DNF list.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.leather,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'doors_label', 30, 282, 220, 'WHERE TO BEGIN'),
    doorChip('start', 'example_chip', 30, 296, 'The worked example »', {
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    doorChip('start', 'library_chip', 264, 296, 'Your library »', {
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }, {
      textColor: COLORS.page,
      fill: COLORS.leather,
      stroke: '',
      strokeWidth: 0,
    }),
    doorChip('start', 'shelf_chip', 30, 338, 'Shelf One »', {
      linkTarget: 'specific_node',
      linkValue: 'shelf_01',
    }),
    doorChip('start', 'vault_chip', 264, 338, 'The quote vault »', {
      linkTarget: 'specific_node',
      linkValue: 'quote_01',
    }),
    doorChip('start', 'tbr_chip', 30, 380, 'The TBR stack »', {
      linkTarget: 'specific_node',
      linkValue: 'tbr_01',
    }),
    doorChip('start', 'wrap_chip', 264, 380, 'The wrap up »', {
      linkTarget: 'specific_node',
      linkValue: 'wrap_up_01',
    }),
    label('start', 'rules_label', 30, 430, 220, 'HOUSE RULES'),
    text('start', 'rules_note', 30, 444, 449, 54, 'Rate on the night you finish, not a week later. A DNF is data, not a failure – it goes on the wrap up sheet with its reason. The worked example shows the handwriting; your library starts blank.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.leather,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'year_label', 30, 508, 300, 'THIS YEAR I WANT TO READ'),
    rect('start', 'year_rule_count', 30, 540, 215, 0.9, COLORS.rule),
    text('start', 'year_word_count', 30, 544, 215, 10, 'BOOKS · A NUMBER', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    rect('start', 'year_rule_kind', 264, 540, 215, 0.9, COLORS.rule),
    text('start', 'year_word_kind', 264, 544, 215, 10, 'MOSTLY · A DIRECTION', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    footerBack('start', '« Cover'),
    footerJump('start', 'THE SHELVES »', {
      linkTarget: 'specific_node',
      linkValue: 'shelf_01',
    }),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Library Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace'),
    pageTitle('workspace', '{{title}}'),
    text('workspace', 'hero', 30, 88, 449, 44, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.leather,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'note', 30, 134, 449, 24, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'table_label', 30, 166, 260, 'ON THE READING TABLE'),
    text('workspace', 'slot_a_chip', 30, 180, 215, 32, '{{slot_a_label}}', {
      dataBinding: 'slot_a_label',
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'left',
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    text('workspace', 'slot_b_chip', 264, 180, 215, 32, '{{slot_b_label}}', {
      dataBinding: 'slot_b_label',
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'left',
      linkTarget: 'child_index',
      linkValue: '1',
    }),
    label('workspace', 'library_label', 30, 224, 260, 'THE LIBRARY'),
    ...[
      ['shelves', 'hub_shelves_label', 'shelf_01'],
      ['vault', 'hub_vault_label', 'quote_01'],
      ['series', 'hub_series_label', 'series_01'],
      ['tbr', 'hub_tbr_label', 'tbr_01'],
      ['wrap', 'hub_wrap_label', 'wrap_up_01'],
      ['example', 'hub_example_label', 'example_workspace'],
    ].map(([role, labelField, target], index) =>
      text('workspace', `${role}_chip`, index % 2 === 0 ? 30 : 264, 240 + Math.floor(index / 2) * 40, 215, 32, `{{${labelField}}}`, {
        dataBinding: labelField,
        fontFamily: 'georgia',
        fontSize: 11,
        fontWeight: 'bold',
        textColor: COLORS.leatherDeep,
        align: 'left',
        linkTarget: 'specific_node',
        linkValue: target,
      })),
    label('workspace', 'wiring_label', 30, 370, 300, 'HOW THE ROOM IS WIRED'),
    text('workspace', 'wiring_note', 30, 386, 449, 56, 'Every spine on a shelf is a tap into its book page, and the book\'s title line is the same field the spine shows – write it once and both agree. Books chain along the shelves, quote leaves chain through the vault, and every page finds its way back here.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.leather,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'notes_label', 30, 452, 200, 'MARGINALIA'),
    writingLines('workspace', 'notes_lines', 30, 468, 449, 144, 24),
    footerBack('workspace', '« The guide'),
    footerJump('workspace', 'THE SHELVES »', {
      linkTarget: 'specific_node',
      linkValue: 'shelf_01',
    }),
  ],
};

// Bookshelf: twelve tall narrow spine chips in two bays of six, standing on
// the drawn boards. Each chip binds its slot field (spine_N_label, held by the
// book in that slot) and taps through to child N-1; slots past the book count
// bind '' on the shelf itself and stay silent ghost spines.
const spineChips = () => {
  const elements = [];
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  for (let n = 1; n <= 12; n += 1) {
    const bay = n <= 6 ? 0 : 1;
    const slot = (n - 1) % 6;
    const x = 41 + slot * 73;
    const chipY = bay === 0 ? 184 : 394;
    const numeralY = bay === 0 ? 320.5 : 530.5;
    elements.push(
      text('shelf', `spine_chip_${n}`, x, chipY, 62, 130, `{{spine_${n}_label}}`, {
        dataBinding: `spine_${n}_label`,
        fontFamily: 'georgia',
        fontSize: 9.5,
        fontWeight: 'bold',
        textColor: COLORS.leather,
        align: 'center',
        verticalAlign: 'top',
        linkTarget: 'child_index',
        linkValue: String(n - 1),
      }),
      text('shelf', `spine_numeral_${n}`, x, numeralY, 62, 8, numerals[n - 1], {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.gilt,
        characterSpacing: 1,
        align: 'center',
      }),
    );
  }
  return elements;
};

const shelf = {
  id: 'shelf',
  name: 'Bookshelf',
  width: W,
  height: H,
  elements: [
    ...pageBase('shelf'),
    pageTitle('shelf', '{{title}}'),
    text('shelf', 'shelf_note', 30, 88, 449, 26, '{{shelf_note}}', {
      dataBinding: 'shelf_note',
      fontSize: 9,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    svg('shelf', 'case_art', 30, 130, 449, 420, shelfCaseArt),
    ...spineChips(),
    text('shelf', 'prev_chip', 30, 566, 180, 16, '{{shelf_prev_label}}', {
      dataBinding: 'shelf_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('shelf', 'next_chip', 299, 566, 180, 16, '{{shelf_next_label}}', {
      dataBinding: 'shelf_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerBack('shelf', '« The library'),
    footerJump('shelf', 'THE WRAP UP »', {
      linkTarget: 'specific_node',
      linkValue: 'wrap_up_01',
    }),
  ],
};

const FORMAT_CHIPS = [
  ['HARDBACK', 86],
  ['PAPERBACK', 186],
  ['EBOOK', 286],
  ['AUDIO', 386],
];

const book = {
  id: 'book',
  name: 'Book Page',
  width: W,
  height: H,
  elements: [
    ...pageBase('book'),
    rect('book', 'plate_frame', 30, 58, 449, 88, COLORS.paper, {
      stroke: COLORS.leather,
      strokeWidth: 1.2,
    }),
    rect('book', 'plate_tick_tl', 27, 55, 5, 5, COLORS.lamp),
    rect('book', 'plate_tick_tr', 477, 55, 5, 5, COLORS.lamp),
    rect('book', 'plate_tick_bl', 27, 141, 5, 5, COLORS.lamp),
    rect('book', 'plate_tick_br', 477, 141, 5, 5, COLORS.lamp),
    label('book', 'title_label', 44, 63, 80, 'TITLE', { fontSize: 6 }),
    text('book', 'title_line', 44, 73, 330, 28, TITLE_BINDING, {
      fontFamily: 'georgia',
      fontSize: 15,
      fontWeight: 'bold',
      textColor: COLORS.leather,
      align: 'left',
    }),
    rect('book', 'title_rule', 44, 103, 330, 0.8, COLORS.rule),
    label('book', 'author_label', 44, 106, 160, 'AUTHOR · FIRST PUBLISHED', { fontSize: 6 }),
    text('book', 'author_line', 44, 116, 330, 16, '{{author_line}}', {
      dataBinding: 'author_line',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.leather,
      align: 'left',
    }),
    rect('book', 'author_rule', 44, 134, 330, 0.8, COLORS.rule),
    text('book', 'shelf_chip', 384, 66, 84, 32, '{{shelf_chip_label}}', {
      dataBinding: 'shelf_chip_label',
      fontFamily: 'georgia',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      fill: COLORS.page,
      stroke: COLORS.leather,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'parent',
    }),
    label('book', 'started_label', 30, 159, 52, 'STARTED', { fontSize: 6 }),
    rect('book', 'started_rule', 88, 170, 120, 0.8, COLORS.rule),
    text('book', 'started_value', 88, 156, 120, 14, '{{started}}', {
      dataBinding: 'started',
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.leather,
      align: 'left',
    }),
    label('book', 'finished_label', 222, 159, 56, 'FINISHED', { fontSize: 6 }),
    rect('book', 'finished_rule', 284, 170, 120, 0.8, COLORS.rule),
    text('book', 'finished_value', 284, 156, 120, 14, '{{finished}}', {
      dataBinding: 'finished',
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.leather,
      align: 'left',
    }),
    label('book', 'rating_label', 30, 185, 46, 'RATING', { fontSize: 6 }),
    ...[0, 1, 2, 3, 4].map(dot =>
      base('book', `rating_dot_${dot + 1}`, 'ellipse', 86 + dot * 22, 182, 14, 14, {
        stroke: COLORS.leather,
        strokeWidth: 1.3,
      })),
    text('book', 'rating_note', 200, 182, 204, 14, '{{rating_note}}', {
      dataBinding: 'rating_note',
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    label('book', 'format_label', 30, 209, 46, 'FORMAT', { fontSize: 6 }),
    ...FORMAT_CHIPS.flatMap(([word, x]) => [
      rect('book', `format_box_${x}`, x, 204, 92, 20, COLORS.paper, {
        stroke: COLORS.leather,
        strokeWidth: 0.9,
      }),
      rect('book', `format_tick_${x}`, x + 6, 209, 10, 10, COLORS.page, {
        stroke: COLORS.leather,
        strokeWidth: 1,
      }),
      text('book', `format_word_${x}`, x + 20, 204, 66, 20, word, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.leatherDeep,
        characterSpacing: 0.8,
        align: 'left',
      }),
    ]),
    text('book', 'format_note', 30, 230, 449, 12, '{{format_note}}', {
      dataBinding: 'format_note',
      fontSize: 8,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    label('book', 'review_label', 30, 250, 120, 'THE REVIEW'),
    writingLines('book', 'review_lines', 30, 262, 449, 147, 21),
    text('book', 'review_value', 30, 262, 449, 147, '{{review}}', {
      dataBinding: 'review',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.leather,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('book', 'quote_label', 30, 421, 220, 'FAVOURITE QUOTE · AND ITS PAGE'),
    rect('book', 'quote_frame', 30, 433, 449, 96, COLORS.paper, {
      stroke: COLORS.leather,
      strokeWidth: 1.2,
    }),
    text('book', 'quote_ornament', 38, 437, 24, 26, '»', {
      fontFamily: 'georgia',
      fontSize: 20,
      fontWeight: 'bold',
      textColor: COLORS.lamp,
      align: 'center',
    }),
    writingLines('book', 'quote_lines', 58, 449, 403, 66, 22),
    text('book', 'quote_value', 58, 445, 403, 78, '{{fav_quote}}', {
      dataBinding: 'fav_quote',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.leather,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('book', 'prev_chip', 30, 545, 180, 16, '{{book_prev_label}}', {
      dataBinding: 'book_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('book', 'next_chip', 299, 545, 180, 16, '{{book_next_label}}', {
      dataBinding: 'book_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    text('book', 'back_link_bound', 30, 614, 150, 16, '{{book_back_label}}', {
      dataBinding: 'book_back_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'left',
      linkTarget: 'ancestor',
      linkValue: '2',
    }),
    footerJump('book', 'QUOTE VAULT »', {
      linkTarget: 'specific_node',
      linkValue: 'quote_01',
    }),
  ],
};

const quotePlate = (role, y, quoteField, sourceField) => [
  rect('quote_page', `${role}_frame`, 30, y, 449, 196, COLORS.paper, {
    stroke: COLORS.leather,
    strokeWidth: 1.2,
  }),
  text('quote_page', `${role}_ornament`, 40, y + 6, 28, 30, '»', {
    fontFamily: 'georgia',
    fontSize: 22,
    fontWeight: 'bold',
    textColor: COLORS.lamp,
    align: 'center',
  }),
  label('quote_page', `${role}_label`, 76, y + 14, 120, 'THE QUOTE', { fontSize: 6 }),
  writingLines('quote_page', `${role}_lines`, 44, y + 40, 421, 88, 22),
  text('quote_page', `${role}_value`, 44, y + 36, 421, 96, `{{${quoteField}}}`, {
    dataBinding: quoteField,
    fontFamily: 'georgia',
    fontSize: 9.5,
    textColor: COLORS.leather,
    verticalAlign: 'top',
    align: 'left',
  }),
  label('quote_page', `${role}_source_label`, 44, y + 139, 150, 'BOOK · AUTHOR · PAGE', { fontSize: 6 }),
  rect('quote_page', `${role}_source_rule`, 200, y + 150, 265, 0.8, COLORS.rule),
  text('quote_page', `${role}_source_value`, 200, y + 136, 265, 14, `{{${sourceField}}}`, {
    dataBinding: sourceField,
    fontFamily: 'georgia',
    fontSize: 8.5,
    textColor: COLORS.leather,
    align: 'left',
  }),
];

const quotePage = {
  id: 'quote_page',
  name: 'Quote Leaf',
  width: W,
  height: H,
  elements: [
    ...pageBase('quote_page'),
    pageTitle('quote_page', '{{title}}'),
    subtitle('quote_page', 'Two quotes to a leaf – copy them in while the page is still warm, and note where they live.'),
    ...quotePlate('plate_a', 112, 'quote_a', 'quote_a_source'),
    ...quotePlate('plate_b', 322, 'quote_b', 'quote_b_source'),
    text('quote_page', 'prev_chip', 30, 538, 180, 16, '{{leaf_prev_label}}', {
      dataBinding: 'leaf_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('quote_page', 'next_chip', 299, 538, 180, 16, '{{leaf_next_label}}', {
      dataBinding: 'leaf_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    text('quote_page', 'back_link_bound', 30, 614, 150, 16, '{{leaf_back_label}}', {
      dataBinding: 'leaf_back_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'left',
      linkTarget: 'parent',
    }),
    footerJump('quote_page', 'THE SHELVES »', {
      linkTarget: 'specific_node',
      linkValue: 'shelf_01',
    }),
  ],
};

const SERIES_COLS = [
  ['NO', 30, 40],
  ['TITLE', 70, 215],
  ['OWNED', 285, 62],
  ['READ', 347, 62],
  ['NOTES', 409, 70],
];

const series = {
  id: 'series',
  name: 'Series Ledger',
  width: W,
  height: H,
  elements: [
    ...pageBase('series'),
    pageTitle('series', '{{title}}'),
    subtitle('series', 'One series to a ledger – number the books in reading order, tick what you own and what you\'ve read.'),
    label('series', 'name_label', 30, 115, 60, 'SERIES', { fontSize: 6 }),
    rect('series', 'name_rule', 96, 126, 160, 0.8, COLORS.rule),
    label('series', 'author_label', 272, 115, 60, 'AUTHOR', { fontSize: 6 }),
    rect('series', 'author_rule', 338, 126, 141, 0.8, COLORS.rule),
    ...SERIES_COLS.map(([word, x, w]) =>
      rect('series', `head_${x}`, x, 140, w, 20, COLORS.leather)),
    ...SERIES_COLS.map(([word, x, w]) =>
      text('series', `head_word_${x}`, x + 6, 140, w - 12, 20, word, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.gilt,
        characterSpacing: 1.2,
        align: 'left',
      })),
    ...Array.from({ length: 10 }, (unused, row) =>
      SERIES_COLS.map(([word, x, w]) =>
        rect('series', `cell_${x}_${row + 1}`, x, 160 + row * 34, w, 34, COLORS.paper, {
          stroke: COLORS.leather,
          strokeWidth: 0.8,
        }))).flat(),
    label('series', 'next_up_label', 30, 514, 260, 'NEXT UP · THE ONE TO BUY OR BORROW'),
    rect('series', 'next_up_rule', 30, 540, 449, 0.8, COLORS.rule),
    text('series', 'prev_chip', 30, 566, 180, 16, '{{series_prev_label}}', {
      dataBinding: 'series_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('series', 'next_chip', 299, 566, 180, 16, '{{series_next_label}}', {
      dataBinding: 'series_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerBack('series', '« The library'),
    footerJump('series', 'THE WRAP UP »', {
      linkTarget: 'specific_node',
      linkValue: 'wrap_up_01',
    }),
  ],
};

const tbrRows = () => {
  const elements = [];
  for (let row = 0; row < 12; row += 1) {
    const y = 132 + row * 34;
    elements.push(
      rect('tbr', `row_marker_${row + 1}`, 30, y + 6, 5, 5, COLORS.lamp),
      rect('tbr', `row_title_rule_${row + 1}`, 44, y + 18, 216, 0.8, COLORS.rule),
      rect('tbr', `row_why_rule_${row + 1}`, 270, y + 18, 209, 0.8, COLORS.rule),
    );
  }
  return elements;
};

const tbr = {
  id: 'tbr',
  name: 'TBR List',
  width: W,
  height: H,
  elements: [
    ...pageBase('tbr'),
    pageTitle('tbr', '{{title}}'),
    subtitle('tbr', 'The stack you mean to read. Cross a line off when it moves onto a shelf.'),
    text('tbr', 'col_title', 44, 116, 216, 10, 'TITLE & AUTHOR', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    text('tbr', 'col_why', 270, 116, 209, 10, 'WHY · WHO PRESSED IT ON YOU', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    ...tbrRows(),
    text('tbr', 'leave_note', 30, 544, 449, 12, 'A book leaves this page for a shelf slot – write its title on the spine there and cross it off here.', {
      fontSize: 8,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    text('tbr', 'prev_chip', 30, 566, 180, 16, '{{tbr_prev_label}}', {
      dataBinding: 'tbr_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('tbr', 'next_chip', 299, 566, 180, 16, '{{tbr_next_label}}', {
      dataBinding: 'tbr_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerBack('tbr', '« The library'),
    footerJump('tbr', 'THE SHELVES »', {
      linkTarget: 'specific_node',
      linkValue: 'shelf_01',
    }),
  ],
};

const MONTH_WORDS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const monthCells = () => {
  const elements = [];
  MONTH_WORDS.forEach((word, index) => {
    const col = index % 6;
    const row = Math.floor(index / 6);
    const x = 30 + col * 74.8;
    const y = 128 + row * 42;
    elements.push(
      rect('wrap_up', `month_cell_${index + 1}`, x, y, 74.8, 42, COLORS.paper, {
        stroke: COLORS.leather,
        strokeWidth: 0.9,
      }),
      text('wrap_up', `month_word_${index + 1}`, x, y + 4, 74.8, 9, word, {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.lamp,
        characterSpacing: 1.2,
        align: 'center',
      }),
    );
  });
  return elements;
};

const TOTAL_BOXES = [
  ['BOOKS FINISHED', 30],
  ['PAGES · ROUGHLY', 183],
  ['RE-READS', 336],
];

const wrapUp = {
  id: 'wrap_up',
  name: 'Wrap Up Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('wrap_up'),
    pageTitle('wrap_up', '{{title}}'),
    subtitle('wrap_up', 'Settle the year while it is still fresh – count, crown, and confess.'),
    label('wrap_up', 'months_label', 30, 114, 300, 'BOOKS FINISHED, MONTH BY MONTH'),
    ...monthCells(),
    ...TOTAL_BOXES.flatMap(([word, x]) => [
      rect('wrap_up', `total_box_${x}`, x, 224, 143, 26, COLORS.paper, {
        stroke: COLORS.leather,
        strokeWidth: 0.9,
      }),
      text('wrap_up', `total_word_${x}`, x + 6, 224, 131, 26, word, {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.inkSoft,
        characterSpacing: 1,
        align: 'left',
      }),
    ]),
    label('wrap_up', 'top_five_label', 30, 264, 160, 'THE TOP FIVE'),
    ...[0, 1, 2, 3, 4].flatMap(row => [
      text('wrap_up', `top_rank_${row + 1}`, 30, 278 + row * 28, 20, 18, String(row + 1), {
        fontFamily: 'georgia',
        fontSize: 12,
        fontWeight: 'bold',
        textColor: COLORS.lamp,
        align: 'left',
      }),
      rect('wrap_up', `top_rule_${row + 1}`, 58, 294 + row * 28, 421, 0.8, COLORS.rule),
    ]),
    label('wrap_up', 'dnf_label', 30, 424, 260, 'DNF · ABANDONED, WITHOUT GUILT'),
    text('wrap_up', 'dnf_col_title', 30, 436, 220, 9, 'TITLE', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    text('wrap_up', 'dnf_col_why', 270, 436, 209, 9, 'WHY IT LOST YOU', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1,
      align: 'left',
    }),
    ...[0, 1, 2, 3].flatMap(row => [
      rect('wrap_up', `dnf_title_rule_${row + 1}`, 30, 464 + row * 30, 220, 0.8, COLORS.rule),
      rect('wrap_up', `dnf_why_rule_${row + 1}`, 270, 464 + row * 30, 209, 0.8, COLORS.rule),
    ]),
    text('wrap_up', 'prev_chip', 30, 584, 180, 16, '{{wu_prev_label}}', {
      dataBinding: 'wu_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('wrap_up', 'next_chip', 299, 584, 180, 16, '{{wu_next_label}}', {
      dataBinding: 'wu_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.leatherDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerBack('wrap_up', '« The library'),
    footerJump('wrap_up', 'THE SERIES »', {
      linkTarget: 'specific_node',
      linkValue: 'series_01',
    }),
  ],
};

return {
  cover,
  start,
  workspace,
  shelf,
  book,
  quote_page: quotePage,
  series,
  tbr,
  wrap_up: wrapUp,
};
