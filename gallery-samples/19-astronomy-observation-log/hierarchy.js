const DEFAULT_CONFIG = { sessionCount: 20 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = { sessionCount: [8, 40] };
Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`The Observatory config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`The Observatory node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`The Observatory template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  const node = { id, parentId, type, title, data: nodeData, children: [] };
  if (typeof options.referenceId === 'string') node.referenceId = options.referenceId;
  nodes[id] = node;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`The Observatory parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const pad2 = (value) => String(value).padStart(2, '0');

// --- The twenty targets ------------------------------------------------------
// Written for northern mid-latitudes (roughly 35-55 degrees north). Types,
// constellations, magnitudes, and season notes are the mainstream astronomical
// consensus, kept evergreen: nothing here depends on the current year. The
// planets and the Moon are described generically - they move - and the last
// card is the non-negotiable solar-eclipse safety brief.

const TARGETS = {
  m31: {
    title: 'Andromeda Galaxy', designation: 'M31',
    target_kicker: 'Autumn evenings, high overhead',
    spec_type: 'Spiral galaxy',
    spec_const: 'Andromeda',
    spec_mag: '3.4 – naked-eye from a dark site',
    spec_diff: 'Easy – plain in binoculars',
    finder_notes: 'Find the Great Square of Pegasus, then follow the chain of Andromeda two stars east to Mirach. Turn a right angle north through fainter Mu Andromedae and go the same distance again – the long oval glow is the galaxy\'s core. Binoculars show it even over towns; a telescope at low power adds the bright nucleus and, from dark sites, a dust lane and the companions M32 and M110. The light landing in your eye left it about 2.5 million years ago.',
  },
  m42: {
    title: 'Orion Nebula', designation: 'M42',
    target_kicker: 'The winter showpiece, due south mid-evening',
    spec_type: 'Emission nebula',
    spec_const: 'Orion',
    spec_mag: '4.0 – visible to the naked eye',
    spec_diff: 'Easy – rewards every instrument',
    finder_notes: 'Below Orion\'s three-star Belt hangs the Sword. Its middle "star" looks fuzzy to the naked eye – that fuzz is the nebula. Any telescope shows gray-green wings of gas folded around the Trapezium, a tight quadrilateral of newborn stars at the heart. Start at low power for the full sweep, then magnify the Trapezium; averted vision doubles how far the wings reach.',
  },
  m45: {
    title: 'Pleiades', designation: 'M45',
    target_kicker: 'Winter evenings, riding high ahead of Orion',
    spec_type: 'Open cluster',
    spec_const: 'Taurus',
    spec_mag: '1.6 – an unmistakable naked-eye knot',
    spec_diff: 'Easy – binoculars frame it best',
    finder_notes: 'Follow Orion\'s Belt up past orange Aldebaran and keep going: the tight dipper-shaped knot of blue-white stars is the Pleiades, the Seven Sisters. Six or seven show to the naked eye; binoculars spill several dozen across the field, which is the finest way to take them – most telescopes magnify too much to hold the whole cluster at once.',
  },
  m13: {
    title: 'Hercules Cluster', designation: 'M13',
    target_kicker: 'Summer evenings, near the zenith',
    spec_type: 'Globular cluster',
    spec_const: 'Hercules',
    spec_mag: '5.8 – a gray puff in a finder scope',
    spec_diff: 'Easy – resolves with aperture',
    finder_notes: 'Find the Keystone, the four-star trapezoid of Hercules, high overhead on summer evenings. M13 sits on its western side, about a third of the way down from Eta toward Zeta Herculis – binoculars show a fuzzy star. A 150 mm telescope at around 100x begins to resolve its edges into pinpoint stars: a swarm of several hundred thousand suns, about 25,000 light-years out.',
  },
  m8: {
    title: 'Lagoon Nebula', designation: 'M8',
    target_kicker: 'Summer, low in the south over the Teapot',
    spec_type: 'Emission nebula',
    spec_const: 'Sagittarius',
    spec_mag: '6.0 – naked-eye under dark skies',
    spec_diff: 'Moderate – wants a clear south horizon',
    finder_notes: 'Above the spout of the Sagittarius Teapot, dark-sky observers see a small brightening in the Milky Way with the naked eye. Binoculars show a glowing pool cut by a dark channel – the lagoon – with the young cluster NGC 6530 embedded on its eastern side. From mid-northern latitudes it never climbs high, so catch it in the hour it crosses due south.',
  },
  m20: {
    title: 'Trifid Nebula', designation: 'M20',
    target_kicker: 'Summer, in the same binocular field as the Lagoon',
    spec_type: 'Emission and reflection nebula',
    spec_const: 'Sagittarius',
    spec_mag: '6.3 – small and low',
    spec_diff: 'Challenging – dark skies help',
    finder_notes: 'Sweep about a degree and a half north-northwest from the Lagoon Nebula; the two share a low-power field. A telescope from dark sites shows a round glow split by dark lanes into three lobes – the "trifid" of the name – with a fainter blue reflection cap on its north side. Haze or moonlight erases it, so save this one for a transparent, moonless night.',
  },
  m27: {
    title: 'Dumbbell Nebula', designation: 'M27',
    target_kicker: 'Summer and early autumn, high in Vulpecula',
    spec_type: 'Planetary nebula',
    spec_const: 'Vulpecula',
    spec_mag: '7.4 – bright for its class',
    spec_diff: 'Easy in a small telescope',
    finder_notes: 'From Gamma Sagittae, the tip star of the little Arrow, nudge about three degrees north. At low power a bright apple-core of glowing gas appears – the brightest planetary nebula in the northern sky, the cast-off shroud of a dying sunlike star. It takes magnification well; an OIII or UHC filter makes the two bright lobes stand out sharply.',
  },
  m57: {
    title: 'Ring Nebula', designation: 'M57',
    target_kicker: 'Summer, between the bottom stars of Lyra',
    spec_type: 'Planetary nebula',
    spec_const: 'Lyra',
    spec_mag: '8.8 – small but high-contrast',
    spec_diff: 'Moderate – needs about 100x',
    finder_notes: 'Point midway between Beta and Gamma Lyrae, the bottom pair of Lyra\'s parallelogram hanging under Vega. The Ring is too small for binoculars – at low power it is one "star" among many – but at 100x it becomes a tiny, perfect gray smoke ring. A classic test of steady seeing: the sharper the night, the crisper the hole in the middle.',
  },
  m81: {
    title: 'Bode\'s Galaxy', designation: 'M81',
    target_kicker: 'Spring evenings, high in the north',
    spec_type: 'Spiral galaxy',
    spec_const: 'Ursa Major',
    spec_mag: '6.9 – binocular-bright from dark sites',
    spec_diff: 'Moderate – an easy star-hop',
    finder_notes: 'Draw a diagonal across the Big Dipper\'s bowl from Phecda through Dubhe and extend it the same distance again. M81 waits there as an oval glow – and the cigar-shaped starburst galaxy M82 shares the same low-power field, two galaxies in one eyepiece. The pair is circumpolar from mid-northern latitudes, best when the Dipper rides highest on spring evenings.',
  },
  m44: {
    title: 'Beehive Cluster', designation: 'M44',
    target_kicker: 'Late winter into spring, midway up the south',
    spec_type: 'Open cluster',
    spec_const: 'Cancer',
    spec_mag: '3.7 – a naked-eye mist',
    spec_diff: 'Easy – made for binoculars',
    finder_notes: 'Halfway along the line from Pollux in Gemini to Regulus in Leo, inside the dim trapezoid of Cancer. The naked eye sees a misty patch – the ancients called it Praesepe, the Manger – and binoculars burst it into dozens of stars. Like the Pleiades it is wide: use the lowest power you own, or the hive flies out of the field.',
  },
  m51: {
    title: 'Whirlpool Galaxy', designation: 'M51',
    target_kicker: 'Spring evenings, under the Dipper\'s handle',
    spec_type: 'Interacting spiral galaxy',
    spec_const: 'Canes Venatici',
    spec_mag: '8.4 – surface brightness is low',
    spec_diff: 'Challenging – dark skies required',
    finder_notes: 'From Alkaid, the end star of the Big Dipper\'s handle, drop about three and a half degrees toward Cor Caroli. Under dark skies a telescope shows two touching glows: the face-on spiral and its small companion NGC 5195, caught mid-collision. Medium apertures on moonless nights begin to show the spiral arms – the first galaxy ever seen to have them.',
  },
  m104: {
    title: 'Sombrero Galaxy', designation: 'M104',
    target_kicker: 'Spring evenings, midway up the southern sky',
    spec_type: 'Edge-on spiral galaxy',
    spec_const: 'Virgo',
    spec_mag: '8.0 – condensed and starlike at first',
    spec_diff: 'Challenging – small and southerly',
    finder_notes: 'About eleven degrees west of Spica, on the border between Virgo and Corvus. A telescope shows a bright spindle with a bulging core; from dark sites, larger apertures reveal the dark dust lane slicing along its edge – the brim of the hat. It sits well south, so take it as it crosses the meridian, and let the eye settle before judging what you see.',
  },
  double: {
    title: 'The Double Cluster', designation: 'NGC 869/884',
    target_kicker: 'Autumn and winter, high between Perseus and Cassiopeia',
    spec_type: 'Pair of open clusters',
    spec_const: 'Perseus',
    spec_mag: '4.3 together – naked-eye from dark skies',
    spec_diff: 'Easy – a low-power showpiece',
    finder_notes: 'Halfway between the W of Cassiopeia and the bright stretch of Perseus, the naked eye picks up an elongated soft glow in the Milky Way. Binoculars split it into two rich clusters sharing one field; a telescope at the lowest power drips with stars, including a scatter of orange supergiants. Circumpolar from mid-northern latitudes and at its best on autumn and winter evenings.',
  },
  albireo: {
    title: 'Albireo', designation: 'Beta Cyg',
    target_kicker: 'Summer, at the head of the Swan',
    spec_type: 'Double star – gold and sapphire',
    spec_const: 'Cygnus',
    spec_mag: '3.1 combined – components 3.4 and 5.1',
    spec_diff: 'Easy – splits at low power',
    finder_notes: 'The star at the head of Cygnus the Swan – the foot of the Northern Cross – where the constellation points down the summer Milky Way. Any telescope at about 30x splits it into a golden primary with a blue-white companion, the sky\'s finest color-contrast pair. If the two stars will not separate, nudge the power up a step and let the seeing settle.',
  },
  saturn: {
    title: 'Saturn', designation: 'PLANET',
    target_kicker: 'Wanders the zodiac – check an almanac for tonight',
    spec_type: 'Ringed gas giant',
    spec_const: 'Moves along the ecliptic',
    spec_mag: 'About -0.5 to 1.0 – ring tilt decides',
    spec_diff: 'Easy – rings show from 25x',
    finder_notes: 'A steady, cream-colored point that does not twinkle like the stars around it; a current almanac, planisphere, or app gives its place among the zodiac constellations tonight. Any telescope at 25x shows the rings – the sight that has hooked observers for four centuries. At 100x in steady air look for the Cassini Division, the shadow of the globe on the rings, and 8th-magnitude Titan standing off to one side. The ring tilt opens and closes over a 29-year cycle, so no two apparitions look quite alike.',
  },
  jupiter: {
    title: 'Jupiter', designation: 'PLANET',
    target_kicker: 'Wanders the zodiac – check an almanac for tonight',
    spec_type: 'Gas giant with four bright moons',
    spec_const: 'Moves along the ecliptic',
    spec_mag: 'About -2.0 to -2.9 – outshines every star',
    spec_diff: 'Easy – moons even in binoculars',
    finder_notes: 'When it is up, usually the brightest starlike object in the late-evening sky – only Venus outshines it. Steadied binoculars already show up to four Galilean moons in a line that rearranges night to night; a telescope at 100x shows the two dark equatorial cloud belts, and in good seeing the Great Red Spot as the planet\'s ten-hour rotation carries it across. Watch for moon shadows crossing the disk – a current almanac lists the events.',
  },
  venus: {
    title: 'Venus', designation: 'PLANET',
    target_kicker: 'The evening or morning star – check an almanac',
    spec_type: 'Inner planet – shows phases',
    spec_const: 'Never far from the Sun',
    spec_mag: 'About -4 – the brightest point of light',
    spec_diff: 'Easy – but mind the nearby Sun',
    finder_notes: 'The blazing "evening star" low in the west after sunset, or the "morning star" before dawn – Venus never strays more than about 47 degrees from the Sun, so it is always a twilight object. A telescope shows a brilliant white phase like a miniature Moon: gibbous when far around its orbit, a large thin crescent when it swings near. Wait until the Sun is fully below the horizon before pointing any optics its way.',
  },
  mars: {
    title: 'Mars', designation: 'PLANET',
    target_kicker: 'Wanders the zodiac – best near opposition',
    spec_type: 'Rocky planet – the red wanderer',
    spec_const: 'Moves along the ecliptic',
    spec_mag: 'From -2.9 at a close opposition to 1.8',
    spec_diff: 'Moderate – detail wants opposition',
    finder_notes: 'An unmistakable rust-orange point when it is up; an almanac gives tonight\'s position. Mars only shows a worthwhile disk in the months around its oppositions, which come roughly every 26 months – between them it shrinks to a featureless dot. Near opposition, 150x to 250x in steady air can show a white polar cap and dusky surface markings; be patient and observe on several nights, since the planet rotates only a little slower than Earth.',
  },
  moon: {
    title: 'The Moon', designation: 'LUNA',
    target_kicker: 'Best along the terminator – first quarter especially',
    spec_type: 'Natural satellite',
    spec_const: 'Crosses the zodiac each month',
    spec_mag: 'About -12.7 when full',
    spec_diff: 'Easy – every instrument rewards',
    finder_notes: 'No finding required – the craft is timing. Look along the terminator, the moving line between lunar day and night, where low sunlight throws every crater and ridge into sharp relief. First quarter, high in the evening sky, is the classic session; full Moon is flat and blinding by comparison. Work the terminator north to south at rising powers, and use a Moon filter if the glare stings. The features are endless: no two nights repeat.',
  },
  eclipse: {
    title: 'The Sun in Eclipse', designation: 'SAFETY',
    target_kicker: 'Read before any solar attempt – no exceptions',
    spec_type: 'Solar eclipse – safety brief',
    spec_const: 'Wherever the Moon crosses the Sun',
    spec_mag: 'Never observe it unfiltered',
    spec_diff: 'Certified solar filters only',
    finder_notes: 'Never look at the Sun – eclipsed or not – without proper protection, and never through any telescope, binocular, or camera unless a certified solar filter is fitted over the FRONT of the instrument. For your eyes alone, use eclipse glasses that meet ISO 12312-2, undamaged and from a reputable maker. Sunglasses, smoked glass, exposed film, and eyepiece-end "sun filters" are never safe. The safest method needs no filter at all: pinhole projection, casting the Sun\'s image through a small hole onto paper. Only during the brief totality of a total eclipse, with the Sun\'s disk completely covered, may filters come off – and they go back on before the first sliver of Sun returns.',
  },
};

const CATALOG_ORDER = [
  'm31', 'm42', 'm45', 'm13', 'm8', 'm20', 'm27', 'm57', 'm81', 'm44',
  'm51', 'm104', 'double', 'albireo', 'saturn', 'jupiter', 'venus', 'mars', 'moon', 'eclipse',
];

// Card data carries everything but the title (the node title is the common
// name); first-observed fields and notes stay blank on the shared cards.
const cardData = (key, overrides = {}) => {
  const { title, ...facts } = TARGETS[key];
  return {
    ...facts,
    first_date: '',
    first_instrument: '',
    first_sky: '',
    card_notes: '',
    ...overrides,
  };
};

const sessionData = (overrides = {}) => ({
  sess_date: '', sess_conditions: '', sess_seeing: '',
  sess_target: '', sess_notes: '',
  obs_prev_label: '', obs_next_label: '',
  ...overrides,
});

const monthData = (overrides = {}) => {
  const data = {
    month_note: '',
    month_prev_label: '', month_next_label: '',
  };
  for (let n = 1; n <= 5; n += 1) data[`highlight_${n}_label`] = '';
  return { ...data, ...overrides };
};

// --- The twelve month skies --------------------------------------------------
// Highlights are deep-sky only (the wanderers move; the template's standing
// Moon-and-planets note handles them generically). Placements are evergreen
// northern-mid-latitude evening astronomy: Orion in winter, the Hercules
// cluster and the Sagittarius nebulae in summer, Andromeda in autumn, galaxy
// season in spring. Meteor-shower mentions are the stable annual showers.

const MONTHS = [
  ['January', 'Crisp, early dark, Orion due south by mid-evening. The Quadrantid meteors peak in the first days.', [
    ['m42', 'M42 · Orion Nebula, due south'],
    ['m45', 'M45 · Pleiades, near overhead'],
    ['double', 'The Double Cluster, high northwest'],
    ['m44', 'M44 · Beehive, well up by nine'],
  ]],
  ['February', 'Orion still rules the south while the Beehive climbs the east and the first galaxies wait in the wings.', [
    ['m42', 'M42 · Orion Nebula, early evening'],
    ['m45', 'M45 · Pleiades, high southwest'],
    ['m44', 'M44 · Beehive, riding high'],
    ['m81', 'M81 · Bode\'s Galaxy, climbing northeast'],
  ]],
  ['March', 'Equinox month – winter tips into the west while the spring galaxies rise behind it.', [
    ['m44', 'M44 · Beehive, due south mid-evening'],
    ['m81', 'M81 · with M82 in one field'],
    ['m51', 'M51 · Whirlpool, up by ten'],
    ['m42', 'M42 · last call, sinking southwest'],
  ]],
  ['April', 'Galaxy season proper – dark evenings between the Dipper and Virgo. Lyrid meteors late in the month.', [
    ['m51', 'M51 · Whirlpool, under the handle'],
    ['m81', 'M81 · Bode\'s Galaxy, near the zenith'],
    ['m104', 'M104 · Sombrero, crossing south'],
    ['m44', 'M44 · Beehive, high in the west'],
  ]],
  ['May', 'The Dipper hangs overhead, galaxies everywhere – and the first globular of summer rises in the east.', [
    ['m13', 'M13 · Hercules Cluster, rising east'],
    ['m51', 'M51 · Whirlpool, best placed'],
    ['m104', 'M104 · Sombrero, early evening south'],
    ['m81', 'M81 · Bode\'s Galaxy, still high'],
  ]],
  ['June', 'Shortest nights – wait out the long twilight, then the summer sky arrives all at once.', [
    ['m13', 'M13 · Hercules Cluster, high east'],
    ['m57', 'M57 · Ring Nebula, under Vega'],
    ['albireo', 'Albireo · the gold and blue double'],
    ['m51', 'M51 · Whirlpool, overhead, dark sky'],
  ]],
  ['July', 'The Milky Way stands up out of Sagittarius – nebula country, low and rich in the south.', [
    ['m8', 'M8 · Lagoon, over the Teapot'],
    ['m20', 'M20 · Trifid, beside the Lagoon'],
    ['m13', 'M13 · Hercules Cluster, at the zenith'],
    ['m57', 'M57 · Ring Nebula, high east'],
    ['m27', 'M27 · Dumbbell, well up by eleven'],
  ]],
  ['August', 'Perseid meteors peak mid-month and the Summer Triangle owns the zenith – the classic camping sky.', [
    ['m8', 'M8 · Lagoon, crossing due south'],
    ['m20', 'M20 · Trifid, same field'],
    ['m27', 'M27 · Dumbbell, overhead'],
    ['m57', 'M57 · Ring Nebula, near the zenith'],
    ['albireo', 'Albireo · high in the Swan'],
  ]],
  ['September', 'The Milky Way tips west while Andromeda climbs the northeast – autumn arrives after midnight first.', [
    ['m31', 'M31 · Andromeda, rising northeast'],
    ['m27', 'M27 · Dumbbell, still overhead'],
    ['albireo', 'Albireo · high in the west'],
    ['m13', 'M13 · Hercules Cluster, west, still fine'],
  ]],
  ['October', 'Galaxy of the month: our neighbor, near the zenith. The Orionid meteors peak late in the month.', [
    ['m31', 'M31 · Andromeda, near overhead'],
    ['double', 'The Double Cluster, high northeast'],
    ['m45', 'M45 · Pleiades, up by ten'],
    ['m27', 'M27 · Dumbbell, early evening west'],
  ]],
  ['November', 'Dark by six – the autumn sky at its best with winter rising behind it. Leonid meteors mid-month.', [
    ['m31', 'M31 · Andromeda, overhead'],
    ['double', 'The Double Cluster, near the zenith'],
    ['m45', 'M45 · Pleiades, high east'],
    ['m42', 'M42 · Orion Nebula, rises late evening'],
  ]],
  ['December', 'The Geminid meteors mid-month are the year\'s best, and winter\'s showpieces return in force.', [
    ['m42', 'M42 · Orion Nebula, up by nine'],
    ['m45', 'M45 · Pleiades, near the zenith'],
    ['double', 'The Double Cluster, overhead'],
    ['m31', 'M31 · Andromeda, high west'],
    ['m44', 'M44 · Beehive, rising late evening'],
  ]],
];

const monthHighlightData = (rows) => {
  const data = {};
  rows.forEach(([key, chipLabel], index) => {
    data[`highlight_${index + 1}_label`] = chipLabel;
  });
  return data;
};

// --- Root and guide ----------------------------------------------------------

addNode('root', null, 'cover', 'The Observatory', {});

addNode('start_here', 'root', 'start', 'First Light', {
  example_label: '',
  skip_label: '',
});

// --- Worked example (EXAMPLE chrome lives here only) -------------------------
// One honest winter session on M42 and the filled card that came home with it.
// The card is a separate example copy - the shared catalog card stays blank.
// 17 January 2026 is a real dark-sky evening: the Moon was a thin waning
// crescent rising just before dawn, leaving the whole evening moonless.

addNode('example_workspace', 'start_here', 'workspace', 'The Worked Example', {
  hero: 'One night taken end to end – an observation sheet from a moonless January evening on the Orion Nebula, and the target card it filled in: first-observed box dated, notes written while the eyepiece was still frosting.',
  workspace_note: 'Everything on this bench is marked EXAMPLE. Your live log runs from Your Observatory.',
  slot_a_label: 'The worked session »',
  slot_b_label: 'M42, card filled »',
  hub_months_label: '', hub_catalog_label: '', hub_lifelist_label: '',
  hub_sessions_label: '', hub_equipment_label: '', hub_glossary_label: '',
}, { example: true });

addNode('example_session', 'example_workspace', 'session', 'A Night on the Orion Nebula', sessionData({
  sess_date: 'Sat 17 Jan 2026 · 21:30',
  sess_conditions: 'Clear and transparent – no Moon all evening, hard frost',
  sess_seeing: 'Steady · stars calm at 100x',
  sess_target: 'M42 · Orion Nebula',
  sess_notes: 'Started at 48x: the nebula\'s wings stretched over half the field with averted vision, a gray-green fan opening east. The Trapezium split clean at 96x – four stars in a tight keystone. Sketched the dark bay that cuts into the glow beside them. Best view of the winter so far; gloves off thirty seconds at a time, eyepiece frosting by eleven.',
}), { example: true });

addNode('example_target', 'example_workspace', 'target', 'Orion Nebula, Logged', cardData('m42', {
  first_date: '17 Jan 2026 · 21:30',
  first_instrument: '150 mm reflector · 25 mm and 12.5 mm eyepieces',
  first_sky: 'Clear, dark, moonless · steady seeing',
  card_notes: 'The wings ran farther than expected with averted vision. All four Trapezium stars held at 96x. The dark bay – the "Fish\'s Mouth" – cuts hard into the brightest glow. Came back inside grinning; this card is why the log exists.',
}), { example: true });

// --- Your Observatory (blank workspace) --------------------------------------
// Child order is load-bearing for the page sequence: twelve month skies, the
// twenty-card catalog, the life list, then the session logs, the equipment
// shelf, and the two glossary pages. Month highlights and life-list rows are
// reference children pointing at the same shared catalog cards.

addNode('blank_workspace', 'start_here', 'workspace', 'Your Observatory', {
  example_label: '',
  skip_label: '',
  hero: `Twelve month skies over a twenty-target catalog – nebulae, clusters, galaxies, doubles, the planets, the Moon, and the eclipse-safety brief – with a life list to tick, ${CONFIG.sessionCount} sketch-circle observation sheets, the equipment shelf, and a two-page glossary, all pre-linked.`,
  workspace_note: `This copy: ${CONFIG.sessionCount} observation sheets. Set sessionCount (8-40) in the generator config.`,
  slot_a_label: '',
  slot_b_label: '',
  hub_months_label: 'The twelve month skies »',
  hub_catalog_label: 'The target catalog »',
  hub_lifelist_label: 'The life list »',
  hub_sessions_label: 'Observation sheets »',
  hub_equipment_label: 'The equipment shelf »',
  hub_glossary_label: 'The glossary »',
});

const MONTH_TITLES = MONTHS.map(([title]) => title);
MONTHS.forEach(([title, note, rows], index) => {
  const n = index + 1;
  addNode(`month_${pad2(n)}`, 'blank_workspace', 'month_sky', title, monthData({
    month_note: note,
    month_prev_label: n > 1 ? `« ${MONTH_TITLES[index - 1]}` : '',
    month_next_label: n < 12 ? `${MONTH_TITLES[index + 1]} »` : '',
    ...monthHighlightData(rows),
  }));
});

MONTHS.forEach(([title, note, rows], monthIndex) => {
  rows.forEach(([key], rowIndex) => {
    addNode(`m${pad2(monthIndex + 1)}_ref_${rowIndex + 1}`, `month_${pad2(monthIndex + 1)}`, 'target',
      `» ${TARGETS[key].title}`, {}, { referenceId: `target_${key}` });
  });
});

// The twenty shared catalog cards, in catalog order, right after the months.
CATALOG_ORDER.forEach((key) => {
  addNode(`target_${key}`, 'blank_workspace', 'target', TARGETS[key].title, cardData(key));
});

// The life list: reference children to all twenty cards drive its
// child_index checklist rows.
const lifeListLabels = {};
CATALOG_ORDER.forEach((key, index) => {
  const t = TARGETS[key];
  const label = ['saturn', 'jupiter', 'venus', 'mars', 'moon'].includes(key)
    ? t.title
    : key === 'eclipse'
      ? 'The Sun in Eclipse · safety'
      : `${t.designation} · ${t.title}`;
  lifeListLabels[`ll_${index + 1}`] = label;
});

addNode('life_list', 'blank_workspace', 'life_list', 'The Life List', lifeListLabels);

CATALOG_ORDER.forEach((key, index) => {
  addNode(`ll_ref_${pad2(index + 1)}`, 'life_list', 'target', `» ${TARGETS[key].title}`,
    {}, { referenceId: `target_${key}` });
});

// The observation sheets, chained night into night; both true ends bind ''.
for (let n = 1; n <= CONFIG.sessionCount; n += 1) {
  addNode(`session_${pad2(n)}`, 'blank_workspace', 'session', `Session ${pad2(n)}`, sessionData({
    obs_prev_label: n > 1 ? `« Session ${pad2(n - 1)}` : '',
    obs_next_label: n < CONFIG.sessionCount ? `Session ${pad2(n + 1)} »` : '',
  }));
}

// The shelf: one equipment page and the two glossary pages.
addNode('equipment_01', 'blank_workspace', 'equipment', 'The Equipment Shelf', {});

addNode('glossary_01', 'blank_workspace', 'glossary', 'Glossary · A to L', {
  term_1: 'Averted vision',
  def_1: 'Looking slightly to one side of a faint object. The eye\'s off-center rods see deeper than its middle, so the nebula brightens when you stop staring at it.',
  term_2: 'Aperture',
  def_2: 'The diameter of a telescope\'s main lens or mirror. It sets how much light you gather – the one number that matters most.',
  term_3: 'Collimation',
  def_3: 'The alignment of a telescope\'s optics. A reflector only delivers sharp stars when collimated; check it when high-power views turn soft.',
  term_4: 'Dark adaptation',
  def_4: 'The eyes\' slow gain in night sensitivity – near-full after about thirty minutes. One glance at a white light resets the clock; dim red light preserves it.',
  term_5: 'Declination',
  def_5: 'The sky\'s north-south coordinate, latitude\'s counterpart, in degrees from the celestial equator. Right ascension is its east-west partner, measured in hours.',
  term_6: 'Ecliptic',
  def_6: 'The Sun\'s yearly track against the stars. The Moon and planets keep close to this line – which is why the wanderers always cross the zodiac.',
  term_7: 'Exit pupil',
  def_7: 'The width of the light beam leaving the eyepiece: aperture divided by power. Between about 1 and 7 mm it matches what a dark-adapted eye can use.',
  term_8: 'Field of view',
  def_8: 'The patch of sky the eyepiece shows. Big showpieces – the Pleiades, the Beehive, the Double Cluster – want the widest, lowest-power field you own.',
  term_9: 'Globular cluster',
  def_9: 'A dense ball of hundreds of thousands of ancient stars orbiting the galaxy\'s core. M13 in Hercules is the northern sky\'s showpiece.',
  gl_prev_label: '',
  gl_next_label: 'M to Z »',
});

addNode('glossary_02', 'blank_workspace', 'glossary', 'Glossary · M to Z', {
  term_1: 'Magnitude',
  def_1: 'Brightness on an inverted scale – bigger numbers are fainter. Five magnitudes is a hundredfold step; magnitude 6 is the naked-eye limit under dark skies.',
  term_2: 'Messier catalog',
  def_2: 'Charles Messier\'s 18th-century list of about 110 comet-impostors – nebulae, clusters, and galaxies that are now the beginner\'s grand tour of the deep sky.',
  term_3: 'Open cluster',
  def_3: 'A loose family of young stars born from one cloud and still traveling together. The Pleiades wrote the type specimen.',
  term_4: 'Opposition',
  def_4: 'When an outer planet stands opposite the Sun in our sky – rising at sunset, up all night, closest, and brightest. The months to watch Mars.',
  term_5: 'Planetary nebula',
  def_5: 'The glowing cast-off shell of a dying sunlike star – nothing to do with planets beyond the round look in old telescopes. The Ring and the Dumbbell are the classics.',
  term_6: 'Seeing',
  def_6: 'The steadiness of the air. Good seeing means still, sharp stars at high power; poor seeing smears them. Judge it every session – it decides your magnification.',
  term_7: 'Terminator',
  def_7: 'The line between day and night on the Moon, where shadows run longest and craters stand in sharpest relief. Observe along it, not at the full glare.',
  term_8: 'Transparency',
  def_8: 'The clarity of the air – how faint you can see. Haze and high moisture kill transparency on nights that look cloudless; the faint galaxies notice first.',
  term_9: 'Zenith',
  def_9: 'The point straight overhead, where you look through the least air. Targets near it show the sky at its darkest and steadiest.',
  gl_prev_label: '« A to L',
  gl_next_label: '',
});

return { nodes, rootId: 'root' };
