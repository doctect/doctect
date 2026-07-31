const DEFAULT_CONFIG = { bedCount: 4, harvestLogCount: 4 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = { bedCount: [2, 8], harvestLogCount: [2, 12] };
Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`The Grower's Year config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`The Grower's Year node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`The Grower's Year template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  const node = { id, parentId, type, title, data: nodeData, children: [] };
  if (typeof options.referenceId === 'string') node.referenceId = options.referenceId;
  nodes[id] = node;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`The Grower's Year parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const pad2 = (value) => String(value).padStart(2, '0');

// --- The sixteen plants, A to Z ----------------------------------------------
// Spec values are written for northern-temperate gardens (Britain, Ireland,
// USDA zones 6-8): last frost mid-to-late May, first frost in October. Every
// figure is the mainstream horticultural consensus, kept evergreen.

const PLANTS = {
  basil: {
    title: 'Basil', botanical: 'Ocimum basilicum',
    when_sow: 'Mar–Apr under cover, with warmth',
    when_plant: 'Late May–Jun, after last frost',
    when_harvest: 'Jun–Sep – pinch tips often',
    spec_depth: '0.5 cm, barely covered',
    spec_spacing: '20–30 cm apart',
    spec_sun: 'Full sun, warm and sheltered; rich, moist soil',
    spec_days: '60–70 days from sowing to steady picking',
    spec_companions: 'Tomato and pepper; flowers draw pollinators',
  },
  beetroot: {
    title: 'Beetroot', botanical: 'Beta vulgaris',
    when_sow: 'Apr–Jul direct; Mar under cloche',
    when_plant: 'Direct-sown – thin, do not move',
    when_harvest: 'Jun–Oct, golf ball to cricket ball',
    spec_depth: '2–2.5 cm',
    spec_spacing: '10 cm; rows 30 cm apart',
    spec_sun: 'Full sun, tolerates light shade; no fresh manure',
    spec_days: '55–70 days',
    spec_companions: 'Onion, lettuce, and the brassicas',
  },
  carrot: {
    title: 'Carrot', botanical: 'Daucus carota',
    when_sow: 'Mar–Jul direct; earliest under fleece',
    when_plant: 'Never transplanted – roots fork',
    when_harvest: 'Jun–Nov; lift and store by hard frost',
    spec_depth: '1 cm, in fine soil',
    spec_spacing: 'Thin to 5–8 cm; rows 30 cm',
    spec_sun: 'Full sun; light, stone-free ground',
    spec_days: '70–80 days',
    spec_companions: 'Onion and leek – their scent confuses carrot fly',
  },
  courgette: {
    title: 'Courgette', botanical: 'Cucurbita pepo',
    when_sow: 'Apr–May under cover; late May direct',
    when_plant: 'Late May–Jun, after last frost',
    when_harvest: 'Jul–Oct – cut small and often',
    spec_depth: '2 cm, seed on its edge',
    spec_spacing: '90 cm each way',
    spec_sun: 'Full sun; rich, moisture-holding soil',
    spec_days: '50–60 days from planting out',
    spec_companions: 'Nasturtium, beans, and sweetcorn',
  },
  garlic: {
    title: 'Garlic', botanical: 'Allium sativum',
    when_sow: 'Grown from cloves, not seed',
    when_plant: 'Oct–Nov; or Feb–Mar at a pinch',
    when_harvest: 'Jun–Jul, when leaves yellow',
    spec_depth: 'Clove tip 2.5 cm below the surface',
    spec_spacing: '15 cm; rows 30 cm',
    spec_sun: 'Full sun; needs winter cold to split into bulbs',
    spec_days: 'Around 8–9 months from autumn planting',
    spec_companions: 'Beetroot and lettuce; keep from beans and peas',
  },
  kale: {
    title: 'Kale', botanical: 'Brassica oleracea',
    when_sow: 'Apr–Jun, in modules or a seedbed',
    when_plant: 'Jun–Jul, firmed in well',
    when_harvest: 'Sep–Feb; sweeter after frost',
    spec_depth: '1 cm',
    spec_spacing: '45 cm each way',
    spec_sun: 'Full sun to light shade; firm, limed soil',
    spec_days: '55–75 days from transplanting',
    spec_companions: 'Beetroot, celery, onion; net against butterflies',
  },
  lettuce: {
    title: 'Lettuce', botanical: 'Lactuca sativa',
    when_sow: 'Mar–Aug, little and often',
    when_plant: 'Module-raised out Apr–Aug',
    when_harvest: 'May–Oct',
    spec_depth: '0.5–1 cm – it needs light, so no deeper',
    spec_spacing: '20–30 cm by type',
    spec_sun: 'Sun; part shade in high summer against bolting',
    spec_days: '45–60 days to hearts; leaves sooner',
    spec_companions: 'Carrot, radish, and strawberry',
  },
  onion: {
    title: 'Onion', botanical: 'Allium cepa',
    when_sow: 'Seed Jan–Feb under cover',
    when_plant: 'Sets Mar–Apr; overwinter sets Sep–Oct',
    when_harvest: 'Jul–Sep, once the tops fall over',
    spec_depth: 'Sets shallow, tip just showing',
    spec_spacing: '10 cm; rows 30 cm',
    spec_sun: 'Full sun; firm, fertile, weed-free ground',
    spec_days: 'Around 100–120 days from spring sets',
    spec_companions: 'Carrot – each hides the other from its fly',
  },
  pea: {
    title: 'Pea', botanical: 'Pisum sativum',
    when_sow: 'Mar–Jun; round types Oct–Nov in mild spots',
    when_plant: 'Direct-sown, with sticks or netting',
    when_harvest: 'Jun–Sep – pick young and often',
    spec_depth: '3–5 cm',
    spec_spacing: '5–7 cm in a flat drill; rows 60 cm',
    spec_sun: 'Full sun; a cool-season crop that sulks in heat',
    spec_days: '60–75 days; mangetout sooner',
    spec_companions: 'Carrot, turnip, beans; not the onion family',
  },
  potato: {
    title: 'Potato', botanical: 'Solanum tuberosum',
    when_sow: 'Grown from seed tubers, chitted from Feb',
    when_plant: 'Late Mar–Apr, once soil wakes',
    when_harvest: 'Earlies Jun–Jul; maincrop Sep–Oct',
    spec_depth: '10–15 cm, earthed up as shoots rise',
    spec_spacing: 'Earlies 30 cm, maincrop 40 cm; rows 60–75 cm',
    spec_sun: 'Full sun; frost kills the tops',
    spec_days: 'Earlies 70–90 days; maincrop 130–140',
    spec_companions: 'Beans and cabbage; never beside tomatoes – shared blight',
  },
  radish: {
    title: 'Radish', botanical: 'Raphanus sativus',
    when_sow: 'Mar–Aug little and often; Feb under cloche',
    when_plant: 'Direct-sown only',
    when_harvest: 'Apr–Sep, pulled young',
    spec_depth: '1 cm',
    spec_spacing: 'Thin to 2.5 cm; rows 15 cm',
    spec_sun: 'Sun or part shade; keep moist or it turns woody',
    spec_days: '25–35 days – the fastest crop in this book',
    spec_companions: 'Pea and lettuce; marks slow carrot rows',
  },
  rosemary: {
    title: 'Rosemary', botanical: 'Salvia rosmarinus',
    when_sow: 'Possible but slow – cuttings are surer',
    when_plant: 'Spring, in sharp-draining soil',
    when_harvest: 'Year-round, lightly, once established',
    spec_depth: '0.5 cm for seed; semi-ripe cuttings in summer',
    spec_spacing: '60–90 cm – it becomes a shrub',
    spec_sun: 'Full sun; hates wet feet in winter',
    spec_days: 'A year to a plant that spares regular sprigs',
    spec_companions: 'Carrot and brassicas – its scent masks their pests',
  },
  runner_bean: {
    title: 'Runner Bean', botanical: 'Phaseolus coccineus',
    when_sow: 'May under cover; late May–Jun direct',
    when_plant: 'Out after last frost, canes already up',
    when_harvest: 'Jul–Oct, before pods coarsen',
    spec_depth: '5 cm',
    spec_spacing: '15 cm; double rows 60 cm apart on canes',
    spec_sun: 'Full sun, sheltered – wind tears the vines',
    spec_days: '80–100 days from sowing',
    spec_companions: 'Sweetcorn and brassicas; not the onion bed',
  },
  spinach: {
    title: 'Spinach', botanical: 'Spinacia oleracea',
    when_sow: 'Mar–May; again Aug–Sep for autumn and overwintering',
    when_plant: 'Direct-sown; thin rather than move',
    when_harvest: 'May–Oct; overwintered plants again in spring',
    spec_depth: '2 cm',
    spec_spacing: '7–15 cm; rows 30 cm',
    spec_sun: 'Sun; part shade delays summer bolting',
    spec_days: '40–50 days',
    spec_companions: 'Strawberry, pea, and the brassicas',
  },
  strawberry: {
    title: 'Strawberry', botanical: 'Fragaria x ananassa',
    when_sow: 'Grown from runners, not seed',
    when_plant: 'Aug–Sep is best; else Apr–May',
    when_harvest: 'Jun–Jul; everbearers trickle to Sep',
    spec_depth: 'Crown exactly at soil level – no deeper',
    spec_spacing: '35–45 cm; rows 75 cm',
    spec_sun: 'Full sun; net the fruit against birds',
    spec_days: 'Fruits the summer after autumn planting',
    spec_companions: 'Borage, spinach, lettuce; not the brassicas',
  },
  tomato: {
    title: 'Tomato', botanical: 'Solanum lycopersicum',
    when_sow: 'Feb–Apr under cover, with warmth',
    when_plant: 'Out late May–Jun, after last frost',
    when_harvest: 'Jul–Oct; ripen the last fruit indoors',
    spec_depth: '0.5 cm; plant out deep – the stem roots',
    spec_spacing: '45–60 cm',
    spec_sun: 'Full sun; steady water stops split fruit',
    spec_days: '60–85 days from planting out',
    spec_companions: 'Basil, marigold, carrot; never near potatoes',
  },
};

const CARD_ORDER = [
  'basil', 'beetroot', 'carrot', 'courgette', 'garlic', 'kale', 'lettuce', 'onion',
  'pea', 'potato', 'radish', 'rosemary', 'runner_bean', 'spinach', 'strawberry', 'tomato',
];

const cardData = (plantKey, overrides = {}) => ({
  ...(plantKey ? PLANTS[plantKey] : {}),
  variety: '',
  card_notes: '',
  card_prev_label: '',
  card_next_label: '',
  ...overrides,
});

// Reference rows never render as pages; their data only needs the bound labels
// so unresolved sibling chips stay silent ('' escape) and, in the example
// branch, the EXAMPLE chrome fields.
const refData = () => ({
  variety: '', card_notes: '', card_prev_label: '', card_next_label: '',
});

const monthData = (overrides = {}) => {
  const data = {
    month_note: '', month_tasks: '',
    month_prev_label: '', month_next_label: '',
  };
  for (let n = 1; n <= 8; n += 1) {
    data[`row_${n}_label`] = '';
    data[`row_${n}_kind`] = '';
  }
  return { ...data, ...overrides };
};

// --- The twelve months -------------------------------------------------------
// Rows are [plantKey, kind, chip label]; kinds are Sow / Plant / Harvest and
// every mapping is mainstream northern-temperate practice: garlic planted in
// autumn, tomatoes started under cover in late winter and planted out after
// the last frost, brassicas transplanted in early summer, maincrop potatoes
// lifted in autumn, kale standing through winter.

const MONTHS = [
  ['January', 'The quiet month – plan the beds, order seed, and let frost break the dug ground.', [
    ['kale', 'Harvest', 'Kale · standing crop'],
    ['rosemary', 'Harvest', 'Rosemary · sprigs for the pot'],
    ['onion', 'Sow', 'Onion · seed, under cover'],
  ]],
  ['February', 'Light returns – the propagator earns its keep while the garden waits.', [
    ['tomato', 'Sow', 'Tomato · under cover, in heat'],
    ['onion', 'Sow', 'Onion · seed, under cover'],
    ['pea', 'Sow', 'Pea · under cloche'],
    ['radish', 'Sow', 'Radish · under cloche'],
    ['garlic', 'Plant', 'Garlic · spring planting'],
    ['kale', 'Harvest', 'Kale · standing crop'],
    ['spinach', 'Harvest', 'Spinach · overwintered'],
  ]],
  ['March', 'The gate opens – first direct sowings as the soil warms and dries.', [
    ['tomato', 'Sow', 'Tomato · under cover'],
    ['carrot', 'Sow', 'Carrot · fleece the early rows'],
    ['lettuce', 'Sow', 'Lettuce · first sowing'],
    ['pea', 'Sow', 'Pea · first open-ground row'],
    ['radish', 'Sow', 'Radish · little and often'],
    ['onion', 'Plant', 'Onion · sets'],
    ['potato', 'Plant', 'Potato · first earlies'],
    ['spinach', 'Sow', 'Spinach · spring crop'],
  ]],
  ['April', 'Everything at once – keep the fleece handy for cold nights.', [
    ['beetroot', 'Sow', 'Beetroot · open ground'],
    ['carrot', 'Sow', 'Carrot · main sowing'],
    ['kale', 'Sow', 'Kale · in modules'],
    ['courgette', 'Sow', 'Courgette · under cover'],
    ['basil', 'Sow', 'Basil · in heat'],
    ['potato', 'Plant', 'Potato · maincrop'],
    ['strawberry', 'Plant', 'Strawberry · spring window'],
    ['lettuce', 'Sow', 'Lettuce · keep sowing'],
  ]],
  ['May', 'Frost watch ends late this month for most gardens – harden off in stages.', [
    ['runner_bean', 'Sow', 'Runner Bean · pots or direct'],
    ['courgette', 'Plant', 'Courgette · out after frost'],
    ['tomato', 'Plant', 'Tomato · out after frost'],
    ['basil', 'Plant', 'Basil · out after frost'],
    ['beetroot', 'Sow', 'Beetroot · succession'],
    ['radish', 'Sow', 'Radish · succession'],
    ['carrot', 'Sow', 'Carrot · succession'],
    ['lettuce', 'Harvest', 'Lettuce · first heads'],
  ]],
  ['June', 'The hungry gap ends – first real pickings while planting finishes.', [
    ['runner_bean', 'Plant', 'Runner Bean · out on canes'],
    ['kale', 'Plant', 'Kale · to final spacing'],
    ['strawberry', 'Harvest', 'Strawberry · the glut'],
    ['pea', 'Harvest', 'Pea · first pods'],
    ['potato', 'Harvest', 'Potato · first earlies'],
    ['lettuce', 'Harvest', 'Lettuce'],
    ['carrot', 'Harvest', 'Carrot · early thinnings'],
    ['beetroot', 'Harvest', 'Beetroot · first roots'],
  ]],
  ['July', 'Peak season – water deeply, pick daily, and sow the late rows.', [
    ['garlic', 'Harvest', 'Garlic · when leaves yellow'],
    ['courgette', 'Harvest', 'Courgette · cut small'],
    ['runner_bean', 'Harvest', 'Runner Bean · first pods'],
    ['basil', 'Harvest', 'Basil · pinch it back'],
    ['onion', 'Harvest', 'Onion · as tops fall'],
    ['pea', 'Harvest', 'Pea · keep picking'],
    ['carrot', 'Sow', 'Carrot · last sowing'],
    ['beetroot', 'Sow', 'Beetroot · last sowing'],
  ]],
  ['August', 'Abundance and bolting – harvest ahead of the plants, sow for autumn.', [
    ['tomato', 'Harvest', 'Tomato · daily now'],
    ['courgette', 'Harvest', 'Courgette · relentless'],
    ['runner_bean', 'Harvest', 'Runner Bean · pick to keep them coming'],
    ['onion', 'Harvest', 'Onion · dry off in the sun'],
    ['potato', 'Harvest', 'Potato · second earlies'],
    ['basil', 'Harvest', 'Basil · before it flowers'],
    ['spinach', 'Sow', 'Spinach · autumn crop'],
    ['radish', 'Sow', 'Radish · last sowings'],
  ]],
  ['September', 'The turn – lift, store, and plant for next year.', [
    ['potato', 'Harvest', 'Potato · maincrop, dry day'],
    ['tomato', 'Harvest', 'Tomato · ripen the last indoors'],
    ['runner_bean', 'Harvest', 'Runner Bean · final flush'],
    ['strawberry', 'Plant', 'Strawberry · runners, best month'],
    ['onion', 'Plant', 'Onion · overwintering sets'],
    ['spinach', 'Sow', 'Spinach · early Sep, to overwinter'],
    ['carrot', 'Harvest', 'Carrot'],
    ['courgette', 'Harvest', 'Courgette · last fruits'],
  ]],
  ['October', 'First frosts – clear the tender crops, plant garlic into warm soil.', [
    ['garlic', 'Plant', 'Garlic · the main planting'],
    ['carrot', 'Harvest', 'Carrot · lift and store'],
    ['kale', 'Harvest', 'Kale · season opens'],
    ['potato', 'Harvest', 'Potato · finish lifting'],
    ['beetroot', 'Harvest', 'Beetroot · before hard frost'],
    ['runner_bean', 'Harvest', 'Runner Bean · until first frost'],
    ['spinach', 'Harvest', 'Spinach · autumn crop'],
    ['pea', 'Sow', 'Pea · round types, mild gardens'],
  ]],
  ['November', 'Put the garden to bed – mulch, tidy, and keep planting garlic.', [
    ['garlic', 'Plant', 'Garlic · until the soil closes'],
    ['kale', 'Harvest', 'Kale'],
    ['carrot', 'Harvest', 'Carrot · last lifts'],
    ['spinach', 'Harvest', 'Spinach · under fleece'],
    ['rosemary', 'Harvest', 'Rosemary · lightly'],
  ]],
  ['December', 'Short days – the standing crops carry the kitchen.', [
    ['kale', 'Harvest', 'Kale · sweeter after frost'],
    ['spinach', 'Harvest', 'Spinach · protected'],
    ['rosemary', 'Harvest', 'Rosemary · for the roast'],
  ]],
];

const monthRowData = (rows) => {
  const data = {};
  rows.forEach(([plantKey, kind, chipLabel], index) => {
    data[`row_${index + 1}_label`] = chipLabel;
    data[`row_${index + 1}_kind`] = kind;
  });
  return data;
};

// --- Root and guide ----------------------------------------------------------

addNode('root', null, 'cover', "The Grower's Year", {});

addNode('start_here', 'root', 'start', 'Before You Sow', {
  example_label: '',
  skip_label: '',
});

// --- Worked example (EXAMPLE chrome lives here only) -------------------------
// March filled the way a real March goes, its eight rows referencing the same
// shared plant cards the blank months use, plus two annotated card copies
// (separate example nodes, not the shared catalog cards) carrying a season of
// field notes.

addNode('example_workspace', 'start_here', 'workspace', 'The Worked Example', {
  hero: 'March filled in the way a real March goes – eight rows sown, planted, and annotated – plus two plant cards carrying a season of field notes, so you can see how the almanac is meant to be written in.',
  workspace_note: 'Everything on this table is marked EXAMPLE. Your live almanac runs from Your Garden.',
  slot_a_label: 'March, worked »',
  slot_b_label: 'Tomato card »',
  slot_c_label: 'Garlic card »',
  hub_months_label: '', hub_index_label: '', hub_beds_label: '',
  hub_harvest_label: '', hub_pest_label: '', hub_review_label: '',
}, { example: true });

addNode('march_example', 'example_workspace', 'month', 'March – Worked', monthData({
  month_note: 'The gate opens – first direct sowings as the soil warms and dries.',
  month_tasks: 'Raked the seedbeds to a crumb on the 6th, first dry week of the year.\nSeed potatoes chitting in the porch – egg boxes, eyes up, since late Feb.\nTop-dressed both far beds with a barrow of compost each.\nHoed the overwintered onion bed before the weeds saw spring coming.',
  ...monthRowData([
    ['tomato', 'Sow', 'Tomato · sown 8th, in heat'],
    ['carrot', 'Sow', 'Carrot · Early Nantes, fleeced'],
    ['lettuce', 'Sow', 'Lettuce · Little Gem, cloche'],
    ['pea', 'Sow', 'Pea · Kelvedon Wonder'],
    ['radish', 'Sow', 'Radish · French Breakfast'],
    ['onion', 'Plant', 'Onion · Sturon sets'],
    ['potato', 'Plant', 'Potato · Rocket, first earlies'],
    ['spinach', 'Sow', 'Spinach · half row, more in Apr'],
  ]),
}), { example: true });

addNode('example_card_tomato', 'example_workspace', 'plant_card', 'Tomato, Annotated', cardData('tomato', {
  variety: "Gardener's Delight",
  card_notes: 'Sown 8 Mar in the propagator; potted on 2 Apr; planted out 24 May after a week of hardening off. Side-shoots pinched every Friday. First truss set 18 Jun – fed weekly from then. Blight watch from late Jul: one bad leaf stripped, fruit fine. Verdict: two plants were plenty for the kitchen.',
}), { example: true });

addNode('example_card_garlic', 'example_workspace', 'plant_card', 'Garlic, Annotated', cardData('garlic', {
  variety: 'Solent Wight',
  card_notes: 'Planted 12 Oct, fat outer cloves only, tips a thumb-joint down. Green shoots up by late Nov. Fed once in Mar, weeded by hand – the roots sit shallow. Rust arrived mid Jun so I stopped watering; lifted 4 Jul, plaited and dried a fortnight in the shed. Sixteen good bulbs from eighteen cloves.',
}), { example: true });

// March's reference rows, added after the two annotated cards so those cards
// lead the plant_card nodes in creation order (the editor previews the first).
MONTHS[2][2].forEach(([plantKey], index) => {
  addNode(`mex_ref_${index + 1}`, 'march_example', 'plant_card', `» ${PLANTS[plantKey].title}`,
    refData(), { referenceId: `card_${plantKey}`, example: true });
});

// --- Your Garden (blank workspace) -------------------------------------------
// Child order is load-bearing for the page sequence: the twelve months, then
// the plant index, then the sixteen shared cards it references, then beds and
// ledgers. The months' reference children point at the same shared cards.

addNode('blank_workspace', 'start_here', 'workspace', 'Your Garden', {
  example_label: '',
  skip_label: '',
  hero: `Twelve month spreads over sixteen plant cards, with ${CONFIG.bedCount} bed maps, ${CONFIG.harvestLogCount} harvest ledger pages, a two-page pest ledger, and the year review – all pre-linked.`,
  workspace_note: `This copy: ${CONFIG.bedCount} beds · ${CONFIG.harvestLogCount} harvest pages. Set bedCount (2-8) and harvestLogCount (2-12) in the generator config.`,
  slot_a_label: '',
  slot_b_label: '',
  slot_c_label: '',
  hub_months_label: 'The twelve months »',
  hub_index_label: 'The plant index »',
  hub_beds_label: 'Bed maps »',
  hub_harvest_label: 'Harvest ledger »',
  hub_pest_label: 'Pest ledger »',
  hub_review_label: 'Year review »',
});

const MONTH_TITLES = MONTHS.map(([title]) => title);
MONTHS.forEach(([title, note, rows], index) => {
  const n = index + 1;
  addNode(`month_${pad2(n)}`, 'blank_workspace', 'month', title, monthData({
    month_note: note,
    month_prev_label: n > 1 ? `« ${MONTH_TITLES[index - 1]}` : '',
    month_next_label: n < 12 ? `${MONTH_TITLES[index + 1]} »` : '',
    ...monthRowData(rows),
  }));
});

MONTHS.forEach(([title, note, rows], monthIndex) => {
  rows.forEach(([plantKey], rowIndex) => {
    addNode(`m${pad2(monthIndex + 1)}_ref_${rowIndex + 1}`, `month_${pad2(monthIndex + 1)}`, 'plant_card',
      `» ${PLANTS[plantKey].title}`, refData(), { referenceId: `card_${plantKey}` });
  });
});

// The index hub: its children are reference rows to all sixteen cards, A to Z,
// driving the child_index chips on the Plant Index template.
const indexLabels = {};
CARD_ORDER.forEach((plantKey, index) => {
  indexLabels[`ix_${index + 1}`] = PLANTS[plantKey].title;
});

addNode('plant_index', 'blank_workspace', 'plant_index', 'Every Plant, A to Z', indexLabels);

CARD_ORDER.forEach((plantKey, index) => {
  addNode(`ix_ref_${pad2(index + 1)}`, 'plant_index', 'plant_card', `» ${PLANTS[plantKey].title}`,
    refData(), { referenceId: `card_${plantKey}` });
});

// The sixteen shared catalog cards, A to Z, right after the index in page order.
CARD_ORDER.forEach((plantKey, index) => {
  addNode(`card_${plantKey}`, 'blank_workspace', 'plant_card', PLANTS[plantKey].title, cardData(plantKey, {
    card_prev_label: index > 0 ? `« ${PLANTS[CARD_ORDER[index - 1]].title}` : '',
    card_next_label: index < CARD_ORDER.length - 1 ? `${PLANTS[CARD_ORDER[index + 1]].title} »` : '',
  }));
});

// --- Beds, ledgers, review ---------------------------------------------------

for (let n = 1; n <= CONFIG.bedCount; n += 1) {
  addNode(`bed_${pad2(n)}`, 'blank_workspace', 'bed_map', `Bed ${pad2(n)}`, {
    bed_prev_label: n > 1 ? '« Previous bed' : '',
    bed_next_label: n < CONFIG.bedCount ? 'Next bed »' : '',
  });
}

for (let n = 1; n <= CONFIG.harvestLogCount; n += 1) {
  addNode(`harvest_${pad2(n)}`, 'blank_workspace', 'harvest_log', `Harvest, Page ${pad2(n)}`, {
    hl_prev_label: n > 1 ? '« Previous page' : '',
    hl_next_label: n < CONFIG.harvestLogCount ? 'Next page »' : '',
  });
}

for (let n = 1; n <= 2; n += 1) {
  addNode(`pest_${pad2(n)}`, 'blank_workspace', 'pest_log', `Pest Notes, Page ${pad2(n)}`, {
    pl_prev_label: n > 1 ? '« Previous page' : '',
    pl_next_label: n < 2 ? 'Next page »' : '',
  });
}

addNode('year_review_01', 'blank_workspace', 'year_review', 'The Year, Reviewed', {});

return { nodes, rootId: 'root' };
