const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  night: '#1d2530',     // primary ink: dark header slabs, borders, text
  starlight: '#6e7f96', // secondary ink: labels, rules accent, soft text
  pale: '#e9edf3',      // page ground
  paper: '#f8fafd',     // writable cells and plates
  mist: '#c9d2dd',      // fine rules and writing lines
  glow: '#dfe7f1',      // light text and stars on night blocks
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
    textColor: COLORS.night,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const label = (templateId, role, x, y, w, value, extra = {}) =>
  text(templateId, role, x, y, w, 12, value, {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.starlight,
    characterSpacing: 1.6,
    align: 'left',
    ...extra,
  });

const writingLines = (templateId, role, x, y, w, h, spacing = 24) =>
  rect(templateId, role, x, y, w, h, COLORS.mist, {
    fillType: 'pattern',
    patternType: 'lines-h',
    patternSpacing: spacing,
    patternWeight: 0.8,
  });

const checkbox = (templateId, role, x, y, size = 12) =>
  rect(templateId, role, x, y, size, size, COLORS.paper, {
    stroke: COLORS.night,
    strokeWidth: 1,
  });

// --- Original artwork -------------------------------------------------------
// All star fields are generated deterministically from a fixed-seed LCG so
// repeated executions emit identical markup.

const starDots = (w, h, count, seed, color) => {
  let s = seed;
  const rnd = () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
  let marks = '';
  for (let i = 0; i < count; i += 1) {
    const x = (4 + rnd() * (w - 8)).toFixed(1);
    const y = (4 + rnd() * (h - 8)).toFixed(1);
    const r = (0.5 + rnd() * 0.9).toFixed(2);
    marks += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
  }
  return marks;
};

const slabStars = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 449 44">${starDots(449, 44, 26, 977, COLORS.glow)}</svg>`;

const coverSky = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 655">${starDots(480, 655, 90, 40961, COLORS.starlight)}</svg>`;

// The cover plate: Orion inside an eyepiece ring, star positions matching the
// naked-eye view facing south (east to the left) - Betelgeuse upper left,
// Bellatrix upper right, the Belt's diagonal, Saiph and Rigel below, and the
// fuzzy patch of M42 hanging in the Sword.
const orionField = (() => {
  let s = 5741;
  const rnd = () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
  let dots = '';
  let placed = 0;
  while (placed < 30) {
    const x = rnd() * 300;
    const y = rnd() * 300;
    const d = Math.sqrt((x - 150) * (x - 150) + (y - 150) * (y - 150));
    if (d > 130) continue;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.6 + rnd() * 0.7).toFixed(2)}" fill="${COLORS.starlight}"/>`;
    placed += 1;
  }
  return dots;
})();

const orionPlate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <circle cx="150" cy="150" r="146" stroke="${COLORS.glow}" stroke-width="2.4" fill="none"/>
  <circle cx="150" cy="150" r="139" stroke="${COLORS.starlight}" stroke-width="0.7" fill="none"/>
  ${orionField}
  <g stroke="${COLORS.starlight}" stroke-width="1.1" fill="none">
    <path d="M108 76 L138 160"/>
    <path d="M192 82 L168 144"/>
    <path d="M138 160 L153 152 L168 144"/>
    <path d="M138 160 L122 226"/>
    <path d="M168 144 L198 216"/>
  </g>
  <circle cx="150" cy="184" r="6.5" fill="${COLORS.starlight}" opacity="0.45"/>
  <circle cx="150" cy="184" r="2.6" fill="${COLORS.glow}"/>
  <circle cx="108" cy="76" r="4.2" fill="${COLORS.pale}"/>
  <circle cx="192" cy="82" r="3.2" fill="${COLORS.pale}"/>
  <circle cx="138" cy="160" r="2.7" fill="${COLORS.pale}"/>
  <circle cx="153" cy="152" r="2.7" fill="${COLORS.pale}"/>
  <circle cx="168" cy="144" r="2.7" fill="${COLORS.pale}"/>
  <circle cx="122" cy="226" r="3" fill="${COLORS.pale}"/>
  <circle cx="198" cy="216" r="4.2" fill="${COLORS.pale}"/>
</svg>`;

// Foot motif: the W of Cassiopeia as a thin constellation line.
const cassiopeiaMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 16">
  <path d="M3 12 L14 4 L26 10 L38 3 L49 9" stroke="${COLORS.starlight}" stroke-width="1" fill="none"/>
  <circle cx="3" cy="12" r="1.7" fill="${COLORS.night}"/>
  <circle cx="14" cy="4" r="1.7" fill="${COLORS.night}"/>
  <circle cx="26" cy="10" r="1.7" fill="${COLORS.night}"/>
  <circle cx="38" cy="3" r="1.7" fill="${COLORS.night}"/>
  <circle cx="49" cy="9" r="1.7" fill="${COLORS.night}"/>
</svg>`;

// The observation sheet's eyepiece: a ~300pt double ring with rim ticks and a
// sparse interior dot scatter (clipped to the field) as sketching guide stars.
const eyepieceField = (() => {
  let s = 271828;
  const rnd = () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
  let dots = '';
  let placed = 0;
  while (placed < 44) {
    const x = rnd() * 300;
    const y = rnd() * 300;
    const d = Math.sqrt((x - 150) * (x - 150) + (y - 150) * (y - 150));
    if (d > 128) continue;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.9" fill="${COLORS.mist}"/>`;
    placed += 1;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <circle cx="150" cy="150" r="147" stroke="${COLORS.night}" stroke-width="2.2" fill="none"/>
  <circle cx="150" cy="150" r="141" stroke="${COLORS.starlight}" stroke-width="0.7" fill="none"/>
  <g stroke="${COLORS.night}" stroke-width="1.4">
    <path d="M150 1 V13"/><path d="M150 287 V299"/><path d="M1 150 H13"/><path d="M287 150 H299"/>
  </g>
  ${dots}
</svg>`;
})();

// --- Shared night-slab chrome -----------------------------------------------
// Head: an inset night-dark slab hanging from the top edge (star field,
// EXAMPLE binding, masthead, skip binding) - inset from both page edges,
// unlike the full-bleed bands, engraved rules, frames, and command bars of
// products 09-18. Foot: a hairline rule with the W of Cassiopeia on the
// centerline between the two footer links.

const pageBase = (templateId, backLabel, rightLabel, rightLink) => [
  rect(templateId, 'ground', 0, 0, W, H, COLORS.pale),
  rect(templateId, 'slab', 22, 0, 465, 58, COLORS.night),
  svg(templateId, 'slab_stars', 30, 5, 449, 44, slabStars),
  text(templateId, 'example', 36, 8, 110, 14, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.glow,
    characterSpacing: 1.5,
    align: 'left',
  }),
  text(templateId, 'masthead', 180, 9, 149, 13, 'THE OBSERVATORY', {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.glow,
    characterSpacing: 2.6,
    align: 'center',
  }),
  text(templateId, 'masthead_sub', 180, 34, 149, 10, 'A NIGHT-SKY FIELD LOG', {
    fontSize: 5.5,
    fontWeight: 'bold',
    textColor: COLORS.starlight,
    characterSpacing: 2,
    align: 'center',
  }),
  text(templateId, 'skip', 344, 8, 132, 14, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.pale,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  rect(templateId, 'foot_rule', 30, 632, 449, 0.8, COLORS.mist),
  svg(templateId, 'foot_mark', 228.5, 640, 52, 16, cassiopeiaMark),
  text(templateId, 'foot_back', 30, 640, 150, 16, backLabel, {
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.night,
    align: 'left',
    linkTarget: 'parent',
  }),
  text(templateId, 'foot_right', 329, 640, 150, 16, rightLabel, {
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.night,
    align: 'right',
    ...rightLink,
  }),
];

const pageTitle = (templateId, value, extra = {}) =>
  text(templateId, 'page_title', 30, 68, 449, 24, value, {
    fontFamily: 'georgia',
    fontSize: 18,
    fontWeight: 'bold',
    textColor: COLORS.night,
    align: 'left',
    ...extra,
  });

// Unfilled tap chip over a hairline: ink text only, so a '' binding vanishes.
const slotChip = (templateId, role, x, y, w, field, link, extra = {}) => [
  text(templateId, role, x, y, w, 24, `{{${field}}}`, {
    dataBinding: field,
    fontFamily: 'georgia',
    fontSize: 10.5,
    fontWeight: 'bold',
    textColor: COLORS.night,
    align: 'left',
    ...link,
    ...extra,
  }),
  rect(templateId, `${role}_rule`, x, y + 25, w, 0.8, COLORS.mist),
];

const doorChip = (templateId, role, x, y, value, link, filled = false) =>
  text(templateId, role, x, y, 215, 34, value, {
    fontFamily: 'georgia',
    fontSize: 11,
    fontWeight: 'bold',
    textColor: filled ? COLORS.glow : COLORS.night,
    fill: filled ? COLORS.night : COLORS.paper,
    stroke: filled ? '' : COLORS.night,
    strokeWidth: filled ? 0 : 0.9,
    align: 'center',
    ...link,
  });

// --- Templates --------------------------------------------------------------

const cover = {
  id: 'cover',
  name: 'Dome Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'ground', 0, 0, W, H, COLORS.night),
    base('cover', 'tap_anywhere', 'rect', 0, 0, W, H, {
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    svg('cover', 'sky', 14.5, 12, 480, 655, coverSky),
    text('cover', 'kicker', 60, 58, 389, 14, 'A FIELD LOG FOR THE NIGHT SKY', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.starlight,
      characterSpacing: 2.4,
      align: 'center',
    }),
    text('cover', 'title', 54, 76, 401, 50, 'The Observatory', {
      fontFamily: 'georgia',
      fontSize: 34,
      fontWeight: 'bold',
      textColor: COLORS.pale,
      align: 'center',
    }),
    rect('cover', 'title_rule', 180, 132, 149, 1, COLORS.starlight),
    rect('cover', 'title_star_a', 240.5, 137.5, 3, 3, COLORS.glow),
    rect('cover', 'title_star_b', 253, 137.5, 3, 3, COLORS.glow),
    rect('cover', 'title_star_c', 265.5, 137.5, 3, 3, COLORS.glow),
    svg('cover', 'orion_plate', 104.5, 158, 300, 300, orionPlate),
    text('cover', 'plate_caption', 96, 466, 317, 12, 'ORION · GATE OF THE WINTER SKY', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.starlight,
      characterSpacing: 1.6,
      align: 'center',
    }),
    text('cover', 'sub', 74, 494, 361, 66, 'Twelve month skies point to twenty accurate target cards – nebulae, clusters, galaxies, the planets, and the Moon – and every sight feeds a sketch-circle observation sheet and one growing life list.', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.glow,
      align: 'center',
      verticalAlign: 'top',
    }),
    text('cover', 'open_cta', 164.5, 572, 180, 34, 'Open the dome »', {
      fontFamily: 'georgia',
      fontSize: 13,
      fontWeight: 'bold',
      textColor: COLORS.night,
      fill: COLORS.pale,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'start_here',
    }),
    text('cover', 'imprint', 96, 628, 317, 12, 'MONTHS · TARGETS · SESSIONS · LIFE LIST', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.starlight,
      characterSpacing: 1.8,
      align: 'center',
    }),
  ],
};

const start = {
  id: 'start',
  name: 'Observer Guide',
  width: W,
  height: H,
  elements: [
    ...pageBase('start', '« Cover', 'THE MONTHS »', {
      linkTarget: 'specific_node',
      linkValue: 'month_01',
    }),
    pageTitle('start', '{{title}}'),
    text('start', 'premise', 30, 96, 449, 58, 'The Observatory is written for observers at northern mid-latitudes – roughly 35 to 55 degrees north, the sky over most of North America, Europe, and Japan. Every month page lists deep-sky sights genuinely well placed that month; every card in the catalog is accurate and evergreen.', {
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.night,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'howto_label', 30, 162, 260, 'HOW TO WORK THE SKY'),
    text('start', 'howto_steps', 30, 178, 449, 112, '1. Open this month\'s sky page and read its highlight rows.\n2. Tap any row – the target\'s card holds type, magnitude, and finder notes.\n3. Star-hop with the card at the scope, then log the night on an observation sheet.\n4. Sketch what the eyepiece actually shows in the circle – date it, note the sky.\n5. Tick the life list as targets fall; each card\'s first-observed box remembers when.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.night,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'doors_label', 30, 300, 220, 'WHERE TO BEGIN'),
    doorChip('start', 'example_chip', 30, 316, 'The worked example »', {
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    doorChip('start', 'observatory_chip', 264, 316, 'Your observatory »', {
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }, true),
    doorChip('start', 'january_chip', 30, 358, 'January\'s sky »', {
      linkTarget: 'specific_node',
      linkValue: 'month_01',
    }),
    doorChip('start', 'lifelist_chip', 264, 358, 'The life list »', {
      linkTarget: 'specific_node',
      linkValue: 'life_list',
    }),
    label('start', 'wanderers_label', 30, 404, 220, 'THE WANDERERS'),
    text('start', 'wanderers_note', 30, 420, 449, 44, 'The Moon and planets drift along the ecliptic on their own calendars, so the month pages name only the fixed deep sky. Check a current almanac or app for where the wanderers stand tonight – each has a card in the catalog.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.night,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'rule_label', 30, 472, 220, 'THE ONE RULE'),
    text('start', 'rule_note', 30, 488, 449, 30, 'Never look at the Sun through any unfiltered instrument – not for a moment. The eclipse-safety card in the catalog is required reading before any solar attempt.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.night,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('start', 'notes_label', 30, 526, 200, 'NOTES'),
    writingLines('start', 'notes_lines', 30, 542, 449, 72, 24),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Observatory Hub',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace', '« The guide', 'LIFE LIST »', {
      linkTarget: 'specific_node',
      linkValue: 'life_list',
    }),
    pageTitle('workspace', '{{title}}'),
    text('workspace', 'hero', 30, 96, 449, 44, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 10,
      textColor: COLORS.night,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('workspace', 'note', 30, 142, 449, 26, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontSize: 8.5,
      textColor: COLORS.starlight,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'bench_label', 30, 176, 260, 'ON THE BENCH'),
    ...slotChip('workspace', 'slot_a_chip', 30, 192, 215, 'slot_a_label', {
      linkTarget: 'child_index',
      linkValue: '0',
    }),
    ...slotChip('workspace', 'slot_b_chip', 264, 192, 215, 'slot_b_label', {
      linkTarget: 'child_index',
      linkValue: '1',
    }),
    label('workspace', 'dome_label', 30, 240, 260, 'THE DOME'),
    ...[
      ['months', 'hub_months_label', 'month_01'],
      ['catalog', 'hub_catalog_label', 'target_m31'],
      ['lifelist', 'hub_lifelist_label', 'life_list'],
      ['sessions', 'hub_sessions_label', 'session_01'],
      ['equipment', 'hub_equipment_label', 'equipment_01'],
      ['glossary', 'hub_glossary_label', 'glossary_01'],
    ].flatMap(([role, labelField, target], index) =>
      slotChip('workspace', `${role}_chip`, index % 2 === 0 ? 30 : 264, 256 + Math.floor(index / 2) * 40, 215, labelField, {
        linkTarget: 'specific_node',
        linkValue: target,
      })),
    label('workspace', 'wiring_label', 30, 384, 300, 'HOW THE WIRING WORKS'),
    text('workspace', 'wiring_note', 30, 400, 449, 56, 'Month highlights are reference chips – each opens the same card the life list ticks, so a target\'s page is one tap from anywhere. Cards link back to the life list, observation sheets chain night into night, and every page returns here.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.night,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('workspace', 'notes_label', 30, 466, 260, 'OBSERVING NOTES'),
    writingLines('workspace', 'notes_lines', 30, 482, 449, 132, 24),
  ],
};

// Month page: masthead, five highlight rows (unfilled chip + writable rule +
// seen box; unused rows bind '' and print as writable spares), a standing
// Moon-and-planets note (kept generic - the wanderers move), and lined space
// for this year's almanac findings.
const monthRows = () => {
  const elements = [];
  for (let n = 1; n <= 5; n += 1) {
    const y = 176 + (n - 1) * 32;
    elements.push(
      text('month_sky', `hl_chip_${n}`, 30, y, 256, 22, `{{highlight_${n}_label}}`, {
        dataBinding: `highlight_${n}_label`,
        fontFamily: 'georgia',
        fontSize: 10.5,
        fontWeight: 'bold',
        textColor: COLORS.night,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(n - 1),
      }),
      rect('month_sky', `hl_rule_${n}`, 300, y + 18, 140, 0.8, COLORS.mist),
      rect('month_sky', `hl_seen_${n}`, 452, y + 5, 12, 12, COLORS.paper, {
        stroke: COLORS.night,
        strokeWidth: 1,
      }),
    );
  }
  return elements;
};

const monthSky = {
  id: 'month_sky',
  name: 'Month Sky',
  width: W,
  height: H,
  elements: [
    ...pageBase('month_sky', '« The hub', 'THE CATALOG »', {
      linkTarget: 'specific_node',
      linkValue: 'target_m31',
    }),
    text('month_sky', 'masthead_month', 104, 66, 301, 30, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 23,
      fontWeight: 'bold',
      textColor: COLORS.night,
      align: 'center',
    }),
    rect('month_sky', 'masthead_rule_a', 104, 99, 301, 1, COLORS.night),
    rect('month_sky', 'masthead_rule_b', 104, 102, 301, 0.5, COLORS.starlight),
    text('month_sky', 'month_note', 30, 108, 449, 30, '{{month_note}}', {
      dataBinding: 'month_note',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.starlight,
      align: 'center',
    }),
    label('month_sky', 'hl_label', 30, 146, 300, 'HIGHLIGHTS · TAP FOR THE TARGET CARD'),
    text('month_sky', 'col_target', 30, 162, 256, 10, 'TARGET', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.starlight,
      characterSpacing: 1,
      align: 'left',
    }),
    text('month_sky', 'col_eyepiece', 300, 162, 140, 10, 'EYEPIECE · DATE', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.starlight,
      characterSpacing: 1,
      align: 'left',
    }),
    text('month_sky', 'col_seen', 444, 162, 32, 10, 'SEEN', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.starlight,
      characterSpacing: 1,
      align: 'right',
    }),
    ...monthRows(),
    text('month_sky', 'spare_note', 30, 340, 449, 12, 'Unused rows are yours – pencil in doubles, comets, and whatever the night volunteers.', {
      fontSize: 8,
      textColor: COLORS.starlight,
      align: 'left',
    }),
    label('month_sky', 'wanderers_label', 30, 364, 300, 'MOON & PLANETS'),
    text('month_sky', 'wanderers_note', 30, 380, 449, 44, 'The Moon and the planets keep their own calendar – check a current almanac for what rides the ecliptic tonight. Saturn, Jupiter, Venus, Mars, and the Moon each hold a card in the catalog, whatever the month.', {
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.night,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('month_sky', 'moon_notes_label', 30, 432, 300, 'MOON & PLANET NOTES, THIS YEAR'),
    writingLines('month_sky', 'moon_notes_lines', 30, 448, 449, 120, 24),
    text('month_sky', 'prev_chip', 30, 584, 170, 18, '{{month_prev_label}}', {
      dataBinding: 'month_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.night,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('month_sky', 'next_chip', 309, 584, 170, 18, '{{month_next_label}}', {
      dataBinding: 'month_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.night,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
  ],
};

const SPEC_ROWS = [
  ['TYPE', 'spec_type'],
  ['CONSTELLATION', 'spec_const'],
  ['MAGNITUDE', 'spec_mag'],
  ['DIFFICULTY', 'spec_diff'],
];

const FIRST_ROWS = [
  ['DATE', 'first_date', 416],
  ['INSTRUMENT · EYEPIECE', 'first_instrument', 444],
  ['SKY · SEEING', 'first_sky', 472],
];

const target = {
  id: 'target',
  name: 'Target Card',
  width: W,
  height: H,
  elements: [
    ...pageBase('target', '« Back', 'THE MONTHS »', {
      linkTarget: 'specific_node',
      linkValue: 'month_01',
    }),
    rect('target', 'designation_plate', 30, 66, 104, 46, COLORS.night),
    text('target', 'designation', 34, 66, 96, 46, '{{designation}}', {
      dataBinding: 'designation',
      fontFamily: 'georgia',
      fontSize: 15,
      fontWeight: 'bold',
      textColor: COLORS.glow,
      align: 'center',
    }),
    text('target', 'card_title', 146, 66, 224, 26, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 18,
      fontWeight: 'bold',
      textColor: COLORS.night,
      align: 'left',
    }),
    text('target', 'kicker', 146, 94, 224, 16, '{{target_kicker}}', {
      dataBinding: 'target_kicker',
      fontSize: 8.5,
      textColor: COLORS.starlight,
      align: 'left',
    }),
    text('target', 'lifelist_chip', 380, 72, 99, 32, 'Life list »', {
      fontFamily: 'georgia',
      fontSize: 10.5,
      fontWeight: 'bold',
      textColor: COLORS.glow,
      fill: COLORS.night,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'life_list',
    }),
    ...SPEC_ROWS.flatMap(([name, field], index) => [
      rect('target', `spec_head_${field}`, 30, 128 + index * 30, 132, 30, COLORS.night),
      text('target', `spec_word_${field}`, 38, 128 + index * 30, 116, 30, name, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.glow,
        characterSpacing: 1,
        align: 'left',
      }),
      rect('target', `spec_cell_${field}`, 162, 128 + index * 30, 317, 30, COLORS.paper, {
        stroke: COLORS.night,
        strokeWidth: 0.9,
      }),
      text('target', `spec_value_${field}`, 170, 128 + index * 30, 301, 30, `{{${field}}}`, {
        dataBinding: field,
        fontSize: 8.5,
        textColor: COLORS.night,
        align: 'left',
      }),
    ]),
    label('target', 'finder_label', 30, 260, 220, 'FINDER NOTES'),
    text('target', 'finder_notes', 30, 276, 449, 104, '{{finder_notes}}', {
      dataBinding: 'finder_notes',
      fontFamily: 'georgia',
      fontSize: 9.5,
      textColor: COLORS.night,
      verticalAlign: 'top',
      align: 'left',
    }),
    rect('target', 'first_box', 30, 390, 449, 108, COLORS.paper, {
      stroke: COLORS.night,
      strokeWidth: 1.1,
    }),
    label('target', 'first_label', 40, 396, 240, 'FIRST OBSERVED'),
    ...FIRST_ROWS.flatMap(([name, field, y]) => [
      text('target', `first_word_${field}`, 40, y, 124, 12, name, {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.starlight,
        characterSpacing: 1,
        align: 'left',
      }),
      text('target', `first_value_${field}`, 172, y - 3, 295, 17, `{{${field}}}`, {
        dataBinding: field,
        fontFamily: 'georgia',
        fontSize: 9,
        textColor: COLORS.night,
        align: 'left',
      }),
      rect('target', `first_rule_${field}`, 172, y + 15, 295, 0.8, COLORS.mist),
    ]),
    label('target', 'notes_label', 30, 510, 200, 'NOTES'),
    writingLines('target', 'notes_lines', 30, 526, 449, 84, 21),
    text('target', 'card_notes', 30, 526, 449, 84, '{{card_notes}}', {
      dataBinding: 'card_notes',
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.night,
      verticalAlign: 'top',
      align: 'left',
    }),
  ],
};

const SESSION_CELLS = [
  ['DATE', 'sess_date', 30],
  ['SKY · CONDITIONS', 'sess_conditions', 181.5],
  ['SEEING', 'sess_seeing', 333],
];

const session = {
  id: 'session',
  name: 'Observation Sheet',
  width: W,
  height: H,
  elements: [
    ...pageBase('session', '« The hub', 'LIFE LIST »', {
      linkTarget: 'specific_node',
      linkValue: 'life_list',
    }),
    text('session', 'sheet_title', 30, 64, 300, 20, '{{title}}', {
      fontFamily: 'georgia',
      fontSize: 15,
      fontWeight: 'bold',
      textColor: COLORS.night,
      align: 'left',
    }),
    ...SESSION_CELLS.flatMap(([name, field, x]) => [
      rect('session', `cell_${field}`, x, 90, 146, 40, COLORS.paper, {
        stroke: COLORS.night,
        strokeWidth: 0.9,
      }),
      text('session', `cell_word_${field}`, x + 6, 94, 134, 10, name, {
        fontSize: 6,
        fontWeight: 'bold',
        textColor: COLORS.starlight,
        characterSpacing: 1.2,
        align: 'left',
      }),
      text('session', `cell_value_${field}`, x + 6, 106, 134, 20, `{{${field}}}`, {
        dataBinding: field,
        fontSize: 8.5,
        textColor: COLORS.night,
        verticalAlign: 'top',
        align: 'left',
      }),
    ]),
    text('session', 'target_word', 30, 142, 56, 14, 'TARGET', {
      fontSize: 6.5,
      fontWeight: 'bold',
      textColor: COLORS.starlight,
      characterSpacing: 1.2,
      align: 'left',
    }),
    text('session', 'target_value', 92, 138, 260, 18, '{{sess_target}}', {
      dataBinding: 'sess_target',
      fontFamily: 'georgia',
      fontSize: 10,
      fontWeight: 'bold',
      textColor: COLORS.night,
      align: 'left',
    }),
    rect('session', 'target_rule', 92, 156, 260, 0.8, COLORS.mist),
    text('session', 'catalog_chip', 384, 138, 95, 18, 'The catalog »', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.night,
      align: 'right',
      linkTarget: 'specific_node',
      linkValue: 'target_m31',
    }),
    svg('session', 'eyepiece', 104.5, 166, 300, 300, eyepieceField),
    text('session', 'eyepiece_caption', 96, 470, 317, 10, 'SKETCH THE FIELD · MARK NORTH ON THE RIM YOURSELF', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.starlight,
      characterSpacing: 1.4,
      align: 'center',
    }),
    label('session', 'notes_label', 30, 486, 200, 'THE NIGHT, IN WORDS'),
    writingLines('session', 'notes_lines', 30, 500, 449, 92, 23),
    text('session', 'sess_notes', 30, 500, 449, 92, '{{sess_notes}}', {
      dataBinding: 'sess_notes',
      fontFamily: 'georgia',
      fontSize: 9,
      textColor: COLORS.night,
      verticalAlign: 'top',
      align: 'left',
    }),
    text('session', 'prev_chip', 30, 602, 170, 16, '{{obs_prev_label}}', {
      dataBinding: 'obs_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.night,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('session', 'next_chip', 309, 602, 170, 16, '{{obs_next_label}}', {
      dataBinding: 'obs_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.night,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
  ],
};

const OPTICS_COLS = [
  ['INSTRUMENT', 30, 170],
  ['APERTURE', 200, 86],
  ['FOCAL LENGTH', 286, 96],
  ['NOTES', 382, 97],
];

const EYEPIECE_COLS = [
  ['EYEPIECE', 30, 150],
  ['FL (MM)', 180, 80],
  ['POWER', 260, 80],
  ['NOTES', 340, 139],
];

const equipment = {
  id: 'equipment',
  name: 'Equipment Page',
  width: W,
  height: H,
  elements: [
    ...pageBase('equipment', '« The hub', 'GLOSSARY »', {
      linkTarget: 'specific_node',
      linkValue: 'glossary_01',
    }),
    pageTitle('equipment', '{{title}}'),
    text('equipment', 'subtitle', 30, 96, 449, 14, 'The kit, written down once – so the log can say "the 10 mm" and mean it.', {
      fontSize: 9,
      textColor: COLORS.starlight,
      align: 'left',
    }),
    label('equipment', 'optics_label', 30, 124, 220, 'OPTICS'),
    ...OPTICS_COLS.map(([name, x, w]) =>
      rect('equipment', `optics_head_${x}`, x, 140, w, 18, COLORS.night)),
    ...OPTICS_COLS.map(([name, x, w]) =>
      text('equipment', `optics_word_${x}`, x + 7, 140, w - 14, 18, name, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.glow,
        characterSpacing: 1.2,
        align: 'left',
      })),
    ...Array.from({ length: 4 }, (unused, row) =>
      OPTICS_COLS.map(([name, x, w]) =>
        rect('equipment', `optics_cell_${x}_${row + 1}`, x, 158 + row * 30, w, 30, COLORS.paper, {
          stroke: COLORS.night,
          strokeWidth: 0.8,
        }))).flat(),
    label('equipment', 'eyepiece_label', 30, 292, 260, 'EYEPIECES & FILTERS'),
    ...EYEPIECE_COLS.map(([name, x, w]) =>
      rect('equipment', `ep_head_${x}`, x, 308, w, 18, COLORS.night)),
    ...EYEPIECE_COLS.map(([name, x, w]) =>
      text('equipment', `ep_word_${x}`, x + 7, 308, w - 14, 18, name, {
        fontSize: 6.5,
        fontWeight: 'bold',
        textColor: COLORS.glow,
        characterSpacing: 1.2,
        align: 'left',
      })),
    ...Array.from({ length: 5 }, (unused, row) =>
      EYEPIECE_COLS.map(([name, x, w]) =>
        rect('equipment', `ep_cell_${x}_${row + 1}`, x, 326 + row * 28, w, 28, COLORS.paper, {
          stroke: COLORS.night,
          strokeWidth: 0.8,
        }))).flat(),
    text('equipment', 'formula_note', 30, 476, 449, 26, 'Power = telescope focal length / eyepiece focal length. Exit pupil = aperture / power – keep it between about 1 and 7 mm.', {
      fontSize: 8,
      textColor: COLORS.starlight,
      verticalAlign: 'top',
      align: 'left',
    }),
    label('equipment', 'kit_label', 30, 512, 260, 'THE FIELD KIT'),
    ...[0, 1, 2].flatMap(row => [
      checkbox('equipment', `kit_box_l_${row}`, 30, 528 + row * 26),
      rect('equipment', `kit_rule_l_${row}`, 50, 540 + row * 26, 195, 0.8, COLORS.mist),
      checkbox('equipment', `kit_box_r_${row}`, 264, 528 + row * 26),
      rect('equipment', `kit_rule_r_${row}`, 284, 540 + row * 26, 195, 0.8, COLORS.mist),
    ]),
  ],
};

const lifeListRows = () => {
  const elements = [];
  for (let n = 1; n <= 20; n += 1) {
    const y = 130 + (n - 1) * 24;
    elements.push(
      checkbox('life_list', `ll_box_${n}`, 30, y + 1),
      text('life_list', `ll_chip_${n}`, 52, y, 200, 16, `{{ll_${n}}}`, {
        dataBinding: `ll_${n}`,
        fontFamily: 'georgia',
        fontSize: 9.5,
        fontWeight: 'bold',
        textColor: COLORS.night,
        align: 'left',
        linkTarget: 'child_index',
        linkValue: String(n - 1),
      }),
      rect('life_list', `ll_rule_${n}`, 268, y + 14, 211, 0.8, COLORS.mist),
    );
  }
  return elements;
};

const lifeList = {
  id: 'life_list',
  name: 'Life List',
  width: W,
  height: H,
  elements: [
    ...pageBase('life_list', '« The hub', 'THE MONTHS »', {
      linkTarget: 'specific_node',
      linkValue: 'month_01',
    }),
    pageTitle('life_list', '{{title}}'),
    text('life_list', 'subtitle', 30, 96, 449, 14, 'Twenty sights, ticked off as the seasons hand them over – date and instrument beside each.', {
      fontSize: 9,
      textColor: COLORS.starlight,
      align: 'left',
    }),
    text('life_list', 'col_target', 52, 116, 200, 10, 'TARGET · TAP FOR ITS CARD', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.starlight,
      characterSpacing: 1,
      align: 'left',
    }),
    text('life_list', 'col_first', 268, 116, 211, 10, 'FIRST SEEN · WITH', {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.starlight,
      characterSpacing: 1,
      align: 'left',
    }),
    ...lifeListRows(),
  ],
};

const glossaryRows = () => {
  const elements = [];
  for (let n = 1; n <= 9; n += 1) {
    const y = 118 + (n - 1) * 54;
    elements.push(
      text('glossary', `term_${n}`, 30, y, 140, 16, `{{term_${n}}}`, {
        dataBinding: `term_${n}`,
        fontFamily: 'georgia',
        fontSize: 10.5,
        fontWeight: 'bold',
        textColor: COLORS.night,
        align: 'left',
      }),
      text('glossary', `def_${n}`, 180, y, 299, 44, `{{def_${n}}}`, {
        dataBinding: `def_${n}`,
        fontSize: 8.5,
        textColor: COLORS.night,
        verticalAlign: 'top',
        align: 'left',
      }),
      rect('glossary', `gl_rule_${n}`, 30, y + 46, 449, 0.6, COLORS.mist),
    );
  }
  return elements;
};

const glossary = {
  id: 'glossary',
  name: 'Glossary Page',
  width: W,
  height: H,
  elements: [
    ...pageBase('glossary', '« The hub', 'EQUIPMENT »', {
      linkTarget: 'specific_node',
      linkValue: 'equipment_01',
    }),
    pageTitle('glossary', '{{title}}'),
    text('glossary', 'subtitle', 30, 96, 449, 14, 'The words the log keeps using, pinned down.', {
      fontSize: 9,
      textColor: COLORS.starlight,
      align: 'left',
    }),
    ...glossaryRows(),
    text('glossary', 'prev_chip', 30, 606, 170, 14, '{{gl_prev_label}}', {
      dataBinding: 'gl_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.night,
      align: 'left',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('glossary', 'next_chip', 309, 606, 170, 14, '{{gl_next_label}}', {
      dataBinding: 'gl_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.night,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
  ],
};

return {
  cover,
  start,
  workspace,
  month_sky: monthSky,
  target,
  session,
  equipment,
  life_list: lifeList,
  glossary,
};
