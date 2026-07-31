const DEFAULT_CONFIG = { pieceCount: 12, sessionCount: 24 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = { pieceCount: [6, 18], sessionCount: [12, 48] };
Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`The Woodshed config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`The Woodshed node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`The Woodshed template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  const node = { id, parentId, type, title, data: nodeData, children: [] };
  if (typeof options.referenceId === 'string') node.referenceId = options.referenceId;
  nodes[id] = node;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`The Woodshed parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const pad2 = (value) => String(value).padStart(2, '0');

// --- Blank-page data shapes --------------------------------------------------

const pieceData = (overrides = {}) => ({
  composer: '', key: '', tempo: '',
  sec_1: '', secbars_1: '', secnote_1: '',
  sec_2: '', secbars_2: '', secnote_2: '',
  sec_3: '', secbars_3: '', secnote_3: '',
  sec_4: '', secbars_4: '', secnote_4: '',
  sec_5: '', secbars_5: '', secnote_5: '',
  sec_6: '', secbars_6: '', secnote_6: '',
  tr_1_bars: '', tr_1_what: '', tr_1_fix: '',
  tr_2_bars: '', tr_2_what: '', tr_2_fix: '',
  tr_3_bars: '', tr_3_what: '', tr_3_fix: '',
  tr_4_bars: '', tr_4_what: '', tr_4_fix: '',
  piece_notes: '',
  ...overrides,
});

const sessionData = (overrides = {}) => ({
  sess_date: '', sess_goal: '',
  bpm_1: '', bpm_2: '', bpm_3: '', bpm_4: '',
  bpm_5: '', bpm_6: '', bpm_7: '', bpm_8: '',
  what_broke: '', what_clicked: '', next_first: '',
  sess_prev_label: '', sess_next_label: '',
  ...overrides,
});

// --- Root and guide ----------------------------------------------------------

addNode('root', null, 'cover', 'The Woodshed', {});

addNode('start_here', 'root', 'start', 'How To Run The Shed', {
  example_label: '',
  skip_label: '',
});

// --- Worked example (EXAMPLE chrome lives here only) -------------------------
// One real jazz standard taken through the mill - Autumn Leaves (music by
// Joseph Kosma, 1945; a 32-bar AABC form, commonly played in G minor) - plus
// one honest session log beside it. Both are separate nodes wired exactly
// like their blank counterparts.

addNode('example_workspace', 'start_here', 'workspace', 'The Worked Example', {
  hero: 'One tune taken through the mill – Autumn Leaves on the stand with its form mapped and its trouble spots named, and one honest session log beside it, metronome ladder filled rung by rung.',
  workspace_note: 'Everything on this stand is marked EXAMPLE. Your working room is Your Studio.',
  slot_a_label: 'Autumn Leaves, worked »',
  slot_b_label: 'The session log »',
  hub_rack_label: '', hub_sessions_label: '', hub_staff_label: '',
  hub_chords_label: '', hub_ladders_label: '', hub_gigs_label: '',
  hub_streak_label: '',
}, { example: true });

addNode('example_piece', 'example_workspace', 'piece', 'Autumn Leaves', pieceData({
  composer: 'Joseph Kosma, 1945',
  key: 'G minor (concert)',
  tempo: 'Medium swing · 120 BPM',
  sec_1: 'A', secbars_1: '1-8', secnote_1: 'The falling cycle – four chords down, then home to G minor',
  sec_2: 'A', secbars_2: '9-16', secnote_2: 'Same eight again – resist playing it louder the second time',
  sec_3: 'B', secbars_3: '17-24', secnote_3: 'Minor turnaround first, then the cycle answers in major',
  sec_4: 'C', secbars_4: '25-32', secnote_4: 'The long descent – two-bar steps all the way to the final cadence',
  tr_1_bars: '25-28', tr_1_what: 'The descent rushes once it starts moving', tr_1_fix: 'Clap the rhythm first, then half tempo with the click',
  tr_2_bars: '5-6', tr_2_what: 'The turn into the major chord lands late', tr_2_fix: 'Loop just these two bars and lead with the bass note',
  tr_3_bars: '17-20', tr_3_what: 'B section entry starts flat-footed', tr_3_fix: 'Sing the pickup out loud before playing it',
  piece_notes: 'Breathe (or lift) at the end of every eight. The melody sits on the falling line – let the long notes ring and the form carries itself.',
}), { example: true });

addNode('example_session', 'example_workspace', 'session', 'A Night On Autumn Leaves', sessionData({
  sess_date: 'Tue 14 May',
  sess_goal: 'Autumn Leaves – make the C-section descent sit calmly at 120',
  bpm_1: '60', bpm_2: '72', bpm_3: '84', bpm_4: '92',
  bpm_5: '100', bpm_6: '108', bpm_7: '116', bpm_8: '120',
  what_broke: 'Bars 25-28 still rush above 108 – the descent loses the click on beat 3.\nThe turn in bar 6 is late every time I start cold.',
  what_clicked: 'Half-tempo runs fixed the descent by the fourth pass.\nSinging the B-section pickup first made the entry land on time.',
  next_first: 'Start at 100 on the C section before touching the top of the tune.',
}), { example: true });

// --- Your Studio (blank workspace) -------------------------------------------
// Child order is load-bearing for the page sequence: the rack, then the
// pieces, then the session logs chained night after night, then the tool
// shelf - staff paper, chord sheets, technique ladders, gig planners, and
// the streak board.

addNode('blank_workspace', 'start_here', 'workspace', 'Your Studio', {
  example_label: '',
  skip_label: '',
  hero: 'The rack holds your repertoire, the logbook holds your nights, and the shelf holds the working paper – manuscript staves, chord boxes, technique ladders, gig sheets, and the streak board that keeps you coming back.',
  workspace_note: `This copy: ${CONFIG.pieceCount} piece pages · ${CONFIG.sessionCount} session logs. Set pieceCount (6-18) and sessionCount (12-48) in the generator config.`,
  slot_a_label: '',
  slot_b_label: '',
  hub_rack_label: 'The repertoire rack »',
  hub_sessions_label: 'The session logbook »',
  hub_staff_label: 'Staff paper »',
  hub_chords_label: 'Chord sheets »',
  hub_ladders_label: 'Technique ladders »',
  hub_gigs_label: 'Gig planners »',
  hub_streak_label: 'The streak board »',
});

// The rack first: its children are reference rows (no extra pages), one per
// piece at child indices 0 and up, matching the chip wiring on the template.
// Slots past pieceCount bind '' and print as silent plates.
const rackData = {};
for (let n = 1; n <= 18; n += 1) {
  rackData[`rack_${n}`] = n <= CONFIG.pieceCount ? `Piece ${pad2(n)} »` : '';
}
addNode('repertoire_rack', 'blank_workspace', 'rack', 'The Repertoire', rackData);

// The pieces.
for (let n = 1; n <= CONFIG.pieceCount; n += 1) {
  addNode(`piece_${pad2(n)}`, 'blank_workspace', 'piece', `Piece ${pad2(n)}`, pieceData());
}

// Rack reference rows, one per piece, in rack order.
for (let n = 1; n <= CONFIG.pieceCount; n += 1) {
  addNode(`rref_piece_${pad2(n)}`, 'repertoire_rack', 'piece', `» Piece ${pad2(n)}`, {}, { referenceId: `piece_${pad2(n)}` });
}

// The session logs, chained as consecutive siblings; both true ends bind ''.
for (let n = 1; n <= CONFIG.sessionCount; n += 1) {
  addNode(`session_${pad2(n)}`, 'blank_workspace', 'session', `Session ${pad2(n)}`, sessionData({
    sess_prev_label: n > 1 ? `« Session ${pad2(n - 1)}` : '',
    sess_next_label: n < CONFIG.sessionCount ? `Session ${pad2(n + 1)} »` : '',
  }));
}

// The tool shelf: staff paper x6, chord sheets x4, technique ladders x2,
// gig planners x4, and the streak board.
for (let n = 1; n <= 6; n += 1) {
  addNode(`staff_${pad2(n)}`, 'blank_workspace', 'staff_paper', `Manuscript ${pad2(n)}`, {});
}

for (let n = 1; n <= 4; n += 1) {
  addNode(`chord_${pad2(n)}`, 'blank_workspace', 'chord_sheet', `Chord Boxes ${pad2(n)}`, {});
}

for (let n = 1; n <= 2; n += 1) {
  addNode(`technique_${pad2(n)}`, 'blank_workspace', 'technique', `Ladder ${pad2(n)}`, {});
}

for (let n = 1; n <= 4; n += 1) {
  addNode(`gig_${pad2(n)}`, 'blank_workspace', 'gig', `Gig ${pad2(n)}`, {
    gig_prev_label: n > 1 ? `« Gig ${pad2(n - 1)}` : '',
    gig_next_label: n < 4 ? `Gig ${pad2(n + 1)} »` : '',
  });
}

addNode('streak_board', 'blank_workspace', 'streak', 'The Streak', {});

return { nodes, rootId: 'root' };
