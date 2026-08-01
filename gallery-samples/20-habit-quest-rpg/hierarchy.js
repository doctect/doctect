const DEFAULT_CONFIG = { dailyCount: 28, bossCount: 12 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = { dailyCount: [14, 56], bossCount: [4, 16] };
Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`The Quest Ledger config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`The Quest Ledger node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`The Quest Ledger template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  const node = { id, parentId, type, title, data: nodeData, children: [] };
  if (typeof options.referenceId === 'string') node.referenceId = options.referenceId;
  nodes[id] = node;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`The Quest Ledger parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const pad2 = (value) => String(value).padStart(2, '0');
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];

// Every bound field a template reads exists on every node of that type, so
// nothing ever prints as a raw {{placeholder}}.

const dailyData = (overrides = {}) => ({
  day_ordinal: '', date_line: '',
  daily_1: '', daily_2: '', daily_3: '',
  side_quest: '', day_total: '', daily_notes: '',
  day_prev_label: '', day_next_label: '',
  ...overrides,
});

const bossData = (overrides = {}) => ({
  big_goal: '',
  phase_1: '', phase_2: '', phase_3: '', phase_4: '',
  victory: '', loot: '', boss_notes: '',
  ...overrides,
});

// --- Root and rulebook -------------------------------------------------------

addNode('root', null, 'cover', 'The Quest Ledger', {});

addNode('start_here', 'root', 'start', 'The Rulebook', {
  example_label: '',
  skip_label: '',
});

// --- Worked example (EXAMPLE chrome lives here only) -------------------------
// One filled day and one filled boss from a clearly fictional personal
// campaign: an office worker training for a first marathon. The blank system's
// pages stay untouched - these are separate example nodes.

addNode('example_workspace', 'start_here', 'workspace', 'The Worked Example', {
  hero: 'One campaign, caught mid-stride – a training Tuesday scored to 35 XP, and the boss it serves: The Marathon, a first 42 km broken into four honest phases with two already struck through.',
  workspace_note: 'Everything on this bench is marked EXAMPLE. Your live campaign runs from Your Guild Hub.',
  slot_a_label: 'The worked day »',
  slot_b_label: 'The Marathon »',
  hub_character_label: '', hub_board_label: '', hub_daily_label: '',
  hub_ledger_label: '', hub_levels_label: '', hub_trophy_label: '',
}, { example: true });

addNode('example_daily', 'example_workspace', 'daily', 'A Tuesday in Training', dailyData({
  day_ordinal: '07',
  date_line: 'Tuesday 14 April – week two of marathon training',
  daily_1: 'Easy run – 5 km on the river path before work',
  daily_2: 'Ten minutes of stretching, hips and calves',
  daily_3: 'Lights out by half past ten',
  side_quest: 'Lay out tomorrow\'s running kit by the door',
  day_total: '35 XP · full clear',
  daily_notes: 'The run felt like lead until the river bend, then the legs remembered the job. All three dailies and the side quest kept – a full clear banks 35, and the ledger says the streak is now four days. The 22:30 quest only survived because the kit quest made the morning automatic.',
  day_prev_label: '',
  day_next_label: 'The Marathon »',
}), { example: true });

addNode('example_boss', 'example_workspace', 'boss', 'The Marathon', bossData({
  big_goal: 'Run my first marathon this autumn – the city course, upright at the finish',
  phase_1: 'Run 10 km without stopping',
  phase_2: 'Finish a half marathon on tired legs',
  phase_3: 'Complete the 30 km long run',
  phase_4: 'Honour the taper – two easy weeks, no hero workouts',
  victory: 'Cross the finish line of the autumn city marathon, whatever the clock says. The killing blow lands with the medal – 100 XP the moment it does.',
  loot: 'New trail shoes, and one whole Sunday of zero obligations.',
  boss_notes: 'Phases one and two are inked – 50 XP banked so far against this boss. The 30 km long run is circled on the calendar for the last Sunday of the month; the taper will be the hardest phase to keep, which is why it is written down.',
}), { example: true });

// --- Your Guild Hub (blank workspace) ----------------------------------------
// Child order is load-bearing for the page sequence: character sheet, the four
// skill trees, the quest board, the daily quest pages, the bosses, two XP
// ledgers, the level log, and the trophy hall. The character sheet's children
// are reference nodes to the trees and the first ledger; the quest board's
// children are reference nodes to every boss.

addNode('blank_workspace', 'start_here', 'workspace', 'Your Guild Hub', {
  example_label: '',
  skip_label: '',
  hero: `A character sheet over four skill trees, ${CONFIG.dailyCount} daily quest pages, a quest board mustering ${CONFIG.bossCount} bosses, two XP ledgers, the level log, and a trophy hall – every deed pre-priced and every page pre-linked.`,
  workspace_note: `This copy: ${CONFIG.dailyCount} daily pages and ${CONFIG.bossCount} bosses. Set dailyCount (14-56) and bossCount (4-16) in the generator config.`,
  slot_a_label: '',
  slot_b_label: '',
  hub_character_label: 'The character sheet »',
  hub_board_label: 'The quest board »',
  hub_daily_label: 'The daily quests »',
  hub_ledger_label: 'The XP ledger »',
  hub_levels_label: 'The level log »',
  hub_trophy_label: 'The trophy hall »',
});

addNode('character_sheet', 'blank_workspace', 'character', 'The Character Sheet', {
  sheet_link_1: 'The Health Tree »',
  sheet_link_2: 'The Mind Tree »',
  sheet_link_3: 'The Craft Tree »',
  sheet_link_4: 'The Social Tree »',
  sheet_link_5: 'The XP ledger »',
});

const TREES = [
  ['tree_health', 'The Health Tree', 'The body\'s branch – sleep, food, and sweat. Root skills are the ones you could keep on your worst week.'],
  ['tree_mind', 'The Mind Tree', 'The head\'s branch – reading, learning, and quiet. Grow it on minutes a day, not heroic weekends.'],
  ['tree_craft', 'The Craft Tree', 'The hands\' branch – the skills of your work and your making. Name what you practice, not what you admire.'],
  ['tree_social', 'The Social Tree', 'The heart\'s branch – the people you show up for. The cheapest skills here pay the deepest.'],
];

TREES.forEach(([id, title, note]) => {
  addNode(id, 'blank_workspace', 'skill_tree', title, { tree_note: note });
});

// The character sheet's chips: reference children to the four trees and the
// first XP ledger, bound to child_index 0-4 on the template.
TREES.forEach(([treeId, title], index) => {
  addNode(`cs_ref_${index + 1}`, 'character_sheet', 'skill_tree', `» ${title}`, {}, { referenceId: treeId });
});
// The reference node renders through the xp_ledger template during link
// validation, so its sibling chips must bind '' at the character sheet's edge.
addNode('cs_ref_5', 'character_sheet', 'xp_ledger', '» XP Ledger I', {
  ledger_prev_label: '',
  ledger_next_label: '',
}, { referenceId: 'xp_ledger_01' });

// The quest board and its roster of reference children, one per boss.
const boardData = { };
for (let n = 1; n <= 16; n += 1) {
  boardData[`board_${n}`] = n <= CONFIG.bossCount ? `Boss ${ROMAN[n - 1]} »` : '';
}
addNode('quest_board', 'blank_workspace', 'quest_board', 'The Quest Board', boardData);

for (let n = 1; n <= CONFIG.bossCount; n += 1) {
  addNode(`qb_ref_${pad2(n)}`, 'quest_board', 'boss', `» Boss ${ROMAN[n - 1]}`, {}, { referenceId: `boss_${pad2(n)}` });
}

// The daily quest pages, chained morning into morning; both true ends bind ''.
for (let n = 1; n <= CONFIG.dailyCount; n += 1) {
  addNode(`daily_${pad2(n)}`, 'blank_workspace', 'daily', `Day ${pad2(n)}`, dailyData({
    day_ordinal: pad2(n),
    day_prev_label: n > 1 ? `« Day ${pad2(n - 1)}` : '',
    day_next_label: n < CONFIG.dailyCount ? `Day ${pad2(n + 1)} »` : '',
  }));
}

// The bosses - blank battle pages the player names from the quest board.
for (let n = 1; n <= CONFIG.bossCount; n += 1) {
  addNode(`boss_${pad2(n)}`, 'blank_workspace', 'boss', `Boss ${ROMAN[n - 1]}`, bossData());
}

// Two XP ledgers, the level log, and the trophy hall.
addNode('xp_ledger_01', 'blank_workspace', 'xp_ledger', 'XP Ledger I', {
  ledger_prev_label: '',
  ledger_next_label: 'XP Ledger II »',
});

addNode('xp_ledger_02', 'blank_workspace', 'xp_ledger', 'XP Ledger II', {
  ledger_prev_label: '« XP Ledger I',
  ledger_next_label: '',
});

addNode('level_log_01', 'blank_workspace', 'level_log', 'The Level Log', {});

addNode('trophy_01', 'blank_workspace', 'trophy', 'The Trophy Hall', {});

return { nodes, rootId: 'root' };
