const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  teal: '#2f5d5a',      // lab ink: frames, rules, primary text
  tealDeep: '#22403e',  // pressed headers
  amber: '#b3703f',     // specimen tag: navigation accent
  amberDeep: '#8a5530', // tap-target text
  mist: '#eef0ea',      // page ground
  paper: '#f9faf6',     // specimen-card fill
  inkSoft: '#5f6a66',   // secondary text
  rule: '#c7cec6',      // fine grid rules
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
    textColor: COLORS.teal,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const label = (templateId, role, x, y, w, value, extra = {}) =>
  text(templateId, role, x, y, w, 12, value, {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.amberDeep,
    characterSpacing: 1.6,
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

const doubleRule = (templateId, role, x, y, w) => [
  rect(templateId, `${role}_a`, x, y, w, 0.7, COLORS.rule),
  rect(templateId, `${role}_b`, x, y + 3.5, w, 1.1, COLORS.teal),
];

// --- Original artwork -------------------------------------------------------

const coverArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 280">
  <g id="bench_rules" stroke="#c7cec6" stroke-width="1" fill="none">
    <path d="M8 44 H252"/><path d="M8 88 H252"/><path d="M8 132 H252"/>
    <path d="M8 176 H252"/><path d="M8 220 H252"/><path d="M8 264 H252"/>
  </g>
  <g id="flask" fill="none" stroke="#2f5d5a" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M78 26 H112"/>
    <path d="M86 26 V96 L46 200 Q38 222 60 222 H130 Q152 222 144 200 L104 96 V26"/>
  </g>
  <path id="liquid" d="M70 152 L56 200 Q52 212 64 212 H126 Q138 212 134 200 L120 152 Z" fill="#b3703f"/>
  <g id="bubbles" fill="#2f5d5a">
    <circle cx="96" cy="132" r="4"/><circle cx="106" cy="114" r="3"/><circle cx="88" cy="106" r="2.4"/>
  </g>
  <g id="word_tag" transform="rotate(10 200 118)">
    <path d="M168 94 L218 94 L236 118 L218 142 L168 142 Z" fill="#f9faf6" stroke="#b3703f" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="222" cy="118" r="4" fill="#b3703f"/>
    <path d="M178 110 H210 M178 126 H202" stroke="#2f5d5a" stroke-width="2.6"/>
  </g>
  <path id="tag_string" d="M228 130 Q250 158 238 186 Q228 206 204 210" fill="none" stroke="#b3703f" stroke-width="2.2" stroke-dasharray="1 6" stroke-linecap="round"/>
  <g id="loose_ticks" stroke="#2f5d5a" stroke-width="2.2" stroke-linecap="round" fill="none">
    <path d="M28 250 V262"/><path d="M38 250 V262"/><path d="M48 250 V262"/>
  </g>
</svg>`;

const flaskMiniArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 38">
  <path d="M9 3 H17" fill="none" stroke="#2f5d5a" stroke-width="2" stroke-linecap="round"/>
  <path d="M11 3 V12 L5 28 Q3 33 9 33 H17 Q23 33 21 28 L15 12 V3" fill="none" stroke="#2f5d5a" stroke-width="2" stroke-linejoin="round"/>
  <path d="M8 22 L6.5 27 Q6 30 9.5 30 H16.5 Q20 30 19.5 27 L18 22 Z" fill="#b3703f"/>
  <circle cx="13" cy="17" r="1.4" fill="#2f5d5a"/>
</svg>`;

const tagMiniArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 28">
  <path d="M4 4 H40 L52 14 L40 24 H4 Z" fill="none" stroke="#b3703f" stroke-width="2.4" stroke-linejoin="round"/>
  <circle cx="42" cy="14" r="2.4" fill="#b3703f"/>
  <path d="M10 11 H32 M10 17 H26" stroke="#2f5d5a" stroke-width="1.6"/>
</svg>`;

// --- Shared lab-notebook chrome ---------------------------------------------
// A solid teal spine band runs the full left edge (with amber index ticks);
// the EXAMPLE and skip bindings sit in a mist header over fine double rules,
// with a mini flask hanging off the right edge of the header.

const pageBase = (templateId) => [
  rect(templateId, 'ground', 0, 0, W, H, COLORS.mist),
  rect(templateId, 'spine', 0, 0, 24, H, COLORS.teal),
  rect(templateId, 'spine_tick_a', 24, 96, 6, 1.2, COLORS.amber),
  rect(templateId, 'spine_tick_b', 24, 336, 6, 1.2, COLORS.amber),
  rect(templateId, 'spine_tick_c', 24, 576, 6, 1.2, COLORS.amber),
  text(templateId, 'example', 40, 20, 150, 14, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.amberDeep,
    characterSpacing: 1.5,
    align: 'left',
  }),
  text(templateId, 'masthead_word', 185, 20, 140, 14, 'LEXICON LAB', {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.teal,
    characterSpacing: 2.6,
    align: 'center',
  }),
  text(templateId, 'skip', 330, 20, 145, 14, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.amberDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  rect(templateId, 'head_rule_fine', 40, 42, 400, 0.7, COLORS.rule),
  rect(templateId, 'head_rule_main', 40, 46, 400, 1.2, COLORS.teal),
  svg(templateId, 'flask_mark', 447, 40, 26, 38, flaskMiniArt),
  rect(templateId, 'foot_rule_main', 40, 640, 435, 1.2, COLORS.teal),
  rect(templateId, 'foot_rule_fine', 40, 644, 435, 0.7, COLORS.rule),
];

const folio = (templateId) =>
  text(templateId, 'folio', 180, 650, 150, 16, 'LEXICON LAB', {
    fontSize: 7,
    fontWeight: 'bold',
    textColor: COLORS.inkSoft,
    characterSpacing: 2.4,
    align: 'center',
  });

const footerLink = (templateId, role, x, w, value, align, link) =>
  text(templateId, role, x, 650, w, 16, value, {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.amberDeep,
    align,
    ...link,
  });

const pageTitle = (templateId, value, extra = {}) =>
  text(templateId, 'page_title', 40, 56, 435, 28, value, {
    fontFamily: 'georgia',
    fontSize: 19,
    fontWeight: 'bold',
    textColor: COLORS.teal,
    align: 'left',
    ...extra,
  });

// --- Templates --------------------------------------------------------------

const cover = {
  id: 'cover',
  name: 'Lab Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'ground', 0, 0, W, H, COLORS.mist),
    base('cover', 'tap_anywhere', 'rect', 0, 0, W, H, {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    rect('cover', 'spine', 0, 0, 38, H, COLORS.teal),
    rect('cover', 'spine_hairline', 40, 0, 1.5, H, COLORS.amber),
    rect('cover', 'plate', 86, 60, 372, 556, COLORS.paper, {
      stroke: COLORS.teal,
      strokeWidth: 1.6,
    }),
    rect('cover', 'plate_inner', 94, 68, 356, 540, '', {
      stroke: COLORS.rule,
      strokeWidth: 0.8,
    }),
    text('cover', 'kicker', 106, 92, 332, 14, 'A VOCABULARY LAB FOR ANY LANGUAGE', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.amberDeep,
      characterSpacing: 2,
      align: 'center',
    }),
    text('cover', 'title', 106, 114, 332, 54, 'Lexicon Lab', {
      fontFamily: 'georgia',
      fontSize: 38,
      fontWeight: 'bold',
      textColor: COLORS.teal,
      align: 'center',
    }),
    ...doubleRule('cover', 'title_rule', 172, 178, 200),
    svg('cover', 'cover_art', 122, 206, 260, 280, coverArt),
    text('cover', 'subtitle', 118, 502, 308, 62, 'Flashcard decks that flip themselves, grammar and drill sheets, a conversation journal, and a spaced review schedule – all pre-linked for whatever language you are learning.', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.teal,
      align: 'center',
      verticalAlign: 'top',
    }),
    text('cover', 'open_cta', 157, 570, 190, 38, 'Open the field guide »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.paper,
      fill: COLORS.amber,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'imprint', 106, 632, 332, 12, 'DECKS · DRILLS · JOURNALS · PROGRESS', {
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
  name: 'Study Guide',
  width: W,
  height: H,
  elements: [
    ...pageBase('start'),
    pageTitle('start', '{{title}}'),
    text('start', 'premise', 40, 90, 435, 56, 'Lexicon Lab is a vocabulary bench for any language you are learning. Every flashcard is two pages – a front you test yourself on and a back that teaches – and every deck is pre-linked, so cards flip and advance before you have written a single word.', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.teal,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'howto_label', 40, 154, 220, 'HOW TO RUN A REVIEW'),
    text('start', 'howto_steps', 40, 170, 435, 112, "1. Open a deck and tap a card row – say the word before you flip.\n2. Tap Reveal » to flip the card, and mark yourself honestly.\n3. Tap Next card » to carry the run to the end of the deck.\n4. Shade the deck's review boxes on Day 1, 3, 7, 14, and 30.\n5. Catch live phrases in the conversation journal, then card them.", {
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.teal,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'benches_label', 40, 292, 220, 'THE BENCHES'),
    text('start', 'demo_chip', 40, 308, 212, 36, 'Spanish demo deck »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.teal,
      fill: COLORS.paper,
      stroke: COLORS.teal,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    text('start', 'lab_chip', 263, 308, 212, 36, 'The word lab »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.paper,
      fill: COLORS.amber,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
    text('start', 'grammar_chip', 40, 352, 212, 36, 'Grammar sheets »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.teal,
      fill: COLORS.paper,
      stroke: COLORS.teal,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'grammar_01',
    }),
    text('start', 'drill_chip', 263, 352, 212, 36, 'Pattern drills »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.teal,
      fill: COLORS.paper,
      stroke: COLORS.teal,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'drill_01',
    }),
    text('start', 'journal_chip', 40, 396, 212, 36, 'Conversation journal »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.teal,
      fill: COLORS.paper,
      stroke: COLORS.teal,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'journal_01',
    }),
    text('start', 'progress_chip', 263, 396, 212, 36, 'Progress wall »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.teal,
      fill: COLORS.paper,
      stroke: COLORS.teal,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'progress_board',
    }),
    text('start', 'agnostic_note', 40, 452, 435, 40, 'The lab is language-agnostic: no template assumes a language. Only the demo deck speaks Spanish – your decks speak whatever you are learning.', {
      fontSize: 9,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'card_label', 40, 504, 260, 'A CARD IS TWO PAGES'),
    text('start', 'card_note', 40, 520, 435, 64, 'Front: the word, big, over its pronunciation line. Back: the meaning, an example in use, and note lines for gender, plurals, and mnemonics. Reveal » and Next card » are already wired on every blank card – write the words and the deck runs itself.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.teal,
      verticalAlign: 'top',
      align: 'left',
    }),
    footerLink('start', 'back_link', 40, 150, '« Cover', 'left', { linkTarget: 'parent' }),
    folio('start'),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Lab Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace'),
    pageTitle('workspace', '{{title}}'),
    text('workspace', 'hero', 40, 90, 435, 42, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.teal,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'note', 40, 136, 435, 28, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'decks_label', 40, 176, 220, 'THE DECKS'),
    ...[0, 1, 2, 3, 4, 5].map(index =>
      text('workspace', `deck_chip_${index + 1}`, index % 2 === 0 ? 40 : 263, 192 + Math.floor(index / 2) * 42, 212, 34, `{{deck_${index + 1}_label}}`, {
        dataBinding: `deck_${index + 1}_label`,
        fontFamily: 'georgia',
        fontSize: 11.5,
        fontWeight: 'bold',
        textColor: COLORS.amberDeep,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(index),
      })),
    label('workspace', 'reference_label', 40, 332, 260, 'REFERENCE & PRACTICE'),
    ...[
      ['grammar', 'grammar_label', 'grammar_01'],
      ['drill', 'drill_label', 'drill_01'],
      ['journal', 'journal_label', 'journal_01'],
      ['progress', 'progress_label', 'progress_board'],
    ].map(([role, labelField, targetId], index) =>
      text('workspace', `${role}_chip`, index % 2 === 0 ? 40 : 263, 348 + Math.floor(index / 2) * 40, 212, 32, `{{${labelField}}}`, {
        dataBinding: labelField,
        fontFamily: 'georgia',
        fontSize: 11,
        fontWeight: 'bold',
        textColor: COLORS.amberDeep,
        align: 'left',
        linkTarget: 'specific_node',
        linkValue: targetId,
      })),
    label('workspace', 'wiring_label', 40, 448, 260, 'HOW THE WIRING WORKS'),
    text('workspace', 'wiring_note', 40, 464, 435, 56, 'Every blank card front already flips to its own back, and every back already advances to the next card in its deck. Write a word on a front and its meaning on the back – the navigation was finished before you started.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.teal,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'bench_notes_label', 40, 536, 200, 'BENCH NOTES'),
    writingLines('workspace', 'bench_notes_lines', 40, 552, 435, 72, 24),
    footerLink('workspace', 'back_link', 40, 150, '« Field guide', 'left', { linkTarget: 'parent' }),
    folio('workspace'),
    footerLink('workspace', 'progress_link', 335, 140, 'PROGRESS WALL »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'progress_board',
    }),
  ],
};

const deck = {
  id: 'deck',
  name: 'Deck Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('deck'),
    pageTitle('deck', '{{title}}'),
    text('deck', 'focus', 40, 88, 435, 26, '{{deck_focus}}', {
      dataBinding: 'deck_focus',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    rect('deck', 'focus_rule', 40, 118, 300, 0.9, COLORS.rule),
    label('deck', 'cards_label', 40, 138, 200, 'CARDS IN THIS DECK'),
    text('deck', 'cards_hint', 245, 138, 230, 12, 'TAP A ROW TO OPEN ITS CARD', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1.2,
      align: 'right',
    }),
    base('deck', 'card_grid', 'grid', 40, 154, 211, 26, {
      fill: COLORS.paper,
      fontSize: 8.5,
      fontFamily: 'helvetica',
      fontWeight: 'bold',
      textColor: COLORS.teal,
      borderRadius: 2,
      gridConfig: {
        cols: 2,
        gapX: 13,
        gapY: 6,
        sourceType: 'current',
        displayField: 'row_label',
        gridBorderMode: 'all',
        gridBorderColor: COLORS.teal,
        gridBorderWidth: 0.8,
        gridBorderStyle: 'solid',
        gridBorderRadius: 2,
        showEmptyCellBorders: false,
      },
    }),
    label('deck', 'review_label', 40, 418, 200, 'REVIEW SCHEDULE'),
    ...[1, 3, 7, 14, 30].flatMap((day, index) => [
      rect('deck', `review_box_${day}`, 40 + index * 88, 434, 18, 18, COLORS.paper, {
        stroke: COLORS.teal,
        strokeWidth: 1,
      }),
      text('deck', `review_day_${day}`, 64 + index * 88, 437, 56, 12, `DAY ${day}`, {
        fontSize: 8,
        fontWeight: 'bold',
        textColor: COLORS.teal,
        align: 'left',
      }),
    ]),
    text('deck', 'review_note', 40, 462, 435, 14, 'Shade a day when you run this deck and it holds.', {
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    text('deck', 'progress_chip', 40, 490, 180, 34, 'Progress wall »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.paper,
      fill: COLORS.amber,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'progress_board',
    }),
    text('deck', 'run_chip', 245, 490, 230, 34, '{{run_label}}', {
      dataBinding: 'run_label',
      fontFamily: 'georgia',
      fontSize: 12,
      fontWeight: 'bold',
      textColor: COLORS.amberDeep,
      align: 'center',
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    label('deck', 'deck_notes_label', 40, 544, 200, 'DECK NOTES'),
    writingLines('deck', 'deck_notes_lines', 40, 560, 435, 64, 22),
    footerLink('deck', 'back_link', 40, 150, '« Lab hub', 'left', { linkTarget: 'parent' }),
    folio('deck'),
    footerLink('deck', 'journal_link', 335, 140, 'JOURNAL »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'journal_01',
    }),
  ],
};

const cardFront = {
  id: 'card_front',
  name: 'Card Front',
  width: W,
  height: H,
  elements: [
    ...pageBase('card_front'),
    rect('card_front', 'card_frame', 48, 84, 413, 510, COLORS.paper, {
      stroke: COLORS.teal,
      strokeWidth: 1.4,
    }),
    rect('card_front', 'card_frame_inner', 56, 92, 397, 494, '', {
      stroke: COLORS.rule,
      strokeWidth: 0.8,
    }),
    svg('card_front', 'tag_art', 68, 106, 56, 28, tagMiniArt),
    text('card_front', 'specimen_no', 280, 112, 160, 12, 'SPECIMEN {{card_no}}', {
      fontSize: 7.5,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1.4,
      align: 'right',
    }),
    label('card_front', 'word_label', 64, 168, 381, 'THE WORD', { align: 'center' }),
    text('card_front', 'word', 64, 188, 381, 84, '{{word}}', {
      dataBinding: 'word',
      fontFamily: 'georgia',
      fontSize: 34,
      fontWeight: 'bold',
      textColor: COLORS.teal,
      align: 'center',
    }),
    rect('card_front', 'word_rule', 134, 278, 240, 1, COLORS.teal),
    label('card_front', 'pron_label', 64, 308, 381, 'PRONUNCIATION', { align: 'center' }),
    text('card_front', 'pronunciation', 64, 324, 381, 24, '{{pronunciation}}', {
      dataBinding: 'pronunciation',
      fontFamily: 'georgia',
      fontSize: 12,
      textColor: COLORS.inkSoft,
      align: 'center',
    }),
    rect('card_front', 'pron_rule', 164, 354, 180, 0.8, COLORS.rule),
    text('card_front', 'front_hint', 64, 382, 381, 14, 'Say it, spell it, picture it – then flip the card.', {
      fontFamily: 'georgia',
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      align: 'center',
    }),
    ...doubleRule('card_front', 'front_divider', 64, 414, 381),
    text('card_front', 'reveal_chip', 154, 460, 200, 48, '{{reveal_label}}', {
      dataBinding: 'reveal_label',
      fontFamily: 'georgia',
      fontSize: 16,
      fontWeight: 'bold',
      textColor: COLORS.amberDeep,
      align: 'center',
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    text('card_front', 'front_note', 64, 516, 381, 12, 'WRITE FIRST – THEN FLIP', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.inkSoft,
      characterSpacing: 1.8,
      align: 'center',
    }),
    footerLink('card_front', 'back_link', 40, 150, '« Deck sheet', 'left', { linkTarget: 'parent' }),
    folio('card_front'),
    footerLink('card_front', 'progress_link', 335, 140, 'PROGRESS WALL »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'progress_board',
    }),
  ],
};

const cardBack = {
  id: 'card_back',
  name: 'Card Back',
  width: W,
  height: H,
  elements: [
    ...pageBase('card_back'),
    rect('card_back', 'card_frame', 48, 84, 413, 510, COLORS.paper, {
      stroke: COLORS.teal,
      strokeWidth: 1.4,
    }),
    rect('card_back', 'card_band', 48, 84, 413, 26, COLORS.teal),
    text('card_back', 'band_word', 60, 90, 389, 14, 'CARD BACK · SPECIMEN {{card_no}}', {
      fontSize: 7.5,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 1.6,
      align: 'center',
    }),
    label('card_back', 'meaning_label', 64, 124, 200, 'MEANING'),
    text('card_back', 'meaning', 64, 140, 381, 64, '{{meaning}}', {
      dataBinding: 'meaning',
      fontFamily: 'georgia',
      fontSize: 18,
      fontWeight: 'bold',
      textColor: COLORS.teal,
      verticalAlign: 'top',
      align: 'left',
    }),
    rect('card_back', 'meaning_rule', 64, 208, 381, 0.8, COLORS.rule),
    label('card_back', 'example_label_row', 64, 226, 200, 'EXAMPLE IN USE'),
    text('card_back', 'example_sentence', 64, 242, 381, 44, '{{example_sentence}}', {
      dataBinding: 'example_sentence',
      fontFamily: 'georgia',
      fontSize: 12,
      textColor: COLORS.teal,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('card_back', 'example_translation', 64, 288, 381, 28, '{{example_translation}}', {
      dataBinding: 'example_translation',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    rect('card_back', 'example_rule', 64, 322, 381, 0.8, COLORS.rule),
    label('card_back', 'notes_label', 64, 338, 320, 'NOTES · GENDER, PLURALS, MNEMONICS'),
    writingLines('card_back', 'notes_lines', 64, 354, 381, 132, 22),
    text('card_back', 'deck_chip', 64, 506, 180, 42, '« Deck sheet', {
      fontFamily: 'georgia',
      fontSize: 12,
      fontWeight: 'bold',
      textColor: COLORS.paper,
      fill: COLORS.amber,
      align: 'center',
      linkTarget: 'ancestor',
      linkValue: '2',
    }),
    text('card_back', 'next_chip', 265, 506, 180, 42, '{{next_label}}', {
      dataBinding: 'next_label',
      fontFamily: 'georgia',
      fontSize: 14,
      fontWeight: 'bold',
      textColor: COLORS.amberDeep,
      align: 'center',
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    footerLink('card_back', 'back_link', 40, 150, '« Card front', 'left', { linkTarget: 'parent' }),
    folio('card_back'),
    footerLink('card_back', 'journal_link', 335, 140, 'JOURNAL »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'journal_01',
    }),
  ],
};

const grammar = {
  id: 'grammar',
  name: 'Grammar Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('grammar'),
    pageTitle('grammar', '{{title}}'),
    text('grammar', 'subtitle', 40, 88, 435, 16, 'One rule per sheet – state it, pattern it, prove it with examples.', {
      fontSize: 9.5,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    label('grammar', 'rule_label', 40, 118, 200, 'THE RULE'),
    rect('grammar', 'rule_box', 40, 134, 435, 88, COLORS.paper, {
      stroke: COLORS.teal,
      strokeWidth: 1,
    }),
    writingLines('grammar', 'rule_lines', 48, 142, 419, 72, 24),
    label('grammar', 'pattern_label', 40, 238, 200, 'THE PATTERN'),
    rect('grammar', 'pattern_box', 40, 254, 435, 64, COLORS.paper, {
      stroke: COLORS.teal,
      strokeWidth: 1,
    }),
    writingLines('grammar', 'pattern_lines', 48, 262, 419, 48, 24),
    label('grammar', 'examples_label', 40, 334, 200, 'EXAMPLES'),
    rect('grammar', 'ex_head_left', 40, 350, 217, 22, COLORS.teal),
    rect('grammar', 'ex_head_right', 257, 350, 218, 22, COLORS.teal),
    text('grammar', 'ex_head_left_word', 48, 354, 201, 14, 'IN THE LANGUAGE', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 1.4,
      align: 'left',
    }),
    text('grammar', 'ex_head_right_word', 265, 354, 202, 14, 'MEANING', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 1.4,
      align: 'left',
    }),
    ...[0, 1, 2, 3].flatMap(row => [
      rect('grammar', `ex_cell_left_${row + 1}`, 40, 372 + row * 46, 217, 46, COLORS.paper, {
        stroke: COLORS.teal,
        strokeWidth: 0.9,
      }),
      rect('grammar', `ex_cell_right_${row + 1}`, 257, 372 + row * 46, 218, 46, COLORS.paper, {
        stroke: COLORS.teal,
        strokeWidth: 0.9,
      }),
    ]),
    text('grammar', 'exceptions_note', 40, 566, 435, 26, 'Exceptions go in the last row – every language keeps a few.', {
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('grammar', 'prev_chip', 40, 600, 150, 20, '{{sheet_prev_label}}', {
      dataBinding: 'sheet_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.amberDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('grammar', 'next_chip', 325, 600, 150, 20, '{{sheet_next_label}}', {
      dataBinding: 'sheet_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.amberDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('grammar', 'back_link', 40, 150, '« The lab', 'left', { linkTarget: 'parent' }),
    folio('grammar'),
  ],
};

const drill = {
  id: 'drill',
  name: 'Drill Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('drill'),
    pageTitle('drill', '{{title}}'),
    text('drill', 'subtitle', 40, 88, 435, 16, 'Pick one pattern and run it down the column – speed comes from reps.', {
      fontSize: 9.5,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    label('drill', 'pattern_label', 40, 118, 240, 'PATTERN DRILLED'),
    rect('drill', 'pattern_rule', 40, 140, 300, 0.9, COLORS.rule),
    rect('drill', 'head_cue', 40, 162, 130, 22, COLORS.teal),
    rect('drill', 'head_form', 170, 162, 175, 22, COLORS.teal),
    rect('drill', 'head_check', 345, 162, 130, 22, COLORS.teal),
    text('drill', 'head_cue_word', 48, 166, 114, 14, 'CUE', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 1.4,
      align: 'left',
    }),
    text('drill', 'head_form_word', 178, 166, 159, 14, 'YOUR FORM', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 1.4,
      align: 'left',
    }),
    text('drill', 'head_check_word', 353, 166, 114, 14, 'CHECK', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 1.4,
      align: 'left',
    }),
    ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap(row => [
      rect('drill', `cell_cue_${row + 1}`, 40, 184 + row * 44, 130, 44, COLORS.paper, {
        stroke: COLORS.teal,
        strokeWidth: 0.9,
      }),
      rect('drill', `cell_form_${row + 1}`, 170, 184 + row * 44, 175, 44, COLORS.paper, {
        stroke: COLORS.teal,
        strokeWidth: 0.9,
      }),
      rect('drill', `cell_check_${row + 1}`, 345, 184 + row * 44, 130, 44, COLORS.paper, {
        stroke: COLORS.teal,
        strokeWidth: 0.9,
      }),
    ]),
    text('drill', 'tip_note', 40, 552, 435, 26, 'Fill the cue column first. Cover the check column, answer aloud, then uncover.', {
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('drill', 'prev_chip', 40, 600, 150, 20, '{{sheet_prev_label}}', {
      dataBinding: 'sheet_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.amberDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('drill', 'next_chip', 325, 600, 150, 20, '{{sheet_next_label}}', {
      dataBinding: 'sheet_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.amberDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('drill', 'back_link', 40, 150, '« The lab', 'left', { linkTarget: 'parent' }),
    folio('drill'),
  ],
};

const journal = {
  id: 'journal',
  name: 'Conversation Log',
  width: W,
  height: H,
  elements: [
    ...pageBase('journal'),
    pageTitle('journal', '{{title}}'),
    label('journal', 'date_label', 40, 94, 100, 'DATE'),
    rect('journal', 'date_rule', 40, 116, 120, 0.9, COLORS.rule),
    label('journal', 'partner_label', 200, 94, 200, 'PARTNER / SOURCE'),
    rect('journal', 'partner_rule', 200, 116, 275, 0.9, COLORS.rule),
    label('journal', 'convo_label', 40, 140, 240, 'THE CONVERSATION'),
    ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap(row => [
      rect('journal', `entry_date_${row + 1}`, 40, 158 + row * 44, 60, 32, COLORS.paper, {
        stroke: COLORS.teal,
        strokeWidth: 0.8,
      }),
      rect('journal', `entry_line_${row + 1}`, 108, 184 + row * 44, 367, 0.9, COLORS.rule),
    ]),
    label('journal', 'words_label', 40, 518, 320, 'WORDS CAUGHT – TURN THEM INTO CARDS'),
    writingLines('journal', 'words_lines', 40, 534, 435, 60, 20),
    text('journal', 'prev_chip', 40, 604, 150, 20, '{{sheet_prev_label}}', {
      dataBinding: 'sheet_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.amberDeep,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('journal', 'next_chip', 325, 604, 150, 20, '{{sheet_next_label}}', {
      dataBinding: 'sheet_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.amberDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
    footerLink('journal', 'back_link', 40, 150, '« The lab', 'left', { linkTarget: 'parent' }),
    folio('journal'),
  ],
};

const PROGRESS_DAY_COLS = [200, 255, 310, 365, 420];

const progress = {
  id: 'progress',
  name: 'Progress Board',
  width: W,
  height: H,
  elements: [
    ...pageBase('progress'),
    pageTitle('progress', '{{title}}'),
    text('progress', 'subtitle', 40, 88, 435, 16, 'One row per deck – shade the day box when that review holds.', {
      fontSize: 9.5,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    rect('progress', 'head_deck', 40, 124, 160, 24, COLORS.teal),
    text('progress', 'head_deck_word', 48, 130, 144, 14, 'DECK', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.mist,
      characterSpacing: 1.4,
      align: 'left',
    }),
    ...[1, 3, 7, 14, 30].flatMap((day, index) => [
      rect('progress', `head_day_${day}`, PROGRESS_DAY_COLS[index], 124, 55, 24, COLORS.teal),
      text('progress', `head_day_word_${day}`, PROGRESS_DAY_COLS[index], 130, 55, 14, `DAY ${day}`, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.mist,
        characterSpacing: 0.8,
        align: 'center',
      }),
    ]),
    ...[0, 1, 2, 3, 4, 5].flatMap(row => [
      rect('progress', `row_deck_${row + 1}`, 40, 148 + row * 54, 160, 54, COLORS.paper, {
        stroke: COLORS.teal,
        strokeWidth: 0.9,
      }),
      text('progress', `row_chip_${row + 1}`, 48, 164 + row * 54, 144, 22, `{{deck_${row + 1}_label}}`, {
        dataBinding: `deck_${row + 1}_label`,
        fontFamily: 'georgia',
        fontSize: 10,
        fontWeight: 'bold',
        textColor: COLORS.amberDeep,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(row),
      }),
      ...[1, 3, 7, 14, 30].map((day, index) =>
        rect('progress', `row_${row + 1}_day_${day}`, PROGRESS_DAY_COLS[index], 148 + row * 54, 55, 54, COLORS.paper, {
          stroke: COLORS.teal,
          strokeWidth: 0.9,
        })),
    ]),
    text('progress', 'graduate_note', 40, 496, 435, 30, 'A deck graduates when Day 30 is shaded – then harvest its journal words into a new deck and start again.', {
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('progress', 'milestones_label', 40, 540, 200, 'MILESTONES'),
    writingLines('progress', 'milestones_lines', 40, 556, 435, 66, 22),
    footerLink('progress', 'back_link', 40, 150, '« The lab', 'left', { linkTarget: 'parent' }),
    folio('progress'),
    footerLink('progress', 'journal_link', 335, 140, 'JOURNAL »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'journal_01',
    }),
  ],
};

return {
  cover,
  start,
  workspace,
  deck,
  card_front: cardFront,
  card_back: cardBack,
  grammar,
  drill,
  journal,
  progress,
};
