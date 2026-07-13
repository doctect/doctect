const DEFAULT_CONFIG = {
  partySize: 5,
  sessionCount: 16,
  questCount: 12,
  npcCount: 20,
  locationCount: 12,
  factionCount: 8,
  encounterCount: 12,
  loreCount: 8,
};
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = {
  partySize: [1, 8],
  sessionCount: [1, 32],
  questCount: [1, 24],
  npcCount: [1, 32],
  locationCount: [1, 24],
  factionCount: [1, 16],
  encounterCount: [1, 24],
  loreCount: [1, 16],
};

Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Campaign Codex config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Campaign Codex node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Campaign Codex template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  nodes[id] = { id, parentId, type, title, data: nodeData, children: [] };
  if (options.referenceId) nodes[id].referenceId = options.referenceId;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Campaign Codex parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const campaignData = (values = {}) => ({
  subtitle: 'Hold campaign promise, table agreements, calendar, and the active arc in one place.',
  menu_label: 'CAMPAIGN CHARTER',
  premise: '',
  tone: '',
  safety: '',
  arc: '',
  calendar: '',
  notes: '',
  ...values,
});

const partyData = (values = {}) => ({
  subtitle: 'Track shared purpose and resources, then open each adventurer record.',
  menu_label: 'PARTY',
  group_goal: '',
  resources: '',
  notes: '',
  ...values,
});

const characterData = (number, values = {}) => ({
  subtitle: 'A table-facing adventurer record for identity, hooks, bonds, and useful capabilities.',
  menu_label: `ADVENTURER ${String(number).padStart(2, '0')}`,
  player: '',
  ancestry_class: '',
  level: '',
  hooks: '',
  bonds: '',
  abilities: '',
  notes: '',
  ...values,
});

const sessionData = (number, values = {}) => ({
  subtitle: `Session ${String(number).padStart(2, '0')} | Prepare pressure, record choices, and carry consequences forward.`,
  menu_label: `SESSION ${String(number).padStart(2, '0')}`,
  date: '',
  recap: '',
  opening: '',
  beats: '',
  decisions: '',
  consequence: '',
  outcome: '',
  next_steps: '',
  ...values,
});

const questData = (number, values = {}) => ({
  subtitle: 'Make status, objective, stakes, clues, opposition, and resolution visible at a glance.',
  menu_label: `QUEST ${String(number).padStart(2, '0')}`,
  status: '',
  patron: '',
  objective: '',
  stakes: '',
  clues: '',
  obstacles: '',
  progress: '',
  outcome: '',
  notes: '',
  ...values,
});

const npcData = (number, values = {}) => ({
  subtitle: 'Run a person from desire, leverage, voice, relationships, and concealed pressure.',
  menu_label: `NPC ${String(number).padStart(2, '0')}`,
  role: '',
  demeanor: '',
  desire: '',
  leverage: '',
  voice: '',
  relationship: '',
  secrets: '',
  notes: '',
  ...values,
});

const locationData = (number, values = {}) => ({
  subtitle: 'Build a playable place from atmosphere, features, hazards, routes, and discoveries.',
  menu_label: `LOCATION ${String(number).padStart(2, '0')}`,
  region: '',
  atmosphere: '',
  features: '',
  hazards: '',
  routes: '',
  discoveries: '',
  notes: '',
  ...values,
});

const factionData = (number, values = {}) => ({
  subtitle: 'Track standing from hostile to allied, then connect agenda, resources, and consequences.',
  menu_label: `FACTION ${String(number).padStart(2, '0')}`,
  reputation: '',
  agenda: '',
  resources: '',
  pressure: '',
  consequence: '',
  notes: '',
  ...values,
});

const encounterData = (number, values = {}) => ({
  subtitle: 'Lead with objectives and terrain; prepare adversaries, stakes, and aftermath without scripting outcomes.',
  menu_label: `ENCOUNTER ${String(number).padStart(2, '0')}`,
  objective: '',
  setup: '',
  environment: '',
  adversaries: '',
  stakes: '',
  aftermath: '',
  notes: '',
  ...values,
});

const loreData = (number, values = {}) => ({
  subtitle: 'Separate world truth from who knows it, its evidence, and its play-facing implications.',
  menu_label: `LORE ${String(number).padStart(2, '0')}`,
  category: '',
  truth: '',
  known_by: '',
  evidence: '',
  implications: '',
  notes: '',
  ...values,
});

const bankData = (label, count, note, values = {}) => ({
  subtitle: `${count} ${label.toLowerCase()} record${count === 1 ? '' : 's'} in this bank.`,
  menu_label: `${label} / ${count}`,
  bank_note: note,
  ...values,
});

const addReference = (id, sessionId, targetId, menuLabel) => addNode(
  id,
  sessionId,
  nodes[targetId].type,
  nodes[targetId].title,
  {
    subtitle: 'Referenced canonical campaign record. Open it without creating another exported page.',
    menu_label: menuLabel,
  },
  { example: true, referenceId: targetId },
);

addNode('root', null, 'cover', 'The Wayfarer Codex', {});
addNode('start_here', 'root', 'start', 'Start Here', {
  example_label: 'START HERE',
  skip_label: 'Skip to blank workspace →',
  subtitle: 'Explore the Ashen Bell adventure or open clean campaign, session, and world-building banks.',
});

addNode('example_workspace', 'start_here', 'workspace', 'The Ashen Bell', {
  subtitle: 'A compact guided adventure showing one session connected to canonical campaign records.',
  workspace_mode: 'GUIDED ADVENTURE CODEX',
  hero: 'At Briar Watch, a bell buried beneath an abandoned road rings without sound. The party must choose whether to wake the wardens who once silenced it.',
  workspace_note: 'Teaching fiction only. The session links to one quest, NPC, location, faction consequence, and encounter through reference nodes; canonical records export once.',
}, { example: true });

addNode('example_campaign', 'example_workspace', 'campaign', 'Campaign Charter | Roads Remember', campaignData({
  premise: 'Wayfarers repair old routes while deciding which forgotten powers deserve to return.',
  tone: 'Folkloric mystery, difficult promises, hopeful repair, travel under changing weather.',
  safety: 'Lines: harm to children, sexual violence. Veils: graphic injury. Pause card and open-door policy active.',
  arc: 'The Ashen Bell tests whether the Greenwardens protect the roads or merely control their history.',
  calendar: 'Late harvest / first frost in nine days / roads close after the third storm.',
  notes: 'System-neutral example. Resolve uncertainty using the rules and safety tools chosen by the table.',
}), { example: true });

addNode('example_party', 'example_workspace', 'party', 'Party | Lantern Company', partyData({
  menu_label: 'PARTY / 3',
  group_goal: 'Restore safe passage between the hill settlements before first frost.',
  resources: 'Moss lantern, survey map, two favors in Alder Market, one exhausted pack mule.',
  notes: 'Shared bond: each member owes Briar Watch one honest answer.',
}), { example: true });
addNode('example_character_01', 'example_party', 'character', 'Tamsin Reed | Trailwarden', characterData(1, {
  menu_label: 'TAMSIN / WARDEN',
  player: 'Example player A',
  ancestry_class: 'Human / trailwarden',
  level: 'Seasoned',
  hooks: 'Mapped the road before it vanished from every official chart.',
  bonds: 'Trusts Iora Vale; doubts the Greenwardens who trained them both.',
  abilities: 'Pathfinding, patient observation, old boundary signs.',
  notes: 'Carries the only map showing a route beneath Briar Watch.',
}), { example: true });
addNode('example_character_02', 'example_party', 'character', 'Orin Moss | Bellwright', characterData(2, {
  menu_label: 'ORIN / BELLWRIGHT',
  player: 'Example player B',
  ancestry_class: 'Dwarf / bellwright',
  level: 'Seasoned',
  hooks: 'Recognizes the silent bell as work from a disgraced foundry.',
  bonds: 'Promised Tamsin not to ring another untested bell.',
  abilities: 'Resonance craft, stonework, precise tools.',
  notes: 'Can damp the bell, break it, or tune it; each choice changes the road.',
}), { example: true });
addNode('example_character_03', 'example_party', 'character', 'Sable Fen | Hedge Seer', characterData(3, {
  menu_label: 'SABLE / SEER',
  player: 'Example player C',
  ancestry_class: 'Halfling / hedge seer',
  level: 'Seasoned',
  hooks: 'Dreams of travelers walking the buried road backward.',
  bonds: 'Owes Iora a true prophecy and fears this may be it.',
  abilities: 'Read omens, calm spirits, bargain with roadside things.',
  notes: 'The bell answers Sable with images rather than sound.',
}), { example: true });

addNode('example_session_bank', 'example_workspace', 'bank', 'Session Ledger', bankData(
  'SESSIONS', 1, 'Open the demonstration session; its linked records remain canonical elsewhere in the codex.',
), { example: true });
addNode('example_session_01', 'example_session_bank', 'session', 'Session 01 | The Bell Below', sessionData(1, {
  menu_label: 'S01 / BELL BELOW',
  date: 'Late harvest / dusk to first watch',
  recap: 'The Lantern Company follows a route visible only where moss grows across old mile stones.',
  opening: 'Briar Watch stands empty. A vibration moves through every metal object, though no sound is heard.',
  beats: 'Meet Iora at the sealed gate. Read the vanished route. Descend into the bell vault. Choose who controls the ward.',
  decisions: "The party shares the map with Iora but withholds Orin's ability to retune the bell.",
  consequence: 'Greenwardens lose authority if the party opens the route; gain leverage if given the bell intact.',
  outcome: 'The bell is damped, not destroyed. One buried mile of road wakes beyond Briar Watch.',
  next_steps: 'Ask who walked the waking road. Update Greenwarden reputation. Mark the northern mile as unstable.',
}), { example: true });

addNode('example_quest_bank', 'example_workspace', 'bank', 'Quest Register', bankData(
  'QUESTS', 1, 'Quest status stays visible from rumor through resolution.',
), { example: true });
addNode('example_quest_ashen_bell', 'example_quest_bank', 'quest', 'Quest | Silence the Ashen Bell', questData(1, {
  menu_label: 'QUEST / ASHEN BELL',
  status: 'ACTIVE / clock 2 of 4',
  patron: 'Iora Vale, Greenwarden outrider',
  objective: 'Reach the bell vault and stop its ward from waking the buried road uncontrolled.',
  stakes: 'Briar Watch may collapse; travelers may return altered; the Greenwardens may seize the route.',
  clues: 'Moss follows erased milestones. Iron vibrates near true doors. The ward responds to remembered names.',
  obstacles: 'Collapsed switchback, divided Greenwarden orders, echo sentinels in the vault.',
  progress: 'Gate opened / route read / vault entered / final tuning unresolved.',
  outcome: 'Bell damped; one mile wakes; authority over the route remains contested.',
  notes: 'Advance the clock when the party forces passage or leaves a ward unanswered.',
}), { example: true });

addNode('example_npc_bank', 'example_workspace', 'bank', 'People & Powers', bankData(
  'NPCS', 1, 'Run the patron as a person with divided duties, not a delivery mechanism for the quest.',
), { example: true });
addNode('example_npc_iora_vale', 'example_npc_bank', 'npc', 'Iora Vale | Greenwarden Outrider', npcData(1, {
  menu_label: 'IORA VALE / OUTRIDER',
  role: 'Patron, witness, and Greenwarden field officer',
  demeanor: 'Careful courtesy; stands where every exit remains visible.',
  desire: 'Keep Briar Watch stable without handing the bell to her superiors.',
  leverage: 'Knows the gate oath and can delay the Greenwarden recovery party.',
  voice: 'Names costs before requests. Never calls the buried route a road.',
  relationship: 'Former route apprentice beside Tamsin; unresolved trust after the maps were burned.',
  secrets: 'Iora rang the bell once as a child and remembers a traveler returning from nowhere.',
  notes: 'If respected, she accepts shared stewardship. If cornered, she signals the faction.',
}), { example: true });

addNode('example_location_bank', 'example_workspace', 'bank', 'Atlas of Roads', bankData(
  'LOCATIONS', 1, 'Record routes and discoveries alongside atmosphere so the place remains playable.',
), { example: true });
addNode('example_location_briar_watch', 'example_location_bank', 'location', 'Briar Watch | Buried Mile', locationData(1, {
  menu_label: 'BRIAR WATCH',
  region: 'North road / alder hills / Greenwarden boundary',
  atmosphere: 'Wet stone, ash-colored moss, metal trembling at the edge of hearing.',
  features: 'Empty watchtower, oath gate, switchback stair, circular bell vault.',
  hazards: "False paths repeat a traveler's last choice. Loose vault stones answer vibration.",
  routes: 'Surface road east. Erased switchback below. Waking mile runs north under the hill.',
  discoveries: "Old ward marks name travelers, not monsters. One mark matches Iora's memory.",
  notes: 'After the session, mark northern route unstable and add one visible milestone.',
}), { example: true });

addNode('example_faction_bank', 'example_workspace', 'bank', 'Faction Ledger', bankData(
  'FACTIONS', 1, 'Reputation records standing while consequences show what changed it.',
), { example: true });
addNode('example_faction_greenwardens', 'example_faction_bank', 'faction', 'Greenwardens | Keepers of Closed Roads', factionData(1, {
  menu_label: 'GREENWARDENS',
  reputation: '-1 / WARY',
  agenda: 'Control reopened routes until their histories and dangers are catalogued.',
  resources: 'Outriders, gate oaths, road archives, authority in four hill settlements.',
  pressure: 'Recovery party reaches Briar Watch at next dawn.',
  consequence: 'Bell surrendered: +1 standing, route closes. Route shared: no change. Route claimed publicly: -1 standing.',
  notes: 'Iora can become an internal ally even while faction standing falls.',
}), { example: true });

addNode('example_encounter_bank', 'example_workspace', 'bank', 'Encounter Folio', bankData(
  'ENCOUNTERS', 1, 'Objectives and environment come before adversary statistics.',
), { example: true });
addNode('example_encounter_bell_vault', 'example_encounter_bank', 'encounter', 'Encounter | The Resonant Vault', encounterData(1, {
  menu_label: 'BELL VAULT',
  objective: 'Damp, retune, or break the bell before the ward clock fills.',
  setup: 'Begin when a metal tool touches the stair rail. Clock starts at 1 of 4.',
  environment: 'Round vault, hanging bell, four cracked braces, flooded ring channel, unstable ceiling.',
  adversaries: "Three echo sentinels repeat the party's previous actions; the ward itself alters routes.",
  stakes: 'Each loud impact advances collapse. Each answered memory opens a safer approach.',
  aftermath: 'Record bell state, route state, injuries, Greenwarden standing, and who heard the first waking mile.',
  notes: 'Sentinels can be redirected by changing intent, not only defeated by force.',
}), { example: true });

addNode('example_lore_bank', 'example_workspace', 'bank', 'Lore Archive', bankData(
  'LORE', 1, 'Keep setting truth separate from evidence available to characters.',
), { example: true });
addNode('example_lore_buried_roads', 'example_lore_bank', 'lore', 'Lore | Roads That Remember', loreData(1, {
  menu_label: 'REMEMBERING ROADS',
  category: 'Old roads / wards / disputed history',
  truth: 'Some roads were not destroyed; bells folded them outside ordinary travel.',
  known_by: 'Senior Greenwardens, two bellwright families, and travelers who returned changed.',
  evidence: 'Erased milestones gather moss. Ward marks list names. Bells react to remembered routes.',
  implications: 'Reopening a road restores passage and also whatever obligations traveled along it.',
  notes: 'Reveal truth through route behavior and testimony, never as an unsupported lecture.',
}), { example: true });

addReference('example_session_quest_ref', 'example_session_01', 'example_quest_ashen_bell', 'QUEST / ASHEN BELL');
addReference('example_session_npc_ref', 'example_session_01', 'example_npc_iora_vale', 'NPC / IORA VALE');
addReference('example_session_location_ref', 'example_session_01', 'example_location_briar_watch', 'LOCATION / BRIAR WATCH');
addReference('example_session_faction_ref', 'example_session_01', 'example_faction_greenwardens', 'FACTION / CONSEQUENCE');
addReference('example_session_encounter_ref', 'example_session_01', 'example_encounter_bell_vault', 'ENCOUNTER / BELL VAULT');

addNode('blank_workspace', 'start_here', 'workspace', 'My Campaign Codex', {
  subtitle: 'Clean configurable campaign banks with no sample characters, events, places, or outcomes.',
  workspace_mode: 'BLANK CAMPAIGN WORKSPACE',
  hero: 'Establish the campaign charter and party, prepare sessions, then grow quests, people, places, factions, encounters, and lore as play creates them.',
  workspace_note: 'All writable fields below are empty. Every bank remains complete and directly navigable at supported maximum counts.',
});
addNode('blank_campaign', 'blank_workspace', 'campaign', 'Campaign Charter', campaignData());
addNode('blank_party', 'blank_workspace', 'party', 'Party Ledger', partyData({
  menu_label: `PARTY / ${CONFIG.partySize}`,
  subtitle: `${CONFIG.partySize} clean adventurer records plus shared goals, resources, and notes.`,
}));
for (let number = 1; number <= CONFIG.partySize; number += 1) {
  const label = String(number).padStart(2, '0');
  addNode(`blank_character_${label}`, 'blank_party', 'character', `Adventurer ${label}`, characterData(number));
}

const blankBanks = [
  ['session', 'SESSIONS', CONFIG.sessionCount, 'session', sessionData, 'Prepare and preserve one consequential record per play session.'],
  ['quest', 'QUESTS', CONFIG.questCount, 'quest', questData, 'Track status and outcomes without scattering quest facts through session notes.'],
  ['npc', 'NPCS', CONFIG.npcCount, 'npc', npcData, 'Keep reusable people canonical, playable, and easy to retrieve.'],
  ['location', 'LOCATIONS', CONFIG.locationCount, 'location', locationData, 'Build places around routes, hazards, discoveries, and sensory identity.'],
  ['faction', 'FACTIONS', CONFIG.factionCount, 'faction', factionData, 'Track reputation and consequences alongside faction agendas.'],
  ['encounter', 'ENCOUNTERS', CONFIG.encounterCount, 'encounter', encounterData, 'Prepare objective, environment, adversaries, and aftermath.'],
  ['lore', 'LORE', CONFIG.loreCount, 'lore', loreData, 'Separate world truth, knowledge, evidence, and implications.'],
];

blankBanks.forEach(([key, label, count, type, dataFactory, note]) => {
  const bankId = `blank_${key}_bank`;
  addNode(bankId, 'blank_workspace', 'bank', `${label[0]}${label.slice(1).toLowerCase()} Bank`, bankData(label, count, note));
  for (let number = 1; number <= count; number += 1) {
    const numberLabel = String(number).padStart(2, '0');
    addNode(`blank_${key}_${numberLabel}`, bankId, type, `${label[0]}${label.slice(1).toLowerCase()} ${numberLabel}`, dataFactory(number));
  }
});

return { nodes, rootId: 'root' };
