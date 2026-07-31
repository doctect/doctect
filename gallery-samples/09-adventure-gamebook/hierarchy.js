const DEFAULT_CONFIG = { blankSectionCount: 20 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = { blankSectionCount: [8, 40] };
Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Branching Road config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Branching Road node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Branching Road template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  const node = { id, parentId, type, title, data: nodeData, children: [] };
  if (typeof options.referenceId === 'string') node.referenceId = options.referenceId;
  nodes[id] = node;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Branching Road parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const pad3 = (value) => String(value).padStart(3, '0');
const sectionId = (value) => `section_${pad3(value)}`;

// --- The adventure ----------------------------------------------------------
// Fifty numbered sections. Entries: [n, prose, choices] where each choice is
// [destination, chip label]. Endings: [n, prose, [], kind]. Everything here is
// original fiction: Hollowpine Forest, Wrenfold, and everyone on the road are
// invented for this gamebook.

const STORY = [
  [1, 'The coach road to Wrenfold drowned in the autumn floods, so the letter must walk. You stand where the old post road enters Hollowpine: a sunken lane, a leaning gate, and a board whose warning has weathered down to four words – KEEP TO THE ROAD. The seal on the letter in your satchel is the warden\'s own, and the warden pays for delivery by morning. Dusk is an hour off. Ahead, the lane runs into the trees; to the right, the chimney of the ruined toll-house is – impossibly – smoking; and by the gate crouches a little roadside shrine.', [
    [2, '» Press on along the post road while the light lasts – turn to 2'],
    [3, '» Turn aside to the toll-house and its impossible smoke – turn to 3'],
    [4, '» Stop first at the little roadside shrine – turn to 4'],
  ]],
  [2, 'For a while the road keeps its promises. Old flagstones surface through the mud like the backs of turtles, laid when Wrenfold\'s timber still mattered to somebody with money. You pass one milestone scraped faceless by weather, then a second – freshly chalked, which is wrong, because nobody has chalked a milestone out here in living memory. The pines lean closer together. Off to the left, water talks quietly to itself. The light is going faster than any map allowed for.', [
    [5, '» Read the chalked milestone properly – turn to 5'],
    [6, '» Save the light and cut through the pines – turn to 6'],
  ]],
  [3, 'The toll-house crouches where the lane once crossed a cart road, before the forest ate the cart road. Half the roof has fallen in, yet a thin rope of smoke stands from the chimney – and then stops, as if aware of being watched. The gate arm still bars the way, politely, after all these years. On the porch hangs a bell with no clapper. Around the back lies the well yard, where something small catches the last of the light.', [
    [7, '» Knock, and try the porch door – turn to 7'],
    [8, '» Walk round to the well yard first – turn to 8'],
  ]],
  [4, 'The shrine is a knee-high house of flat stones, kept for whatever small god minds this road. Travelers have left what travelers leave: a coin gone green, a bone button, a dry crust. And a lantern – tin, dented, smelling of fresh oil – hanging from an iron hook as if set there an hour ago. A light in Hollowpine is worth a small sacrilege; the little god can spare it until morning. You lift it down and note it in your record. Behind you, the road divides.', [
    [5, '» Follow the post road, lantern in hand – turn to 5'],
    [7, '» Carry your borrowed light to the toll-house – turn to 7'],
  ]],
  [5, 'The chalk is fresh enough to smear under your thumb. Not a number – a number you would forgive – but an arrow, and beneath it, small and neat as a ledger line: THE ROAD IS NOT WHERE IT WAS. The arrow points away from the road entirely, toward a fold in the ground where a single thread of smoke stands perfectly still above the trees. Every county has its joker. But the hand is careful, old-fashioned – a clerk\'s hand, or a surveyor\'s – and your neck prickles all the same.', [
    [9, '» Follow the arrow toward the standing smoke – turn to 9'],
    [10, '» Trust stone over chalk and keep to the road – turn to 10'],
  ]],
  [6, 'The shortcut begins honestly and then stops pretending. Needles swallow your footsteps; resin closes your throat. The pines stand in rows too regular to be wild – planted long ago, and every lane between them looks like a path, and none of them is. You steer by the failing grey of the sky until a low stone wall stops you, one the map never mentioned. Beyond it you can make out two things: a fork of pale road, and further off, the cold glitter of moving water.', [
    [10, '» Climb the wall and make for the fork of pale road – turn to 10'],
    [11, '» Head for the sound of moving water – turn to 11'],
  ]],
  [7, 'The porch boards accept your weight one at a time, each with its own small ceremony of complaint. The door stands ajar on a hall smelling of cold ash and old paper. "Toll is a penny," you tell the emptiness, for the comfort of a voice, and the emptiness keeps it. Behind the counter with its little barred window, the keeper\'s parlor waits in the dark – and in a dish on the counter sits a candle stub, its wax still soft.', [
    [12, '» Go through to the keeper\'s parlor – turn to 12'],
    [8, '» Step back out and try the well yard – turn to 8'],
  ]],
  [8, 'The well yard is small, walled, and tidy in the way of places still used. The well rope is new – the only new thing here. The bucket comes up dry, holding a fist-sized packet of oilcloth, and inside, heavy as a lie, a brass key, its bow cast in the shape of a crowned milestone. Keys open; that is what keys are for. You pocket it, add it to your record, and consider the house: the door around the front, or the low cellar hatch sunk against the back wall.', [
    [12, '» Go in by the front and find the parlor – turn to 12'],
    [13, '» Try the low cellar hatch at the back wall – turn to 13'],
  ]],
  [9, 'The standing smoke belongs to a charcoal mound banked to burn slow, and the mound belongs to Ilsa Brack – grey-braided, tar-handed, entirely unsurprised. "Post rider," she says, as if confirming weather. "Road has been restless since the surveyor went in. Thirty days now, and never out." She whittles as she talks, and what she whittles is a whistle of ash wood, which she presses on you with the firewood-blunt kindness of the very solitary. "If the trees start repeating, blow it. And note it down. The road plays fair with honest travelers, mostly."', [
    [15, '» Stay by the fire and hear the surveyor\'s story – turn to 15'],
    [10, '» Thank her, pocket the whistle, and regain the road – turn to 10'],
  ]],
  [10, 'The fork wears a fingerpost older than any living opinion of it. Two arms: WRENFOLD, pointing down a broad, confident, well-drained road; and a second arm, blank, aimed up a narrow way half-lost in bramble. The trouble is the nail holes. Both arms have been taken down and swapped – lately, the wood still bright where the fasteners bit. Someone wanted travelers on the wrong road. Or off the right one, which is not the same thing at all.', [
    [17, '» Take the broad road the sign calls WRENFOLD – turn to 17'],
    [16, '» Take the narrow, unlabelled way – turn to 16'],
  ]],
  [11, 'The water sound grows, and so does the sense of being kept company. Between the pine rows, at the edge of what light remains, something long-legged keeps pace with you – stopping when you stop, with a courtesy far worse than pursuit. You never see more of it than an absence between trunks. Then the river shows itself: broad, black-backed, hurrying, loud enough to drown politeness. Upstream lies the pale suggestion of a ford; along your own bank, a towpath goes down into the dark.', [
    [14, '» Chance the ford now, before full dark – turn to 14'],
    [18, '» Keep to the towpath along your own bank – turn to 18'],
  ]],
  [12, 'The keeper\'s parlor keeps its ledger the way a church keeps its book, open on a stand to the last page written. Carts, riders, tolls of a penny, in fading ranks of brown ink – and the entries stop thirty years ago. Except they do not. One line further, fresh and neat: T. REHN, SURVEYOR, WESTBOUND. TOLL PAID. THE ROAD IS NOT WHERE IT WAS. The date is thirty days ago, and the ink still carries a shine.', [
    [19, '» Climb the stair to the keeper\'s room – turn to 19'],
    [13, '» Take the soft candle and try the cellar door – turn to 13'],
  ]],
  [13, 'The cellar door is oak, iron-strapped, and locked with intent – the lock a century younger than the door it serves. Cold air threads up between the boards, carrying a smell you cannot quite file: wet stone, snuffed candle, and underneath both, faint as a signature, ink. Whoever locks an empty cellar in a ruined house locks it against something, or for something. The keyhole, you notice, is the shape of a crowned milestone.', [
    [20, '» If you carry the brass key, open the lock – turn to 20'],
    [21, '» Leave the cellar its secrets and regain the road – turn to 21'],
  ]],
  [14, 'The stepping stones are where your feet believe them to be, right up until the third stone, which is not. The river is patient and thorough: it takes your hat, your satchel, and then the argument out of your legs, and it does not particularly hurry over any of it. The letter for Wrenfold\'s warden travels further down the valley tonight than you ever will. Hollowpine keeps its road. The river keeps you. Your journey ends here.', [], 'An ill end'],
  [15, '"Tobias Rehn," Ilsa says, poking the mound. "Crown surveyor. Brass instruments, clerk\'s hands. Sent to settle the maps, because the road on paper and the road on the ground have stopped agreeing. He told me the forest keeps the old right-of-way the way a dog keeps a bone – buried, and remembered, and defended." She spits, comfortably. "He went to walk the true line. Nothing has come out since but weather." Her pipe stem points two ways at once: her own back-path through the river meadows, or the bramble mouth of the old king\'s road.', [
    [24, '» Take her back-path through the river meadows – turn to 24'],
    [16, '» Strike for the old king\'s road – turn to 16'],
  ]],
  [16, 'The narrow way is the elder road – you feel it through your boots before you can prove it. Cobbles heave under moss; the ruts are worn axle-deep by traffic that ended before your grandmother\'s grandmother. Under a fallen branch you find a paving stone cut with a crowned milestone, twin to nothing on any modern map. Whatever the fingerpost believes, this was once the road that mattered. At a dead oak the way divides: on along the ridge, where moonlight is beginning, or downhill toward a gleam of water.', [
    [21, '» Follow the ridge into the moonlight – turn to 21'],
    [23, '» Go down toward the gleam of water – turn to 23'],
  ]],
  [17, 'The broad road is generous, well-cambered, sweetly drained – everything a road ought to be, which is by now itself suspicious. It curves left, easily, invitingly. You pass a birch bent into a hoop by some old snow. You pass, some minutes later, a birch bent into a hoop by some old snow. The same birch. The same curve, left, gently left, always left. Your own bootprints come up the road to meet you, looking as tired as you feel.', [
    [22, '» Keep walking – roads must go somewhere – turn to 22'],
    [10, '» Turn hard about and retrace to the fingerpost – turn to 10'],
  ]],
  [18, 'The towpath keeps company with the river, past horse rings green with age. Whatever paced you between the pines has no taste for open water; the presence peels away like mist off a pond, and breathing gets easier by the yard. At a tarred post the path offers its accounts: the hanging footbridge is down these thirty years, but the bank path runs on, and up through the rushes a cut climbs toward open meadow and sky.', [
    [23, '» Stay with the river bank – turn to 23'],
    [24, '» Climb through the rushes to the meadows – turn to 24'],
  ]],
  [19, 'Upstairs, the keeper\'s bedroom has been lived in, and lately: blanket thrown back, water in the ewer, a rind gone hard on the sill – days old, not decades. On a tripod at the window stands a brass spyglass stamped with the surveyor\'s crown, aimed not along the road, as a toll keeper\'s glass should be, but into the black of the trees. Through it, after a moment, you find what it was left watching: a lantern light, deep in the forest, moving – stopping – moving – going in a slow and perfect circle.', [
    [13, '» Go down and try the cellar door – turn to 13'],
    [21, '» Leave the house and make for that circling light – turn to 21'],
  ]],
  [20, 'The brass key turns as if oiled yesterday. The cellar is deeper than any toll-house needs, and older: dressed stone below the first turn of the stair, and on the walls, tallies – hundreds upon hundreds of five-bar gates scratched at shoulder height. At the bottom, where a cellar should end, an opening: a tunnel, dead level and dead straight, running away under the forest. On the floor lies a surveyor\'s chain, neatly coiled, the way a man leaves a thing he means to come back for.', [
    [26, '» Follow the tunnel under the forest – turn to 26'],
    [27, '» Search the racked shelves at the cellar\'s back – turn to 27'],
  ]],
  [21, 'You come out onto open road under a rising moon, and for a while the night is almost kind. Then the trees close ranks and the road forgets itself in the dark – surface, edges, direction, all gone to guesswork. Far off between the trunks a light shows, steady as a held breath. To walk unlit in Hollowpine is to let the road do your choosing for you; travelers with a light of their own get a vote.', [
    [25, '» If you took the shrine lantern, light it now – turn to 25'],
    [22, '» Walk dark, and keep to what feels like the road – turn to 22'],
  ]],
  [22, 'This road walks you more than you walk it. Left, gently left, at a grade so kind you could weep. You cut a mark in a trunk with your knife; ten minutes later it greets you from the wrong side of the road, healed over grey as if years had passed. Your legs report hours. The moon reports minutes. Neither is lying, and that is the worst thing yet. Underfoot, very faint, the road hums – one low, contented, well-fed note.', [
    [28, '» Keep on – something must break the circle – turn to 28'],
    [17, '» Cut hard away from the curve, into the trees – turn to 17'],
  ]],
  [23, 'The bank path delivers you to the ford the maps do remember. The river runs high with the same floods that drowned the coach road: the stepping stones show as pale coins, and every third coin is spent – submerged, or gone. On the far bank a stone stair climbs toward meadow. Snagged in a fallen alder hangs wreckage that was never a boat: canvas, guy-rope, a splintered tripod leg. A camp, once – and somewhere along this bank, the rest of its story.', [
    [29, '» Trace the wreckage along the bank to its camp – turn to 29'],
    [14, '» Cross now by the drowned stones – turn to 14'],
  ]],
  [24, 'The meadows are silver and open, and after Hollowpine\'s ceilinged dark, walking under plain sky feels like being forgiven. Ilsa\'s back-path is a sheep track that knows its business, contouring above the river with no interest in drama. Below, the water bends around a shoulder of land, and on the shoulder the moon picks out a hard, geometric shape among the soft grass shapes: canvas, guyed and pegged. A tent. No fire, no light, no dog. Nothing about it moves.', [
    [29, '» Go down to the dark camp on the shoulder – turn to 29'],
    [30, '» Hold the high path toward the forest\'s heart – turn to 30'],
  ]],
  [25, 'The shrine lantern throws a small, brave room of light, and the forest, caught out, rearranges itself into merely trees. On the trunks, at exactly lantern height, there are blazes: a crown, a number, an arrow, cut this season by a careful hand. Surveyor\'s marks. The road is not where it was – and Tobias Rehn had set about marking where it is, one trunk at a time, walking off into the dark of the wood along a line straight as string.', [
    [31, '» Leave the road and follow the blazes – turn to 31'],
    [30, '» Keep the road, keeping the marks in sight – turn to 30'],
  ]],
  [26, 'The tunnel runs dressed stone for a hundred paces and living rock after, dead level the whole way – engineered, and by somebody with no patience for corners. Your candle finds the tallies again, marching at shoulder height, and once, scratched deeper than the rest: THE TOLL IS COUNTED IN WALKERS NOW. The draught freshens, smelling of loam and pine needles, and a stair rises to a hinged door of bark and board. You come up inside a hollow oak, in the forest\'s deep heart, beside a sunken ruin the trees have kept.', [
    [31, '» Follow the blaze-marks between the trees – turn to 31'],
    [32, '» Explore the sunken ruin beside the oak – turn to 32'],
  ]],
  [27, 'The shelves rack ledgers by the score, and you reach for the last of them, which is a mistake – not because of what it holds, but because of the draught you have let hunt along the passage. Above you the iron-strapped door swings to with the soft finality of a full stop, and the lock you opened remembers its business. The candle lasts an hour. The dark lasts longer. In time – you will not count it, but something does – the tally on the wall gains a new bar, scratched at shoulder height, fresh as chalk. Your journey ends here.', [], 'An ill end'],
  [28, 'The circle is tighter now. The bent birch comes around oftener; your bootprints cross and recross like the handwriting of someone falling asleep. Cold rises that has nothing to do with night, and you understand, in the wordless way the body understands rivers and heights, that the road is not lost and neither are you: you are kept. It is a good hour for inventory – what you carry, what you promised, and what you have left to spend.', [
    [30, '» If you carry Ilsa\'s ash whistle, blow it now – turn to 30'],
    [17, '» Press on around the bend once more – turn to 17'],
    [35, '» Sit down at the roadside and wait for morning – turn to 35'],
  ]],
  [29, 'The camp was struck by weather, not by hands: tent skinned to its poles, instrument cases burst and bleached. Half under the flysheet, sealed in oilcloth like a conscience, lies a field book, dry as a sermon – T. REHN cut into the board. You read by moonlight. Measurements at first, a clerk\'s tidy columns; then shorter entries, in the same tidy hand, which is somehow worse: CHAINS MEASURE LONG AFTER DARK. ROAD DISAGREES WITH ITSELF. THE OLD RIGHT-OF-WAY IS OPEN, AND IT IS NOT ON MY MAPS.', [
    [33, '» Take the field book and read as you walk – turn to 33'],
    [34, '» Leave it and follow the river to the weir – turn to 34'],
  ]],
  [30, 'You feel the change underfoot before you see it: the ground remembering a purpose. The hum of the wood falls quiet. And on your right a road opens that no map, old or new, has ever admitted to: straight, grass-grown, aimed like an instrument into the heart of Hollowpine, blazed trunk after trunk at even intervals. Far down its length burns a single point of lantern light. Not moving. Waiting.', [
    [36, '» Walk the hidden spur toward the light – turn to 36'],
    [37, '» Shadow the spur from the trees, unannounced – turn to 37'],
  ]],
  [31, 'The blazes walk you off every path you have trusted tonight, and they do not apologize. Then, a clearing: a cairn of road-stones stacked waist high, milestone fragments facing outward like old soldiers stood at ease. The topmost fragment has fresh chisel-work: XLVII MILES BY THE TRUE LINE, and an arrow. Sighted over the cairn, the arrow finds an aisle between the trees too straight to be any accident of growing – and under the topmost stone, weighted against weather, papers.', [
    [33, '» Read the papers weighted under the top stone – turn to 33'],
    [36, '» Sight along the arrow and walk the true line – turn to 36'],
  ]],
  [32, 'The sunken ruin was a waystation once – roofless these centuries, its walls holding a square of moonlight and a floor of leaf-fall. The forest has kept it the way a museum keeps a case. A stair descends against the north wall to a vault door standing ajar on darkness, and beside the stair a niche holds the station\'s last furniture: a lamp bracket, a bell arm, and the mounting-stone of a gate. Cut into the lintel, sharp as yesterday: a wren above a crown.', [
    [37, '» Slip along the spur toward the gatehouse ruin – turn to 37'],
    [38, '» Go down the stair to the vault – turn to 38'],
  ]],
  [33, 'Rehn\'s hand stays a clerk\'s even where the sense frays. CONCLUSION, the page announces. TWO ROADS. THE SURVEYED ROAD, WHICH MEN MAINTAIN, AND THE RIGHT-OF-WAY, WHICH THE FOREST MAINTAINS. WHERE THEY DISAGREE, THE FOREST IS WINNING. Then, smaller: A ROAD UNWALKED CLOSES. THIS ONE HAS DECIDED NOT TO CLOSE ALONE. And at the page\'s foot, underlined twice, the entry of a man putting his affairs in order: IF FOUND, TELL THE WARDEN – THE LETTER ROAD IS SAFE ONLY WHILE THE TRUE LINE IS REMEMBERED.', [
    [38, '» Seek the old waystation and what he left there – turn to 38'],
    [36, '» Find the true line and walk it as he did – turn to 36'],
  ]],
  [34, 'The weir is the river\'s one polite handshake: a spine of cut stone, water combing over it in an even silver sheet an inch deep, loud and civil at once. From the crest, halfway across, you can see a long way downstream, and what you see is lights – lanterns, real ones, hung in a swaying line along a village weir. Wrenfold, keeping its water-lights against the flood, a night\'s steady walk by the bank. Behind you, the forest stands very still, like a man pretending he has not been following.', [
    [39, '» Cross, and push down the bank for Wrenfold – turn to 39'],
    [40, '» Cross, and knock at the lit hut by the water – turn to 40'],
  ]],
  [35, 'You sit down at the roadside to wait for morning, which is reasonable, and reason is what the road prefers to work with. The moon goes round. The birch goes round. When you stand – in a minute, you tell yourself, in just a minute – your legs take up the curve of their own accord, left, gently left. In spring, a charcoal burner will find a post-rider\'s satchel at the edge of a road that is not on her map either, the letter inside still sealed. She will note it down, and walk out of the circle, and you will not. Your journey ends here.', [], 'An ill end'],
  [36, 'The spur admits you the way a great hall admits a guest it was expecting: utterly straight, utterly quiet – no owl, no wind, your own footsteps arriving a half-beat late. Underfoot is not mud but paving, the old stones unbroken this whole hidden mile. The lantern ahead grows no faster than your patience deserves. Beside the way, at proper intervals, stand mile markers with their numbers facing the wrong direction – cut for travelers coming back, by a road that expected to send some.', [
    [41, '» Walk on to the waiting lantern – turn to 41'],
    [43, '» Turn aside at the gatehouse and its stepped path – turn to 43'],
  ]],
  [37, 'You keep to the trees, unannounced, and parallel the spur the way you would walk beside a sleeping dog. The spur, it turns out, has a gatehouse: hip-high ruin now, but its lintel stone still carries a wren above a crown, cut sharp. Inside, sheltered from dew, lie a bedroll and a cold fire – laid, not abandoned; someone watches this road in shifts and expects to come back. From behind the gatehouse a stepped path climbs the ridge, marked with small crowned stones.', [
    [41, '» Step out onto the line and go to the lantern – turn to 41'],
    [43, '» Climb the stepped path behind the gatehouse – turn to 43'],
  ]],
  [38, 'The vault under the waystation is dry as a snuffbox and shelved to the ceiling: toll rolls by the hundredweight, wax-sealed, crumbling sweetly. On the central table, alone, with the air of an exhibit, stands an iron strong-box. Its hasp bears the crowned milestone, twin to the shape of a certain keyhole – and, if you have been collecting such things, to the bow of a certain brass key. The box is locked. The vault waits to see what you are carrying.', [
    [42, '» If you carry the brass key, open the strong-box – turn to 42'],
    [41, '» Leave it shut and climb out toward the lantern – turn to 41'],
  ]],
  [39, 'The bank road is long, wet, and blessedly ordinary: mud that is only mud, willows that are only willows. Wrenfold\'s water-lights grow from a scatter of sparks to actual flames in actual iron brackets, tended by somebody paid to tend them. You could follow this bank all night and come in with the milk carts – letter delivered, fee collected, and the whole strange business of the forest left folded behind you like a map you have decided not to reopen.', [
    [44, '» Keep the bank road to Wrenfold and be done – turn to 44'],
    [40, '» Turn aside at the drover\'s hut above the willows – turn to 40'],
  ]],
  [40, 'The drover\'s hut leaks light at every joint, and inside is the first human face since the charcoal camp: a drover with a mattock across his knees, who does not ask what you are doing on the bank at this hour, because the answer is always the same – avoiding the forest. "Straight line through the trees, old as sin," he says, when you press him. "Him with the lantern has stood on it a month. Dogs will not go near it. Nor will I." He points the mattock handle at the ridge, and then, meaningfully, at the safe and ordinary bank.', [
    [43, '» Climb where the mattock points, to the straight line – turn to 43'],
    [44, '» Take his advice and keep the bank for Wrenfold – turn to 44'],
  ]],
  [41, 'The lantern stands on a surveyor\'s tripod, trimmed and full – someone keeps it – and beside it, at parade rest, stands Tobias Rehn. Thin as a chain-line, coat gone the colors of lichen, boots worn to paper: a man thirty days walking. The eyes, though, are exact. "You are standing on the true line," he says, in place of any greeting. "Mind it. I can hold it open only while there is light to walk by, and my oil" – he tilts the lantern gently, and it answers with almost nothing – "is nearly through."', [
    [45, '» Set down your satchel and hear him out – turn to 45'],
    [46, '» Take his elbow – walk now, and talk walking – turn to 46'],
  ]],
  [42, 'The key\'s crown finds its twin and the strong-box opens like a well-mannered book. Inside lies Rehn\'s fair copy, drawn as though the pen never once lifted: Hollowpine entire, and through it two roads – the surveyed road men keep, curling on itself like a sleeping dog, and beneath it, straight as a chalked string, the TRUE LINE, running to Wrenfold\'s gate. In the corner, pressed in wax, a wren above a crown: the same seal that rides against your ribs in the warden\'s letter. Wrenfold has paid to keep this road remembered before.', [
    [45, '» Take the map and make for the lantern on the line – turn to 45'],
    [47, '» Take the map up the warden-stones to the ridge – turn to 47'],
  ]],
  [43, 'The warden-stones climb the ridge in file, each cut with the wren-and-crown, each with its face rubbed smooth by hands doing exactly what your hand does now. From the top, the whole trick of Hollowpine lies below you in moonlight: the false road curled round on itself like a sleeping dog, and through the circle of it, faint as a crease in cloth, the true line running straight – one end at the old fingerpost fork, the other at the far-off pinprick of Wrenfold\'s water-lights. Between them, on the line itself, one small steady lantern.', [
    [47, '» Descend to where the false road crosses the line – turn to 47'],
    [46, '» Go down to the small steady lantern – turn to 46'],
  ]],
  [44, 'You give the forest its victory and the river your company, and by first light the bank road hands you to Wrenfold\'s bridge like one servant passing a guest to another. The warden, Alder Quist, breaks the seal at her own gate, reads twice, and looks at you longer than the letter took. "Most riders come the forest way," she says. "The ones who arrive." You are paid in full, fed beyond argument, and put to bed in the warm. Whatever Hollowpine is keeping, it keeps a while longer – but the letter is delivered, and you are alive to wonder. Your journey ends here – well.', [], 'A good end'],
  [45, 'Rehn\'s account is a surveyor\'s: no ghosts, only measurements that misbehave. "The road is older than the county, and it is owed its maintenance. A road unwalked closes. This one" – he nods along the line, patient as winter – "has decided not to close alone. It gathers walkers. I have been its maintenance for a month, and I am nearly spent." He looks at your satchel, then at you. "A letter for the warden. Then we want the same thing, rider. Get the line to Wrenfold. However you can."', [
    [48, '» If you still carry the lantern, put it in his hands – turn to 48'],
    [49, '» Give him your arm instead, and trust the blazes – turn to 49'],
  ]],
  [46, 'Walking out is wading upstream. The false road wants its curve back: every dozen paces your feet put in a quiet word for turning left, just a little, just to see. You fix your eyes on the surveyor\'s blazes and haul yourself mark to mark, hand over hand along a rope that only your attention makes real. The curve argues. You count aloud. The blazes agree with you, one by one, which is the only agreement that matters tonight.', [
    [49, '» Hold the line, mark by mark, to the last bend – turn to 49'],
    [48, '» Make for the tripod where the blazes gather – turn to 48'],
  ]],
  [47, 'Where the false road and the true line cross there is nothing at all – no post, no stone, only your new knowledge lying over the ground like frost. So you build what the moment demands: road-stones stacked knee-high, a blaze cut clean, an arrow pointing true. It is a small thing. So is chalk on a milestone; so is a whistle of ash. Roads are lost by inches and kept by inches, and tonight the inches are yours. The line runs on toward the water-lights, and behind you the lantern burns where the blazes gather.', [
    [50, '» Take the true line for Wrenfold, and dawn – turn to 50'],
    [48, '» Walk back up the line for the lantern first – turn to 48'],
  ]],
  [48, 'The last mile of the true line walks easy, as a road does when it is being used for exactly what it is for. Where the blazes gather at the tripod, a lantern swings into step beside you – the surveyor, thin as a chain-line, walking while there is light to walk by. Neither of you talks much. The line asks little except that you keep to it, which, tonight, feels like the whole of the law. Ahead, the trees thin, and the water-lights of Wrenfold come up like a constellation being decided upon.', [
    [50, '» Walk the last mile to the warden\'s door – turn to 50'],
  ]],
  [49, 'The line delivers you, of all places, to the back of the old fingerpost – the fork where the arms were swapped. From this side the matter is plain as print: warden\'s marks on the post, the arms turned by careful hands, a generation of travelers steered off a failing road while it was fed and rested. Not malice. Maintenance. You turn the arms back true – Wrenfold\'s warden can decide their next posture – and take the last of the line toward the smell of bread and the ringing of a small, sincere bell.', [
    [50, '» Set the arms right, and walk into Wrenfold – turn to 50'],
  ]],
  [50, 'Wrenfold at dawn is smoke, bread, and one sincere bell. Warden Alder Quist reads your letter at her gate; then she reads you, your account tumbling out with the mud still on it – the milestone, the ledger, the circling road, the line, the lantern. "Thirty years we pay to have that road looked away from," she says at last. "It will be cheaper to remember it." Word goes out with the dawn carts for the thin surveyor on the hidden line; walkers are promised at every new moon. The letter is delivered. So, at last, is the road. Your journey ends here – well.', [], 'A good end'],
];

// --- Root, guide, record ----------------------------------------------------

addNode('root', null, 'cover', 'The Branching Road', {});

addNode('start_here', 'root', 'start', 'How to Read This Road', {
  example_label: 'START HERE',
  skip_label: 'Skip to blank workspace →',
});

addNode('tracking_sheet', 'start_here', 'tracking', "Traveler's Record", {
  example_label: '',
  skip_label: '',
  subtitle: 'Sections visited, items carried, promises made. The road plays fair with honest travelers.',
});

// --- The fifty sections -----------------------------------------------------

STORY.forEach(([number, prose, choices, endingKind]) => {
  const data = {
    example_label: '',
    skip_label: '',
    map_no: String(number),
    prose,
  };
  if (endingKind) {
    data.ending_kind = endingKind;
  } else {
    for (let slot = 1; slot <= 4; slot += 1) {
      data[`choice_${slot}_label`] = choices[slot - 1] ? choices[slot - 1][1] : '';
    }
  }
  addNode(sectionId(number), 'start_here', endingKind ? 'ending' : 'section', String(number), data);
});

STORY.forEach(([number, , choices]) => {
  choices.forEach(([destination], index) => {
    const destinationId = sectionId(destination);
    addNode(`${sectionId(number)}_choice_${index + 1}`, sectionId(number), nodes[destinationId].type, `» ${destination}`, {
      example_label: '',
      skip_label: '',
      map_no: '',
      prose: '',
      ending_kind: '',
      choice_1_label: '',
      choice_2_label: '',
      choice_3_label: '',
      choice_4_label: '',
    }, { referenceId: destinationId });
  });
});

// --- Worked story map (the EXAMPLE) -----------------------------------------

addNode('example_workspace', 'start_here', 'story_map', 'The Road, Mapped', {
  subtitle: 'The included adventure charted section by section – a worked example for mapping your own.',
  map_act_1: '1 The Trailhead » 2·3·4\n2 The Post Road » 5·6\n3 The Toll-House Lane » 7·8\n4 The Shrine Lantern » 5·7\n5 The Chalked Milestone » 9·10\n6 The Pine Shortcut » 10·11\n7 The Porch Door » 12·8\n8 The Well Yard » 12·13\n9 The Charcoal Camp » 15·10\n10 The Fingerpost » 17·16\n11 Paced to the River » 14·18\n12 The Keeper\'s Ledger » 19·13\n13 The Cellar Door » 20·21\n14 The Ford at Night · ILL',
  map_act_2: '15 Ilsa\'s Tale » 24·16\n16 The King\'s Road » 21·23\n17 The Generous Road » 22·10\n18 The Towpath » 23·24\n19 The Spyglass Room » 13·21\n20 The Tallied Cellar » 26·27\n21 Moonrise Gate » 25·22\n22 The Circling Road » 28·17\n23 The Drowned Ford » 29·14\n24 The River Meadows » 29·30\n25 Lantern Blazes » 31·30\n26 The Straight Tunnel » 31·32\n27 The Cellar Dark · ILL\n28 The Tight Circle » 30·17·35\n29 The Ruined Camp » 33·34\n30 The Hidden Spur » 36·37\n31 The Milestone Cairn » 33·36\n32 The Waystation » 37·38\n33 Rehn\'s Conclusions » 38·36\n34 The Weir Crossing » 39·40\n35 The Road That Keeps · ILL',
  map_act_3: '36 The Straight Mile » 41·43\n37 The Gatehouse » 41·43\n38 The Strong-Box Vault » 42·41\n39 The Bank Road » 44·40\n40 The Drover\'s Hut » 43·44\n41 The Surveyor\'s Lantern » 45·46\n42 The True Map » 45·47\n43 The Warden-Stones » 47·46\n44 The Long Way Home · GOOD\n45 The Surveyor\'s Ask » 48·49\n46 Against the Curve » 49·48\n47 The Crossing Marked » 50·48\n48 The Last Mile » 50\n49 The Last Bend » 50\n50 The Warden\'s Door · GOOD',
  map_endings: 'GOOD · 44 The Long Way Home · 50 The Warden\'s Door\nILL · 14 The Ford at Night · 27 The Cellar Dark · 35 The Road That Keeps',
  map_notes: 'LOOP · the circling road: 17 » 22 » 28 and round again to 17\nGATES · shrine lantern at 21 and 45 · brass key at 13 and 38 · ash whistle at 28',
}, { example: true });

// --- Authoring kit (the blank workspace) ------------------------------------

addNode('blank_workspace', 'start_here', 'workspace', 'Write Your Own Road', {
  example_label: '',
  skip_label: '',
  subtitle: 'An authoring kit for a gamebook of your own.',
  hero: 'Map the whole road first, plan each crossroads on its own sheet, then draft numbered sections with their choice lines. Destinations stay handwritten until the story earns them.',
  workspace_note: 'Two story maps, two branch planners, and a run of numbered blank sections. Set blankSectionCount in the generator config (8-40) to size the run to your story.',
});

for (let mapNumber = 1; mapNumber <= 2; mapNumber += 1) {
  const suffix = String(mapNumber).padStart(2, '0');
  addNode(`blank_story_map_${suffix}`, 'blank_workspace', 'story_map', `Story Map ${suffix}`, {
    subtitle: 'Chart sections and roads in three acts before you write them.',
    menu_label: `STORY MAP ${suffix}`,
    map_act_1: '',
    map_act_2: '',
    map_act_3: '',
    map_endings: '',
    map_notes: '',
  });
}

for (let plannerNumber = 1; plannerNumber <= 2; plannerNumber += 1) {
  const suffix = String(plannerNumber).padStart(2, '0');
  addNode(`blank_branch_planner_${suffix}`, 'blank_workspace', 'branch_planner', `Branch Plan ${suffix}`, {
    menu_label: `BRANCH PLAN ${suffix}`,
  });
}

for (let blankNumber = 1; blankNumber <= CONFIG.blankSectionCount; blankNumber += 1) {
  const suffix = String(blankNumber).padStart(2, '0');
  addNode(`blank_section_${suffix}`, 'blank_workspace', 'blank_section', `Blank Section ${suffix}`, {
    menu_label: `SECTION ${suffix}`,
    kit_no: String(blankNumber),
  });
}

return { nodes, rootId: 'root' };
