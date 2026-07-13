const DEFAULT_CONFIG = {
  actCount: 3,
  chaptersPerAct: 8,
  scenesPerChapter: 3,
  characterCount: 12,
  locationCount: 8,
};
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = {
  actCount: [1, 5],
  chaptersPerAct: [1, 12],
  scenesPerChapter: [1, 6],
  characterCount: [1, 30],
  locationCount: [1, 20],
};

Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Story Atelier config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Story Atelier node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Story Atelier template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  nodes[id] = { id, parentId, type, title, data: nodeData, children: [] };
  if (options.referenceId) nodes[id].referenceId = options.referenceId;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Story Atelier parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const premiseData = (values = {}) => ({
  subtitle: 'Name the dramatic promise before building pages around it.',
  menu_label: 'PREMISE',
  logline: '',
  promise: '',
  stakes: '',
  question: '',
  notes: '',
  ...values,
});

const structureData = (actNumber, values = {}) => ({
  subtitle: `Act ${String(actNumber).padStart(2, '0')} | Track pressure, turn, climax, and changed state.`,
  menu_label: `ACT ${String(actNumber).padStart(2, '0')} STRUCTURE`,
  opening: '',
  turn: '',
  crisis: '',
  climax: '',
  resolution: '',
  notes: '',
  ...values,
});

const characterData = (number, values = {}) => {
  const label = String(number).padStart(2, '0');
  return {
    subtitle: 'Desire, contradiction, voice, and scene-ready detail.',
    menu_label: `CHARACTER ${label}`,
    link_label: `${label}  __________________`,
    role: '',
    want: '',
    need: '',
    secret: '',
    voice: '',
    appearance: '',
    history: '',
    notes: '',
    ...values,
  };
};

const locationData = (number, values = {}) => {
  const label = String(number).padStart(2, '0');
  return {
    subtitle: 'A place as pressure system, social space, and continuity anchor.',
    menu_label: `LOCATION ${label}`,
    link_label: `${label}  __________________`,
    sensory: '',
    function: '',
    change: '',
    history: '',
    notes: '',
    ...values,
  };
};

const chapterMapData = (actNumber, values = {}) => ({
  subtitle: `Act ${String(actNumber).padStart(2, '0')} | Open every chapter directly from one bounded map.`,
  menu_label: `ACT ${String(actNumber).padStart(2, '0')} CHAPTER MAP`,
  notes: '',
  ...values,
});

const chapterData = (actNumber, chapterNumber, values = {}) => ({
  subtitle: `Act ${String(actNumber).padStart(2, '0')} / Chapter ${String(chapterNumber).padStart(2, '0')} | Assemble scenes around one chapter turn.`,
  menu_label: `CHAPTER ${String(chapterNumber).padStart(2, '0')}`,
  goal: '',
  beat_1: '',
  beat_2: '',
  beat_3: '',
  outcome: '',
  notes: '',
  ...values,
});

const sceneData = (sceneNumber, values = {}) => ({
  subtitle: `Scene ${String(sceneNumber).padStart(2, '0')} | Goal meets conflict and leaves a changed condition.`,
  menu_label: `SCENE ${String(sceneNumber).padStart(2, '0')}`,
  goal: '',
  conflict: '',
  outcome: '',
  pov: '',
  setting: '',
  story_time: '',
  continuity: '',
  ...values,
});

const continuityData = (values = {}) => ({
  subtitle: 'Audit sequence, knowledge, objects, appearance, setting, and movement.',
  menu_label: 'CONTINUITY',
  check_1: '',
  check_2: '',
  check_3: '',
  check_4: '',
  notes: '',
  ...values,
});

const revisionData = (passNumber, values = {}) => ({
  subtitle: `Pass ${String(passNumber).padStart(2, '0')} | Read with one lens, record findings, then define actions.`,
  menu_label: `REVISION ${String(passNumber).padStart(2, '0')}`,
  pass_goal: '',
  findings: '',
  actions: '',
  ...values,
});

const addSceneLinks = (sceneId, linksId, characterBankId, locationBankId, sceneNumber, example = false) => {
  addNode(linksId, sceneId, 'scene_links', `Scene ${String(sceneNumber).padStart(2, '0')} | Cast & Places`, {
    subtitle: 'Write the names used in this scene. Every slot already links to its canonical story-bible record.',
    menu_label: 'CAST & PLACES',
  }, { example });

  addNode(`${linksId}_characters`, linksId, 'bank', 'Character Links', {
    menu_label: 'CHARACTERS',
  }, { example, referenceId: characterBankId });

  addNode(`${linksId}_locations`, linksId, 'bank', 'Location Links', {
    menu_label: 'LOCATIONS',
  }, { example, referenceId: locationBankId });
};

addNode('root', null, 'cover', 'Story Atelier', {});
addNode('start_here', 'root', 'start', 'Start Here', {
  example_label: 'START HERE',
  skip_label: 'Skip to blank workspace →',
  subtitle: 'Choose a guided railway mystery or open a clean, configurable novel studio.',
});

addNode('example_workspace', 'start_here', 'workspace', 'The Missing Seven Minutes', {
  subtitle: 'A short fictional mystery showing story-bible records threaded into a three-scene chapter.',
  workspace_mode: 'GUIDED MYSTERY WORKSPACE',
  hero: 'A detective checks a railway ledger, questions one witness, and discovers that an apparent delay was deliberately removed from the station record.',
  workspace_note: 'Every page in this branch is teaching fiction. Scene cards link to canonical character and location records through references.',
}, { example: true });

addNode('example_premise', 'example_workspace', 'premise', 'Premise | The Missing Seven Minutes', premiseData({
  logline: 'When seven minutes vanish from a station ledger, a precise detective must prove the delay was staged before the last train carries away the only witness.',
  promise: 'A contained railway mystery solved through timing, observation, and one physical thread of evidence.',
  stakes: 'A porter will be blamed; the witness will disappear; the altered record becomes official by midnight.',
  question: 'Who removed the delay, and what passed across the platform during those missing minutes?',
  notes: 'Quiet procedural tension. No graphic violence. Resolution must emerge from planted scene evidence.',
}), { example: true });

addNode('example_structure', 'example_workspace', 'structure', 'Act I | A Gap in the Ledger', structureData(1, {
  opening: 'Mara Venn audits the final arrivals after a locked-bag complaint.',
  turn: 'The platform clock and handwritten ledger disagree by seven minutes.',
  crisis: 'Witness Elian Rowe retracts his first account as the last train approaches.',
  climax: 'Mara reconstructs the platform crossing from a snagged signal thread.',
  resolution: 'The porter is cleared; the altered ledger is preserved as evidence.',
  notes: 'Chapter 01 carries this miniature arc in three linked scenes.',
}), { example: true });

addNode('example_character_bank', 'example_workspace', 'bank', 'Character Files', {
  subtitle: 'Canonical character records referenced from scene cards.',
  menu_label: 'CHARACTERS / 2',
  bank_note: 'Open Mara Venn or Elian Rowe. Scene references return to these records rather than duplicating facts.',
}, { example: true });
addNode('example_character_detective', 'example_character_bank', 'character', 'Mara Venn | Detective', characterData(1, {
  menu_label: 'MARA VENN / DETECTIVE',
  link_label: '01  MARA VENN',
  role: 'Railway investigator / point-of-view detective',
  want: 'A complete account before the midnight record closes.',
  need: 'Trust observed behavior without forcing it into her first theory.',
  secret: 'She once approved a timetable correction that concealed negligence.',
  voice: 'Short questions; exact times; notices verbs people avoid.',
  appearance: 'Ink-smudged thumb, brass watch, rain-dark coat hem.',
  history: 'Former timetable clerk. Learns to treat the witness as collaborator, not variable.',
  notes: 'Carries ledger copy from Scene 01 through Scene 03.',
}), { example: true });
addNode('example_character_witness', 'example_character_bank', 'character', 'Elian Rowe | Witness', characterData(2, {
  menu_label: 'ELIAN ROWE / WITNESS',
  link_label: '02  ELIAN ROWE',
  role: 'Tea-stall assistant / reluctant witness',
  want: 'Board the last train without involving his employer.',
  need: 'Name what he saw rather than protect himself with silence.',
  secret: 'He moved a dropped dispatch pouch away from the track edge.',
  voice: 'Answers around nouns; remembers sound and color before time.',
  appearance: 'Gold thread caught on cuff; steam-reddened hands.',
  history: 'Knows platform habits. Chooses a precise statement when Mara shows the ledger gap.',
  notes: 'Thread on cuff matches signal bunting, not the missing pouch.',
}), { example: true });

addNode('example_location_bank', 'example_workspace', 'bank', 'Location Files', {
  subtitle: 'Canonical setting records referenced from scene cards.',
  menu_label: 'LOCATIONS / 1',
  bank_note: 'The platform record anchors clock position, sightlines, weather, movement, and physical evidence.',
}, { example: true });
addNode('example_location_platform', 'example_location_bank', 'location', 'Northbridge Railway Platform', locationData(1, {
  menu_label: 'NORTHBRIDGE PLATFORM',
  link_label: '01  NORTHBRIDGE PLATFORM',
  sensory: 'Coal rain, cooling iron, tea steam, signal bell, wet gold bunting thread.',
  function: 'A public space whose clocks and sightlines appear objective but can be manipulated.',
  change: 'Crowd thins from arrival rush to one last-train queue; rain exposes fresh footprints.',
  history: 'Old platform clock runs from a separate mechanism; clerks manually reconcile it with dispatch time.',
  notes: 'Clock above east arch. Waiting room faces Track 2. Signal bunting frays beside porter gate.',
}), { example: true });

addNode('example_chapter_map', 'example_workspace', 'chapter_map', 'Act I | Chapter Map', chapterMapData(1, {
  menu_label: 'CHAPTER MAP / ACT I',
  notes: 'One demonstration chapter: discover discrepancy, test witness account, reconstruct missing interval.',
}), { example: true });
addNode('example_chapter_01', 'example_chapter_map', 'chapter', 'Chapter 01 | The Missing Seven Minutes', chapterData(1, 1, {
  menu_label: 'CHAPTER 01 / SEVEN MINUTES',
  goal: 'Turn an administrative discrepancy into a physical, testable mystery.',
  beat_1: 'Ledger and platform clock disagree.',
  beat_2: 'Witness account contradicts official timing.',
  beat_3: 'Thread and last-train movement expose the staged delay.',
  outcome: 'Mara preserves the altered ledger and clears the porter.',
  notes: 'POV remains Mara. Rain strengthens. Last train advances from twenty-two to two minutes away.',
}), { example: true });

addNode('example_scene_01', 'example_chapter_01', 'scene', 'Scene 01 | The Clock Disagrees', sceneData(1, {
  menu_label: 'SCENE 01 / CLOCK',
  goal: 'Verify the final arrival ledger against the platform clock.',
  conflict: 'The clerk insists the clock lost time, but its sealed mechanism contradicts him.',
  outcome: 'Mara isolates the missing seven minutes and marks the porter gate as the only unseen route.',
  pov: 'Mara Venn / detective',
  setting: 'Northbridge railway platform',
  story_time: '23:18 / rain beginning',
  continuity: 'IN: dry ledger copy. OUT: circled gap; damp coat; last train in 22 minutes.',
}), { example: true });
addSceneLinks('example_scene_01', 'example_scene_01_links', 'example_character_bank', 'example_location_bank', 1, true);
addNode('example_scene_02', 'example_chapter_01', 'scene', 'Scene 02 | The Witness Revises', sceneData(2, {
  menu_label: 'SCENE 02 / WITNESS',
  goal: 'Get the witness to place movement inside the missing interval.',
  conflict: 'Elian contradicts his first timing and refuses to identify the figure by the porter gate.',
  outcome: 'He admits moving the pouch and recalls gold thread snagging after the porter had already left.',
  pov: 'Mara Venn / detective',
  setting: 'Platform waiting room',
  story_time: '23:28 / steady rain',
  continuity: 'IN: last train in 12 minutes. OUT: witness cuff thread; porter excluded from timing.',
}), { example: true });
addSceneLinks('example_scene_02', 'example_scene_02_links', 'example_character_bank', 'example_location_bank', 2, true);
addNode('example_scene_03', 'example_chapter_01', 'scene', 'Scene 03 | The Threaded Route', sceneData(3, {
  menu_label: 'SCENE 03 / ROUTE',
  goal: 'Reconstruct who crossed the platform during the erased interval.',
  conflict: 'The last train is arriving and the remaining suspect moves toward its rear carriage.',
  outcome: 'A signal thread maps the gate crossing; Mara stops the altered ledger leaving with its author.',
  pov: 'Mara Venn / detective',
  setting: 'Northbridge railway platform',
  story_time: '23:38 / train entering',
  continuity: 'IN: wet thread on cuff. OUT: thread matched to bunting; ledger sealed; witness remains.',
}), { example: true });
addSceneLinks('example_scene_03', 'example_scene_03_links', 'example_character_bank', 'example_location_bank', 3, true);

addNode('example_continuity', 'example_workspace', 'continuity', 'Continuity | Chapter 01', continuityData({
  check_1: '23:18 -> 23:28 -> 23:38. Last train countdown: 22 -> 12 -> 2 minutes.',
  check_2: 'Mara learns ledger gap in Scene 01, porter exclusion in Scene 02, thread route in Scene 03.',
  check_3: 'Ledger copy becomes damp. Gold thread moves from cuff observation to matched evidence.',
  check_4: 'Platform -> waiting room -> platform. Rain increases; crowd thins; train enters Track 2.',
  notes: 'Check that Elian cannot see the east arch clock from the waiting-room bench.',
}), { example: true });

[
  ['Structure', 'Does each scene turn pressure and change the available explanation?', 'Scene 02 risks repeating discovery.', 'Make witness admission exclude porter and introduce thread route.'],
  ['Character', 'Does Mara change method while Elian makes a consequential choice?', 'Mara begins too certain; Elian lacks agency at exit.', 'Let Mara ask sensory rather than timing questions; Elian chooses to remain.'],
  ['Continuity', 'Do time, weather, objects, knowledge, and movement remain exact?', 'Waiting-room clock sightline is ambiguous.', 'State blocked sightline and carry damp ledger through Scene 03.'],
  ['Line', 'Can prose gain precision, rhythm, and railway texture without clutter?', 'Several timing explanations are abstract.', 'Replace summaries with clock face, bell, thread, and train movement.'],
].forEach(([focus, goal, findings, actions], index) => {
  const pass = index + 1;
  addNode(`example_revision_${String(pass).padStart(2, '0')}`, 'example_workspace', 'revision', `Revision ${String(pass).padStart(2, '0')} | ${focus}`, revisionData(pass, {
    pass_goal: goal,
    findings,
    actions,
  }), { example: true });
});

addNode('blank_workspace', 'start_here', 'workspace', 'My Story Atelier', {
  example_label: '',
  skip_label: '',
  subtitle: 'A clean three-act default with configurable chapters, scenes, characters, and locations.',
  workspace_mode: 'BLANK WORKSPACE',
  hero: 'Begin with premise and structure. Build canonical story-bible records, map chapters, shape every scene, then audit continuity and revise in focused passes.',
  workspace_note: 'No sample plot, character, setting, scene, continuity, or revision text appears below.',
});

addNode('blank_premise', 'blank_workspace', 'premise', 'Premise', premiseData());

for (let actNumber = 1; actNumber <= CONFIG.actCount; actNumber += 1) {
  const actLabel = String(actNumber).padStart(2, '0');
  addNode(`blank_structure_${actLabel}`, 'blank_workspace', 'structure', `Act ${actLabel} | Structure`, structureData(actNumber));
}

addNode('blank_character_bank', 'blank_workspace', 'bank', 'Character Bank', {
  subtitle: `${CONFIG.characterCount} clean canonical character records.`,
  menu_label: `CHARACTERS / ${CONFIG.characterCount}`,
  bank_note: 'Open every record directly. Use scene references to connect canonical character facts without copying them.',
});
for (let characterNumber = 1; characterNumber <= CONFIG.characterCount; characterNumber += 1) {
  const label = String(characterNumber).padStart(2, '0');
  addNode(`blank_character_${label}`, 'blank_character_bank', 'character', `Character ${label}`, characterData(characterNumber));
}

addNode('blank_location_bank', 'blank_workspace', 'bank', 'Location Bank', {
  subtitle: `${CONFIG.locationCount} clean canonical location records.`,
  menu_label: `LOCATIONS / ${CONFIG.locationCount}`,
  bank_note: 'Track sensory identity, dramatic function, movement, and continuity anchors in one record per place.',
});
for (let locationNumber = 1; locationNumber <= CONFIG.locationCount; locationNumber += 1) {
  const label = String(locationNumber).padStart(2, '0');
  addNode(`blank_location_${label}`, 'blank_location_bank', 'location', `Location ${label}`, locationData(locationNumber));
}

for (let actNumber = 1; actNumber <= CONFIG.actCount; actNumber += 1) {
  const actLabel = String(actNumber).padStart(2, '0');
  const mapId = `blank_chapter_map_${actLabel}`;
  addNode(mapId, 'blank_workspace', 'chapter_map', `Act ${actLabel} | Chapter Map`, chapterMapData(actNumber));
  for (let chapterNumber = 1; chapterNumber <= CONFIG.chaptersPerAct; chapterNumber += 1) {
    const chapterLabel = String(chapterNumber).padStart(2, '0');
    const chapterId = `blank_chapter_${actLabel}_${chapterLabel}`;
    addNode(chapterId, mapId, 'chapter', `Act ${actLabel} | Chapter ${chapterLabel}`, chapterData(actNumber, chapterNumber));
    for (let sceneNumber = 1; sceneNumber <= CONFIG.scenesPerChapter; sceneNumber += 1) {
      const sceneLabel = String(sceneNumber).padStart(2, '0');
      const sceneId = `blank_scene_${actLabel}_${chapterLabel}_${sceneLabel}`;
      addNode(
        sceneId,
        chapterId,
        'scene',
        `Act ${actLabel} | Chapter ${chapterLabel} | Scene ${sceneLabel}`,
        sceneData(sceneNumber),
      );
      addSceneLinks(
        sceneId,
        `${sceneId}_links`,
        'blank_character_bank',
        'blank_location_bank',
        sceneNumber,
      );
    }
  }
}

addNode('blank_continuity', 'blank_workspace', 'continuity', 'Continuity Ledger', continuityData());
for (let passNumber = 1; passNumber <= 4; passNumber += 1) {
  const label = String(passNumber).padStart(2, '0');
  addNode(`blank_revision_${label}`, 'blank_workspace', 'revision', `Revision Pass ${label}`, revisionData(passNumber));
}

return { nodes, rootId: 'root' };
