const DEFAULT_CONFIG = { dossierCount: 10, reviewWeeks: 8 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = { dossierCount: [4, 16], reviewWeeks: [4, 16] };
Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Offer Track config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Offer Track node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Offer Track template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  const node = { id, parentId, type, title, data: nodeData, children: [] };
  if (typeof options.referenceId === 'string') node.referenceId = options.referenceId;
  nodes[id] = node;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Offer Track parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const pad2 = (value) => String(value).padStart(2, '0');

// Every dossier carries the same bound fields; blanks bind '' throughout so the
// pipeline refs and empty controls print nothing (unfilled-chip escape).
const dossierData = (overrides = {}) => ({
  role: '', source: '', salary: '', next_action: '',
  stage_mark_1: '', stage_mark_2: '', stage_mark_3: '', stage_mark_4: '', stage_mark_5: '',
  contact_1: '', contact_2: '',
  dossier_prev_label: '', dossier_next_label: '',
  ...overrides,
});

const starData = (overrides = {}) => ({
  star_question: '', star_situation: '', star_task: '', star_action: '', star_result: '',
  star_prev_label: '', star_next_label: '',
  ...overrides,
});

// --- Root and briefing -------------------------------------------------------

addNode('root', null, 'cover', 'Offer Track', {});

addNode('start_here', 'root', 'start', 'The Briefing', {
  example_label: '',
  skip_label: '',
});

// --- Worked example (EXAMPLE chrome lives here only) -------------------------
// One filled dossier for the fictional Meridian Data Co. and one finished STAR
// story, as separate sibling nodes, so both mechanics can be read before the
// user writes anything. Their end-of-run sibling chips bind '' (the dossier's
// forward sibling is the story, and vice versa – cross-type nav stays quiet).

addNode('example_workspace', 'start_here', 'workspace', 'Worked Example', {
  hero: 'One dossier filled end to end for a fictional company, and one STAR story told the way it should be told in the room – so you can see the system running before you point it at your own search.',
  workspace_note: 'Everything on this desk is marked EXAMPLE. Your live search runs from the Search HQ.',
  slot_a_label: 'Meridian dossier »',
  slot_b_label: 'Worked STAR story »',
  pipeline_label: '', stars_label: '', questions_label: '', asks_label: '',
  contacts_label: '', comparison_label: '', reviews_label: '',
}, { example: true });

addNode('meridian_dossier', 'example_workspace', 'dossier', 'Meridian Data Co.', dossierData({
  role: 'Senior Data Platform Engineer',
  source: 'Referral – Priya Shah',
  salary: 'Posted $168-185k · ask 190',
  stage_mark_1: 'X',
  stage_mark_2: 'X',
  stage_mark_3: 'X',
  next_action: 'Panel loop Thursday 10:00. Re-read both STAR stories the night before, raise the on-call rota question in the technical round, and send thanks to Dana by Friday noon.',
  contact_1: 'Priya Shah · Staff Engineer · former teammate, made the referral – keep her posted, no surprises',
  contact_2: 'Dana Okafor · Recruiter · prefers email, answers fastest before 10:00',
}), { example: true });

addNode('example_star', 'example_workspace', 'star_story', 'A Finished STAR Story', starData({
  star_question: 'Tell me about a time you led a project without formal authority.',
  star_situation: 'At Harborlight Systems our churn dashboard had been quietly wrong for six weeks. Three teams each assumed another owned the fix, and the executives kept reading the bad number every Monday.',
  star_task: 'I was the newest engineer on the platform team, but I decided someone had to own the number – and that the fix mattered more than whose backlog it landed in.',
  star_action: 'I traced the pipeline end to end and wrote a one-page incident note naming the broken join, then convened the three leads for a thirty-minute triage. I proposed carrying the fix myself with one reviewer from each team, and published a daily two-line status until it shipped.',
  star_result: 'Churn reporting was corrected in nine days and the Monday number moved back within half a percent of finance. The incident note became the team template, and two of those leads later sponsored my promotion case.',
}), { example: true });

// --- Search HQ (blank workspace) ---------------------------------------------
// Child order is load-bearing: the pipeline board sits at child index 0 so the
// hub's slot chips resolve, and every other desk is reached by deterministic
// stable id. Dossiers, prep bank, contacts, matrix, and reviews follow.

addNode('blank_workspace', 'start_here', 'workspace', 'Search HQ', {
  example_label: '',
  skip_label: '',
  hero: `Your live search: ${CONFIG.dossierCount} company dossiers wired to one pipeline board, six STAR story sheets, a question and ask bank, a contact ledger, the offer matrix, and ${CONFIG.reviewWeeks} chained weekly reviews.`,
  workspace_note: `This copy: ${CONFIG.dossierCount} dossiers · ${CONFIG.reviewWeeks} weekly reviews. Set dossierCount (4-16) and reviewWeeks (4-16) in the generator config.`,
  slot_a_label: '',
  slot_b_label: '',
  pipeline_label: 'Pipeline board »',
  stars_label: 'STAR stories »',
  questions_label: 'Question bank »',
  asks_label: 'Ask bank »',
  contacts_label: 'Contact ledger »',
  comparison_label: 'Offer matrix »',
  reviews_label: 'Weekly reviews »',
});

// The board's sixteen slot chips bind slot_1..slot_16 over child_index 0..15;
// labels past the configured dossier count bind '' so those rows print blank.
const slotLabels = {};
for (let n = 1; n <= 16; n += 1) {
  slotLabels[`slot_${n}_label`] = n <= CONFIG.dossierCount ? `Dossier ${pad2(n)} »` : '';
}

addNode('pipeline_board', 'blank_workspace', 'pipeline', 'The Pipeline', {
  ...slotLabels,
});

for (let n = 1; n <= CONFIG.dossierCount; n += 1) {
  addNode(`dossier_${pad2(n)}`, 'blank_workspace', 'dossier', `Dossier ${pad2(n)}`, dossierData({
    dossier_prev_label: n > 1 ? '« Previous dossier' : '',
    dossier_next_label: n < CONFIG.dossierCount ? 'Next dossier »' : '',
  }));
}

// Pipeline children are reference nodes to every blank dossier, so the board
// enumerates them and the contract can route each dossier through the board.
for (let n = 1; n <= CONFIG.dossierCount; n += 1) {
  addNode(`pipe_ref_${pad2(n)}`, 'pipeline_board', 'dossier', `» Dossier ${pad2(n)}`,
    dossierData(), { referenceId: `dossier_${pad2(n)}` });
}

// --- Prep bank ---------------------------------------------------------------

for (let n = 1; n <= 6; n += 1) {
  addNode(`star_${pad2(n)}`, 'blank_workspace', 'star_story', `STAR ${pad2(n)}`, starData({
    star_prev_label: n > 1 ? '« Previous story' : '',
    star_next_label: n < 6 ? 'Next story »' : '',
  }));
}

// Real, evergreen interview questions – answer-sketch space under each.
addNode('prep_questions', 'blank_workspace', 'question_bank', 'Questions About You', {
  q1: 'Walk me through your background – what thread connects the moves you have made?',
  q2: 'Tell me about a piece of work you are genuinely proud of. What was hard about it?',
  q3: 'Describe a time you disagreed with a decision and were overruled. What did you do next?',
  q4: 'Tell me about a failure that still stings. What changed in how you work because of it?',
  q5: 'When everything is urgent and priorities conflict, how do you actually choose?',
  qb_prev_label: '',
  qb_next_label: 'More questions »',
});

addNode('prep_questions_02', 'blank_workspace', 'question_bank', 'Questions About Fit', {
  q1: 'Why this company, and why now? What would make you turn the offer down?',
  q2: 'What does the best manager you ever had do that the others did not?',
  q3: 'Tell me about the hardest feedback you have received. Did they have a point?',
  q4: 'What would your current team miss most in the week after you leave?',
  q5: 'What do you want to be doing in three years that you cannot do today?',
  qb_prev_label: '« Questions about you',
  qb_next_label: '',
});

addNode('prep_asks', 'blank_workspace', 'ask_bank', 'Asks For The Room', {});

// --- Contacts, matrix, weekly reviews ----------------------------------------

for (let n = 1; n <= 4; n += 1) {
  addNode(`contacts_${pad2(n)}`, 'blank_workspace', 'contacts', `Contacts ${pad2(n)}`, {
    ct_prev_label: n > 1 ? '« Previous page' : '',
    ct_next_label: n < 4 ? 'Next page »' : '',
  });
}

addNode('comparison_sheet', 'blank_workspace', 'comparison', 'The Offer Matrix', {});

for (let n = 1; n <= CONFIG.reviewWeeks; n += 1) {
  addNode(`review_w${pad2(n)}`, 'blank_workspace', 'weekly_review', `Week ${pad2(n)}`, {
    wr_prev_label: n > 1 ? '« Previous week' : '',
    wr_next_label: n < CONFIG.reviewWeeks ? 'Next week »' : '',
  });
}

return { nodes, rootId: 'root' };
