const DEFAULT_CONFIG = { bookCount: 24, quotePageCount: 16 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = { bookCount: [12, 36], quotePageCount: [8, 24] };
Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`The Reading Room config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`The Reading Room node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`The Reading Room template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  const node = { id, parentId, type, title, data: nodeData, children: [] };
  if (typeof options.referenceId === 'string') node.referenceId = options.referenceId;
  nodes[id] = node;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`The Reading Room parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const pad2 = (value) => String(value).padStart(2, '0');

// Shelves hold twelve books each; the cap of 36 books keeps the case to three.
const shelfCount = Math.ceil(CONFIG.bookCount / 12);
const SHELF_WORDS = ['One', 'Two', 'Three'];

// A book keeps its own spine slot field (spine_N_label, N = its position on
// its shelf). The shelf's spine chip N binds the same field and resolves it
// through the shelf's data context - the book is the single place the title is
// written, so editing it updates the spine and the book page header together.
const bookData = (slotOnShelf, overrides = {}) => ({
  [`spine_${slotOnShelf}_label`]: '',
  author_line: '',
  started: '',
  finished: '',
  rating_note: '',
  format_note: '',
  review: '',
  fav_quote: '',
  book_prev_label: '',
  book_next_label: '',
  shelf_chip_label: '',
  book_back_label: '',
  ...overrides,
});

const quoteData = (overrides = {}) => ({
  quote_a: '',
  quote_a_source: '',
  quote_b: '',
  quote_b_source: '',
  leaf_prev_label: '',
  leaf_next_label: '',
  leaf_back_label: '« The library',
  ...overrides,
});

// --- Root and guide ----------------------------------------------------------

addNode('root', null, 'cover', 'The Reading Room', {});

addNode('start_here', 'root', 'start', 'Before You Shelve', {
  example_label: '',
  skip_label: '',
});

// --- The worked example (EXAMPLE chrome lives here only) ---------------------
// One book page filled the way a finished book should be - Jane Eyre, a real
// public-domain classic with invented, clearly journal-style reading dates and
// verdicts - plus one filled quote leaf.

addNode('example_workspace', 'start_here', 'workspace', 'The Worked Example', {
  hero: 'One book page filled end to end – Jane Eyre, dated, rated, reviewed, and quoted – plus a quote leaf with two passages copied out, so you can see how the room is meant to be written in.',
  workspace_note: 'Everything on this table is marked EXAMPLE. Your live library runs from Your Library.',
  slot_a_label: 'Jane Eyre, worked »',
  slot_b_label: 'A filled quote leaf »',
  hub_shelves_label: '',
  hub_vault_label: '',
  hub_series_label: '',
  hub_tbr_label: '',
  hub_wrap_label: '',
  hub_example_label: '',
}, { example: true });

addNode('example_book', 'example_workspace', 'book', 'Jane Eyre, Worked', bookData(1, {
  spine_1_label: 'Jane Eyre',
  author_line: 'Charlotte Brontë · first published 1847',
  started: '3 January',
  finished: '19 January',
  rating_note: 'Five dots, inked the same night.',
  format_note: 'Paperback · the Penguin Classics copy with the cracked orange spine.',
  review: 'Re-read after fifteen years, and it holds. What I remembered as a romance is really a book about refusing to be owned – by Rochester, by St John, by hunger.\nThe red-room still frightens. The proposal under the chestnut tree still lands, even knowing the lightning splits the tree that same night.\nLowood is harder to read now than it was at sixteen.\nVerdict: the battered copy stays; it has earned its crease.',
  fav_quote: '"I am no bird; and no net ensnares me: I am a free human being with an independent will." – ch. 23',
  shelf_chip_label: '« The table',
  book_back_label: '« The guide',
}), { example: true });

addNode('example_quote', 'example_workspace', 'quote_page', 'Quotes, Worked', quoteData({
  quote_a: '"I would always rather be happy than dignified."',
  quote_a_source: 'Jane Eyre · Charlotte Brontë · ch. 34',
  quote_b: '"Life appears to me too short to be spent in nursing animosity, or registering wrongs."',
  quote_b_source: 'Jane Eyre · Charlotte Brontë · ch. 6',
  leaf_back_label: '« The example table',
}), { example: true });

// --- Your Library (blank workspace) ------------------------------------------
// Child order is load-bearing for the page sequence and the sibling chains:
// shelves first (books chain across them via the cousin fallback), then the
// quote vault, series ledgers, the TBR stack, and the wrap up sheets.

addNode('blank_workspace', 'start_here', 'workspace', 'Your Library', {
  example_label: '',
  skip_label: '',
  hero: `${shelfCount === 1 ? 'One shelf' : shelfCount === 2 ? 'Two shelves' : 'Three shelves'} of tappable spines over ${CONFIG.bookCount} book pages, with ${CONFIG.quotePageCount} quote leaves, four series ledgers, a two-page TBR stack, and two wrap up sheets – all pre-linked.`,
  workspace_note: `This copy: ${CONFIG.bookCount} books · ${CONFIG.quotePageCount} quote leaves. Set bookCount (12-36) and quotePageCount (8-24) in the generator config.`,
  slot_a_label: '',
  slot_b_label: '',
  hub_shelves_label: 'The shelves »',
  hub_vault_label: 'The quote vault »',
  hub_series_label: 'Series ledgers »',
  hub_tbr_label: 'The TBR stack »',
  hub_wrap_label: 'The wrap up »',
  hub_example_label: 'The worked example »',
});

// Shelves and their books. Spine slots past a shelf's book count bind '' on
// the shelf itself, so the chip vanishes and the ghost spine prints as an
// empty slot on the furniture.
for (let s = 1; s <= shelfCount; s += 1) {
  const firstSlot = (s - 1) * 12 + 1;
  const lastSlot = Math.min(s * 12, CONFIG.bookCount);
  const booksOnShelf = lastSlot - firstSlot + 1;
  const shelfData = {
    shelf_note: `Books ${firstSlot} to ${lastSlot}. Tap a spine to open its book page – the spine and the page share one title line.`,
    shelf_prev_label: s > 1 ? `« Shelf ${SHELF_WORDS[s - 2]}` : '',
    shelf_next_label: s < shelfCount ? `Shelf ${SHELF_WORDS[s]} »` : '',
  };
  for (let slot = booksOnShelf + 1; slot <= 12; slot += 1) {
    shelfData[`spine_${slot}_label`] = '';
  }
  addNode(`shelf_${pad2(s)}`, 'blank_workspace', 'shelf', `Shelf ${SHELF_WORDS[s - 1]}`, shelfData);
}

for (let g = 1; g <= CONFIG.bookCount; g += 1) {
  const s = Math.ceil(g / 12);
  const slotOnShelf = ((g - 1) % 12) + 1;
  addNode(`book_${pad2(g)}`, `shelf_${pad2(s)}`, 'book', `Slot ${g}`, bookData(slotOnShelf, {
    [`spine_${slotOnShelf}_label`]: `Slot ${g}`,
    book_prev_label: g > 1 ? '« Previous book' : '',
    book_next_label: g < CONFIG.bookCount ? 'Next book »' : '',
    shelf_chip_label: `« Shelf ${SHELF_WORDS[s - 1]}`,
    book_back_label: '« The library',
  }));
}

// --- The quote vault ---------------------------------------------------------

for (let n = 1; n <= CONFIG.quotePageCount; n += 1) {
  addNode(`quote_${pad2(n)}`, 'blank_workspace', 'quote_page', `Leaf ${pad2(n)}`, quoteData({
    leaf_prev_label: n > 1 ? `« Leaf ${pad2(n - 1)}` : '',
    leaf_next_label: n < CONFIG.quotePageCount ? `Leaf ${pad2(n + 1)} »` : '',
  }));
}

// --- Series ledgers, the TBR stack, and the wrap up --------------------------

for (let n = 1; n <= 4; n += 1) {
  addNode(`series_${pad2(n)}`, 'blank_workspace', 'series', `Series ${pad2(n)}`, {
    series_prev_label: n > 1 ? '« Previous ledger' : '',
    series_next_label: n < 4 ? 'Next ledger »' : '',
  });
}

for (let n = 1; n <= 2; n += 1) {
  addNode(`tbr_${pad2(n)}`, 'blank_workspace', 'tbr', `TBR, Page ${pad2(n)}`, {
    tbr_prev_label: n > 1 ? '« Previous page' : '',
    tbr_next_label: n < 2 ? 'Next page »' : '',
  });
}

addNode('wrap_up_01', 'blank_workspace', 'wrap_up', 'This Year, Wrapped', {
  wu_prev_label: '',
  wu_next_label: 'A spare year sheet »',
});

addNode('wrap_up_02', 'blank_workspace', 'wrap_up', 'A Second Year, Wrapped', {
  wu_prev_label: '« This year\'s sheet',
  wu_next_label: '',
});

return { nodes, rootId: 'root' };
