const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  slate: '#2b3542',
  slateSoft: '#5a6674',
  brass: '#a08248',
  brassDeep: '#7a6234',
  ivory: '#edf0f4',
  paper: '#f7f8fa',
  boardDark: '#ccd4de',
  rule: '#b9c0ca',
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
    textColor: COLORS.slate,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const label = (templateId, role, x, y, w, value, extra = {}) =>
  text(templateId, role, x, y, w, 12, value, {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.brassDeep,
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

// --- The board --------------------------------------------------------------
// One static SVG checkerboard (8x8, 40pt squares, a1 dark) plus 64 bound text
// cells overlaid, each centered in its square. a1 sits bottom-left: the board
// is always drawn from White's side. Pieces are letters - uppercase White,
// lowercase black - so no chess glyphs ever reach the PDF fonts.

const BOARD_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const SQUARE = 40;
const BOARD = SQUARE * 8;

const darkSquares = [];
for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
  for (let rank = 1; rank <= 8; rank += 1) {
    if ((fileIndex + 1 + rank) % 2 === 0) {
      darkSquares.push(`<rect x="${fileIndex * SQUARE}" y="${(8 - rank) * SQUARE}" width="${SQUARE}" height="${SQUARE}" fill="#ccd4de"/>`);
    }
  }
}
const boardArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOARD} ${BOARD}"><rect x="0" y="0" width="${BOARD}" height="${BOARD}" fill="#f7f8fa"/>${darkSquares.join('')}</svg>`;

const boardBlock = (templateId, x, y) => [
  rect(templateId, 'board_frame', x - 6, y - 6, BOARD + 12, BOARD + 12, '', {
    stroke: COLORS.brass,
    strokeWidth: 1.4,
  }),
  rect(templateId, 'board_frame_inner', x - 2, y - 2, BOARD + 4, BOARD + 4, '', {
    stroke: COLORS.slate,
    strokeWidth: 0.7,
  }),
  svg(templateId, 'board_art', x, y, BOARD, BOARD, boardArt),
  ...[8, 7, 6, 5, 4, 3, 2, 1].map(rank =>
    text(templateId, `rank_${rank}`, x - 24, y + (8 - rank) * SQUARE, 14, SQUARE, String(rank), {
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.slateSoft,
      align: 'center',
    })),
  ...BOARD_FILES.map((file, fileIndex) =>
    text(templateId, `file_${file}`, x + fileIndex * SQUARE, y + BOARD + 9, SQUARE, 12, file, {
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.slateSoft,
      align: 'center',
    })),
  ...BOARD_FILES.flatMap((file, fileIndex) =>
    [1, 2, 3, 4, 5, 6, 7, 8].map(rank =>
      text(templateId, `cell_${file}${rank}`, x + fileIndex * SQUARE, y + (8 - rank) * SQUARE, SQUARE, SQUARE, `{{${file}${rank}}}`, {
        dataBinding: `${file}${rank}`,
        fontFamily: 'georgia',
        fontSize: 17,
        fontWeight: 'bold',
        textColor: COLORS.slate,
        align: 'center',
      }))),
];

// --- Original artwork -------------------------------------------------------

const coverArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 260">
  <g id="mini_board">
    <rect x="14" y="44" width="168" height="168" fill="#edf0f4"/>
    <g fill="#8f7440">
      <rect x="42" y="44" width="28" height="28"/><rect x="98" y="44" width="28" height="28"/><rect x="154" y="44" width="28" height="28"/>
      <rect x="14" y="72" width="28" height="28"/><rect x="70" y="72" width="28" height="28"/><rect x="126" y="72" width="28" height="28"/>
      <rect x="42" y="100" width="28" height="28"/><rect x="98" y="100" width="28" height="28"/><rect x="154" y="100" width="28" height="28"/>
      <rect x="14" y="128" width="28" height="28"/><rect x="70" y="128" width="28" height="28"/><rect x="126" y="128" width="28" height="28"/>
      <rect x="42" y="156" width="28" height="28"/><rect x="98" y="156" width="28" height="28"/><rect x="154" y="156" width="28" height="28"/>
      <rect x="14" y="184" width="28" height="28"/><rect x="70" y="184" width="28" height="28"/><rect x="126" y="184" width="28" height="28"/>
    </g>
    <rect x="14" y="44" width="168" height="168" fill="none" stroke="#a08248" stroke-width="2"/>
  </g>
  <g id="move_tree" fill="none" stroke="#2b3542" stroke-width="3" stroke-linecap="round">
    <path d="M112 198 V142"/>
    <path d="M112 142 C112 116 86 120 78 90"/>
    <path d="M112 142 C112 112 140 118 146 86"/>
  </g>
  <g id="tree_stops">
    <circle cx="112" cy="198" r="7" fill="#2b3542"/>
    <circle cx="78" cy="90" r="6" fill="#edf0f4" stroke="#2b3542" stroke-width="2"/>
    <circle cx="146" cy="86" r="6" fill="#a08248" stroke="#2b3542" stroke-width="2"/>
  </g>
  <g id="rook" fill="#edf0f4">
    <rect x="198" y="58" width="9" height="13"/><rect x="212" y="58" width="9" height="13"/><rect x="226" y="58" width="9" height="13"/>
    <rect x="198" y="71" width="37" height="9"/>
    <rect x="205" y="80" width="23" height="56"/>
    <rect x="199" y="136" width="35" height="7"/>
    <rect x="194" y="143" width="45" height="10"/>
  </g>
  <g id="pawn" fill="#a08248">
    <circle cx="216" cy="186" r="10"/>
    <path d="M209 196 L223 196 L228 224 L204 224 Z"/>
    <rect x="200" y="224" width="32" height="8"/>
  </g>
  <g id="corner_ticks" stroke="#a08248" stroke-width="1.6" fill="none">
    <path d="M14 30 H40"/><path d="M14 30 V56" transform="translate(0,-26)"/>
    <path d="M14 226 H40"/><path d="M182 30 H156"/>
  </g>
</svg>`;

const dividerArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 20">
  <path d="M8 10 H84" stroke="#a08248" stroke-width="1.4" fill="none"/>
  <rect x="94" y="4" width="12" height="12" fill="#a08248" transform="rotate(45 100 10)"/>
  <path d="M116 10 H192" stroke="#a08248" stroke-width="1.4" fill="none"/>
  <circle cx="8" cy="10" r="2.2" fill="#2b3542"/>
  <circle cx="192" cy="10" r="2.2" fill="#2b3542"/>
</svg>`;

const pawnRankArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 30">
  <g id="pawn_a" fill="#2b3542"><circle cx="20" cy="9" r="5"/><path d="M16.5 14 L23.5 14 L26 25 L14 25 Z"/><rect x="12" y="25" width="16" height="3.5"/></g>
  <g id="pawn_b" fill="#a08248"><circle cx="60" cy="9" r="5"/><path d="M56.5 14 L63.5 14 L66 25 L54 25 Z"/><rect x="52" y="25" width="16" height="3.5"/></g>
  <g id="pawn_c" fill="#2b3542"><circle cx="100" cy="9" r="5"/><path d="M96.5 14 L103.5 14 L106 25 L94 25 Z"/><rect x="92" y="25" width="16" height="3.5"/></g>
  <g id="pawn_d" fill="#a08248"><circle cx="140" cy="9" r="5"/><path d="M136.5 14 L143.5 14 L146 25 L134 25 Z"/><rect x="132" y="25" width="16" height="3.5"/></g>
</svg>`;

// --- Shared chrome ----------------------------------------------------------
// Every content page carries a slate masthead band over a brass baseline; the
// EXAMPLE and skip bindings live inside the band, the book word sits centered.

const pageBase = (templateId) => [
  rect(templateId, 'ground', 0, 0, W, H, COLORS.ivory),
  rect(templateId, 'masthead', 0, 0, W, 56, COLORS.slate),
  rect(templateId, 'masthead_rule', 0, 60, W, 2, COLORS.brass),
  text(templateId, 'masthead_word', 185, 20, 140, 16, 'OPENING ATLAS', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.brass,
    characterSpacing: 2.6,
    align: 'center',
  }),
  text(templateId, 'example', 30, 20, 150, 16, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.ivory,
    characterSpacing: 1.5,
    align: 'left',
  }),
  text(templateId, 'skip', 331, 20, 148, 16, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.ivory,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  rect(templateId, 'footer_rule', 30, 638, 449, 1, COLORS.brass),
  rect(templateId, 'footer_notch', 251, 644, 7, 7, COLORS.brass),
];

const folio = (templateId) =>
  text(templateId, 'folio', 174, 655, 160, 16, 'STUDY · BRANCH · REPEAT', {
    fontSize: 6.5,
    fontWeight: 'bold',
    textColor: COLORS.slateSoft,
    characterSpacing: 1.8,
    align: 'center',
  });

const footerLink = (templateId, role, x, w, value, align, link) =>
  text(templateId, role, x, 655, w, 16, value, {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.brassDeep,
    align,
    ...link,
  });

// --- Templates --------------------------------------------------------------

const cover = {
  id: 'cover',
  name: 'Atlas Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'slate_full', 0, 0, W, H, COLORS.slate),
    rect('cover', 'tap_anywhere', 0, 0, W, H, '', {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    rect('cover', 'frame_ivory', 22, 22, 465, 635, '', { stroke: COLORS.ivory, strokeWidth: 1.4 }),
    rect('cover', 'frame_brass', 32, 32, 445, 615, '', { stroke: COLORS.brass, strokeWidth: 0.8 }),
    text('cover', 'kicker', 54, 66, 401, 16, 'A CHESS REPERTOIRE IN PAGES', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 2,
      align: 'center',
    }),
    text('cover', 'title', 54, 92, 401, 54, 'Opening Atlas', {
      fontFamily: 'georgia',
      fontSize: 40,
      fontWeight: 'bold',
      textColor: COLORS.ivory,
      align: 'center',
    }),
    rect('cover', 'title_rule_a', 154, 158, 200, 1.2, COLORS.brass),
    rect('cover', 'title_rule_b', 154, 163, 200, 1.2, COLORS.brass),
    svg('cover', 'cover_art', 124, 186, 260, 260, coverArt),
    text('cover', 'subtitle', 84, 466, 341, 58, 'Four opening chapters drawn as a navigable move tree: every position is a page, every candidate move a tap deeper, every transposition a signpost back to the mainline.', {
      fontFamily: 'georgia',
      fontSize: 11.5,
      textColor: COLORS.ivory,
      align: 'center',
      verticalAlign: 'top',
    }),
    text('cover', 'open_cta', 144, 556, 220, 46, 'Open the study guide »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      fill: COLORS.brass,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'imprint', 54, 624, 401, 14, 'FOUR CHAPTERS · FORTY POSITIONS · ONE BOOK OF LINES', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.rule,
      characterSpacing: 1.5,
      align: 'center',
    }),
  ],
};

const start = {
  id: 'start',
  name: 'How To Study',
  width: W,
  height: H,
  elements: [
    ...pageBase('start'),
    text('start', 'title', 30, 70, 449, 28, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 20,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      align: 'left',
    }),
    text('start', 'premise', 30, 102, 449, 54, 'The atlas holds a full opening repertoire as a tree of positions. Read a chapter like a book - the pages run down the mainline first, then through each branch - or navigate it like a map: every candidate move on a position page is a link to the position it creates.', {
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.slate,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'howto_label', 30, 164, 200, 'HOW TO USE THE ATLAS'),
    text('start', 'howto_steps', 30, 178, 449, 100, '1. Pick a repertoire hub - White or Black - and open a chapter.\n2. Play the mainline on a real board, page by page, to its tabiya.\n3. Return and follow each branch; transposition pages jump you back to the line they rejoin.\n4. Write what you learn on the annotation lines - the atlas is a workbook, not just a book.\n5. Rebuild lines from memory on the practice worksheets, and score each session in a study log.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.slate,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'legend_label', 30, 288, 200, 'PIECE LETTERS'),
    ...[['K', 'KING'], ['Q', 'QUEEN'], ['R', 'ROOK'], ['B', 'BISHOP'], ['N', 'KNIGHT'], ['P', 'PAWN']].flatMap(([letter, name], index) => [
      rect('start', `legend_box_${letter}`, 30 + index * 76, 302, 70, 42, COLORS.paper, {
        stroke: COLORS.brass,
        strokeWidth: 0.9,
      }),
      text('start', `legend_letter_${letter}`, 30 + index * 76, 306, 70, 20, letter, {
        fontFamily: 'georgia',
        fontSize: 15,
        fontWeight: 'bold',
        textColor: COLORS.slate,
        align: 'center',
      }),
      text('start', `legend_name_${letter}`, 30 + index * 76, 326, 70, 12, name, {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.slateSoft,
        characterSpacing: 1,
        align: 'center',
      }),
    ]),
    text('start', 'legend_note', 30, 350, 449, 13, 'UPPERCASE = WHITE · lowercase = black · empty cell = empty square · boards face White', {
      fontSize: 7.5,
      fontWeight: 'bold',
      textColor: COLORS.slateSoft,
      characterSpacing: 0.6,
      align: 'left',
    }),
    text('start', 'white_chip', 30, 378, 220, 46, 'White repertoire »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      fill: COLORS.brass,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'white_repertoire',
    }),
    text('start', 'black_chip', 259, 378, 220, 46, 'Black repertoire »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.ivory,
      fill: COLORS.slate,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'black_repertoire',
    }),
    text('start', 'example_chip', 30, 434, 220, 36, 'See the worked example »', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      fill: COLORS.paper,
      stroke: COLORS.brass,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    text('start', 'practice_chip', 259, 434, 220, 36, 'Open the practice kit »', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      fill: COLORS.paper,
      stroke: COLORS.brass,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
    label('start', 'anatomy_label', 30, 488, 200, 'READING A POSITION PAGE'),
    text('start', 'anatomy_text', 30, 502, 449, 96, 'Top: the opening it belongs to and the position name. Middle: the diagram, drawn from the White side, with the move list that produced it and the book assessment beside it. Bottom: one line on the idea, then the candidate moves - tap one to follow it. A candidate marked "transposes" is a reference page: it lands on the original position, wherever it lives in the book.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.slate,
      verticalAlign: 'top',
      align: 'left',
    }),
    footerLink('start', 'back_link', 30, 140, '« Cover', 'left', { linkTarget: 'parent' }),
    folio('start'),
    footerLink('start', 'white_link', 339, 140, 'WHITE REPERTOIRE »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'white_repertoire',
    }),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Practice Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace'),
    text('workspace', 'title', 30, 68, 449, 26, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 19,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      align: 'left',
    }),
    text('workspace', 'hero', 30, 98, 449, 44, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.slate,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'note', 30, 146, 449, 26, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontSize: 8.5,
      textColor: COLORS.slateSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'sheets_label', 30, 184, 200, 'THE SHEETS'),
    ...Array.from({ length: 24 }, (unused, slot) =>
      text('workspace', `slot_chip_${slot + 1}`, slot < 12 ? 30 : 262, 200 + (slot % 12) * 26, 217, 22, `{{slot_${slot + 1}_label}}`, {
        dataBinding: `slot_${slot + 1}_label`,
        fontFamily: 'georgia',
        fontSize: 10.5,
        fontWeight: 'bold',
        textColor: COLORS.brassDeep,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(slot),
      })),
    label('workspace', 'how_label', 30, 524, 240, 'HOW THE SHEETS WORK'),
    text('workspace', 'how_text', 30, 538, 449, 60, 'A line worksheet is an empty position page: write a line in your own hand, then letter the final position onto the blank board from memory. A study log rules one row per session - date it, name the line, and score the recall so weak branches surface by themselves.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.slate,
      verticalAlign: 'top',
      align: 'left',
    }),
    footerLink('workspace', 'back_link', 30, 140, '« Study guide', 'left', { linkTarget: 'parent' }),
    folio('workspace'),
    footerLink('workspace', 'example_link', 339, 140, 'WORKED EXAMPLE »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
  ],
};

const repertoire = {
  id: 'repertoire',
  name: 'Repertoire Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('repertoire'),
    text('repertoire', 'title', 30, 70, 449, 30, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 22,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      align: 'left',
    }),
    text('repertoire', 'side_note', 30, 106, 449, 40, '{{side_note}}', {
      dataBinding: 'side_note',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.slate,
      verticalAlign: 'top',
      align: 'left',
    }),
    svg('repertoire', 'pawn_rank', 174, 152, 160, 30, pawnRankArt),
    ...[0, 1].flatMap(chapterIndex => {
      const y = 196 + chapterIndex * 166;
      const n = chapterIndex + 1;
      return [
        rect('repertoire', `card_${n}`, 30, y, 449, 148, COLORS.paper, {
          stroke: COLORS.brass,
          strokeWidth: 1.2,
        }),
        rect('repertoire', `card_${n}_inner`, 36, y + 6, 437, 136, '', {
          stroke: COLORS.rule,
          strokeWidth: 0.7,
        }),
        rect('repertoire', `card_${n}_tap`, 30, y, 449, 148, '', {
          linkTarget: 'child_index',
          linkValue: String(chapterIndex),
        }),
        text('repertoire', `card_${n}_no`, 48, y + 16, 40, 40, String(n), {
          fontFamily: 'georgia',
          fontSize: 30,
          fontWeight: 'bold',
          textColor: COLORS.brass,
          align: 'left',
        }),
        text('repertoire', `card_${n}_label`, 96, y + 22, 340, 26, `{{chapter_${n}_label}}`, {
          dataBinding: `chapter_${n}_label`,
          fontFamily: 'georgia',
          fontSize: 15,
          fontWeight: 'bold',
          textColor: COLORS.slate,
          align: 'left',
          linkTarget: 'child_index',
          linkValue: String(chapterIndex),
        }),
        text('repertoire', `card_${n}_note`, 96, y + 52, 361, 62, `{{chapter_${n}_note}}`, {
          dataBinding: `chapter_${n}_note`,
          fontFamily: 'georgia',
          fontSize: 9.5,
          textColor: COLORS.slate,
          verticalAlign: 'top',
          align: 'left',
        }),
        text('repertoire', `card_${n}_cta`, 96, y + 120, 240, 14, 'OPEN THE CHAPTER »', {
          fontSize: 7.5,
          fontWeight: 'bold',
          textColor: COLORS.brassDeep,
          characterSpacing: 1.4,
          align: 'left',
        }),
      ];
    }),
    text('repertoire', 'hub_note', 30, 544, 449, 54, '{{hub_note}}', {
      dataBinding: 'hub_note',
      fontSize: 9,
      textColor: COLORS.slateSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    footerLink('repertoire', 'back_link', 30, 140, '« Study guide', 'left', { linkTarget: 'parent' }),
    folio('repertoire'),
    footerLink('repertoire', 'practice_link', 339, 140, 'PRACTICE KIT »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
  ],
};

const chapter = {
  id: 'chapter',
  name: 'Chapter Opener',
  width: W,
  height: H,
  elements: [
    ...pageBase('chapter'),
    text('chapter', 'eyebrow', 30, 68, 449, 12, '{{chapter_label}}', {
      dataBinding: 'chapter_label',
      fontSize: 7.5,
      fontWeight: 'bold',
      textColor: COLORS.brassDeep,
      characterSpacing: 1.8,
      align: 'left',
    }),
    text('chapter', 'title', 30, 82, 449, 30, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 22,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      align: 'left',
    }),
    svg('chapter', 'divider', 154, 122, 200, 20, dividerArt),
    label('chapter', 'plan_label', 30, 154, 120, 'THE PLAN'),
    text('chapter', 'summary', 30, 168, 449, 104, '{{summary}}', {
      dataBinding: 'summary',
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.slate,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('chapter', 'ideas_label', 30, 284, 120, 'KEY IDEAS'),
    text('chapter', 'ideas', 30, 298, 449, 132, '{{ideas}}', {
      dataBinding: 'ideas',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.slate,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('chapter', 'begin_chip', 30, 446, 220, 46, 'Begin the line »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      fill: COLORS.brass,
      align: 'center',
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    text('chapter', 'begin_note', 268, 448, 211, 44, '{{begin_note}}', {
      dataBinding: 'begin_note',
      fontSize: 8.5,
      textColor: COLORS.slateSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('chapter', 'prep_label', 30, 512, 200, 'PREPARATION NOTES'),
    writingLines('chapter', 'prep_lines', 30, 526, 449, 100, 25),
    footerLink('chapter', 'back_link', 30, 140, '« Repertoire hub', 'left', { linkTarget: 'parent' }),
    folio('chapter'),
    footerLink('chapter', 'practice_link', 339, 140, 'PRACTICE KIT »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
  ],
};

const position = {
  id: 'position',
  name: 'Position Page',
  width: W,
  height: H,
  elements: [
    ...pageBase('position'),
    text('position', 'eyebrow', 30, 66, 300, 11, '{{chapter_label}}', {
      dataBinding: 'chapter_label',
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.brassDeep,
      characterSpacing: 1.6,
      align: 'left',
    }),
    text('position', 'title', 30, 78, 330, 22, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 15,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      align: 'left',
    }),
    text('position', 'to_move', 340, 82, 139, 14, '{{to_move}}', {
      dataBinding: 'to_move',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.slateSoft,
      align: 'right',
    }),
    ...boardBlock('position', 112, 104),
    label('position', 'line_label', 30, 450, 120, 'THE LINE'),
    text('position', 'move_list', 30, 464, 296, 42, '{{move_list}}', {
      dataBinding: 'move_list',
      fontFamily: 'georgia',
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      verticalAlign: 'top',
      align: 'left',
    }),
    rect('position', 'eval_box', 340, 450, 139, 56, COLORS.paper, {
      stroke: COLORS.brass,
      strokeWidth: 1.1,
    }),
    text('position', 'eval_label', 340, 456, 139, 12, 'ASSESSMENT', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.brassDeep,
      characterSpacing: 1.6,
      align: 'center',
    }),
    text('position', 'eval_text', 340, 470, 139, 28, '{{eval_text}}', {
      dataBinding: 'eval_text',
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      align: 'center',
    }),
    text('position', 'idea', 30, 512, 449, 28, '{{idea}}', {
      dataBinding: 'idea',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.slate,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('position', 'cand_label', 30, 544, 200, 'CANDIDATE MOVES'),
    ...[0, 1, 2].map(candidate =>
      text('position', `cand_chip_${candidate + 1}`, 30 + candidate * 154, 556, candidate === 2 ? 141 : 146, 26, `{{candidate_${candidate + 1}_label}}`, {
        dataBinding: `candidate_${candidate + 1}_label`,
        fontFamily: 'georgia',
        fontSize: 11,
        fontWeight: 'bold',
        textColor: COLORS.brassDeep,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(candidate),
      })),
    writingLines('position', 'note_lines', 30, 590, 449, 42, 21),
    footerLink('position', 'back_link', 30, 140, '« Back', 'left', { linkTarget: 'parent' }),
    folio('position'),
    footerLink('position', 'guide_link', 339, 140, 'STUDY GUIDE »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
  ],
};

const worksheet = {
  id: 'worksheet',
  name: 'Line Worksheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('worksheet'),
    text('worksheet', 'title', 30, 68, 300, 24, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 16,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      align: 'left',
    }),
    text('worksheet', 'note', 340, 74, 139, 14, 'From memory', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.slateSoft,
      align: 'right',
    }),
    ...boardBlock('worksheet', 112, 108),
    label('worksheet', 'line_label', 30, 454, 120, 'THE LINE'),
    writingLines('worksheet', 'line_lines', 30, 468, 449, 48, 24),
    label('worksheet', 'ideas_label', 30, 530, 260, 'IDEAS · EVALS · REMINDERS'),
    writingLines('worksheet', 'ideas_lines', 30, 544, 449, 88, 22),
    footerLink('worksheet', 'back_link', 30, 140, '« Practice kit', 'left', { linkTarget: 'parent' }),
    folio('worksheet'),
    footerLink('worksheet', 'guide_link', 339, 140, 'STUDY GUIDE »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
  ],
};

// Study log: an 11-row session ledger drawn from explicit bordered rects -
// no grid elements anywhere in this product.
const LOG_COLS = [30, 108, 327, 403];
const LOG_COL_WIDTHS = [78, 219, 76, 76];
const LOG_HEADS = ['DATE', 'LINE STUDIED', 'RECALL', 'REVISIT'];

const studyLog = {
  id: 'study_log',
  name: 'Study Log Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('study_log'),
    text('study_log', 'title', 30, 68, 300, 24, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 16,
      fontWeight: 'bold',
      textColor: COLORS.slate,
      align: 'left',
    }),
    text('study_log', 'subtitle', 30, 94, 449, 14, 'One row per session - date it, name the line, score the recall out of ten.', {
      fontSize: 9,
      textColor: COLORS.slateSoft,
      align: 'left',
    }),
    ...LOG_COLS.map((x, colIndex) =>
      rect('study_log', `head_${colIndex}`, x, 118, LOG_COL_WIDTHS[colIndex], 22, COLORS.slate)),
    ...LOG_COLS.map((x, colIndex) =>
      text('study_log', `head_text_${colIndex}`, x + 8, 118, LOG_COL_WIDTHS[colIndex] - 8, 22, LOG_HEADS[colIndex], {
        fontSize: 7,
        fontWeight: 'bold',
        textColor: COLORS.ivory,
        characterSpacing: 1.2,
        align: 'left',
      })),
    ...Array.from({ length: 11 }, (unused, row) =>
      LOG_COLS.map((x, colIndex) =>
        rect('study_log', `cell_${row + 1}_${colIndex}`, x, 140 + row * 40, LOG_COL_WIDTHS[colIndex], 40, COLORS.paper, {
          stroke: COLORS.brass,
          strokeWidth: 0.8,
        }))).flat(),
    label('study_log', 'notes_label', 30, 592, 120, 'NOTES'),
    writingLines('study_log', 'notes_lines', 30, 606, 449, 26, 13),
    footerLink('study_log', 'back_link', 30, 140, '« Practice kit', 'left', { linkTarget: 'parent' }),
    folio('study_log'),
    footerLink('study_log', 'guide_link', 339, 140, 'STUDY GUIDE »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
  ],
};

return {
  cover,
  start,
  workspace,
  repertoire,
  chapter,
  position,
  worksheet,
  study_log: studyLog,
};
