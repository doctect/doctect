const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  ink: '#21262b',    // club black: primary ink, marquee bands, table heads
  brass: '#ad8433',  // brass: accents, number plates, section labels
  paper: '#f1ede2',  // warm paper: page ground
  cream: '#faf7ef',  // writable cells and plates
  smoke: '#6e675c',  // warm smoke: secondary text
  sand: '#cbc2ae',   // fine rules and writing lines
  glow: '#efe6d2',   // light text on club-black bands
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

// Poster section label: a thick brass dash, then letterspaced caps.
const label = (templateId, role, x, y, w, value, extra = {}) => [
  rect(templateId, `${role}_dash`, x, y + 4.5, 12, 3.2, COLORS.brass),
  text(templateId, role, x + 18, y, w - 18, 12, value, {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.brass,
    characterSpacing: 1.9,
    align: 'left',
    ...extra,
  }),
];

const writingLines = (templateId, role, x, y, w, h, spacing = 24) =>
  rect(templateId, role, x, y, w, h, COLORS.sand, {
    fillType: 'pattern',
    patternType: 'lines-h',
    patternSpacing: spacing,
    patternWeight: 0.8,
  });

const cell = (templateId, role, x, y, w, h, extra = {}) =>
  rect(templateId, role, x, y, w, h, COLORS.cream, {
    stroke: COLORS.ink,
    strokeWidth: 0.9,
    ...extra,
  });

const checkbox = (templateId, role, x, y, size = 12) =>
  rect(templateId, role, x, y, size, size, COLORS.cream, {
    stroke: COLORS.ink,
    strokeWidth: 1,
  });

// --- Original halftone artwork ----------------------------------------------
// The product's signature motif: halftone dot fields, generated
// deterministically. The disc fades outward from a dense centre; the bar
// fades left to right like a fading tremolo.

const halftoneDisc = (radius, dotMax, color) => {
  const step = dotMax * 2.6;
  let dots = '';
  for (let gy = -radius; gy <= radius; gy += step) {
    for (let gx = -radius; gx <= radius; gx += step) {
      const d = Math.sqrt(gx * gx + gy * gy);
      if (d > radius - dotMax * 0.8) continue;
      const r = Math.max(0.5, dotMax * (1 - d / radius));
      dots += `<circle cx="${(radius + gx).toFixed(1)}" cy="${(radius + gy).toFixed(1)}" r="${r.toFixed(2)}" fill="${color}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${radius * 2} ${radius * 2}">${dots}</svg>`;
};

const halftoneBar = (w, h, dotMax, color) => {
  const step = dotMax * 2.5;
  let dots = '';
  for (let gy = step / 2; gy <= h - step / 2 + 0.01; gy += step) {
    for (let gx = step / 2; gx <= w - step / 2 + 0.01; gx += step) {
      const r = Math.max(0.35, dotMax * (1 - gx / w));
      dots += `<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="${r.toFixed(2)}" fill="${color}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${dots}</svg>`;
};

// Equalizer bars for the cover plate: a frozen chorus of levels.
const eqBars = (w, h, color, altColor) => {
  const heights = [0.28, 0.52, 0.4, 0.78, 0.6, 0.95, 0.5, 0.7, 0.34, 0.86, 0.56, 0.42, 0.66, 0.3];
  const barW = w / (heights.length * 1.6);
  let bars = '';
  heights.forEach((factor, index) => {
    const bh = h * factor;
    const x = index * (w / heights.length) + barW * 0.3;
    bars += `<rect x="${x.toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${index % 3 === 1 ? altColor : color}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
};

// Chord box frame: four strings (vertical), a solid nut, four fret wires.
const chordFrame = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80">
  <rect x="8" y="6" width="48" height="3.4" fill="#21262b"/>
  <g stroke="#21262b" stroke-width="1.2">
    <path d="M8 6 V74"/><path d="M24 6 V74"/><path d="M40 6 V74"/><path d="M56 6 V74"/>
  </g>
  <g stroke="#21262b" stroke-width="1">
    <path d="M8 23 H56"/><path d="M8 40 H56"/><path d="M8 57 H56"/><path d="M8 74 H56"/>
  </g>
</svg>`;

// One month row of the streak board. FEB carries 29 dots; the 29th is dashed
// for leap day.
const monthDots = (days, dashLast) => {
  let dots = '';
  for (let day = 0; day < days; day += 1) {
    const dash = dashLast && day === days - 1 ? ' stroke-dasharray="2 1.7"' : '';
    dots += `<circle cx="${(6.5 + day * 13).toFixed(1)}" cy="6.5" r="4.6" fill="none" stroke="#21262b" stroke-width="1.1"${dash}/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 403 13">${dots}</svg>`;
};

// --- Shared marquee chrome ---------------------------------------------------
// Head: a full-bleed club-black marquee band (EXAMPLE binding, masthead, skip
// binding) over a brass strip. Foot: a matching club-black bill line - back
// link, house legend, rack jump - over its own brass strip. Full-bleed dark
// bands are geometrically unlike the bracketed drafting sheets, engraved
// rules, bookplates, and command bars of products 09-17.

const pageBase = (templateId, backLabel) => [
  rect(templateId, 'ground', 0, 0, W, H, COLORS.paper),
  rect(templateId, 'marquee', 0, 0, W, 30, COLORS.ink),
  text(templateId, 'example', 16, 8, 110, 15, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.brass,
    characterSpacing: 1.6,
    align: 'left',
  }),
  text(templateId, 'masthead', 160, 9, 189, 13, 'THE WOODSHED · PRACTICE STUDIO', {
    fontSize: 7,
    fontWeight: 'bold',
    textColor: COLORS.glow,
    characterSpacing: 2.2,
    align: 'center',
  }),
  text(templateId, 'skip', 335, 8, 158, 15, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.paper,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  rect(templateId, 'marquee_brass', 0, 30, W, 2.5, COLORS.brass),
  rect(templateId, 'bill_brass', 0, 646.5, W, 2.5, COLORS.brass),
  rect(templateId, 'bill', 0, 649, W, 30, COLORS.ink),
  text(templateId, 'bill_back', 16, 649, 150, 30, backLabel, {
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.glow,
    align: 'left',
    linkTarget: 'parent',
  }),
  text(templateId, 'bill_legend', 170, 649, 169, 30, 'SETS NIGHTLY · NO COVER', {
    fontSize: 6,
    fontWeight: 'bold',
    textColor: COLORS.brass,
    characterSpacing: 1.6,
    align: 'center',
  }),
  text(templateId, 'bill_rack', 343, 649, 150, 30, 'THE RACK »', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.glow,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'repertoire_rack',
  }),
];

const pageTitle = (templateId, value, extra = {}) =>
  text(templateId, 'page_title', 30, 46, 449, 26, value, {
    fontSize: 19,
    fontWeight: 'bold',
    textColor: COLORS.ink,
    characterSpacing: 1.4,
    align: 'left',
    ...extra,
  });

const doorChip = (templateId, role, x, y, value, link, extra = {}) =>
  text(templateId, role, x, y, 215, 32, value, {
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.ink,
    fill: COLORS.cream,
    stroke: COLORS.ink,
    strokeWidth: 0.9,
    align: 'center',
    ...link,
    ...extra,
  });

// Unfilled tap chip: ink text over a sand rule; vanishes when its bound
// label is ''.
const slotChip = (templateId, role, x, y, w, field, link, extra = {}) => [
  text(templateId, role, x, y, w, 26, `{{${field}}}`, {
    dataBinding: field,
    fontSize: 11,
    fontWeight: 'bold',
    textColor: COLORS.ink,
    align: 'left',
    ...link,
    ...extra,
  }),
  rect(templateId, `${role}_rule`, x, y + 27, w, 0.9, COLORS.sand),
];

// --- Templates ---------------------------------------------------------------

const cover = {
  id: 'cover',
  name: 'Shed Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'ground', 0, 0, W, H, COLORS.ink),
    base('cover', 'tap_anywhere', 'rect', 0, 0, W, H, {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    rect('cover', 'edge_top', 22, 20, 465, 1.4, COLORS.brass),
    rect('cover', 'edge_bottom', 22, 657, 465, 1.4, COLORS.brass),
    text('cover', 'kicker', 30, 34, 449, 14, 'A PRACTICE ROOM FOR ANY INSTRUMENT', {
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.paper,
      characterSpacing: 2.6,
      align: 'center',
    }),
    text('cover', 'title_the', 30, 62, 449, 22, 'THE', {
      fontSize: 16,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 9,
      align: 'center',
    }),
    text('cover', 'title_word', 30, 84, 449, 58, 'WOODSHED', {
      fontSize: 52,
      fontWeight: 'bold',
      textColor: COLORS.paper,
      characterSpacing: 4,
      align: 'center',
    }),
    svg('cover', 'title_fade', 129, 150, 251, 10, halftoneBar(251, 10, 2, '#ad8433')),
    text('cover', 'bill_line', 30, 170, 449, 14, 'WHERE THE WORK GETS DONE', {
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 3,
      align: 'center',
    }),
    svg('cover', 'disc_art', 144.5, 202, 220, 220, halftoneDisc(110, 4.4, '#ad8433')),
    svg('cover', 'disc_echo', 66, 300, 64, 64, halftoneDisc(32, 2.6, '#f1ede2')),
    svg('cover', 'eq_art', 120, 434, 269, 56, eqBars(269, 56, '#f1ede2', '#ad8433')),
    rect('cover', 'eq_base', 120, 492, 269, 1.4, COLORS.brass),
    text('cover', 'sub', 62, 508, 385, 58, 'A rack for the tunes, a logbook for the nights, and a shelf of working paper – manuscript staves, chord boxes, technique ladders, gig sheets. The door is open and the metronome is patient. Come in and do the work.', {
      fontSize: 10,
      textColor: COLORS.paper,
      align: 'center',
      verticalAlign: 'top',
    }),
    text('cover', 'open_cta', 159.5, 580, 190, 36, 'Step into the shed »', {
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      fill: COLORS.brass,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'imprint', 96, 630, 317, 12, 'REPERTOIRE · SESSIONS · MANUSCRIPT · GIGS', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 1.9,
      align: 'center',
    }),
  ],
};

const start = {
  id: 'start',
  name: 'Player Guide',
  width: W,
  height: H,
  elements: [
    ...pageBase('start', '« Cover'),
    pageTitle('start', '{{title}}'),
    text('start', 'premise', 30, 76, 449, 58, 'The Woodshed is the practice room that keeps score – for horn players, string players, drummers, singers, anyone who shows up. Tunes live on a rack, nights live in a logbook, and the shelf keeps honest tools: manuscript staves, chord boxes for the fretted crowd, technique ladders, and a streak board that hates a gap.', {
      fontSize: 10,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('start', 'howto_label', 30, 140, 260, 'HOW A NIGHT IN THE SHED RUNS'),
    text('start', 'howto_steps', 30, 156, 449, 100, '1. Rack your tunes – one piece page each, form mapped, trouble spots named.\n2. Every night, open the next session log and set one goal. Just one.\n3. Climb the metronome ladder – eight boxes, one click at a time.\n4. Write down what broke and what clicked while it still stings.\n5. Fill the day\'s dot on the streak board. Do not break the chain.', {
      fontSize: 9.5,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('start', 'doors_label', 30, 262, 220, 'WHERE TO BEGIN'),
    doorChip('start', 'example_chip', 30, 278, 'The worked example »', {
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    doorChip('start', 'studio_chip', 264, 278, 'Your studio »', {
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }, {
      textColor: COLORS.glow,
      fill: COLORS.ink,
      stroke: '',
      strokeWidth: 0,
    }),
    doorChip('start', 'rack_chip', 30, 318, 'The repertoire rack »', {
      linkTarget: 'specific_node',
      linkValue: 'repertoire_rack',
    }),
    doorChip('start', 'streak_chip', 264, 318, 'The streak board »', {
      linkTarget: 'specific_node',
      linkValue: 'streak_board',
    }),
    ...label('start', 'shelf_label', 30, 370, 220, 'THE TOOL SHELF'),
    doorChip('start', 'staff_chip', 30, 386, 'Staff paper »', {
      linkTarget: 'specific_node',
      linkValue: 'staff_01',
    }),
    doorChip('start', 'chord_chip', 264, 386, 'Chord sheets »', {
      linkTarget: 'specific_node',
      linkValue: 'chord_01',
    }),
    doorChip('start', 'ladder_chip', 30, 426, 'Technique ladders »', {
      linkTarget: 'specific_node',
      linkValue: 'technique_01',
    }),
    doorChip('start', 'gig_chip', 264, 426, 'Gig planners »', {
      linkTarget: 'specific_node',
      linkValue: 'gig_01',
    }),
    ...label('start', 'rules_label', 30, 478, 220, 'HOUSE RULES'),
    text('start', 'rules_text', 30, 494, 449, 52, '1. Slow is smooth, and smooth is fast.\n2. Loop the two bars that scare you, not the sixteen you love.\n3. End every night on something that sounds good.', {
      fontSize: 9.5,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('start', 'own_rules_label', 30, 552, 220, 'YOUR OWN RULES'),
    writingLines('start', 'own_rules_lines', 30, 568, 449, 60, 24),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Studio Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace', '« The guide'),
    pageTitle('workspace', '{{title}}'),
    text('workspace', 'hero', 30, 76, 449, 44, '{{hero}}', {
      dataBinding: 'hero',
      fontSize: 10,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'note', 30, 122, 449, 24, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontSize: 8.5,
      textColor: COLORS.smoke,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('workspace', 'stand_label', 30, 154, 260, 'ON THE STAND'),
    ...slotChip('workspace', 'slot_a_chip', 30, 170, 215, 'slot_a_label', {
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    ...slotChip('workspace', 'slot_b_chip', 264, 170, 215, 'slot_b_label', {
      linkTarget: 'specific_node',
      linkValue: 'example_session',
    }),
    ...label('workspace', 'studio_label', 30, 212, 260, 'THE STUDIO'),
    ...[
      ['rack', 'hub_rack_label', 'repertoire_rack'],
      ['sessions', 'hub_sessions_label', 'session_01'],
      ['staff', 'hub_staff_label', 'staff_01'],
      ['chords', 'hub_chords_label', 'chord_01'],
      ['ladders', 'hub_ladders_label', 'technique_01'],
      ['gigs', 'hub_gigs_label', 'gig_01'],
      ['streak', 'hub_streak_label', 'streak_board'],
    ].flatMap(([role, labelField, target], index) =>
      slotChip('workspace', `${role}_chip`, index % 2 === 0 ? 30 : 264, 228 + Math.floor(index / 2) * 38, 215, labelField, {
        linkTarget: 'specific_node',
        linkValue: target,
      })),
    ...label('workspace', 'wiring_label', 30, 392, 300, 'HOW THE ROOM IS WIRED'),
    text('workspace', 'wiring_note', 30, 408, 449, 56, 'The rack chips land on the same piece pages this hub reaches – every tune is one tap from anywhere. Session logs chain into each other night after night, every piece page jumps to the logbook, and the black bill at the foot of every page walks back home.', {
      fontSize: 9.5,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('workspace', 'notes_label', 30, 474, 200, 'SHED NOTES'),
    writingLines('workspace', 'notes_lines', 30, 490, 449, 120, 24),
  ],
};

// Repertoire rack: 18 numbered slots (two columns, column-major like a set
// list). Unused slots bind '' and print as silent brass plates over rules.
const rackSlots = () => {
  const elements = [];
  for (let n = 1; n <= 18; n += 1) {
    const col = n <= 9 ? 0 : 1;
    const row = (n - 1) % 9;
    const x = 30 + col * 234;
    const y = 108 + row * 50;
    elements.push(
      rect('rack', `plate_${n}`, x, y + 2, 26, 26, COLORS.brass),
      text('rack', `plate_num_${n}`, x, y + 2, 26, 26, String(n).padStart(2, '0'), {
        fontSize: 10.5,
        fontWeight: 'bold',
        textColor: COLORS.ink,
        align: 'center',
      }),
      text('rack', `slot_${n}`, x + 34, y + 2, 181, 26, `{{rack_${n}}}`, {
        dataBinding: `rack_${n}`,
        fontSize: 10.5,
        fontWeight: 'bold',
        textColor: COLORS.ink,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(n - 1),
      }),
      rect('rack', `slot_rule_${n}`, x + 34, y + 29, 181, 0.9, COLORS.sand),
    );
  }
  return elements;
};

const rack = {
  id: 'rack',
  name: 'Repertoire Rack',
  width: W,
  height: H,
  elements: [
    ...pageBase('rack', '« The hub'),
    pageTitle('rack', '{{title}}'),
    text('rack', 'subtitle', 30, 74, 449, 13, 'Every chip opens its piece page. Empty slots stay silent until you rack a new tune.', {
      fontSize: 8.5,
      textColor: COLORS.smoke,
      align: 'left',
    }),
    ...rackSlots(),
    svg('rack', 'foot_fade', 30, 572, 200, 10, halftoneBar(200, 10, 2, '#ad8433')),
    text('rack', 'motto', 30, 592, 449, 16, 'KNOW EVERY TUNE COLD · THEN PLAY IT WARM', {
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 2.4,
      align: 'left',
    }),
    text('rack', 'hint', 30, 612, 449, 24, 'Twelve slots filled to start – rename a piece page to rack a tune, add pages for a deeper book.', {
      fontSize: 8,
      textColor: COLORS.smoke,
      verticalAlign: 'top',
      align: 'left',
    }),
  ],
};

const SECTION_ROWS = [1, 2, 3, 4, 5, 6];
const TROUBLE_COLS = [
  ['BARS', 30, 70],
  ['WHAT BREAKS', 100, 190],
  ['THE FIX', 290, 189],
];

const piece = {
  id: 'piece',
  name: 'Piece Page',
  width: W,
  height: H,
  elements: [
    ...pageBase('piece', '« The hub'),
    text('piece', 'piece_title', 30, 46, 310, 24, '{{title}}', {
      fontSize: 17,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      characterSpacing: 1,
      align: 'left',
    }),
    text('piece', 'log_chip', 349, 46, 130, 26, 'Session logs »', {
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      fill: COLORS.brass,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'session_01',
    }),
    text('piece', 'by_word', 30, 78, 24, 13, 'BY', {
      fontSize: 7.5,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 1.4,
      align: 'left',
    }),
    text('piece', 'composer', 56, 76, 290, 15, '{{composer}}', {
      dataBinding: 'composer',
      fontSize: 9.5,
      textColor: COLORS.ink,
      align: 'left',
    }),
    rect('piece', 'composer_rule', 56, 92, 290, 0.9, COLORS.sand),
    rect('piece', 'key_head', 30, 104, 60, 28, COLORS.ink),
    text('piece', 'key_word', 30, 104, 60, 28, 'KEY', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.glow,
      characterSpacing: 1.4,
      align: 'center',
    }),
    cell('piece', 'key_cell', 90, 104, 155, 28),
    text('piece', 'key_value', 98, 104, 139, 28, '{{key}}', {
      dataBinding: 'key',
      fontSize: 9,
      textColor: COLORS.ink,
      align: 'left',
    }),
    rect('piece', 'tempo_head', 264, 104, 60, 28, COLORS.ink),
    text('piece', 'tempo_word', 264, 104, 60, 28, 'TEMPO', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.glow,
      characterSpacing: 1.2,
      align: 'center',
    }),
    cell('piece', 'tempo_cell', 324, 104, 155, 28),
    text('piece', 'tempo_value', 332, 104, 139, 28, '{{tempo}}', {
      dataBinding: 'tempo',
      fontSize: 9,
      textColor: COLORS.ink,
      align: 'left',
    }),
    ...label('piece', 'map_label', 30, 144, 240, 'SECTION MAP'),
    text('piece', 'map_hint', 280, 144, 199, 12, 'LETTER · BARS · WHAT HAPPENS', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.smoke,
      characterSpacing: 1.2,
      align: 'right',
    }),
    ...SECTION_ROWS.flatMap(row => [
      cell('piece', `sec_tag_${row}`, 30, 160 + (row - 1) * 26, 44, 22),
      text('piece', `sec_tag_value_${row}`, 30, 160 + (row - 1) * 26, 44, 22, `{{sec_${row}}}`, {
        dataBinding: `sec_${row}`,
        fontSize: 9.5,
        fontWeight: 'bold',
        textColor: COLORS.ink,
        align: 'center',
      }),
      cell('piece', `sec_bars_${row}`, 78, 160 + (row - 1) * 26, 70, 22),
      text('piece', `sec_bars_value_${row}`, 84, 160 + (row - 1) * 26, 58, 22, `{{secbars_${row}}}`, {
        dataBinding: `secbars_${row}`,
        fontFamily: 'courier',
        fontSize: 8.5,
        textColor: COLORS.ink,
        align: 'left',
      }),
      text('piece', `sec_note_${row}`, 158, 160 + (row - 1) * 26, 321, 22, `{{secnote_${row}}}`, {
        dataBinding: `secnote_${row}`,
        fontSize: 9,
        textColor: COLORS.ink,
        align: 'left',
      }),
      rect('piece', `sec_note_rule_${row}`, 158, 160 + (row - 1) * 26 + 23, 321, 0.9, COLORS.sand),
    ]),
    ...label('piece', 'trouble_label', 30, 326, 240, 'TROUBLE SPOTS'),
    ...TROUBLE_COLS.map(([word, x, w]) =>
      rect('piece', `tr_head_${x}`, x, 342, w, 18, COLORS.ink)),
    ...TROUBLE_COLS.map(([word, x, w]) =>
      text('piece', `tr_head_word_${x}`, x + 7, 342, w - 14, 18, word, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.glow,
        characterSpacing: 1.2,
        align: 'left',
      })),
    ...[1, 2, 3, 4].flatMap(row =>
      TROUBLE_COLS.map(([word, x, w], colIndex) => {
        const field = ['bars', 'what', 'fix'][colIndex];
        return [
          cell('piece', `tr_cell_${field}_${row}`, x, 360 + (row - 1) * 30, w, 30, { strokeWidth: 0.8 }),
          text('piece', `tr_value_${field}_${row}`, x + 6, 360 + (row - 1) * 30, w - 12, 30, `{{tr_${row}_${field}}}`, {
            dataBinding: `tr_${row}_${field}`,
            fontSize: 7.5,
            textColor: COLORS.ink,
            align: 'left',
          }),
        ];
      }).flat()),
    ...label('piece', 'tally_label', 30, 492, 240, 'PRACTICE TALLY'),
    text('piece', 'tally_hint', 280, 492, 199, 12, 'ONE BOX PER RUN-THROUGH', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.smoke,
      characterSpacing: 1.2,
      align: 'right',
    }),
    ...Array.from({ length: 20 }, (unused, index) =>
      checkbox('piece', `tally_box_${index + 1}`, 30 + index * 22.6, 508, 16)),
    ...label('piece', 'notes_label', 30, 540, 240, 'EARS, FINGERINGS & BREATH MARKS'),
    writingLines('piece', 'notes_lines', 30, 556, 449, 63, 21),
    text('piece', 'piece_notes', 30, 558, 449, 61, '{{piece_notes}}', {
      dataBinding: 'piece_notes',
      fontSize: 8.5,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
  ],
};

const FOCUS_ITEMS = ['Tone', 'Timing', 'Dynamics', 'Accuracy', 'Memory', 'Reading'];

const session = {
  id: 'session',
  name: 'Session Log',
  width: W,
  height: H,
  elements: [
    ...pageBase('session', '« The hub'),
    text('session', 'session_title', 30, 46, 300, 24, '{{title}}', {
      fontSize: 17,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      characterSpacing: 1,
      align: 'left',
    }),
    rect('session', 'date_head', 349, 46, 40, 26, COLORS.ink),
    text('session', 'date_word', 349, 46, 40, 26, 'DATE', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.glow,
      characterSpacing: 1,
      align: 'center',
    }),
    cell('session', 'date_cell', 389, 46, 90, 26),
    text('session', 'date_value', 395, 46, 78, 26, '{{sess_date}}', {
      dataBinding: 'sess_date',
      fontFamily: 'courier',
      fontSize: 8.5,
      textColor: COLORS.ink,
      align: 'left',
    }),
    text('session', 'goal_word', 30, 82, 130, 13, 'TONIGHT\'S ONE GOAL', {
      fontSize: 7.5,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 1.6,
      align: 'left',
    }),
    text('session', 'goal_value', 30, 96, 449, 16, '{{sess_goal}}', {
      dataBinding: 'sess_goal',
      fontSize: 10,
      textColor: COLORS.ink,
      align: 'left',
    }),
    rect('session', 'goal_rule', 30, 113, 449, 0.9, COLORS.sand),
    ...label('session', 'ladder_label', 30, 128, 320, 'THE METRONOME LADDER · START LOW, STEP UP'),
    ...Array.from({ length: 8 }, (unused, index) => [
      cell('session', `bpm_cell_${index + 1}`, 30 + index * 56.4, 178 - index * 4, 48, 26),
      text('session', `bpm_value_${index + 1}`, 30 + index * 56.4, 178 - index * 4, 48, 26, `{{bpm_${index + 1}}}`, {
        dataBinding: `bpm_${index + 1}`,
        fontFamily: 'courier',
        fontSize: 9,
        textColor: COLORS.ink,
        align: 'center',
      }),
    ]).flat(),
    text('session', 'ladder_hint', 30, 210, 449, 12, 'BPM PER RUNG · EIGHT RUNGS, ONE CLICK AT A TIME · STOP WHERE IT WOBBLES', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.smoke,
      characterSpacing: 1.2,
      align: 'left',
    }),
    ...label('session', 'focus_label', 30, 230, 240, 'FOCUS OF THE NIGHT'),
    ...FOCUS_ITEMS.flatMap((item, index) => [
      checkbox('session', `focus_box_${index + 1}`, index % 2 === 0 ? 30 : 264, 248 + Math.floor(index / 2) * 24 + 1),
      text('session', `focus_word_${index + 1}`, (index % 2 === 0 ? 30 : 264) + 20, 248 + Math.floor(index / 2) * 24, 180, 15, item, {
        fontSize: 9,
        textColor: COLORS.ink,
        align: 'left',
      }),
    ]),
    ...label('session', 'broke_label', 30, 330, 240, 'WHAT BROKE'),
    writingLines('session', 'broke_lines', 30, 346, 449, 63, 21),
    text('session', 'broke_value', 30, 348, 449, 61, '{{what_broke}}', {
      dataBinding: 'what_broke',
      fontSize: 8.5,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('session', 'clicked_label', 30, 420, 240, 'WHAT CLICKED'),
    writingLines('session', 'clicked_lines', 30, 436, 449, 63, 21),
    text('session', 'clicked_value', 30, 438, 449, 61, '{{what_clicked}}', {
      dataBinding: 'what_clicked',
      fontSize: 8.5,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...label('session', 'next_label', 30, 510, 300, 'NEXT TIME, FIRST THING'),
    writingLines('session', 'next_lines', 30, 526, 449, 42, 21),
    text('session', 'next_value', 30, 528, 449, 40, '{{next_first}}', {
      dataBinding: 'next_first',
      fontSize: 8.5,
      textColor: COLORS.ink,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('session', 'prev_chip', 30, 600, 180, 16, '{{sess_prev_label}}', {
      dataBinding: 'sess_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('session', 'next_chip', 299, 600, 180, 16, '{{sess_next_label}}', {
      dataBinding: 'sess_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
  ],
};

// Staff paper: ten hand-width manuscript staves. Each stave is a tight
// lines-h pattern rect (five lines at 5.5pt spacing) closed by terminal
// bar lines, with a small brass system number in the margin.
const staffStaves = () => {
  const elements = [];
  for (let n = 1; n <= 10; n += 1) {
    const y = 104 + (n - 1) * 52;
    elements.push(
      text('staff_paper', `sys_num_${n}`, 30, y + 7, 16, 10, String(n), {
        fontSize: 7,
        fontWeight: 'bold',
        textColor: COLORS.brass,
        align: 'right',
      }),
      rect('staff_paper', `stave_${n}`, 54, y, 401, 22.5, COLORS.ink, {
        fillType: 'pattern',
        patternType: 'lines-h',
        patternSpacing: 5.5,
        patternWeight: 0.9,
      }),
      rect('staff_paper', `bar_l_${n}`, 54, y, 1.1, 22.9, COLORS.ink),
      rect('staff_paper', `bar_r_${n}`, 453.9, y, 1.1, 22.9, COLORS.ink),
    );
  }
  return elements;
};

const staffPaper = {
  id: 'staff_paper',
  name: 'Staff Paper',
  width: W,
  height: H,
  elements: [
    ...pageBase('staff_paper', '« The hub'),
    text('staff_paper', 'staff_title', 30, 44, 300, 20, '{{title}}', {
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      characterSpacing: 1.6,
      align: 'left',
    }),
    text('staff_paper', 'staff_for', 279, 46, 200, 15, 'FOR:', {
      fontSize: 7.5,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 1.4,
      align: 'left',
    }),
    rect('staff_paper', 'staff_for_rule', 312, 60, 167, 0.9, COLORS.sand),
    text('staff_paper', 'staff_hint', 30, 66, 449, 12, 'TEN SYSTEMS · DRAW YOUR OWN CLEFS, BARS AND TIME', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.smoke,
      characterSpacing: 1.4,
      align: 'left',
    }),
    ...staffStaves(),
    text('staff_paper', 'staff_foot', 30, 626, 449, 12, 'THE WOODSHED MANUSCRIPT SERIES', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 2,
      align: 'center',
    }),
  ],
};

// Chord sheet: sixteen chord boxes, four strings by four frets, each with a
// name line above the frame.
const chordBoxes = () => {
  const elements = [];
  for (let n = 1; n <= 16; n += 1) {
    const col = (n - 1) % 4;
    const row = Math.floor((n - 1) / 4);
    const x = 30 + col * 112.25;
    const y = 112 + row * 124;
    elements.push(
      rect('chord_sheet', `name_rule_${n}`, x + 8, y + 14, 88, 0.9, COLORS.ink),
      text('chord_sheet', `name_word_${n}`, x + 8, y + 17, 88, 9, 'NAME', {
        fontSize: 5.5,
        fontWeight: 'bold',
        textColor: COLORS.smoke,
        characterSpacing: 1.2,
        align: 'left',
      }),
      svg('chord_sheet', `frame_${n}`, x + 20, y + 30, 64, 80, chordFrame),
    );
  }
  return elements;
};

const chordSheet = {
  id: 'chord_sheet',
  name: 'Chord Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('chord_sheet', '« The hub'),
    text('chord_sheet', 'chord_title', 30, 44, 300, 20, '{{title}}', {
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      characterSpacing: 1.6,
      align: 'left',
    }),
    text('chord_sheet', 'chord_caption', 30, 68, 449, 26, 'Sixteen boxes for fretted instruments – four strings, four frets, nut at the top. Name the chord on the line, dot the shape below. More strings? Draw the extra lines in; the boxes don\'t mind.', {
      fontSize: 8.5,
      textColor: COLORS.smoke,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...chordBoxes(),
    text('chord_sheet', 'chord_foot', 30, 616, 449, 12, 'O ABOVE FOR OPEN · X FOR MUTED · NUMBER THE FINGERS', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 1.6,
      align: 'center',
    }),
  ],
};

// Technique ladder: ten staggered rungs climbing from the bottom of the page.
const techniqueRungs = () => {
  const elements = [];
  for (let n = 1; n <= 10; n += 1) {
    const x = 30 + (n - 1) * 13;
    const y = 576 - (n - 1) * 42;
    elements.push(
      rect('technique', `rung_plate_${n}`, x, y, 22, 20, COLORS.brass),
      text('technique', `rung_num_${n}`, x, y, 22, 20, String(n), {
        fontSize: 9,
        fontWeight: 'bold',
        textColor: COLORS.ink,
        align: 'center',
      }),
      rect('technique', `rung_rule_${n}`, x + 30, y + 19, 180, 0.9, COLORS.ink),
      cell('technique', `rung_goal_${n}`, x + 218, y, 56, 20, { strokeWidth: 0.8 }),
      rect('technique', `rung_date_${n}`, x + 282, y + 19, 56, 0.9, COLORS.sand),
      checkbox('technique', `rung_box_${n}`, x + 346, y + 4, 13),
    );
  }
  return elements;
};

const technique = {
  id: 'technique',
  name: 'Technique Ladder',
  width: W,
  height: H,
  elements: [
    ...pageBase('technique', '« The hub'),
    pageTitle('technique', '{{title}}'),
    text('technique', 'tech_intro', 30, 74, 449, 26, 'One skill per ladder – scales, rudiments, breath, bowing, whatever your instrument climbs. Ten rungs from easy to honest.', {
      fontSize: 8.5,
      textColor: COLORS.smoke,
      verticalAlign: 'top',
      align: 'left',
    }),
    rect('technique', 'skill_head', 30, 108, 110, 26, COLORS.ink),
    text('technique', 'skill_word', 30, 108, 110, 26, 'THE SKILL', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.glow,
      characterSpacing: 1.4,
      align: 'center',
    }),
    cell('technique', 'skill_cell', 140, 108, 339, 26),
    ...label('technique', 'rungs_label', 30, 150, 260, 'THE RUNGS · CLIMB FROM THE BOTTOM'),
    text('technique', 'rungs_hint', 300, 150, 179, 12, 'EXERCISE · GOAL · DATE · TICK', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.smoke,
      characterSpacing: 1.2,
      align: 'right',
    }),
    ...techniqueRungs(),
    text('technique', 'tech_foot', 30, 616, 449, 12, 'A RUNG A WEEK IS A FLIGHT A SEASON', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 2,
      align: 'center',
    }),
  ],
};

const GIG_WHEN_COLS = [
  ['DATE', 30, 140],
  ['VENUE', 178, 180],
  ['CALL TIME', 366, 113],
];
const GIG_KIT = [
  'Instrument & spares',
  'Music, tablet & charger',
  'Stand & accessories',
  'Cables & power',
  'Setlist taped down',
  'Water & earplugs',
];

const gig = {
  id: 'gig',
  name: 'Gig Planner',
  width: W,
  height: H,
  elements: [
    ...pageBase('gig', '« The hub'),
    pageTitle('gig', '{{title}}'),
    ...GIG_WHEN_COLS.flatMap(([word, x, w]) => [
      rect('gig', `when_head_${x}`, x, 82, w, 14, COLORS.ink),
      text('gig', `when_word_${x}`, x + 6, 82, w - 12, 14, word, {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.glow,
        characterSpacing: 1.2,
        align: 'left',
      }),
      cell('gig', `when_cell_${x}`, x, 96, w, 24),
    ]),
    ...label('gig', 'set_label', 30, 134, 220, 'THE SET'),
    text('gig', 'set_key_word', 379, 136, 100, 10, 'KEY · COUNT-IN', {
      fontSize: 5.5,
      fontWeight: 'bold',
      textColor: COLORS.smoke,
      characterSpacing: 1,
      align: 'center',
    }),
    ...Array.from({ length: 10 }, (unused, index) => [
      text('gig', `set_num_${index + 1}`, 30, 150 + index * 24, 20, 15, `${String(index + 1).padStart(2, '0')}`, {
        fontFamily: 'courier',
        fontSize: 8.5,
        fontWeight: 'bold',
        textColor: COLORS.brass,
        align: 'left',
      }),
      rect('gig', `set_rule_${index + 1}`, 54, 150 + index * 24 + 16, 315, 0.9, COLORS.sand),
      rect('gig', `set_key_rule_${index + 1}`, 379, 150 + index * 24 + 16, 100, 0.9, COLORS.sand),
    ]).flat(),
    ...label('gig', 'kit_label', 30, 396, 220, 'THE KIT'),
    ...GIG_KIT.flatMap((item, index) => [
      checkbox('gig', `kit_box_${index + 1}`, index % 2 === 0 ? 30 : 264, 412 + Math.floor(index / 2) * 24 + 1),
      text('gig', `kit_word_${index + 1}`, (index % 2 === 0 ? 30 : 264) + 20, 412 + Math.floor(index / 2) * 24, 195, 15, item, {
        fontSize: 9,
        textColor: COLORS.ink,
        align: 'left',
      }),
    ]),
    ...label('gig', 'after_label', 30, 496, 300, 'AFTER THE GIG · WHAT LANDED, WHAT DIDN\'T'),
    writingLines('gig', 'after_lines', 30, 512, 449, 84, 21),
    text('gig', 'prev_chip', 30, 618, 180, 16, '{{gig_prev_label}}', {
      dataBinding: 'gig_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('gig', 'next_chip', 299, 618, 180, 16, '{{gig_next_label}}', {
      dataBinding: 'gig_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.ink,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
  ],
};

const MONTHS = [
  ['JAN', 31], ['FEB', 29], ['MAR', 31], ['APR', 30], ['MAY', 31], ['JUN', 30],
  ['JUL', 31], ['AUG', 31], ['SEP', 30], ['OCT', 31], ['NOV', 30], ['DEC', 31],
];

const streakRows = () => {
  const elements = [];
  MONTHS.forEach(([word, days], index) => {
    const y = 128 + index * 30;
    elements.push(
      text('streak', `month_${word}`, 30, y, 40, 13, word, {
        fontSize: 8,
        fontWeight: 'bold',
        textColor: COLORS.brass,
        characterSpacing: 1.2,
        align: 'left',
      }),
      svg('streak', `dots_${word}`, 76, y, 403, 13, monthDots(days, word === 'FEB')),
    );
  });
  return elements;
};

const streak = {
  id: 'streak',
  name: 'Streak Board',
  width: W,
  height: H,
  elements: [
    ...pageBase('streak', '« The hub'),
    pageTitle('streak', '{{title}}'),
    text('streak', 'streak_caption', 30, 74, 449, 24, 'One dot per day you played – two honest minutes count. Fill the dot, keep the chain. The dashed dot is leap day.', {
      fontSize: 8.5,
      textColor: COLORS.smoke,
      verticalAlign: 'top',
      align: 'left',
    }),
    ...[1, 8, 15, 22, 29].map(day =>
      text('streak', `scale_${day}`, 72.5 + (day - 1) * 13, 110, 20, 10, String(day), {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.smoke,
        align: 'center',
      })),
    ...streakRows(),
    rect('streak', 'best_head', 30, 508, 90, 30, COLORS.ink),
    text('streak', 'best_word', 30, 508, 90, 30, 'BEST STREAK', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.glow,
      characterSpacing: 1,
      align: 'center',
    }),
    cell('streak', 'best_cell', 120, 508, 125, 30),
    rect('streak', 'days_head', 264, 508, 90, 30, COLORS.ink),
    text('streak', 'days_word', 264, 508, 90, 30, 'DAYS PLAYED', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.glow,
      characterSpacing: 1,
      align: 'center',
    }),
    cell('streak', 'days_cell', 354, 508, 125, 30),
    svg('streak', 'streak_fade', 30, 556, 160, 10, halftoneBar(160, 10, 2, '#ad8433')),
    text('streak', 'streak_motto', 30, 576, 449, 16, 'DON\'T BREAK THE CHAIN', {
      fontSize: 11,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      characterSpacing: 3,
      align: 'left',
    }),
    text('streak', 'streak_rule_text', 30, 598, 449, 30, 'Played today? Fill today\'s dot. Missed a day? Start a new chain tomorrow – the board keeps score, it doesn\'t judge.', {
      fontSize: 8,
      textColor: COLORS.smoke,
      verticalAlign: 'top',
      align: 'left',
    }),
  ],
};

return {
  cover,
  start,
  workspace,
  rack,
  piece,
  session,
  staff_paper: staffPaper,
  chord_sheet: chordSheet,
  technique,
  gig,
  streak,
};
