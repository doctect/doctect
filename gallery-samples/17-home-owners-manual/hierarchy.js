const DEFAULT_CONFIG = { roomCount: 8, applianceCount: 12 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = { roomCount: [4, 12], applianceCount: [6, 20] };
Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`The House Book config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});
if (CONFIG.applianceCount > CONFIG.roomCount * 4) {
  throw new Error('The House Book config allows at most 4 appliances per room - raise roomCount or lower applianceCount.');
}

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`The House Book node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`The House Book template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  const node = { id, parentId, type, title, data: nodeData, children: [] };
  if (typeof options.referenceId === 'string') node.referenceId = options.referenceId;
  nodes[id] = node;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`The House Book parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const pad2 = (value) => String(value).padStart(2, '0');

// --- Rooms and appliances ----------------------------------------------------
// Appliance-heavy rooms lead the list, so the greedy distribution (at most
// four cards per room, filled from the first room onward) lands the default
// twelve cards on the kitchen, the utility room, and the living room.

const ROOM_TITLES = [
  'Kitchen', 'Utility Room', 'Living Room', 'Main Bedroom',
  'Bathroom', 'Home Office', 'Garage', 'Hallway & Stairs',
  'Second Bedroom', 'Basement', 'Attic', 'Guest Room',
];

const roomData = (overrides = {}) => ({
  paint_walls: '', paint_trim: '', paint_floor: '',
  measurements: '', fixtures: '', room_notes: '',
  appl_1: '', appl_2: '', appl_3: '', appl_4: '',
  ...overrides,
});

const applianceData = (overrides = {}) => ({
  make: '', model: '', serial: '', purchased: '', warranty: '',
  manual_location: '', appl_notes: '',
  svc_1_date: '', svc_1_note: '', svc_2_date: '', svc_2_note: '',
  svc_3_date: '', svc_3_note: '', svc_4_date: '', svc_4_note: '',
  ap_prev_label: '', ap_next_label: '',
  ...overrides,
});

// Reference rows never render as pages; their data only needs the bound
// labels of unresolved-capable links ('' escape).
const roomRefData = () => ({ appl_1: '', appl_2: '', appl_3: '', appl_4: '' });

// --- The five systems --------------------------------------------------------
// Fixed roster: HVAC, Plumbing, Electrical, Roof & Exterior, Safety. Checklist
// items are mainstream, evergreen home-maintenance practice.

const SYSTEMS = [
  ['system_hvac', 'HVAC', {
    sys_note: 'Heating, ventilation, and cooling – the machinery of comfortable air.',
    callout_label: 'SHUTOFF LOCATION',
    callout_hint: 'Furnace switch, condenser breaker, and fuel valve – write where, exactly.',
    spec_1_label: 'FILTER SIZE', spec_2_label: 'MAKE, MODEL & FUEL', spec_3_label: 'LAST PROFESSIONAL SERVICE',
    lines_label: 'SERVICE VISITS · ONE PER LINE',
    check_1: 'Filter checked – swap it if it reads grey', check_2: 'Vents and returns clear of furniture',
    check_3: 'Condensate drain runs free', check_4: 'Outdoor unit clear of leaves and growth',
    check_5: 'Thermostat batteries fresh', check_6: 'Annual professional service booked',
  }],
  ['system_plumbing', 'Plumbing', {
    sys_note: 'Water in, water out – and the valves that stand between you and a flood.',
    callout_label: 'SHUTOFF LOCATION',
    callout_hint: 'Main water valve, water heater valve, and toilet stops – where, exactly.',
    spec_1_label: 'WATER HEATER MAKE & AGE', spec_2_label: 'PIPE MATERIAL', spec_3_label: 'WATER PRESSURE',
    lines_label: 'FIXTURE & VALVE REGISTER · ONE PER LINE',
    check_1: 'Main shutoff valve turns freely', check_2: 'Under-sink connections dry to the touch',
    check_3: 'Water heater flushed this year', check_4: 'Toilet flappers seal – no phantom refills',
    check_5: 'Washing machine hoses sound – swap at five years', check_6: 'Outdoor taps insulated before frost',
  }],
  ['system_electrical', 'Electrical', {
    sys_note: 'The panel, the circuits, and everything in the house that hums.',
    callout_label: 'MAIN BREAKER',
    callout_hint: 'Panel location and which breaker kills the whole house – write it down.',
    spec_1_label: 'PANEL RATING (AMPS)', spec_2_label: 'INSTALLED · LAST INSPECTED', spec_3_label: 'SPARE FUSES · BULB SIZES',
    lines_label: 'BREAKER MAP · ONE CIRCUIT PER LINE',
    check_1: 'Test-button trip on RCD and GFCI outlets', check_2: 'No warm outlets or switch plates',
    check_3: 'Extension cords are temporary, not wiring', check_4: 'Panel legend legible and current',
    check_5: 'Outdoor sockets covered and dry', check_6: 'Electrician\'s number on the contractor list',
  }],
  ['system_roof', 'Roof & Exterior', {
    sys_note: 'The shell – roof, gutters, walls, and the ground the rain runs to.',
    callout_label: 'ACCESS POINTS',
    callout_hint: 'Attic hatch, ladder anchor, gutter reach – note what it takes to get up there.',
    spec_1_label: 'ROOF MATERIAL & AGE', spec_2_label: 'GUTTER RUNS · DOWNSPOUTS', spec_3_label: 'SIDING & TRIM PAINT CODES',
    lines_label: 'STORM & LEAK NOTES · ONE PER LINE',
    check_1: 'Shingles and ridge flat after storms', check_2: 'Gutters run clear at both ends',
    check_3: 'Downspouts throw water clear of the walls', check_4: 'Flashing tight at chimney and valleys',
    check_5: 'Sealant sound around windows and doors', check_6: 'Ground slopes away from the foundation',
  }],
  ['system_safety', 'Safety', {
    sys_note: 'Alarms, extinguishers, and the drill nobody hopes to use.',
    callout_label: 'DEVICE LOCATIONS',
    callout_hint: 'Smoke and CO alarms, extinguisher, first-aid kit, spare keys – map them here.',
    spec_1_label: 'ALARM COUNT · POWER TYPE', spec_2_label: 'EXTINGUISHER TYPE & DATE', spec_3_label: 'MEETING POINT OUTSIDE',
    lines_label: 'DEVICE REGISTER · ONE PER LINE',
    check_1: 'Smoke alarms tested this month', check_2: 'CO alarm near every sleeping floor',
    check_3: 'Extinguisher pressure in the green', check_4: 'Escape routes clear on every floor',
    check_5: 'First-aid kit stocked and findable', check_6: 'Alarm batteries changed at the clock change',
  }],
];

// --- The four seasons --------------------------------------------------------

const SEASONS = [
  ['season_spring', 'Spring', 'The thaw audit – undo winter, ready the cooling.', [
    'Gutters and downspouts cleared of winter debris',
    'Roof scanned for lifted or missing shingles',
    'AC serviced and test-run before the first hot week',
    'Outdoor taps back on – check for winter splits',
    'Sump pump tested with a bucket of water',
    'Window screens up, draft strips down',
    'Grade and drains watched through one hard rain',
    'Smoke and CO alarms tested at the clock change',
    'Dryer vent duct pulled and cleaned',
    'Deck and fence checked for winter heave',
  ]],
  ['season_summer', 'Summer', 'The open-air season – paint, seal, and keep the cool running.', [
    'AC filter checked monthly while it runs',
    'Exterior caulk and sealant touched up',
    'Deck, fence, and trim stained or painted',
    'Wasp nests swept from the eaves early',
    'Garage door tracks cleaned and lubricated',
    'Irrigation and hoses checked for leaks',
    'Water heater part-drained to clear sediment',
    'Bathroom fans and range hood degreased',
    'Windows washed – sills and weep holes cleared',
    'Paths and paving re-levelled where frost lifted them',
  ]],
  ['season_autumn', 'Autumn', 'The button-up – heat ready, water out, leaves handled.', [
    'Furnace or boiler serviced before the cold',
    'Fresh filter in for the heating season',
    'Gutters cleared after the last leaf-fall',
    'Outdoor taps drained and insulated',
    'Weatherstripping renewed where drafts bite',
    'Chimney swept before the first fire',
    'Roof and flashing checked before winter',
    'Snow tools and salt where you can reach them',
    'Lawn aerated, beds mulched against frost',
    'Ceiling fans reversed to push warm air down',
  ]],
  ['season_winter', 'Winter', 'The long watch – frost, damp, and the quiet indoor jobs.', [
    'Eaves watched for ice dams after snow',
    'Furnace filter checked mid-season',
    'Vulnerable pipes left dripping in hard frost',
    'Condensation wiped, ventilation cracked open',
    'Salt and grit topped up after each storm',
    'Main water valve exercised so it never seizes',
    'Drains deep-cleaned – the indoor month\'s job',
    'Caulk and grout touched up in the bathrooms',
    'Manuals, serials, and this book brought up to date',
    'Spring projects listed while the faults are fresh',
  ]],
];

const seasonData = (note, items, nextLabel) => {
  const data = { season_note: note, season_next_label: nextLabel };
  items.forEach((item, index) => {
    data[`item_${index + 1}`] = item;
  });
  return data;
};

// --- Root and guide ----------------------------------------------------------

addNode('root', null, 'cover', 'The House Book', {});

addNode('start_here', 'root', 'start', 'How To Run The House', {
  example_label: '',
  skip_label: '',
});

// --- Worked example (EXAMPLE chrome lives here only) -------------------------
// One utility room walked end to end, with its (fictional) Kestrel KD-40
// dishwasher filed as a real child of the room - the same wiring the blank
// rooms use, shown filled.

addNode('example_workspace', 'start_here', 'workspace', 'The Worked Example', {
  hero: 'One utility room walked end to end – paint codes, measurements, fixtures – and its dishwasher filed with serial, warranty, and a service history. This is the one afternoon of work the whole book asks for, shown done.',
  workspace_note: 'Everything on this desk is marked EXAMPLE. Your live manual runs from Your House.',
  slot_a_label: 'The utility room, worked »',
  slot_b_label: 'The dishwasher card »',
  hub_dashboard_label: '', hub_rooms_label: '', hub_systems_label: '',
  hub_seasons_label: '', hub_repairs_label: '', hub_contacts_label: '',
}, { example: true });

addNode('example_room', 'example_workspace', 'room', 'The Utility Room, Worked', roomData({
  paint_walls: 'Harbour Fog 214 – matt emulsion · repainted 2023',
  paint_trim: 'Gull White 03 – satinwood · 2023',
  paint_floor: 'Slate-grey vinyl tile · laid 2019',
  measurements: '2.9 m x 2.2 m · ceiling 2.4 m · door 762 mm · window 900 x 600 mm',
  fixtures: 'Stainless sink + mixer tap (2019)\nOak-front wall cabinets x 3\nExtractor fan, 15-minute timer\nDouble sockets x 2 – one switched\nCeiling: 2 x GU10 spots',
  room_notes: 'Condensation on cold mornings – run the extractor and crack the window when the dryer is on. The stopcock for the sink hides behind the left cabinet base panel.',
  appl_1: 'Kestrel KD-40 dishwasher »',
}), { example: true });

addNode('example_appliance', 'example_room', 'appliance', 'Kestrel KD-40 Dishwasher', applianceData({
  make: 'Kestrel',
  model: 'KD-40 QuietDrive',
  serial: 'KD40-2231-08847-EU',
  purchased: 'March 2022 · Harbour Appliance Co.',
  warranty: 'March 2027 – 5 years, drum and motor',
  manual_location: 'Red folder, kitchen drawer file · PDF saved in Home/Manuals',
  svc_1_date: '06 Jun 2023',
  svc_1_note: 'Filters and spray arms cleaned – slow-drain fault cured, no parts',
  svc_2_date: '14 Feb 2024',
  svc_2_note: 'Inlet hose washer replaced under warranty – no charge',
  appl_notes: 'Rinse aid at setting 3 suits our hard water. Error E4 means a blocked filter – clear it, then hold Start for three seconds to reset.',
}), { example: true });

// --- Your House (blank workspace) --------------------------------------------
// Child order is load-bearing for the page sequence: dashboard, then each room
// followed by its own appliance cards, then systems, seasons, and ledgers.

addNode('blank_workspace', 'start_here', 'workspace', 'Your House', {
  example_label: '',
  skip_label: '',
  hero: 'The dashboard reaches every room and system; rooms own their appliance cards; the seasons keep the maintenance year turning. Start with the emergency shutoffs on the guide page, then walk the house.',
  workspace_note: `This copy: ${CONFIG.roomCount} rooms · ${CONFIG.applianceCount} appliance cards. Set roomCount (4-12) and applianceCount (6-20) in the generator config.`,
  slot_a_label: '',
  slot_b_label: '',
  hub_dashboard_label: 'The dashboard »',
  hub_rooms_label: 'Room pages »',
  hub_systems_label: 'The systems »',
  hub_seasons_label: 'The seasons »',
  hub_repairs_label: 'Repair ledger »',
  hub_contacts_label: 'Contractors »',
});

// Dashboard first: its children are reference rows (no extra pages) - the
// five fixed systems at child indices 0-4, then one reference per room at
// indices 5 and up, matching the chip wiring on the template.
const dashboardData = { };
SYSTEMS.forEach(([id, title], index) => {
  dashboardData[`sys_${index + 1}`] = `${title} »`;
});
for (let n = 1; n <= 12; n += 1) {
  dashboardData[`room_${n}`] = n <= CONFIG.roomCount ? `${ROOM_TITLES[n - 1]} »` : '';
}
addNode('dashboard', 'blank_workspace', 'dashboard', 'The House At A Glance', dashboardData);

// Rooms, each owning its appliance cards (greedy: at most four per room).
const applianceCounts = [];
let remaining = CONFIG.applianceCount;
for (let n = 1; n <= CONFIG.roomCount; n += 1) {
  const count = Math.min(4, remaining);
  applianceCounts.push(count);
  remaining -= count;
}

let applianceNumber = 0;
for (let n = 1; n <= CONFIG.roomCount; n += 1) {
  const applData = {};
  for (let slot = 1; slot <= applianceCounts[n - 1]; slot += 1) {
    applData[`appl_${slot}`] = `Appliance ${pad2(applianceNumber + slot)} »`;
  }
  addNode(`room_${pad2(n)}`, 'blank_workspace', 'room', ROOM_TITLES[n - 1], roomData(applData));
  for (let slot = 1; slot <= applianceCounts[n - 1]; slot += 1) {
    applianceNumber += 1;
    addNode(`appliance_${pad2(applianceNumber)}`, `room_${pad2(n)}`, 'appliance', `Appliance ${pad2(applianceNumber)}`, applianceData({
      ap_prev_label: applianceNumber > 1 ? `« Appliance ${pad2(applianceNumber - 1)}` : '',
      ap_next_label: applianceNumber < CONFIG.applianceCount ? `Appliance ${pad2(applianceNumber + 1)} »` : '',
    }));
  }
}

// The five systems - created before the dashboard's reference rows so the
// editor's template preview shows a real system page, not a reference stub.
SYSTEMS.forEach(([id, title, data]) => {
  addNode(id, 'blank_workspace', 'system', title, data);
});

// Dashboard reference rows: systems first (indices 0-4), then the rooms.
SYSTEMS.forEach(([id, title], index) => {
  addNode(`dref_sys_${index + 1}`, 'dashboard', 'system', `» ${title}`, {}, { referenceId: id });
});
for (let n = 1; n <= CONFIG.roomCount; n += 1) {
  addNode(`dref_room_${pad2(n)}`, 'dashboard', 'room', `» ${ROOM_TITLES[n - 1]}`, roomRefData(), { referenceId: `room_${pad2(n)}` });
}

// The four seasons, siblings in calendar order; winter's next chip binds ''.
SEASONS.forEach(([id, title, note, items], index) => {
  const nextLabel = index < SEASONS.length - 1 ? `${SEASONS[index + 1][1]} »` : '';
  addNode(id, 'blank_workspace', 'seasonal', title, seasonData(note, items, nextLabel));
});

// Repair ledger and contractor list.
for (let n = 1; n <= 6; n += 1) {
  addNode(`repair_${pad2(n)}`, 'blank_workspace', 'repair_log', `Repairs, Page ${pad2(n)}`, {
    rl_prev_label: n > 1 ? `« Page ${pad2(n - 1)}` : '',
    rl_next_label: n < 6 ? `Page ${pad2(n + 1)} »` : '',
  });
}

for (let n = 1; n <= 2; n += 1) {
  addNode(`contractor_${pad2(n)}`, 'blank_workspace', 'contacts', `Contractors, Page ${pad2(n)}`, {
    cl_prev_label: n > 1 ? `« Page ${pad2(n - 1)}` : '',
    cl_next_label: n < 2 ? `Page ${pad2(n + 1)} »` : '',
  });
}

return { nodes, rootId: 'root' };
