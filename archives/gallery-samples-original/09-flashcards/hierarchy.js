// Flashcard Deck — HIERARCHY SCRIPT
// Decks of cards. Each card is a FRONT (question) page that owns its BACK (answer) page as
// its single child — so a card's answer is permanently paired to its question. Front "Flip"
// opens the back (child 0); back "Flip" returns to the front (parent). Front prev/next steps
// through the deck's cards. Rename decks and write your own Q/A on each card.
const numDecks = 4;
const cardsPerDeck = 20;

const nodes = {};
const rootId = "root";

nodes[rootId] = {
  id: rootId, parentId: null, type: "cover",
  title: "Flashcards", data: { subtitle: "study · flip · repeat" }, children: []
};

const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId, parentId: rootId, type: "section",
  title: "Decks", data: {}, children: []
};
nodes[rootId].children.push(contentsId);

for (let d = 1; d <= numDecks; d++) {
  const deckId = createId("deck");
  nodes[deckId] = { id: deckId, parentId: contentsId, type: "deck", title: "Deck " + d, data: {}, children: [] };
  nodes[contentsId].children.push(deckId);

  for (let c = 1; c <= cardsPerDeck; c++) {
    const frontId = createId("front");
    nodes[frontId] = { id: frontId, parentId: deckId, type: "card_front", title: "Card " + c, data: {}, children: [] };
    nodes[deckId].children.push(frontId);

    const backId = createId("back");
    nodes[backId] = { id: backId, parentId: frontId, type: "card_back", title: "Card " + c, data: {}, children: [] };
    nodes[frontId].children.push(backId);
  }
}

return { nodes, rootId };
