const DEFAULT_CONFIG = { tripCount: 3, daysPerTrip: 5, reservationsPerTrip: 2 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = {
  tripCount: [1, 6],
  daysPerTrip: [1, 21],
  reservationsPerTrip: [0, 8],
};

Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Field Notes config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Field Notes node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Field Notes template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  nodes[id] = { id, parentId, type, title, data: nodeData, children: [] };
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Field Notes parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const tripData = (values = {}) => ({
  subtitle: 'Keep essential plans close, then leave room for what the place changes.',
  menu_label: '',
  destination: '',
  dates: '',
  base: '',
  travel_note: '',
  ...values,
});

const reservationsData = (count, values = {}) => ({
  subtitle: 'Lodging, transit, timed entries, and useful arrival details.',
  menu_label: 'RESERVATIONS',
  empty_state: count === 0 ? 'No reservations yet - use this page for practical notes.' : '',
  notes: '',
  ...values,
});

const reservationData = (values = {}) => ({
  subtitle: 'Store only practical details; leave sensitive personal and payment data elsewhere.',
  menu_label: '',
  kind: '',
  provider: '',
  address: '',
  arrival: '',
  departure: '',
  booking_reference: '',
  contact: '',
  notes: '',
  ...values,
});

const dayData = (dayNumber, dayCount, values = {}) => ({
  subtitle: `Day ${String(dayNumber).padStart(2, '0')} | Shape a route, then record what was not on the list.`,
  menu_label: `DAY ${String(dayNumber).padStart(2, '0')}`,
  date_label: '',
  timeline: '',
  field_notes: '',
  weather: '',
  moment: '',
  nav_prev_label: dayNumber === 1 ? '' : `« DAY ${String(dayNumber - 1).padStart(2, '0')}`,
  nav_next_label: dayNumber === dayCount ? '' : `DAY ${String(dayNumber + 1).padStart(2, '0')} »`,
  ...values,
});

const packingData = (values = {}) => ({
  subtitle: 'Pack for movement, weather, access, and a little unplanned space.',
  menu_label: 'PACKING',
  pack_1: '',
  pack_2: '',
  pack_3: '',
  pack_4: '',
  pack_5: '',
  ...values,
});

const expenseData = (values = {}) => {
  const data = {
    subtitle: 'A simple ledger for seeing the shape of the journey, not accounting perfection.',
    menu_label: 'EXPENSES',
    expense_note: '',
  };
  for (let row = 1; row <= 8; row += 1) {
    data[`day_${row}`] = '';
    data[`item_${row}`] = '';
    data[`category_${row}`] = '';
    data[`amount_${row}`] = '';
  }
  return { ...data, ...values };
};

const tastesData = (values = {}) => {
  const data = {
    subtitle: 'Tastes, objects, and small finds worth remembering precisely.',
    menu_label: 'TASTES',
    best_bite: '',
  };
  for (let row = 1; row <= 6; row += 1) {
    data[`where_${row}`] = '';
    data[`dish_${row}`] = '';
  }
  return { ...data, ...values };
};

const sketchesData = (values = {}) => ({
  subtitle: 'Four open frames for drawings, tickets, and glued-in scraps.',
  menu_label: 'SKETCHES',
  caption_1: '',
  caption_2: '',
  caption_3: '',
  caption_4: '',
  ...values,
});

const highlightsData = (values = {}) => ({
  subtitle: 'Close the route by choosing details worth carrying into ordinary days.',
  menu_label: 'HIGHLIGHTS',
  highlight_1: '',
  highlight_2: '',
  highlight_3: '',
  highlight_4: '',
  bring_home: '',
  next_time: '',
  ...values,
});

addNode('root', null, 'cover', 'Field Notes from Elsewhere', {});
addNode('start_here', 'root', 'start', 'Start Here', {
  example_label: 'START HERE',
  skip_label: 'Skip to blank workspace →',
  subtitle: 'Choose a guided Lisbon route or open a clean, configurable journey shelf.',
});

addNode('example_workspace', 'start_here', 'workspace', 'Lisbon, Slowly', {
  subtitle: 'A fictional three-day city journey showing planning, field notes, and reflection together.',
  workspace_mode: 'GUIDED LISBON WORKSPACE',
  hero: 'One hillside base. Three walkable days. Enough structure to notice tiled walls, ferry light, and late-afternoon streets.',
  workspace_note: 'All names, providers, reservations, and schedule details in this branch are fictional teaching examples. No booking codes or personal data are included.',
}, { example: true });

addNode('example_trip_lisbon', 'example_workspace', 'trip', 'Lisbon | Three Days', tripData({
  subtitle: 'Fictional Lisbon route | Three days shaped around neighborhoods rather than a checklist.',
  menu_label: 'LISBON / 3 DAYS',
  destination: 'Lisbon, Portugal',
  dates: '3 days / early autumn',
  base: 'Graça hillside / fictional guesthouse',
  travel_note: 'Use trams early, walk downhill when possible, and keep one long lunch unplanned.',
}), { example: true });

addNode('example_reservations', 'example_trip_lisbon', 'reservations', 'Lisbon Reservations', reservationsData(3, {
  subtitle: 'Three fictional records: lodging, local transit, and one timed cultural stop.',
  notes: 'No real confirmation numbers, payment details, personal names, email addresses, or identity documents appear in this example.',
}), { example: true });

addNode('example_reservation_lodging', 'example_reservations', 'reservation', 'Miradouro House | Lodging', reservationData({
  menu_label: 'LODGING / MIRADOURO HOUSE',
  kind: 'LODGING',
  provider: 'Miradouro House (fictional)',
  address: 'Graça hillside, Lisbon / fictional location',
  arrival: 'Day 01 / after 15:00',
  departure: 'Day 04 / by 11:00',
  booking_reference: 'Not included - fictional example',
  contact: 'Use provider channel / fictional',
  notes: 'Ask about luggage storage. Confirm steep approach before arrival.',
}), { example: true });

addNode('example_reservation_transit', 'example_reservations', 'reservation', 'Tejo Loop Transit | Local Travel', reservationData({
  menu_label: 'TRANSIT / TEJO LOOP',
  kind: 'TRANSIT',
  provider: 'Tejo Loop Transit (fictional)',
  address: 'Airport arrival hall to Alameda interchange, then neighborhood shuttle',
  arrival: 'Day 01 / daytime arrival',
  departure: 'Day 04 / allow 75 minutes',
  booking_reference: 'Not required - fictional example',
  contact: 'Transit desk / fictional',
  notes: 'Buy a reloadable local card on arrival. Verify current service before travel.',
}), { example: true });

addNode('example_reservation_culture', 'example_reservations', 'reservation', 'Tile Museum | Timed Visit', reservationData({
  menu_label: 'TIMED VISIT / TILE MUSEUM',
  kind: 'TIMED ENTRY',
  provider: 'Riverside Tile Study (fictional)',
  address: 'Eastern Lisbon / fictional teaching venue',
  arrival: 'Day 03 / 10:00',
  departure: 'Day 03 / around 11:30',
  booking_reference: 'Not included - fictional example',
  contact: 'Venue desk / fictional',
  notes: 'Arrive ten minutes early. Sketchbook permitted in this fictional example.',
}), { example: true });

addNode('example_itinerary', 'example_trip_lisbon', 'itinerary', 'Three Days in Lisbon', {
  subtitle: 'A fictional route grouped by neighboring places, with generous unscheduled edges.',
  menu_label: 'ITINERARY',
}, { example: true });

addNode('example_day_01', 'example_itinerary', 'day', 'Day 01 | Baixa to Alfama', dayData(1, 3, {
  menu_label: 'DAY 01 / BAIXA + ALFAMA',
  date_label: 'DAY 01 / BAIXA + ALFAMA',
  timeline: '09:30  Settle near Graça\n11:00  Walk down through Mouraria\n13:00  Lunch near Baixa\n15:30  Alfama lanes + small viewpoints\n18:15  Ferry light from the river edge',
  field_notes: 'Laundry moved above a narrow lane like signal flags. At the river the city stopped feeling like a map and became mostly wind, glare, and footsteps on stone.',
  weather: 'Bright / river breeze',
  moment: 'Blue tile fragments beside a repair shop',
}), { example: true });

addNode('example_day_02', 'example_itinerary', 'day', 'Day 02 | Belém to Ajuda', dayData(2, 3, {
  menu_label: 'DAY 02 / BELÉM + AJUDA',
  date_label: 'DAY 02 / BELÉM + AJUDA',
  timeline: '08:30  Tram west before crowds\n09:30  Riverside walk in Belém\n11:30  Garden pause\n13:15  Lunch uphill toward Ajuda\n16:00  Quiet streets + local café\n18:00  Return by bus',
  field_notes: 'Monumental stone gave way quickly to ordinary balconies uphill. Best part was the change in scale: broad river, formal garden, then a café with four tables and a radio.',
  weather: 'High cloud / warm',
  moment: 'Custard scent drifting into the tram queue',
}), { example: true });

addNode('example_day_03', 'example_itinerary', 'day', 'Day 03 | Estrela to the River', dayData(3, 3, {
  menu_label: 'DAY 03 / ESTRELA + RIVER',
  date_label: 'DAY 03 / ESTRELA + RIVER',
  timeline: '09:00  Estrela garden\n10:30  Fictional tile study visit\n12:30  Market lunch\n15:00  Unplanned bookshop hour\n17:30  Walk to Cais do Sodré\n19:00  Final river crossing',
  field_notes: 'A jacaranda shadow patterned the path almost like tile. Kept the afternoon loose and found a narrow bookshop where the shelves made their own crooked topography.',
  weather: 'Soft sun / still',
  moment: 'Last ferry wake folding the reflected city',
}), { example: true });

addNode('example_packing', 'example_trip_lisbon', 'packing', 'Lisbon Packing Notes', packingData({
  pack_1: 'Light layers\nRain shell\nBroken-in walking shoes',
  pack_2: 'Water bottle\nSmall notebook\nSunglasses\nTransit card sleeve',
  pack_3: 'Offline map\nAccommodation address\nEmergency contacts stored securely elsewhere',
  pack_4: 'Blister care\nSun protection\nReusable tote',
  pack_5: 'Leave one-third of the day bag empty. Carry no sensitive documents beyond what the real journey requires.',
}), { example: true });

addNode('example_expenses', 'example_trip_lisbon', 'expenses', 'Lisbon Expense Sketch', expenseData({
  day_1: '01', item_1: 'Airport transit', category_1: 'TRANSIT', amount_1: '€',
  day_2: '01', item_2: 'Lunch', category_2: 'FOOD', amount_2: '€',
  day_3: '01', item_3: 'Ferry', category_3: 'TRANSIT', amount_3: '€',
  day_4: '02', item_4: 'Tram + bus', category_4: 'TRANSIT', amount_4: '€',
  day_5: '02', item_5: 'Lunch', category_5: 'FOOD', amount_5: '€',
  day_6: '03', item_6: 'Timed visit', category_6: 'CULTURE', amount_6: '€',
  day_7: '03', item_7: 'Bookshop', category_7: 'OBJECT', amount_7: '€',
  expense_note: 'Example categories only; amounts intentionally omitted rather than presenting invented prices as current guidance.',
}), { example: true });

addNode('example_tastes', 'example_trip_lisbon', 'tastes', 'Lisbon | Tastes & Finds', tastesData({
  where_1: 'Bakery window, Alfama lane', dish_1: 'Warm custard pastry, extra cinnamon',
  where_2: 'Market counter, Baixa', dish_2: 'Grilled sardines with lemon',
  where_3: 'Corner kiosk by the river', dish_3: 'Bitter espresso, ceramic cup kept cool',
  best_bite: 'The pastry — order two immediately, regret nothing.',
}), { example: true });

addNode('example_sketches', 'example_trip_lisbon', 'sketches', 'Lisbon | Tickets & Sketches', sketchesData({
  caption_1: 'Tram ticket, morning ride west',
  caption_2: 'Tile pattern from an Alfama doorway',
  caption_3: 'Ferry deck rail at dusk',
  caption_4: 'Bookshop shelf that leaned like the street',
}), { example: true });

addNode('example_highlights', 'example_trip_lisbon', 'highlights', 'Lisbon | What Remains', highlightsData({
  highlight_1: 'The ferry deck at the edge of evening.',
  highlight_2: 'Warm pastry, bitter coffee, salt in the river air.',
  highlight_3: 'Door numbers painted directly onto blue tile.',
  highlight_4: 'A café owner describing the quietest uphill route.',
  bring_home: 'Walk neighborhoods in sequences, not attractions in lists. Leave enough margin to follow texture, weather, and appetite.',
  next_time: 'Stay longer in one district and take an early train beyond the city.',
}), { example: true });

addNode('blank_workspace', 'start_here', 'workspace', 'My Journey Shelf', {
  example_label: '',
  skip_label: '',
  subtitle: 'A clean configurable workspace with no sample destinations, bookings, costs, or journal entries.',
  workspace_mode: 'BLANK WORKSPACE',
  hero: 'Choose a journey, gather practical details, and make room for notes from the field.',
  workspace_note: 'Trip dashboards below link every planning and reflection destination by stable semantic node ID.',
});

for (let tripNumber = 1; tripNumber <= CONFIG.tripCount; tripNumber += 1) {
  const tripLabel = String(tripNumber).padStart(2, '0');
  const prefix = `blank_trip_${tripLabel}`;
  addNode(prefix, 'blank_workspace', 'trip', `Journey ${tripLabel}`, tripData({
    subtitle: `Journey ${tripLabel} | ${CONFIG.daysPerTrip} day pages and ${CONFIG.reservationsPerTrip} reservation records.`,
    menu_label: `JOURNEY ${tripLabel}`,
  }));

  const reservationsId = `${prefix}_reservations`;
  addNode(reservationsId, prefix, 'reservations', `Journey ${tripLabel} | Reservations`, reservationsData(CONFIG.reservationsPerTrip));
  for (let reservationNumber = 1; reservationNumber <= CONFIG.reservationsPerTrip; reservationNumber += 1) {
    const reservationLabel = String(reservationNumber).padStart(2, '0');
    addNode(`${prefix}_reservation_${reservationLabel}`, reservationsId, 'reservation', `Reservation ${reservationLabel}`, reservationData({
      menu_label: `RESERVATION ${reservationLabel}`,
    }));
  }

  const itineraryId = `${prefix}_itinerary`;
  addNode(itineraryId, prefix, 'itinerary', `Journey ${tripLabel} | Itinerary`, {
    subtitle: `${CONFIG.daysPerTrip} clean daily route and field-note pages.`,
    menu_label: 'ITINERARY',
  });
  for (let dayNumber = 1; dayNumber <= CONFIG.daysPerTrip; dayNumber += 1) {
    const dayLabel = String(dayNumber).padStart(2, '0');
    addNode(`${prefix}_day_${dayLabel}`, itineraryId, 'day', `Day ${dayLabel}`, dayData(dayNumber, CONFIG.daysPerTrip));
  }

  addNode(`${prefix}_packing`, prefix, 'packing', `Journey ${tripLabel} | Packing`, packingData());
  addNode(`${prefix}_expenses`, prefix, 'expenses', `Journey ${tripLabel} | Expenses`, expenseData());
  addNode(`${prefix}_tastes`, prefix, 'tastes', `Journey ${tripLabel} | Tastes & Finds`, tastesData());
  addNode(`${prefix}_sketches`, prefix, 'sketches', `Journey ${tripLabel} | Tickets & Sketches`, sketchesData());
  addNode(`${prefix}_highlights`, prefix, 'highlights', `Journey ${tripLabel} | Highlights`, highlightsData());
}

return { nodes, rootId: 'root' };
