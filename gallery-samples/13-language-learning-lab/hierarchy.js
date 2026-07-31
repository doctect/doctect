const DEFAULT_CONFIG = { deckCount: 4, cardsPerDeck: 12, journalPageCount: 8 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = { deckCount: [2, 6], cardsPerDeck: [8, 16], journalPageCount: [4, 16] };
Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Lexicon Lab config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Lexicon Lab node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Lexicon Lab template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  const node = { id, parentId, type, title, data: nodeData, children: [] };
  if (typeof options.referenceId === 'string') node.referenceId = options.referenceId;
  nodes[id] = node;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Lexicon Lab parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const pad2 = (value) => String(value).padStart(2, '0');

// --- Card wiring -------------------------------------------------------------
// Every card is a pre-linked two-page pair: the front's ONLY child is its back
// (Reveal » = child_index 0), and the back's ONLY child is a reference node to
// the NEXT front in the deck (Next card » = child_index 0; the label is '' and
// the reference is omitted on the deck's last card, so the run ends quietly).
// Handwritten blank decks therefore navigate exactly like the Spanish demo.

const addCardPair = (deckId, prefix, n, total, content, options = {}) => {
  const nn = pad2(n);
  const filled = content !== undefined;
  addNode(`${prefix}_c${nn}`, deckId, 'card_front', filled ? `${nn} · ${content.word}` : `Card ${nn}`, {
    card_no: `${nn}/${pad2(total)}`,
    row_label: filled ? `${nn} · ${content.word}` : `Card ${nn}`,
    word: filled ? content.word : '',
    pronunciation: filled ? content.pron : '',
    reveal_label: 'Reveal »',
  }, options);
  addNode(`${prefix}_b${nn}`, `${prefix}_c${nn}`, 'card_back', `Reverse ${nn}`, {
    card_no: `${nn}/${pad2(total)}`,
    meaning: filled ? content.meaning : '',
    example_sentence: filled ? content.example : '',
    example_translation: filled ? content.translation : '',
    next_label: n < total ? 'Next card »' : '',
  }, options);
};

const linkCardChain = (prefix, total, options = {}) => {
  for (let n = 1; n < total; n += 1) {
    addNode(`${prefix}_b${pad2(n)}_next`, `${prefix}_b${pad2(n)}`, 'card_front', `» Card ${pad2(n + 1)}`, {
      reveal_label: '',
    }, { ...options, referenceId: `${prefix}_c${pad2(n + 1)}` });
  }
};

// --- The demo deck (the only Spanish in the product) -------------------------
// Eight everyday words with accurate meanings, pronunciations, and natural
// example sentences. Spanish accented characters are WinAnsi-safe.

const DEMO_CARDS = [
  { word: 'hola', pron: 'OH-lah (the h is silent)', meaning: 'hello; hi',
    example: '¡Hola! ¿Cómo estás?', translation: 'Hello! How are you?' },
  { word: 'gracias', pron: 'GRAH-syahs', meaning: 'thank you',
    example: 'Muchas gracias por tu ayuda.', translation: 'Thank you very much for your help.' },
  { word: 'agua', pron: 'AH-gwah', meaning: 'water (feminine – el agua in the singular)',
    example: 'Quiero un vaso de agua, por favor.', translation: 'I would like a glass of water, please.' },
  { word: 'casa', pron: 'KAH-sah', meaning: 'house; home',
    example: 'Mi casa está cerca del parque.', translation: 'My house is near the park.' },
  { word: 'comer', pron: 'koh-MEHR', meaning: 'to eat',
    example: 'Vamos a comer a las dos.', translation: 'We are going to eat at two.' },
  { word: 'libro', pron: 'LEE-broh', meaning: 'book',
    example: 'Estoy leyendo un libro muy bueno.', translation: 'I am reading a very good book.' },
  { word: 'tiempo', pron: 'TYEHM-poh', meaning: 'time; also the weather',
    example: '¿Qué tiempo hace hoy?', translation: 'What is the weather like today?' },
  { word: 'amigo', pron: 'ah-MEE-goh', meaning: 'friend (male – amiga for a female friend)',
    example: 'Carlos es mi mejor amigo.', translation: 'Carlos is my best friend.' },
];

// --- Root and field guide ----------------------------------------------------

addNode('root', null, 'cover', 'Lexicon Lab', {});

addNode('start_here', 'root', 'start', 'Field Guide', {
  example_label: '',
  skip_label: '',
});

// --- Demo bench (EXAMPLE chrome lives here only) -----------------------------

addNode('example_workspace', 'start_here', 'workspace', 'Demo Bench', {
  hero: 'One finished deck, so you can feel the mechanic before you build your own: eight everyday Spanish words, each a two-page card that flips on a tap and runs to the next.',
  workspace_note: 'Everything on this bench is marked EXAMPLE – your own decks live in the word lab.',
  deck_1_label: 'Spanish starter deck »',
  deck_2_label: '', deck_3_label: '', deck_4_label: '', deck_5_label: '', deck_6_label: '',
  grammar_label: '', drill_label: '', journal_label: '', progress_label: '',
}, { example: true });

addNode('demo_deck', 'example_workspace', 'deck', 'Spanish Starter Deck', {
  deck_focus: 'Everyday Spanish – the eight words you will reach for first.',
  run_label: 'Start the run »',
}, { example: true });

DEMO_CARDS.forEach((content, index) => {
  addCardPair('demo_deck', 'demo', index + 1, DEMO_CARDS.length, content, { example: true });
});
linkCardChain('demo', DEMO_CARDS.length, { example: true });

// --- The word lab (blank workspace) ------------------------------------------
// Child order is load-bearing: the CONFIG.deckCount decks sit at child indexes
// 0..deckCount-1 so the hub's six deck chips can use literal child_index 0-5
// (unused chips bind '' labels); grammar, drills, journal, and the progress
// board follow and are reached by their deterministic ids instead.

const deckLabels = {};
[1, 2, 3, 4, 5, 6].forEach((n) => {
  deckLabels[`deck_${n}_label`] = n <= CONFIG.deckCount ? `Deck ${pad2(n)} »` : '';
});

addNode('blank_workspace', 'start_here', 'workspace', 'The Word Lab', {
  example_label: '',
  skip_label: '',
  hero: `Your decks live here: ${CONFIG.deckCount} of them, each ${CONFIG.cardsPerDeck} blank cards already wired front to back to next card, with grammar sheets, pattern drills, and a conversation journal alongside.`,
  workspace_note: `This copy: ${CONFIG.deckCount} decks · ${CONFIG.cardsPerDeck} cards per deck · ${CONFIG.journalPageCount} journal pages. Set deckCount (2-6), cardsPerDeck (8-16), and journalPageCount (4-16) in the generator config.`,
  ...deckLabels,
  grammar_label: 'Grammar sheets »',
  drill_label: 'Pattern drills »',
  journal_label: 'Conversation journal »',
  progress_label: 'Progress wall »',
});

for (let deckNumber = 1; deckNumber <= CONFIG.deckCount; deckNumber += 1) {
  const suffix = pad2(deckNumber);
  addNode(`deck_${suffix}`, 'blank_workspace', 'deck', `Deck ${suffix}`, {
    deck_focus: '',
    run_label: 'Start the run »',
  });
  for (let n = 1; n <= CONFIG.cardsPerDeck; n += 1) {
    addCardPair(`deck_${suffix}`, `d${deckNumber}`, n, CONFIG.cardsPerDeck);
  }
  linkCardChain(`d${deckNumber}`, CONFIG.cardsPerDeck);
}

for (let n = 1; n <= 6; n += 1) {
  addNode(`grammar_${pad2(n)}`, 'blank_workspace', 'grammar', `Grammar ${pad2(n)}`, {
    sheet_prev_label: n > 1 ? '« Previous sheet' : '',
    sheet_next_label: n < 6 ? 'Next sheet »' : '',
  });
}

for (let n = 1; n <= 4; n += 1) {
  addNode(`drill_${pad2(n)}`, 'blank_workspace', 'drill', `Drill ${pad2(n)}`, {
    sheet_prev_label: n > 1 ? '« Previous sheet' : '',
    sheet_next_label: n < 4 ? 'Next sheet »' : '',
  });
}

for (let n = 1; n <= CONFIG.journalPageCount; n += 1) {
  addNode(`journal_${pad2(n)}`, 'blank_workspace', 'journal', `Conversation ${pad2(n)}`, {
    sheet_prev_label: n > 1 ? '« Previous page' : '',
    sheet_next_label: n < CONFIG.journalPageCount ? 'Next page »' : '',
  });
}

// The progress board's children are reference nodes to the decks, so its six
// row chips can use literal child_index 0-5; rows past deckCount bind ''.
addNode('progress_board', 'blank_workspace', 'progress', 'Progress Wall', {
  ...deckLabels,
});

for (let deckNumber = 1; deckNumber <= CONFIG.deckCount; deckNumber += 1) {
  addNode(`prog_ref_${deckNumber}`, 'progress_board', 'deck', `» Deck ${pad2(deckNumber)}`, {
    run_label: '',
  }, { referenceId: `deck_${pad2(deckNumber)}` });
}

return { nodes, rootId: 'root' };
