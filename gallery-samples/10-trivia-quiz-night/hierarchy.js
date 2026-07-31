const DEFAULT_CONFIG = { blankRoundCount: 2 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = { blankRoundCount: [0, 4] };
Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Quiz Night config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Quiz Night node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Quiz Night template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  const node = { id, parentId, type, title, data: nodeData, children: [] };
  if (typeof options.referenceId === 'string') node.referenceId = options.referenceId;
  nodes[id] = node;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Quiz Night parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const pad2 = (value) => String(value).padStart(2, '0');

// --- The quiz ----------------------------------------------------------------
// Six rounds x ten questions, easy to hard within each round. Every question
// and fun fact is deliberately evergreen: capitals, chemical symbols, classic
// literature, landmark dates - nothing that can expire.
// Question entries: [row cue, question, answer, fun fact].

const QUIZ = [
  {
    no: 1,
    title: 'General Knowledge',
    note: 'A bit of everything to warm the table up – easy openers first, one honest stinker at the end.',
    questions: [
      ['Hexagon sides', 'How many sides does a hexagon have?', 'Six',
        'Honeycomb cells are hexagonal because that shape tiles a surface using the least total wall – bees are ruthless economists.'],
      ['Largest planet', 'What is the largest planet in our Solar System?', 'Jupiter',
        'Jupiter is more than twice as massive as all the other planets combined.'],
      ['Piano keys', 'How many keys does a standard modern piano have?', '88',
        'That is 52 white keys and 36 black keys.'],
      ['Slam dunk sport', 'In which sport would you perform a slam dunk?', 'Basketball',
        'James Naismith invented the game in 1891 – the first hoops were peach baskets nailed to a balcony.'],
      ["What 'www' stands for", "What do the letters 'www' stand for at the start of a web address?", 'World Wide Web',
        'Tim Berners-Lee proposed the World Wide Web at CERN in 1989.'],
      ['Minutes in a day', 'How many minutes are there in one full day?', '1,440',
        '24 hours of 60 minutes each – and the same day holds 86,400 seconds.'],
      ['Most native speakers', 'Which language has the most native speakers in the world?', 'Mandarin Chinese',
        'Native speakers number close to a billion – more than any other language on Earth.'],
      ['The missing letter', 'Which is the only letter of the alphabet that does not appear in the name of any US state?', 'Q',
        'J and Z each appear in exactly one state name: New Jersey and Arizona.'],
      ['Time zones of China', 'How many official time zones does China use?', 'One',
        'The whole country runs on Beijing time, so in the far west the sun can rise after 9 am.'],
      ['Smallest country', 'What is the smallest country in the world by area?', 'Vatican City',
        'It covers about half a square kilometre and has fewer than a thousand residents.'],
    ],
  },
  {
    no: 2,
    title: 'Science & Nature',
    note: 'Elements, planets, and beasts – the natural world in ten questions.',
    questions: [
      ['Formula for water', 'What is the chemical formula for water?', 'H2O',
        'Every molecule is two hydrogen atoms bonded to one oxygen atom.'],
      ['Gas plants breathe in', 'Which gas do plants take in from the air for photosynthesis?', 'Carbon dioxide',
        'The oxygen plants release comes from split water molecules, not from the carbon dioxide.'],
      ['Symbol for gold', 'What is the chemical symbol for gold?', 'Au',
        "From 'aurum', the Latin word for gold – silver's Ag comes from 'argentum'."],
      ['Closest to the Sun', 'Which planet is closest to the Sun?', 'Mercury',
        'Venus is still the hottest planet – its thick carbon dioxide atmosphere traps the heat.'],
      ['Hardest natural substance', 'What is the hardest naturally occurring substance on Earth?', 'Diamond',
        'Diamond and soft pencil graphite are both pure carbon – only the arrangement of the atoms differs.'],
      ['Bones in a body', 'How many bones are there in an adult human body?', '206',
        'Babies are born with around 300 – many fuse together as they grow.'],
      ['Largest animal ever', 'What is the largest animal ever known to have lived?', 'The blue whale',
        'Its heart alone can weigh about 180 kilograms – roughly the weight of two grown adults.'],
      ['Symbol for iron', 'What is the chemical symbol for iron?', 'Fe',
        "From the Latin 'ferrum' – the same iron helps the hemoglobin in your blood carry oxygen."],
      ['Octopus hearts', 'How many hearts does an octopus have?', 'Three',
        'Two pump blood to the gills and one to the body – and the blood is blue, thanks to copper-based hemocyanin.'],
      ['Speed of light', 'To the nearest thousand, what is the speed of light in kilometres per second?', '300,000 km per second',
        'Precisely 299,792.458 km per second – sunlight needs about 8 minutes 20 seconds to reach Earth.'],
    ],
  },
  {
    no: 3,
    title: 'History',
    note: 'Dates and deeds, from the pyramids to the fall of the Wall.',
    questions: [
      ['First US president', 'Who was the first President of the United States?', 'George Washington',
        'He took office in 1789 – the capital city on the Potomac was later named after him.'],
      ['Titanic year', 'In which year did the Titanic sink?', '1912',
        'She struck the iceberg late on 14 April and went down in the early hours of 15 April.'],
      ['Pyramids of Giza', 'In which country do the ancient pyramids of Giza stand?', 'Egypt',
        'The Great Pyramid remained the tallest human-made structure in the world for over 3,800 years.'],
      ['End of WWII', 'In which year did the Second World War end?', '1945',
        'Germany surrendered in May; Japan signed its formal surrender that September.'],
      ['First on the Moon', 'Who was the first person to walk on the Moon?', 'Neil Armstrong',
        'Apollo 11, July 1969 – Buzz Aldrin followed him down about nineteen minutes later.'],
      ['Buried by Vesuvius', 'Which Roman city was buried by the eruption of Mount Vesuvius in AD 79?', 'Pompeii',
        'Its neighbour Herculaneum was buried by the very same eruption.'],
      ['Fall of the Wall', 'In which year did the Berlin Wall come down?', '1989',
        'It had divided the city for 28 years, since 1961.'],
      ["Genghis Khan's empire", 'Which empire did Genghis Khan found?', 'The Mongol Empire',
        'It grew into the largest contiguous land empire in history.'],
      ['Magna Carta year', 'In which year was the Magna Carta sealed?', '1215',
        'King John sealed it at Runnymede, in a meadow beside the River Thames.'],
      ['Last pharaoh', 'Who was the last active pharaoh of ancient Egypt?', 'Cleopatra (Cleopatra VII)',
        'She lived closer in time to the Moon landing than to the building of the Great Pyramid.'],
    ],
  },
  {
    no: 4,
    title: 'Geography',
    note: 'Capitals, rivers, borders – and one very large ocean.',
    questions: [
      ['Capital of France', 'What is the capital city of France?', 'Paris',
        "The nickname 'City of Light' honours both its Enlightenment thinkers and its early street lighting."],
      ['Largest ocean', 'Which is the largest ocean on Earth?', 'The Pacific Ocean',
        'It covers more of the planet than all the land put together.'],
      ['Longest river in Africa', 'What is the longest river in Africa?', 'The Nile',
        'It runs about 6,650 kilometres north to the Mediterranean Sea.'],
      ['Capital of Japan', 'What is the capital city of Japan?', 'Tokyo',
        'Greater Tokyo is the most populous metropolitan area in the world, home to some 37 million people.'],
      ['Highest mountain', 'What is the highest mountain above sea level?', 'Mount Everest',
        'The 2020 China-Nepal joint survey put the summit at 8,848.86 metres.'],
      ['Largest hot desert', 'What is the largest hot desert in the world?', 'The Sahara',
        'Counting cold deserts too, Antarctica is the largest desert of all.'],
      ['Capital of Australia', 'What is the capital city of Australia?', 'Canberra',
        'It was purpose-built as the capital after Sydney and Melbourne both claimed the honour.'],
      ['Country of lakes', 'Which country contains the most natural lakes?', 'Canada',
        "More than half of the world's natural lakes lie inside its borders."],
      ['Longest land border', 'Which two countries share the longest international land border?', 'Canada and the United States',
        'It runs for about 8,890 kilometres, counting the Alaska stretch.'],
      ['Three capitals', 'Which country has three capital cities: Pretoria, Cape Town, and Bloemfontein?', 'South Africa',
        'One capital each for the executive, legislative, and judicial branches of government.'],
    ],
  },
  {
    no: 5,
    title: 'Arts',
    note: 'Painters, poets, and composers – the classics, no trick questions.',
    questions: [
      ['Mona Lisa', 'Who painted the Mona Lisa?', 'Leonardo da Vinci',
        'He kept the painting with him until his death – it now hangs in the Louvre in Paris.'],
      ['Romeo and Juliet', "Who wrote the play 'Romeo and Juliet'?", 'William Shakespeare',
        'He also left us around 37 plays and 154 sonnets.'],
      ['Violin strings', 'How many strings does a standard violin have?', 'Four',
        'They are tuned G, D, A, E – each a perfect fifth from the next.'],
      ['The Starry Night', "Who painted 'The Starry Night'?", 'Vincent van Gogh',
        'He painted it in 1889 from the window of his asylum room in the south of France.'],
      ['Pride and Prejudice', "Who wrote 'Pride and Prejudice'?", 'Jane Austen',
        "It appeared in 1813 without her name – credited only to 'the author of Sense and Sensibility'."],
      ['The Four Seasons', "Which composer wrote the violin concertos known as 'The Four Seasons'?", 'Antonio Vivaldi',
        'Published in 1725, each of the four concertos comes with its own descriptive sonnet.'],
      ["Michelangelo's David", "Who sculpted the statue of 'David' in Florence?", 'Michelangelo',
        'He carved it from a single block of Carrara marble that other sculptors had abandoned decades earlier.'],
      ['Call me Ishmael', "Which novel opens with the line 'Call me Ishmael'?", 'Moby-Dick (by Herman Melville)',
        'The white whale was partly inspired by a real albino sperm whale nicknamed Mocha Dick.'],
      ['Guernica', "Which Spanish artist painted 'Guernica'?", 'Pablo Picasso',
        'He painted it in 1937, in response to the bombing of the Basque town of Guernica.'],
      ['1812 Overture', "Which Russian composer wrote the '1812 Overture'?", 'Pyotr Ilyich Tchaikovsky',
        'The score literally calls for cannon fire – sixteen shots of it.'],
    ],
  },
  {
    no: 6,
    title: 'Wildcard',
    note: 'Anything goes – chalkboard curveballs to finish the night.',
    questions: [
      ['Rainbow colours', 'How many colours are in a rainbow, as traditionally listed?', 'Seven',
        'Isaac Newton settled on seven, adding indigo partly to match the seven notes of a musical scale.'],
      ['Chessboard squares', 'How many squares make up the playing grid of a chessboard?', '64',
        'Count every larger square the grid contains and the total climbs to 204.'],
      ['Dots on a die', 'How many dots are there in total on a standard six-sided die?', '21',
        'Opposite faces of a die always add up to seven.'],
      ['A murder of...', 'What is a group of crows called?', 'A murder',
        'A group of owls, meanwhile, is a parliament.'],
      ['The food that keeps', 'Which pantry staple can stay edible for thousands of years?', 'Honey',
        'Sealed pots of honey found in ancient Egyptian tombs were still perfectly edible.'],
      ["Radio code for 'S'", "In the NATO phonetic alphabet, which word stands for the letter 'S'?", 'Sierra',
        'The alphabet was adopted in 1956, with words chosen to survive shouting over bad radio.'],
      ['Caesar salad origins', 'In which country was the Caesar salad invented?', 'Mexico',
        'Restaurateur Caesar Cardini improvised it at his Tijuana restaurant in 1924.'],
      ['Sideways planet', 'Which planet in our Solar System spins on its side?', 'Uranus',
        'Its axis is tipped about 98 degrees, so each pole gets roughly 42 years of sunlight, then 42 of darkness.'],
      ['Ten-point tiles', 'Which two letters are worth ten points each in English-language Scrabble?', 'Q and Z',
        'There is exactly one tile of each in a standard set.'],
      ['The octothorpe', "Which everyday symbol is formally known as an 'octothorpe'?", 'The hash sign (#)',
        'Telephone engineers at Bell Labs helped popularize the name in the 1960s.'],
    ],
  },
];

// --- Root and host guide -----------------------------------------------------

addNode('root', null, 'cover', 'Quiz Night', {});

addNode('start_here', 'root', 'start', 'Host Guide', {
  example_label: '',
  skip_label: '',
});

// --- The six authored rounds -------------------------------------------------
// Wiring: each round's children are its ten questions; each question's only
// child is its answer; each answer's only child is a reference node to the
// next question in the round (omitted on the round's last answer).

const addRound = (roundId, roundData, roundTitle, questionPrefix, questions, roundLabel) => {
  const data = { ...roundData };
  questions.forEach(([cue], index) => {
    data[`q_${index + 1}_label`] = `${index + 1} · ${cue} »`;
  });
  addNode(roundId, 'start_here', 'round', roundTitle, data);

  questions.forEach(([, questionText, answerText, funFact], index) => {
    const n = index + 1;
    addNode(`${questionPrefix}_q${pad2(n)}`, roundId, 'question', `Q${n}`, {
      q_no: String(n),
      round_label: roundLabel,
      question_text: questionText,
      reveal_label: 'Reveal »',
    });
    addNode(`${questionPrefix}_a${pad2(n)}`, `${questionPrefix}_q${pad2(n)}`, 'answer', `A${n}`, {
      q_no: String(n),
      round_label: roundLabel,
      answer_text: answerText,
      fun_fact: funFact,
      next_label: n < questions.length ? 'Next question »' : '',
    });
  });
  questions.forEach((entry, index) => {
    const n = index + 1;
    if (n >= questions.length) return;
    addNode(`${questionPrefix}_a${pad2(n)}_next`, `${questionPrefix}_a${pad2(n)}`, 'question', `» Q${n + 1}`, {
      reveal_label: '',
    }, { referenceId: `${questionPrefix}_q${pad2(n + 1)}` });
  });
};

QUIZ.forEach(({ no, title, note, questions }) => {
  addRound(`round_${no}`, { round_no: String(no), round_note: note }, `Round ${no} · ${title}`,
    `r${no}`, questions, `ROUND ${no} · ${title.toUpperCase()}`);
});

// --- Score ledgers and grand totals -----------------------------------------

addNode('scoreboard_1', 'start_here', 'scoreboard', 'Score Ledger 01', {
  subtitle: 'One column per team, one row per round – the whole night on a single board.',
});

addNode('scoreboard_2', 'start_here', 'scoreboard', 'Score Ledger 02', {
  subtitle: 'A spare ledger – for the rematch, or for scoring a quiz of your own.',
});

addNode('grand_totals', 'start_here', 'grand_total', 'Grand Totals', {});

// --- Worked example (EXAMPLE chrome lives here only) -------------------------
// The example hub is a demonstration round hub whose two rows are reference
// nodes into the real Round 1 opener, so the specimen question and answer are
// the live pages themselves - no duplicated quiz content.

addNode('example_workspace', 'start_here', 'round', 'Worked Example', {
  round_no: '?',
  round_note: 'How a round plays: tap a row to open its card, write your answer on the lines, tap Reveal, then Next question. The specimen rows below open the real Round 1 opener – and every blank round in the host kit is wired exactly the same way.',
  q_1_label: 'Specimen question »',
  q_2_label: 'Specimen answer »',
  q_3_label: '', q_4_label: '', q_5_label: '', q_6_label: '', q_7_label: '',
  q_8_label: '', q_9_label: '', q_10_label: '',
}, { example: true });

addNode('example_question', 'example_workspace', 'question', 'Specimen Question', {
  ...exampleChrome,
  reveal_label: '',
}, { referenceId: 'r1_q01' });

addNode('example_answer', 'example_workspace', 'answer', 'Specimen Answer', {
  ...exampleChrome,
  next_label: '',
}, { referenceId: 'r1_a01' });

// --- Host kit (the blank workspace) ------------------------------------------
// Blank rounds mirror the authored wiring exactly, with '' content, so a
// handwritten quiz navigates identically: question reveals to answer, answer
// turns to the next question, the round's last answer goes quiet.

const kitLabels = {};
[1, 2, 3, 4].forEach((n) => {
  kitLabels[`kit_${n}_label`] = n <= CONFIG.blankRoundCount ? `Blank Round ${pad2(n)} »` : '';
});

addNode('blank_workspace', 'start_here', 'workspace', 'Host Kit', {
  example_label: '',
  skip_label: '',
  hero: 'Write your own quiz night on chalk-ready blanks: each round hub seats ten questions, and every question card is already wired to its answer card.',
  workspace_note: `Blank rounds in this copy: ${CONFIG.blankRoundCount}. Set blankRoundCount (0-4) in the generator config before generating to change it.`,
  ...kitLabels,
});

for (let blankNumber = 1; blankNumber <= CONFIG.blankRoundCount; blankNumber += 1) {
  const suffix = pad2(blankNumber);
  const data = {
    round_no: String(blankNumber),
    round_note: 'Write your topic and questions below – reveal navigation is already wired.',
  };
  for (let n = 1; n <= 10; n += 1) data[`q_${n}_label`] = `Question ${n} »`;
  addNode(`blank_round_${suffix}`, 'blank_workspace', 'round', `Blank Round ${suffix}`, data);

  for (let n = 1; n <= 10; n += 1) {
    addNode(`bq${blankNumber}_q${pad2(n)}`, `blank_round_${suffix}`, 'question', `Q${n}`, {
      q_no: String(n),
      round_label: `BLANK ROUND ${suffix}`,
      question_text: '',
      reveal_label: 'Reveal »',
    });
    addNode(`bq${blankNumber}_a${pad2(n)}`, `bq${blankNumber}_q${pad2(n)}`, 'answer', `A${n}`, {
      q_no: String(n),
      round_label: `BLANK ROUND ${suffix}`,
      answer_text: '',
      fun_fact: '',
      next_label: n < 10 ? 'Next question »' : '',
    });
  }
  for (let n = 1; n < 10; n += 1) {
    addNode(`bq${blankNumber}_a${pad2(n)}_next`, `bq${blankNumber}_a${pad2(n)}`, 'question', `» Q${n + 1}`, {
      reveal_label: '',
    }, { referenceId: `bq${blankNumber}_q${pad2(n + 1)}` });
  }
}

return { nodes, rootId: 'root' };
