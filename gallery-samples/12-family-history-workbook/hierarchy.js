const DEFAULT_CONFIG = { sparePersonCount: 8, promptPageCount: 6 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = { sparePersonCount: [4, 16], promptPageCount: [2, 12] };
Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Roots & Branches config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Roots & Branches node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Roots & Branches template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  const node = { id, parentId, type, title, data: nodeData, children: [] };
  if (typeof options.referenceId === 'string') node.referenceId = options.referenceId;
  nodes[id] = node;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Roots & Branches parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const pad2 = (value) => String(value).padStart(2, '0');

// --- The pedigree numbering scheme -------------------------------------------
// The single source of truth for who is whose parent. Chart children are
// ordered by 0-based box index in ahnentafel order: 0 self, 1 father,
// 2 mother, 3-6 grandparents, 7-14 great-grandparents. The father of box i
// is box 2i+1 and the mother box 2i+2 (in the 1-based numbers printed on the
// chart: a father is double his child's number, a mother double plus one).
// templates.js draws its connector lines from this same 2i+1 / 2i+2 rule,
// and every kin chip below is generated from these two functions.

const fatherIndex = (index) => (2 * index + 1 < 15 ? 2 * index + 1 : undefined);
const motherIndex = (index) => (2 * index + 2 < 15 ? 2 * index + 2 : undefined);

const CHART_PERSONS = [
  'Self',
  'Father',
  'Mother',
  'Grandfather (Paternal)',
  'Grandmother (Paternal)',
  'Grandfather (Maternal)',
  'Grandmother (Maternal)',
  'Great-Grandfather (Paternal I)',
  'Great-Grandmother (Paternal I)',
  'Great-Grandfather (Paternal II)',
  'Great-Grandmother (Paternal II)',
  'Great-Grandfather (Maternal I)',
  'Great-Grandmother (Maternal I)',
  'Great-Grandfather (Maternal II)',
  'Great-Grandmother (Maternal II)',
];

const generationOf = (index) => {
  if (index === 0) return 1;
  if (index <= 2) return 2;
  if (index <= 6) return 3;
  return 4;
};

// Every person node carries the full person-page binding set so unused chips
// and unfilled vitals bind '' and vanish cleanly.
const personData = (overrides = {}) => ({
  role_line: '',
  born_value: '',
  married_value: '',
  died_value: '',
  places_value: '',
  year_1: '', timeline_1: '',
  year_2: '', timeline_2: '',
  year_3: '', timeline_3: '',
  year_4: '', timeline_4: '',
  year_5: '', timeline_5: '',
  person_note: '',
  kin_1_label: '',
  kin_2_label: '',
  kin_3_label: '',
  kin_4_label: '',
  kin_5_label: '',
  kin_6_label: '',
  ...overrides,
});

// --- Interview questions (two per story-prompt sheet) ------------------------

const QUESTIONS = [
  'What is your earliest memory of the house you grew up in?',
  'How did your parents meet, and what did they first make of one another?',
  'What did your grandparents\' home smell like, and what were you allowed to touch there?',
  'What was on the table at an ordinary supper, and who cooked it?',
  'What did your family call you as a child, and where did the name come from?',
  'What work did your father and your mother do with their hands and their days?',
  'When money was short, what did your family do without?',
  'Which holiday mattered most in your house, and how was it kept?',
  'What is the furthest-back story anyone ever told you about our family?',
  'Who was the storyteller of the family, and which story did they always tell?',
  'What did Sunday look like, morning to night, when you were ten?',
  'When did your family first leave the place they came from, and why?',
  'What object in your house today has been in the family the longest?',
  'What songs or sayings did your mother repeat so often you still hear them?',
  'Who in the family were you told you take after, and in what way?',
  'What was the first great piece of news you remember reaching your street?',
  'How did you meet the person you married, and what happened next?',
  'What was the hardest year of your life, and what carried you through it?',
  'Which relative do you wish you had asked more questions, and what would you ask?',
  'What did school look like - the room, the teacher, the walk there?',
  'What advice from your parents did you ignore, and how did that go?',
  'What place would you take me to if you could walk me through your childhood?',
  'What recipe, remedy or ritual should not be allowed to die with our generation?',
  'What do you want your great-grandchildren to know about you that no record will show?',
];

// --- Root and first steps ----------------------------------------------------

addNode('root', null, 'cover', 'Roots & Branches', {});

addNode('start_here', 'root', 'start', 'First Steps', {
  example_label: '',
  skip_label: '',
});

// --- Worked example: three filled pages for a clearly fictional family -------
// The Hartwell-Reyes family is invented for the specimen pages; every date is
// fictional and pre-1950. The self page's kin chips link to the two child
// pages exactly the way a chart person links to its parents.

addNode('example_workspace', 'start_here', 'person', 'Amelia Hartwell Reyes', personData({
  role_line: 'EXAMPLE · THE HARTWELL-REYES FAMILY · A FICTIONAL SPECIMEN',
  born_value: '12 March 1899 · Gloucester, Massachusetts',
  married_value: '4 June 1920 · to Thomas Ellis · Portland, Maine',
  died_value: '30 November 1948 · Portland, Maine',
  places_value: 'Gloucester · Boston · Portland',
  year_1: '1899', timeline_1: 'Born above the sail loft on Harbour Street, Gloucester',
  year_2: '1905', timeline_2: 'The family follows the fishing fleet south to Boston',
  year_3: '1917', timeline_3: 'Keeps the books at the Reyes chandlery through the war',
  year_4: '1920', timeline_4: 'Marries Thomas Ellis; the couple settles in Portland',
  year_5: '1934', timeline_5: 'Opens her dressmaking rooms on Congress Street',
  person_note: 'Every date on this page was copied from a record the family still holds - the Bible flyleaf, two parish registers and one ship manifest. Where memory and paper disagreed, the paper won.',
  kin_1_label: 'Father · Edmund Hartwell »',
  kin_2_label: 'Mother · Rosa Reyes »',
}), { example: true });

addNode('example_father', 'example_workspace', 'person', 'Edmund Hartwell', personData({
  role_line: 'EXAMPLE · FATHER OF AMELIA · A FICTIONAL SPECIMEN',
  born_value: '2 October 1868 · Gloucester, Massachusetts',
  married_value: '19 April 1897 · to Rosa Reyes · Gloucester',
  died_value: '17 January 1931 · Boston, Massachusetts',
  places_value: 'Gloucester · Boston',
  year_1: '1868', timeline_1: 'Born in the fish-house cottage his father rented',
  year_2: '1884', timeline_2: 'Ships as a boy aboard the schooner Alice M.',
  year_3: '1897', timeline_3: 'Marries Rosa Reyes at the harbour chapel',
  year_4: '1902', timeline_4: 'Comes ashore for good to work the Boston wharves',
  year_5: '1922', timeline_5: 'Retires to mend nets and mind his grandchildren',
  person_note: 'His birth year is from the parish register; the family Bible says 1867 and is wrong. Amelia noted the correction herself in the margin, with the register page number beside it.',
}), { example: true });

addNode('example_mother', 'example_workspace', 'person', 'Rosa Reyes', personData({
  role_line: 'EXAMPLE · MOTHER OF AMELIA · A FICTIONAL SPECIMEN',
  born_value: '23 August 1874 · Veracruz, Mexico',
  married_value: '19 April 1897 · to Edmund Hartwell · Gloucester',
  died_value: '9 May 1946 · Portland, Maine',
  places_value: 'Veracruz · Gloucester · Boston · Portland',
  year_1: '1874', timeline_1: 'Born in the harbour quarter of Veracruz',
  year_2: '1891', timeline_2: 'Sails north with her uncle\'s trading house',
  year_3: '1897', timeline_3: 'Marries Edmund Hartwell at the harbour chapel',
  year_4: '1910', timeline_4: 'Opens the family chandlery\'s Boston counter',
  year_5: '1929', timeline_5: 'Moves in with Amelia on Congress Street',
  person_note: 'Her crossing is fixed by the manifest of the brig Mariposa, which lists her age as seventeen. No civil birth record has been found yet; the search is logged in the research ledger.',
}), { example: true });

// --- The family archive (blank workspace) ------------------------------------
// Child order is load-bearing for the Tree Hub's child_index chips:
// 0 chart · 1-4 group sheets · 5-8 photo ledgers · 9-12 research ledgers ·
// 13-14 source index · 15..15+spares-1 spare persons · prompts last
// (reached by their stable id, so their base index may float).

const spareLabels = {};
for (let slot = 1; slot <= 16; slot += 1) {
  spareLabels[`spare_${slot}_label`] = slot <= CONFIG.sparePersonCount ? `Person ${pad2(slot)} »` : '';
}

addNode('blank_workspace', 'start_here', 'workspace', 'Family Archive', {
  example_label: '',
  skip_label: '',
  hero: 'The working half of the book: the chart and its fifteen pages, the record sheets that prove them, and blank pages for everyone the chart cannot hold.',
  workspace_note: `This copy carries ${CONFIG.sparePersonCount} spare person pages and ${CONFIG.promptPageCount} interview sheets. Set sparePersonCount (4-16) and promptPageCount (2-12) in the generator config to change them.`,
  ...spareLabels,
});

// --- The pedigree chart and its fifteen person pages -------------------------

const chartData = {};
CHART_PERSONS.forEach((personTitle, index) => {
  chartData[`box_${index + 1}_label`] = personTitle;
});

addNode('pedigree_chart', 'blank_workspace', 'chart', 'Four Generations', chartData);

const chartPersonId = (index) => `chart_person_${pad2(index + 1)}`;

CHART_PERSONS.forEach((personTitle, index) => {
  const father = fatherIndex(index);
  const mother = motherIndex(index);
  addNode(chartPersonId(index), 'pedigree_chart', 'person', personTitle, personData({
    role_line: `PEDIGREE NO. ${index + 1} OF 15 · GENERATION ${generationOf(index)}`,
    kin_1_label: father === undefined ? '' : `Father · chart no. ${father + 1} »`,
    kin_2_label: mother === undefined ? '' : `Mother · chart no. ${mother + 1} »`,
  }));
});

// Kin reference children, in the same order as the kin chips (child 0 the
// father, child 1 the mother), each resolving to the chart person the
// numbering scheme names.
CHART_PERSONS.forEach((personTitle, index) => {
  const father = fatherIndex(index);
  const mother = motherIndex(index);
  if (father === undefined || mother === undefined) return;
  addNode(`kin_${pad2(index + 1)}_father`, chartPersonId(index), 'person',
    `» Father (no. ${father + 1})`, personData(), { referenceId: chartPersonId(father) });
  addNode(`kin_${pad2(index + 1)}_mother`, chartPersonId(index), 'person',
    `» Mother (no. ${mother + 1})`, personData(), { referenceId: chartPersonId(mother) });
});

// --- Record books ------------------------------------------------------------

for (let sheet = 1; sheet <= 4; sheet += 1) {
  addNode(`group_${pad2(sheet)}`, 'blank_workspace', 'group_sheet', `Family Group ${pad2(sheet)}`, {});
}

for (let sheet = 1; sheet <= 4; sheet += 1) {
  addNode(`photo_${pad2(sheet)}`, 'blank_workspace', 'photo_log', `Photos ${pad2(sheet)}`, {});
}

for (let sheet = 1; sheet <= 4; sheet += 1) {
  addNode(`research_${pad2(sheet)}`, 'blank_workspace', 'research_log', `Research ${pad2(sheet)}`, {});
}

for (let sheet = 1; sheet <= 2; sheet += 1) {
  addNode(`sources_${pad2(sheet)}`, 'blank_workspace', 'sources', `Sources ${pad2(sheet)}`, {});
}

// --- Spare person pages ------------------------------------------------------

for (let spare = 1; spare <= CONFIG.sparePersonCount; spare += 1) {
  addNode(`spare_${pad2(spare)}`, 'blank_workspace', 'person', `Person ${pad2(spare)}`, personData({
    role_line: 'SPARE PAGE · FOR ANYONE THE CHART CANNOT HOLD',
  }));
}

// --- Story prompt sheets -----------------------------------------------------

for (let sheet = 1; sheet <= CONFIG.promptPageCount; sheet += 1) {
  addNode(`prompt_${pad2(sheet)}`, 'blank_workspace', 'prompts', `Interview ${pad2(sheet)}`, {
    prompt_a: QUESTIONS[2 * (sheet - 1)],
    prompt_b: QUESTIONS[2 * sheet - 1],
    prev_label: sheet === 1 ? '' : '« Previous sheet',
    next_label: sheet === CONFIG.promptPageCount ? '' : 'Next sheet »',
  });
}

return { nodes, rootId: 'root' };
