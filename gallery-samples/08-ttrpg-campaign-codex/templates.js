const W = RM_PP_WIDTH;
const H = RM_PP_HEIGHT;

const COLORS = {
  oxblood: '#783f38',
  oxbloodDeep: '#492824',
  moss: '#667153',
  mossDeep: '#3f4934',
  vellum: '#e8dcc7',
  writing: '#fffaf0',
  ink: '#302b27',
  muted: '#746c61',
  rule: '#a99b87',
  mossPale: '#d7dacb',
  oxbloodPale: '#dfccc5',
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
    fontSize: 9.5,
    fontFamily: 'helvetica',
    textColor: COLORS.ink,
    verticalAlign: 'middle',
    ...extra,
  });

const svg = (templateId, role, x, y, w, h, svgContent) =>
  base(templateId, role, 'svg', x, y, w, h, { svgContent });

const grid = (templateId, role, x, y, cellW, cellH, cols, extra = {}) =>
  base(templateId, role, 'grid', x, y, cellW, cellH, {
    fill: COLORS.writing,
    fontSize: 7.5,
    fontFamily: 'helvetica',
    fontWeight: 'bold',
    textColor: COLORS.oxbloodDeep,
    borderRadius: 2,
    gridConfig: {
      cols,
      gapX: 7,
      gapY: 7,
      sourceType: 'current',
      displayField: 'menu_label',
      gridBorderMode: 'all',
      gridBorderColor: COLORS.oxblood,
      gridBorderWidth: 0.8,
      gridBorderStyle: 'solid',
      gridBorderRadius: 2,
      showEmptyCellBorders: false,
      ...extra,
    },
  });

const field = (templateId, role, label, binding, x, y, w, h, extra = {}) => [
  text(templateId, `${role}_label`, x, y, w, 14, label.toUpperCase(), {
    fontSize: 7.2,
    fontWeight: 'bold',
    textColor: COLORS.mossDeep,
    characterSpacing: 0.65,
  }),
  rect(templateId, `writing_${role}`, x, y + 16, w, h - 16, COLORS.writing),
  text(templateId, `${role}_value`, x + 6, y + 20, w - 12, h - 24, `{{${binding}}}`, {
    dataBinding: binding,
    fontFamily: extra.fontFamily || 'georgia',
    fontSize: extra.fontSize || 8.8,
    verticalAlign: 'top',
    ...extra,
  }),
];

const codexMotif = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 430">
  <g id="heraldry">
    <polygon points="176,34 290,76 275,242 176,332 77,242 62,76" fill="#e8dcc7" stroke="#667153" stroke-width="6"/>
    <path d="M176 45 V318 M75 116 H278" fill="none" stroke="#783f38" stroke-width="5"/>
    <path d="M102 205 C127 169 145 165 176 192 C207 165 226 170 250 205 C226 247 203 264 176 281 C148 264 125 246 102 205Z" fill="#667153" opacity="0.9"/>
  </g>
  <g id="route" fill="none" stroke="#783f38" stroke-width="5" stroke-linecap="round">
    <path d="M27 377 C64 342 87 384 122 350 C156 316 180 370 216 334 C246 304 275 342 324 292"/>
  </g>
  <g id="die" transform="translate(240 270)">
    <polygon points="0,-47 44,-15 28,38 -28,38 -44,-15" fill="#492824" stroke="#e8dcc7" stroke-width="4"/>
    <path d="M0 -47 V10 M-44 -15 L0 10 L44 -15 M0 10 L28 38 M0 10 L-28 38" fill="none" stroke="#e8dcc7" stroke-width="2"/>
    <circle cx="0" cy="-15" r="5" fill="#e8dcc7"/>
    <circle cx="-17" cy="18" r="4" fill="#e8dcc7"/>
    <circle cx="17" cy="18" r="4" fill="#e8dcc7"/>
  </g>
</svg>`;

const routeMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 55">
  <g fill="none" stroke-linecap="round">
    <path d="M8 38 C50 6 84 47 126 18 C169 -11 205 45 258 18 C283 5 306 9 332 31" stroke="#667153" stroke-width="4"/>
    <path d="M8 38 C50 6 84 47 126 18 C169 -11 205 45 258 18 C283 5 306 9 332 31" stroke="#783f38" stroke-width="1.4" stroke-dasharray="3 8"/>
    <circle cx="8" cy="38" r="5" fill="#783f38"/><circle cx="332" cy="31" r="5" fill="#783f38"/>
  </g>
</svg>`;

const pageBase = (templateId, section) => [
  rect(templateId, 'vellum', 0, 0, W, H, COLORS.vellum),
  rect(templateId, 'moss_rail', 0, 0, 20, H, COLORS.mossDeep),
  rect(templateId, 'oxblood_notch', 20, 45, 8, 54, COLORS.oxblood),
  text(templateId, 'example', 40, 10, 96, 24, '{{example_label}}', {
    dataBinding: 'example_label',
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.oxblood,
    characterSpacing: 1.1,
  }),
  text(templateId, 'skip', 224, 10, 257, 24, '{{skip_label}}', {
    dataBinding: 'skip_label',
    fontSize: 8.5,
    fontWeight: 'bold',
    textColor: COLORS.mossDeep,
    align: 'right',
    linkTarget: 'specific_node',
    linkValue: 'blank_workspace',
  }),
  text(templateId, 'section', 40, 44, 441, 18, section.toUpperCase(), {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.oxblood,
    characterSpacing: 1.35,
  }),
  rect(templateId, 'heading_rule', 40, 68, 441, 2, COLORS.moss),
  rect(templateId, 'footer_rule', 40, 620, 441, 1, COLORS.rule),
  text(templateId, 'home', 40, 631, 54, 25, 'HOME', {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.oxblood,
    linkTarget: 'specific_node',
    linkValue: 'root',
  }),
  text(templateId, 'up', 113, 631, 54, 25, 'UP', {
    fontSize: 7.5,
    fontWeight: 'bold',
    textColor: COLORS.mossDeep,
    linkTarget: 'parent',
  }),
  text(templateId, 'folio', 268, 631, 213, 25, 'WAYFARER CODEX / CAMPAIGN RECORD', {
    fontSize: 6.8,
    fontWeight: 'bold',
    textColor: COLORS.muted,
    align: 'right',
    characterSpacing: 0.35,
  }),
];

const titleBlock = (templateId) => [
  text(templateId, 'title', 40, 78, 441, 36, '{{title}}', {
    fontFamily: 'georgia',
    fontSize: 21,
    fontWeight: 'bold',
    textColor: COLORS.oxbloodDeep,
  }),
  text(templateId, 'subtitle', 40, 116, 441, 34, '{{subtitle}}', {
    dataBinding: 'subtitle',
    fontFamily: 'georgia',
    fontSize: 8.8,
    textColor: COLORS.muted,
    verticalAlign: 'top',
  }),
];

const cover = {
  id: 'cover',
  name: 'Campaign Codex Cover',
  width: W,
  height: H,
  elements: [
    rect('cover', 'field', 0, 0, W, H, COLORS.oxbloodDeep),
    rect('cover', 'moss_spine', 32, 0, 9, H, COLORS.moss),
    text('cover', 'kicker', 68, 58, 300, 24, 'SESSION / WORLD / CONSEQUENCE', {
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.vellum,
      characterSpacing: 1.4,
    }),
    text('cover', 'title', 67, 98, 295, 118, 'The Wayfarer\nCodex', {
      fontFamily: 'georgia',
      fontSize: 37,
      fontWeight: 'bold',
      textColor: COLORS.writing,
      verticalAlign: 'top',
    }),
    text('cover', 'subtitle', 69, 228, 220, 74, 'A campaign ledger for choices that alter roads, people, and powers.', {
      fontFamily: 'georgia',
      fontSize: 11.5,
      textColor: COLORS.vellum,
      verticalAlign: 'top',
    }),
    svg('cover', 'codex_heraldry', 190, 160, 291, 357, codexMotif),
    text('cover', 'open', 68, 561, 206, 47, 'OPEN THE CODEX  ->', {
      fontSize: 9.5,
      fontWeight: 'bold',
      textColor: COLORS.oxbloodDeep,
      fill: COLORS.vellum,
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
    svg('start', 'route_mark', 40, 158, 319, 48, routeMark),
    text('start', 'intro', 40, 216, 441, 67, 'Begin with campaign promise and party. Prepare each session around active records, then let decisions update quests, people, places, factions, encounters, and lore.', {
      fontFamily: 'georgia',
      fontSize: 11.5,
      textColor: COLORS.oxbloodDeep,
      verticalAlign: 'top',
    }),
    text('start', 'guided', 40, 312, 211, 92, 'EXPLORE THE ASHEN BELL\nOne session / five linked records', {
      fontSize: 9.5,
      fontWeight: 'bold',
      textColor: COLORS.writing,
      fill: COLORS.oxblood,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'example_workspace',
    }),
    text('start', 'blank', 270, 312, 211, 92, 'OPEN BLANK CODEX\nConfigurable campaign banks', {
      fontSize: 9.5,
      fontWeight: 'bold',
      textColor: COLORS.mossDeep,
      fill: COLORS.writing,
      align: 'center',
      linkTarget: 'specific_node',
      linkValue: 'blank_workspace',
    }),
    text('start', 'method', 40, 445, 441, 96, 'CHARTER  ->  PARTY  ->  SESSION\nQUESTS / NPCS / LOCATIONS / FACTIONS\nENCOUNTERS  ->  CONSEQUENCES  ->  LORE', {
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.mossDeep,
      characterSpacing: 0.45,
      verticalAlign: 'top',
    }),
  ],
};

const workspace = {
  id: 'workspace',
  name: 'Campaign Workspace',
  width: W,
  height: H,
  elements: [
    ...pageBase('workspace', 'campaign index'),
    ...titleBlock('workspace'),
    text('workspace', 'mode', 40, 160, 441, 20, '{{workspace_mode}}', {
      dataBinding: 'workspace_mode',
      fontSize: 7.5,
      fontWeight: 'bold',
      textColor: COLORS.oxblood,
      characterSpacing: 0.9,
    }),
    text('workspace', 'hero', 40, 186, 441, 54, '{{hero}}', {
      dataBinding: 'hero',
      fontFamily: 'georgia',
      fontSize: 10.5,
      textColor: COLORS.oxbloodDeep,
      verticalAlign: 'top',
    }),
    grid('workspace', 'navigator', 40, 257, 104, 42, 4),
    text('workspace', 'note', 40, 525, 441, 70, '{{workspace_note}}', {
      dataBinding: 'workspace_note',
      fontFamily: 'georgia',
      fontSize: 8.2,
      textColor: COLORS.muted,
      verticalAlign: 'top',
    }),
  ],
};

const campaign = {
  id: 'campaign',
  name: 'Campaign Charter',
  width: W,
  height: H,
  elements: [
    ...pageBase('campaign', 'campaign charter'),
    ...titleBlock('campaign'),
    ...field('campaign', 'premise', 'Campaign premise', 'premise', 40, 158, 441, 69),
    ...field('campaign', 'tone', 'Tone and touchstones', 'tone', 40, 238, 212, 72),
    ...field('campaign', 'safety', 'Safety and boundaries', 'safety', 269, 238, 212, 72),
    ...field('campaign', 'arc', 'Active arc', 'arc', 40, 321, 441, 80),
    ...field('campaign', 'calendar', 'Campaign calendar / clocks', 'calendar', 40, 412, 212, 82),
    ...field('campaign', 'notes', 'Table agreements / notes', 'notes', 269, 412, 212, 82),
  ],
};

const bank = {
  id: 'bank',
  name: 'Campaign Bank',
  width: W,
  height: H,
  elements: [
    ...pageBase('bank', 'record bank'),
    ...titleBlock('bank'),
    text('bank', 'instruction', 40, 158, 441, 35, '{{bank_note}}', {
      dataBinding: 'bank_note',
      fontFamily: 'georgia',
      fontSize: 8.7,
      textColor: COLORS.muted,
      verticalAlign: 'top',
    }),
    grid('bank', 'navigator', 40, 207, 104, 34, 4),
  ],
};

const party = {
  id: 'party',
  name: 'Party Ledger',
  width: W,
  height: H,
  elements: [
    ...pageBase('party', 'party ledger'),
    ...titleBlock('party'),
    ...field('party', 'group_goal', 'Shared purpose', 'group_goal', 40, 158, 441, 72),
    ...field('party', 'resources', 'Shared resources / obligations', 'resources', 40, 242, 212, 88),
    ...field('party', 'notes', 'Party bonds / open questions', 'notes', 269, 242, 212, 88),
    text('party', 'roster_label', 40, 350, 441, 18, 'ADVENTURER ROSTER', {
      fontSize: 7.3,
      fontWeight: 'bold',
      textColor: COLORS.oxblood,
      characterSpacing: 0.8,
    }),
    grid('party', 'navigator', 40, 377, 104, 37, 4),
  ],
};

const character = {
  id: 'character',
  name: 'Adventurer Record',
  width: W,
  height: H,
  elements: [
    ...pageBase('character', 'adventurer record'),
    ...titleBlock('character'),
    ...field('character', 'player', 'Player', 'player', 40, 158, 120, 52),
    ...field('character', 'identity', 'Ancestry / class / playbook', 'ancestry_class', 172, 158, 181, 52),
    ...field('character', 'level', 'Level', 'level', 365, 158, 116, 52, { fontSize: 8 }),
    ...field('character', 'hooks', 'Adventure hooks', 'hooks', 40, 220, 441, 76),
    ...field('character', 'bonds', 'Bonds and debts', 'bonds', 40, 307, 212, 90),
    ...field('character', 'abilities', 'Useful abilities / gear', 'abilities', 269, 307, 212, 90),
    ...field('character', 'notes', 'Conditions, changes, and notes', 'notes', 40, 408, 441, 96),
  ],
};

const session = {
  id: 'session',
  name: 'Session Record',
  width: W,
  height: H,
  elements: [
    ...pageBase('session', 'session ledger'),
    ...titleBlock('session'),
    ...field('session', 'date', 'Date / campaign time', 'date', 40, 154, 212, 49, { fontSize: 8 }),
    ...field('session', 'recap', 'Recap', 'recap', 269, 154, 212, 49, { fontSize: 8 }),
    ...field('session', 'opening', 'Opening situation', 'opening', 40, 212, 441, 58, { fontSize: 8.2 }),
    ...field('session', 'beats', 'Likely beats / pressure', 'beats', 40, 279, 212, 76, { fontSize: 8.1 }),
    ...field('session', 'decisions', 'Decisions made', 'decisions', 269, 279, 212, 76, { fontSize: 8.1 }),
    ...field('session', 'consequence', 'Faction / world consequence', 'consequence', 40, 364, 212, 68, { fontSize: 7.9 }),
    ...field('session', 'outcome', 'Outcome', 'outcome', 269, 364, 212, 68, { fontSize: 7.9 }),
    ...field('session', 'next_steps', 'Next session threads', 'next_steps', 40, 441, 441, 57, { fontSize: 7.8 }),
    text('session', 'links_label', 40, 504, 441, 15, 'LINKED CANONICAL RECORDS', {
      fontSize: 7,
      fontWeight: 'bold',
      textColor: COLORS.oxblood,
      characterSpacing: 0.7,
    }),
    grid('session', 'navigator', 40, 526, 137, 34, 3),
  ],
};

const quest = {
  id: 'quest',
  name: 'Quest Record',
  width: W,
  height: H,
  elements: [
    ...pageBase('quest', 'quest register'),
    ...titleBlock('quest'),
    text('quest', 'status_key', 40, 152, 441, 17, 'RUMORED  /  ACTIVE  /  STALLED  /  COMPLETE  /  FAILED', {
      fontSize: 7.1,
      fontWeight: 'bold',
      textColor: COLORS.oxblood,
      characterSpacing: 0.45,
    }),
    ...field('quest', 'status', 'Current status / clock', 'status', 40, 172, 212, 49, { fontSize: 8 }),
    ...field('quest', 'patron', 'Patron / source', 'patron', 269, 172, 212, 49, { fontSize: 8 }),
    ...field('quest', 'objective', 'Objective', 'objective', 40, 230, 441, 60, { fontSize: 8.2 }),
    ...field('quest', 'stakes', 'Stakes', 'stakes', 40, 299, 212, 69, { fontSize: 8 }),
    ...field('quest', 'clues', 'Clues / leads', 'clues', 269, 299, 212, 69, { fontSize: 8 }),
    ...field('quest', 'obstacles', 'Obstacles', 'obstacles', 40, 377, 212, 68, { fontSize: 8 }),
    ...field('quest', 'progress', 'Progress / clock events', 'progress', 269, 377, 212, 68, { fontSize: 8 }),
    ...field('quest', 'outcome', 'Outcome', 'outcome', 40, 454, 212, 57, { fontSize: 7.8 }),
    ...field('quest', 'notes', 'Notes', 'notes', 269, 454, 212, 57, { fontSize: 7.8 }),
  ],
};

const npc = {
  id: 'npc',
  name: 'NPC Record',
  width: W,
  height: H,
  elements: [
    ...pageBase('npc', 'people and powers'),
    ...titleBlock('npc'),
    ...field('npc', 'role', 'Role', 'role', 40, 158, 212, 55),
    ...field('npc', 'demeanor', 'Demeanor', 'demeanor', 269, 158, 212, 55),
    ...field('npc', 'desire', 'Desire', 'desire', 40, 224, 212, 70),
    ...field('npc', 'leverage', 'Leverage / offer', 'leverage', 269, 224, 212, 70),
    ...field('npc', 'voice', 'Voice / manner', 'voice', 40, 305, 212, 72),
    ...field('npc', 'relationship', 'Relationships / standing', 'relationship', 269, 305, 212, 72),
    ...field('npc', 'secrets', 'Secrets / pressure', 'secrets', 40, 388, 441, 70),
    ...field('npc', 'notes', 'Changes and notes', 'notes', 40, 469, 441, 65),
  ],
};

const location = {
  id: 'location',
  name: 'Location Record',
  width: W,
  height: H,
  elements: [
    ...pageBase('location', 'atlas of roads'),
    ...titleBlock('location'),
    ...field('location', 'region', 'Region / position', 'region', 40, 158, 441, 52),
    ...field('location', 'atmosphere', 'Atmosphere / sensory cues', 'atmosphere', 40, 221, 441, 69),
    ...field('location', 'features', 'Playable features', 'features', 40, 301, 212, 81),
    ...field('location', 'hazards', 'Hazards / pressures', 'hazards', 269, 301, 212, 81),
    ...field('location', 'routes', 'Routes / access', 'routes', 40, 393, 212, 77),
    ...field('location', 'discoveries', 'Discoveries', 'discoveries', 269, 393, 212, 77),
    ...field('location', 'notes', 'Changes and notes', 'notes', 40, 481, 441, 60),
  ],
};

const reputationCells = [];
const reputationX = 40;
const reputationY = 177;
const reputationCellW = 63;
['-3', '-2', '-1', '0', '+1', '+2', '+3'].forEach((label, index) => {
  reputationCells.push(rect('faction', `reputation_cell_${index}`, reputationX + index * reputationCellW, reputationY, reputationCellW, 38, index < 3 ? COLORS.oxbloodPale : COLORS.mossPale));
  reputationCells.push(text('faction', `reputation_value_${index}`, reputationX + index * reputationCellW, reputationY, reputationCellW, 38, label, {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.oxbloodDeep,
    align: 'center',
  }));
});
reputationCells.push(rect('faction', 'reputation_boundary', reputationX, reputationY, reputationCellW * 7, 38, '', {
  stroke: COLORS.oxblood,
  strokeWidth: 0.8,
}));
for (let index = 1; index < 7; index += 1) {
  reputationCells.push(rect('faction', `reputation_divider_${index}`, reputationX + index * reputationCellW - 0.4, reputationY, 0.8, 38, COLORS.oxblood));
}

const faction = {
  id: 'faction',
  name: 'Faction Record',
  width: W,
  height: H,
  elements: [
    ...pageBase('faction', 'faction ledger'),
    ...titleBlock('faction'),
    text('faction', 'reputation_label', 40, 153, 441, 16, 'REPUTATION: HOSTILE  <---------------->  ALLIED', {
      fontSize: 7.2,
      fontWeight: 'bold',
      textColor: COLORS.oxblood,
      characterSpacing: 0.45,
    }),
    ...reputationCells,
    ...field('faction', 'reputation', 'Current reputation / reason', 'reputation', 40, 225, 441, 50, { fontSize: 8 }),
    ...field('faction', 'agenda', 'Agenda', 'agenda', 40, 286, 212, 71),
    ...field('faction', 'resources', 'Resources / reach', 'resources', 269, 286, 212, 71),
    ...field('faction', 'pressure', 'Current pressure / clock', 'pressure', 40, 368, 212, 72),
    ...field('faction', 'consequence', 'Standing consequences', 'consequence', 269, 368, 212, 72),
    ...field('faction', 'notes', 'Members, changes, and notes', 'notes', 40, 451, 441, 79),
  ],
};

const encounter = {
  id: 'encounter',
  name: 'Encounter Record',
  width: W,
  height: H,
  elements: [
    ...pageBase('encounter', 'encounter folio'),
    ...titleBlock('encounter'),
    ...field('encounter', 'objective', 'Objective / success condition', 'objective', 40, 158, 441, 63, { fontSize: 8.5 }),
    ...field('encounter', 'setup', 'Setup / trigger', 'setup', 40, 232, 212, 67, { fontSize: 8.2 }),
    ...field('encounter', 'stakes', 'Stakes / clocks', 'stakes', 269, 232, 212, 67, { fontSize: 8.2 }),
    ...field('encounter', 'environment', 'Environment / terrain actions', 'environment', 40, 310, 212, 87, { fontSize: 8.2 }),
    ...field('encounter', 'adversaries', 'Adversaries / behavior', 'adversaries', 269, 310, 212, 87, { fontSize: 8.2 }),
    ...field('encounter', 'aftermath', 'Aftermath / changed state', 'aftermath', 40, 408, 441, 72, { fontSize: 8.2 }),
    ...field('encounter', 'notes', 'Rules notes / adjustments', 'notes', 40, 491, 441, 51, { fontSize: 7.8 }),
  ],
};

const lore = {
  id: 'lore',
  name: 'Lore Record',
  width: W,
  height: H,
  elements: [
    ...pageBase('lore', 'lore archive'),
    ...titleBlock('lore'),
    ...field('lore', 'category', 'Category / era / source', 'category', 40, 158, 441, 55),
    ...field('lore', 'truth', 'World truth', 'truth', 40, 224, 441, 86),
    ...field('lore', 'known_by', 'Who knows / believes it', 'known_by', 40, 321, 212, 86),
    ...field('lore', 'evidence', 'Evidence in play', 'evidence', 269, 321, 212, 86),
    ...field('lore', 'implications', 'Implications / adventure use', 'implications', 40, 418, 441, 78),
    ...field('lore', 'notes', 'Contradictions and notes', 'notes', 40, 507, 441, 49),
  ],
};

return {
  cover,
  start,
  workspace,
  campaign,
  bank,
  party,
  character,
  session,
  quest,
  npc,
  location,
  faction,
  encounter,
  lore,
};
