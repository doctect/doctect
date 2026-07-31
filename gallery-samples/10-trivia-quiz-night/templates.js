const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  board: '#2e3438',
  brass: '#b08d3f',
  brassDeep: '#8a6b30',
  chalk: '#f0ede4',
  chalkSoft: '#c8c1b0',
  paper: '#faf8f2',
  inkSoft: '#5c635f',
  rule: '#c4beae',
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
    textColor: COLORS.board,
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

const writingLines = (templateId, role, x, y, w, h, spacing = 26) =>
  rect(templateId, role, x, y, w, h, COLORS.rule, {
    fillType: 'pattern',
    patternType: 'lines-h',
    patternSpacing: spacing,
    patternWeight: 0.8,
  });

const doubleRule = (templateId, role, x, y, w) => [
  rect(templateId, `${role}_a`, x, y, w, 1.2, COLORS.brass),
  rect(templateId, `${role}_b`, x, y + 5, w, 1.2, COLORS.brass),
];

// --- Original artwork -------------------------------------------------------

const coverArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 270">
  <g id="pint" fill="none" stroke="#f0ede4" stroke-width="3.5" stroke-linejoin="round">
    <path d="M70 60 L82 208 Q84 220 100 220 Q116 220 118 208 L130 60 Z"/>
  </g>
  <g id="foam" fill="#f0ede4">
    <circle cx="74" cy="56" r="11"/><circle cx="92" cy="48" r="13"/>
    <circle cx="110" cy="50" r="12"/><circle cx="126" cy="56" r="10"/>
  </g>
  <path id="band" d="M76 116 L124 116" stroke="#b08d3f" stroke-width="3.5" fill="none"/>
  <g id="bubbles" fill="#b08d3f">
    <circle cx="92" cy="152" r="2.6"/><circle cx="104" cy="138" r="3.2"/><circle cx="98" cy="172" r="2.1"/>
  </g>
  <circle id="ring" cx="196" cy="120" r="56" fill="none" stroke="#f0ede4" stroke-width="1.8" stroke-dasharray="6 9"/>
  <path id="qmark" d="M170 94 C170 66 224 66 224 94 C224 116 196 112 196 140" fill="none" stroke="#b08d3f" stroke-width="9" stroke-linecap="round"/>
  <circle id="qdot" cx="196" cy="168" r="7" fill="#f0ede4"/>
  <g id="tally_chalk" stroke="#f0ede4" stroke-width="2.4" stroke-linecap="round" fill="none">
    <path d="M40 240 V262"/><path d="M49 240 V262"/><path d="M58 240 V262"/><path d="M67 240 V262"/>
    <path d="M33 260 L74 242" stroke="#b08d3f" stroke-width="2.8"/>
  </g>
  <g id="tally_brass" stroke="#f0ede4" stroke-width="2.4" stroke-linecap="round" fill="none">
    <path d="M196 240 V262"/><path d="M205 240 V262"/><path d="M214 240 V262"/>
  </g>
  <g id="chalk_dust" fill="#f0ede4">
    <circle cx="30" cy="36" r="1.6"/><circle cx="236" cy="28" r="1.4"/><circle cx="146" cy="18" r="1.5"/>
  </g>
</svg>`;

const questionMarkArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80">
  <circle cx="32" cy="40" r="30" fill="none" stroke="#b08d3f" stroke-width="1.6" stroke-dasharray="5 8"/>
  <path d="M20 28 C20 12 44 12 44 28 C44 40 32 38 32 50" fill="none" stroke="#2e3438" stroke-width="5.5" stroke-linecap="round"/>
  <circle cx="32" cy="63" r="4" fill="#2e3438"/>
</svg>`;

const tallyArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
  <g stroke="#2e3438" stroke-width="2.2" stroke-linecap="round" fill="none">
    <path d="M12 14 V46"/><path d="M21 14 V46"/><path d="M30 14 V46"/><path d="M39 14 V46"/>
  </g>
  <path d="M6 44 L46 16" stroke="#b08d3f" stroke-width="2.8" stroke-linecap="round" fill="none"/>
</svg>`;

const pintGlassArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 72">
  <path d="M12 10 L17 58 Q18 63 26 63 Q34 63 35 58 L40 10 Z" fill="none" stroke="#2e3438" stroke-width="2.2" stroke-linejoin="round"/>
  <g fill="#faf8f2" stroke="#2e3438" stroke-width="1.6">
    <circle cx="14" cy="9" r="5"/><circle cx="25" cy="6" r="6"/><circle cx="37" cy="9" r="5"/>
  </g>
  <path d="M18.5 30 L33.5 30" stroke="#b08d3f" stroke-width="2.4" fill="none"/>
  <g fill="#b08d3f">
    <circle cx="25" cy="40" r="1.6"/><circle cx="29" cy="46" r="1.3"/><circle cx="24" cy="50" r="1.2"/>
  </g>
</svg>`;

const pintChalkMiniArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 52">
  <path d="M6 7 L9 44 Q10 48 14 48 Q18 48 19 44 L22 7 Z" fill="none" stroke="#f0ede4" stroke-width="2" stroke-linejoin="round"/>
  <g fill="#f0ede4">
    <circle cx="8" cy="6" r="3"/><circle cx="14" cy="4.5" r="3.5"/><circle cx="20" cy="6" r="3"/>
  </g>
  <path d="M9.5 23 L18.5 23" stroke="#b08d3f" stroke-width="2" fill="none"/>
</svg>`;

// --- Shared chalkboard chrome -----------------------------------------------
// Every content page carries a dark board masthead panel with a brass chalk
// frame; the EXAMPLE and skip bindings live inside the board.

const pageBase = (templateId) => [
  rect(templateId, 'chalk_paper', 0, 0, W, H, COLORS.chalk),
  rect(templateId, 'board', 16, 16, 477, 74, COLORS.board),
  rect(templateId, 'board_frame', 22, 22, 465, 62, '', { stroke: COLORS.brass, strokeWidth: 0.9 }),
  text(templateId, 'example', 32, 26, 150, 13, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.chalk,
    characterSpacing: 1.5,
    align: 'left',
  }),
  text(templateId, 'skip', 200, 26, 220, 13, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.chalk,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  svg(templateId, 'board_pint', 445, 26, 28, 52, pintChalkMiniArt),
  rect(templateId, 'footer_rule_a', 16, 646, 477, 1.2, COLORS.brass),
  rect(templateId, 'footer_rule_b', 16, 651, 477, 1.2, COLORS.brass),
];

const folio = (templateId) =>
  text(templateId, 'folio', 174, 658, 160, 16, 'QUIZ NIGHT', {
    fontSize: 7,
    fontWeight: 'bold',
    textColor: COLORS.inkSoft,
    characterSpacing: 2.4,
    align: 'center',
  });

const footerLink = (templateId, role, x, w, value, align, link) =>
  text(templateId, role, x, 658, w, 16, value, {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.brassDeep,
    align,
    ...link,
  });

const boardTitle = (templateId, value, extra = {}) =>
  text(templateId, 'board_title', 32, 46, 445, 28, value, {
    fontFamily: 'georgia',
    fontSize: 18,
    fontWeight: 'bold',
    textColor: COLORS.chalk,
    align: 'center',
    ...extra,
  });

// --- Templates --------------------------------------------------------------

const cover = {
  id: 'cover',
  name: 'Quiz Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'board_full', 0, 0, W, H, COLORS.board),
    rect('cover', 'tap_anywhere', 0, 0, W, H, '', {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    rect('cover', 'frame_chalk', 20, 20, 469, 639, '', { stroke: COLORS.chalk, strokeWidth: 1.4 }),
    rect('cover', 'frame_brass', 30, 30, 449, 619, '', { stroke: COLORS.brass, strokeWidth: 0.8 }),
    text('cover', 'kicker', 54, 66, 401, 16, 'THE SELF-SCORING PUB QUIZ', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 2,
      align: 'center',
    }),
    text('cover', 'title', 54, 92, 401, 54, 'Quiz Night', {
      fontFamily: 'georgia',
      fontSize: 40,
      fontWeight: 'bold',
      textColor: COLORS.chalk,
      align: 'center',
    }),
    ...doubleRule('cover', 'title_rule', 154, 158, 200),
    svg('cover', 'cover_art', 124, 190, 260, 270, coverArt),
    text('cover', 'subtitle', 94, 486, 321, 56, 'Six themed rounds, sixty questions, every answer one tap away – plus a host kit of pre-wired blank rounds for writing your own.', {
      fontFamily: 'georgia',
      fontSize: 11.5,
      textColor: COLORS.chalk,
      align: 'center',
      verticalAlign: 'top',
    }),
    text('cover', 'open_cta', 144, 562, 220, 46, 'Open the host guide »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.board,
      fill: COLORS.brass,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'imprint', 54, 628, 401, 14, 'ROUNDS · REVEALS · GRAND TOTALS', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.chalkSoft,
      characterSpacing: 1.5,
      align: 'center',
    }),
  ],
};

const start = {
  id: 'start',
  name: 'How To Host',
  width: W,
  height: H,
  elements: [
    ...pageBase('start'),
    boardTitle('start', '{{title}}'),
    text('start', 'premise', 48, 102, 413, 50, 'Quiz Night runs itself from the page: six rounds of ten questions, every answer one tap away, and a score sheet that keeps the whole night honest. One tablet, any number of teams – and the quizmaster gets to play too.', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.board,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'howto_label', 48, 162, 160, 'HOW TO PLAY'),
    text('start', 'howto_rules', 48, 178, 413, 130, '1. Open a round hub and read the first question aloud.\n2. Teams write their answers down – on paper or on the card itself.\n3. Tap Reveal » to check the answer, then Next question » to keep moving.\n4. Mark points in the team boxes on the round hub as you go.\n5. Copy round totals to the score sheet; after Round 6, crown the winners.', {
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.board,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'rounds_label', 48, 318, 200, 'THE SIX ROUNDS'),
    ...[
      ['Round 1 · General Knowledge »', 'round_1'],
      ['Round 2 · Science & Nature »', 'round_2'],
      ['Round 3 · History »', 'round_3'],
      ['Round 4 · Geography »', 'round_4'],
      ['Round 5 · Arts »', 'round_5'],
      ['Round 6 · Wildcard »', 'round_6'],
    ].map(([roundLabel, roundId], index) =>
      text('start', `round_chip_${index + 1}`, index % 2 === 0 ? 48 : 263, 334 + Math.floor(index / 2) * 40, 198, 32, roundLabel, {
        fontFamily: 'georgia',
        fontSize: 9.5,
        fontWeight: 'bold',
        textColor: COLORS.board,
        fill: COLORS.paper,
        stroke: COLORS.brass,
        strokeWidth: 0.9,
        align: 'center',
        linkTarget: 'specific_node',
        linkValue: roundId,
      })),
    text('start', 'start_chip', 48, 462, 198, 46, 'Start Round 1 »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.board,
      fill: COLORS.brass,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'round_1',
    }),
    text('start', 'score_chip', 263, 462, 198, 46, 'Score sheet »', {
      fontFamily: 'georgia',
      fontSize: 12,
      fontWeight: 'bold',
      textColor: COLORS.board,
      fill: COLORS.paper,
      stroke: COLORS.brass,
      strokeWidth: 1,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'scoreboard_1',
    }),
    text('start', 'example_chip', 48, 522, 198, 38, 'See the worked example »', {
      fontFamily: 'georgia',
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.board,
      fill: COLORS.paper,
      stroke: COLORS.brass,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    text('start', 'author_chip', 263, 522, 198, 38, 'Write your own quiz »', {
      fontFamily: 'georgia',
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.board,
      fill: COLORS.paper,
      stroke: COLORS.brass,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
    text('start', 'honor_note', 48, 574, 413, 40, 'Scoring is on your honor: one point a question unless the table rules otherwise. House suggestions – half points for near misses, and the fun fact settles all arguments.', {
      fontSize: 9,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    folio('start'),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Host Kit Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace'),
    boardTitle('workspace', '{{title}}', { fontSize: 17 }),
    text('workspace', 'hero', 48, 104, 413, 46, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 11,
      textColor: COLORS.board,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'note', 48, 158, 413, 34, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontSize: 9,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'kit_label', 48, 206, 220, 'THE BLANK ROUNDS'),
    ...[0, 1, 2, 3].map(index =>
      text('workspace', `kit_chip_${index + 1}`, 48, 222 + index * 46, 300, 38, `{{kit_${index + 1}_label}}`, {
        dataBinding: `kit_${index + 1}_label`,
        fontFamily: 'georgia',
        fontSize: 12,
        fontWeight: 'bold',
        textColor: COLORS.brassDeep,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(index),
      })),
    label('workspace', 'wiring_label', 48, 414, 260, 'HOW THE WIRING WORKS'),
    text('workspace', 'wiring_note', 48, 430, 413, 64, 'Every blank question card already reveals to its own answer card, and every answer card already turns to the next question in the round. Write a topic on the round hub and ten questions in the blanks – the navigation is done.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.board,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'score_chip', 48, 510, 190, 36, 'Score sheet »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.board,
      fill: COLORS.brass,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'scoreboard_1',
    }),
    text('workspace', 'example_chip', 258, 510, 203, 36, 'Worked example »', {
      fontFamily: 'georgia',
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.board,
      fill: COLORS.paper,
      stroke: COLORS.brass,
      strokeWidth: 0.9,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    footerLink('workspace', 'back_link', 32, 140, '« Host guide', 'left', { linkTarget: 'parent' }),
    folio('workspace'),
    footerLink('workspace', 'totals_link', 337, 140, 'GRAND TOTALS »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'grand_totals',
    }),
  ],
};

const round = {
  id: 'round',
  name: 'Round Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('round'),
    text('round', 'board_title', 32, 48, 330, 26, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 16,
      fontWeight: 'bold',
      textColor: COLORS.chalk,
      align: 'left',
    }),
    text('round', 'score_link', 320, 52, 118, 20, 'SCORE SHEET »', {
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      align: 'right',
      linkTarget: 'specific_node',
      linkValue: 'scoreboard_1',
    }),
    text('round', 'round_no', 36, 102, 110, 104, '{{round_no}}', {
      fontFamily: 'georgia',
      fontSize: 84,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      align: 'center',
    }),
    text('round', 'round_note', 162, 116, 311, 76, '{{round_note}}', {
      dataBinding: 'round_note',
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.board,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...doubleRule('round', 'row_rule', 36, 222, 437),
    ...[0, 1, 2, 3, 4, 5].map(team =>
      text('round', `team_head_${team + 1}`, 310 + team * 27, 240, 24, 10, `T${team + 1}`, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.inkSoft,
        align: 'center',
      })),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(row => {
      const y = 256 + row * 36;
      return [
        text('round', `q_row_${row + 1}`, 36, y + 2, 266, 30, `{{q_${row + 1}_label}}`, {
          dataBinding: `q_${row + 1}_label`,
          fontFamily: 'georgia',
          fontSize: 10.5,
          fontWeight: 'bold',
          textColor: COLORS.board,
          align: 'left',
          linkTarget: 'child_index',
          linkValue: String(row),
        }),
        ...[0, 1, 2, 3, 4, 5].map(team =>
          rect('round', `score_box_${row + 1}_${team + 1}`, 310 + team * 27, y + 4, 24, 26, COLORS.paper, {
            stroke: COLORS.brass,
            strokeWidth: 0.9,
          })),
      ];
    }),
    footerLink('round', 'back_link', 32, 140, '« Host guide', 'left', { linkTarget: 'parent' }),
    folio('round'),
    footerLink('round', 'totals_link', 337, 140, 'GRAND TOTALS »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'grand_totals',
    }),
  ],
};

const question = {
  id: 'question',
  name: 'Question Card',
  width: W,
  height: H,
  elements: [
    ...pageBase('question'),
    text('question', 'round_label', 32, 48, 445, 13, '{{round_label}}', {
      dataBinding: 'round_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.chalk,
      characterSpacing: 1.5,
      align: 'center',
    }),
    text('question', 'board_note', 32, 64, 445, 11, 'WRITE FIRST · THEN REVEAL', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.chalkSoft,
      characterSpacing: 1.8,
      align: 'center',
    }),
    svg('question', 'tally_art', 36, 110, 60, 60, tallyArt),
    text('question', 'q_no', 154, 100, 200, 96, '{{q_no}}', {
      fontFamily: 'georgia',
      fontSize: 76,
      fontWeight: 'bold',
      textColor: COLORS.board,
      align: 'center',
    }),
    svg('question', 'qmark_art', 408, 102, 64, 80, questionMarkArt),
    ...doubleRule('question', 'q_rule', 154, 208, 200),
    text('question', 'question_text', 48, 236, 413, 150, '{{question_text}}', {
      dataBinding: 'question_text',
      fontFamily: 'georgia',
      fontSize: 15,
      textColor: COLORS.board,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('question', 'answer_label', 48, 398, 220, 'WRITE YOUR ANSWER'),
    writingLines('question', 'answer_lines', 48, 414, 413, 130, 26),
    text('question', 'reveal_chip', 154, 562, 200, 44, '{{reveal_label}}', {
      dataBinding: 'reveal_label',
      fontFamily: 'georgia',
      fontSize: 15,
      fontWeight: 'bold',
      textColor: COLORS.brassDeep,
      align: 'center',
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    footerLink('question', 'back_link', 32, 140, '« Round hub', 'left', { linkTarget: 'parent' }),
    folio('question'),
    footerLink('question', 'score_link', 337, 140, 'SCORE SHEET »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'scoreboard_1',
    }),
  ],
};

const answer = {
  id: 'answer',
  name: 'Answer Card',
  width: W,
  height: H,
  elements: [
    ...pageBase('answer'),
    text('answer', 'round_label', 32, 46, 445, 13, '{{round_label}}', {
      dataBinding: 'round_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.chalk,
      characterSpacing: 1.5,
      align: 'center',
    }),
    text('answer', 'answer_kicker', 32, 62, 445, 13, 'ANSWER · QUESTION {{q_no}}', {
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 1.5,
      align: 'center',
    }),
    text('answer', 'answer_text', 48, 112, 413, 110, '{{answer_text}}', {
      dataBinding: 'answer_text',
      fontFamily: 'georgia',
      fontSize: 21,
      fontWeight: 'bold',
      textColor: COLORS.board,
      verticalAlign: 'top',
      align: 'center',
    }),
    ...doubleRule('answer', 'fact_rule', 48, 238, 413),
    label('answer', 'fact_label', 48, 262, 120, 'FUN FACT'),
    svg('answer', 'pint_art', 404, 258, 56, 72, pintGlassArt),
    text('answer', 'fun_fact', 48, 278, 340, 96, '{{fun_fact}}', {
      dataBinding: 'fun_fact',
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('answer', 'scoring_note', 48, 346, 340, 28, 'One point for a correct answer – mark it in the team boxes on the round hub.', {
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('answer', 'back_chip', 48, 388, 190, 44, '« Back to round', {
      fontFamily: 'georgia',
      fontSize: 12.5,
      fontWeight: 'bold',
      textColor: COLORS.board,
      fill: COLORS.brass,
      align: 'center',
      linkTarget: 'ancestor',
      linkValue: '2',
    }),
    text('answer', 'next_chip', 271, 388, 190, 44, '{{next_label}}', {
      dataBinding: 'next_label',
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.brassDeep,
      align: 'center',
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    label('answer', 'talk_label', 48, 458, 160, 'TABLE TALK'),
    writingLines('answer', 'talk_lines', 48, 474, 413, 156, 26),
    footerLink('answer', 'back_link', 32, 140, '« Question', 'left', { linkTarget: 'parent' }),
    folio('answer'),
    footerLink('answer', 'score_link', 337, 140, 'SCORE SHEET »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'scoreboard_1',
    }),
  ],
};

// Score sheet: an 8-row x 7-column chalk ledger. Every cell is an explicit
// bordered rect (no grid elements anywhere in this product).
const SCORE_COLS = [36, 131, 188, 245, 302, 359, 416];
const SCORE_COL_WIDTHS = [95, 57, 57, 57, 57, 57, 57];
const SCORE_ROWS = [
  ['header', 132, 30],
  ['name', 162, 30],
  ['r1', 192, 44],
  ['r2', 236, 44],
  ['r3', 280, 44],
  ['r4', 324, 44],
  ['r5', 368, 44],
  ['r6', 412, 44],
  ['total', 456, 44],
];

const scoreboard = {
  id: 'scoreboard',
  name: 'Score Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('scoreboard'),
    boardTitle('scoreboard', '{{title}}'),
    text('scoreboard', 'subtitle', 48, 102, 413, 15, '{{subtitle}}', {
      dataBinding: 'subtitle',
      fontSize: 9.5,
      textColor: COLORS.inkSoft,
      align: 'center',
    }),
    ...SCORE_ROWS.flatMap(([rowKey, y, h]) =>
      SCORE_COLS.map((x, colIndex) =>
        rect('scoreboard', `cell_${rowKey}_${colIndex}`, x, y, SCORE_COL_WIDTHS[colIndex], h,
          rowKey === 'header' ? COLORS.board : COLORS.paper, {
            stroke: COLORS.brass,
            strokeWidth: rowKey === 'total' ? 1.2 : 0.9,
          }))),
    text('scoreboard', 'corner_head', 40, 132, 87, 30, 'ROUND', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.chalk,
      characterSpacing: 1.2,
      align: 'left',
    }),
    ...[0, 1, 2, 3, 4, 5].map(team =>
      text('scoreboard', `team_head_${team + 1}`, 131 + team * 57, 132, 57, 30, `TEAM ${team + 1}`, {
        fontSize: 7,
        fontWeight: 'bold',
        textColor: COLORS.chalk,
        align: 'center',
      })),
    text('scoreboard', 'name_row_label', 40, 162, 87, 30, 'Team name', {
      fontSize: 8,
      textColor: COLORS.inkSoft,
      align: 'left',
    }),
    ...[0, 1, 2, 3, 4, 5].map(index =>
      text('scoreboard', `round_row_label_${index + 1}`, 40, 192 + index * 44, 87, 44, `Round ${index + 1} »`, {
        fontFamily: 'georgia',
        fontSize: 9.5,
        fontWeight: 'bold',
        textColor: COLORS.board,
        align: 'left',
        linkTarget: 'specific_node',
        linkValue: `round_${index + 1}`,
      })),
    text('scoreboard', 'total_row_label', 40, 456, 87, 44, 'TOTAL', {
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.brassDeep,
      characterSpacing: 1.2,
      align: 'left',
    }),
    text('scoreboard', 'copy_note', 36, 520, 250, 26, "Copy each round's team scores here as the night goes on.", {
      fontSize: 8.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('scoreboard', 'totals_chip', 303, 516, 170, 34, 'Grand totals »', {
      fontFamily: 'georgia',
      fontSize: 11.5,
      fontWeight: 'bold',
      textColor: COLORS.board,
      fill: COLORS.brass,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'grand_totals',
    }),
    label('scoreboard', 'notes_label', 36, 566, 180, 'MARKING NOTES'),
    writingLines('scoreboard', 'notes_lines', 36, 582, 437, 48, 22),
    footerLink('scoreboard', 'back_link', 32, 140, '« Host guide', 'left', { linkTarget: 'parent' }),
    folio('scoreboard'),
    footerLink('scoreboard', 'round_link', 337, 140, 'ROUND 1 »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'round_1',
    }),
  ],
};

const grandTotal = {
  id: 'grand_total',
  name: 'Grand Total Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('grand_total'),
    boardTitle('grand_total', '{{title}}'),
    text('grand_total', 'subtitle', 48, 102, 413, 15, "Add each team's six round scores – highest total takes the night.", {
      fontSize: 9.5,
      textColor: COLORS.inkSoft,
      align: 'center',
    }),
    text('grand_total', 'total_head', 372, 116, 101, 12, 'TOTAL', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.brassDeep,
      characterSpacing: 1.5,
      align: 'center',
    }),
    ...[0, 1, 2, 3, 4, 5].flatMap(team => {
      const y = 132 + team * 52;
      return [
        label('grand_total', `team_label_${team + 1}`, 36, y + 6, 70, `TEAM ${team + 1}`),
        rect('grand_total', `team_line_${team + 1}`, 112, y + 26, 230, 0.9, COLORS.rule),
        rect('grand_total', `team_total_box_${team + 1}`, 372, y, 101, 40, COLORS.paper, {
          stroke: COLORS.brass,
          strokeWidth: 1.1,
        }),
      ];
    }),
    rect('grand_total', 'winner_box', 36, 462, 437, 140, COLORS.paper, {
      stroke: COLORS.brass,
      strokeWidth: 1.6,
    }),
    rect('grand_total', 'winner_frame', 42, 468, 425, 128, '', {
      stroke: COLORS.brass,
      strokeWidth: 0.8,
    }),
    text('grand_total', 'winner_label', 56, 486, 200, 16, 'WINNER', {
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.brassDeep,
      characterSpacing: 3,
      align: 'left',
    }),
    rect('grand_total', 'winner_line', 56, 536, 270, 0.9, COLORS.rule),
    text('grand_total', 'winner_note', 56, 552, 270, 36, 'Name them, cheer them, and chalk it up – same table next week.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.inkSoft,
      verticalAlign: 'top',
      align: 'left',
    }),
    svg('grand_total', 'winner_pint', 372, 478, 88, 110, pintGlassArt),
    footerLink('grand_total', 'back_link', 32, 140, '« Host guide', 'left', { linkTarget: 'parent' }),
    folio('grand_total'),
    footerLink('grand_total', 'score_link', 337, 140, 'SCORE SHEET »', 'right', {
      linkTarget: 'specific_node',
      linkValue: 'scoreboard_1',
    }),
  ],
};

return {
  cover,
  start,
  workspace,
  round,
  question,
  answer,
  scoreboard,
  grand_total: grandTotal,
};
