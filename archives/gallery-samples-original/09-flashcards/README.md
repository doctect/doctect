# Flashcard Deck

Gallery metadata + generator scripts for the Flashcard Deck sample project.

## Gallery metadata

- **Title:** Flashcard Deck
- **Tags:** `flashcards` `study` `students` `revision` `learning` `memory`
- **Description:** Make and drill your own flashcards. Each deck holds a stack of cards; a card is a question page that flips to its answer with one tap, and flips back. Step through a deck card by card, or jump to any card from the deck's grid. Write your own Q&A, rename the decks to your subjects, and study.

## Structure

```
cover (root)
└── Decks (section, id "contents")
    └── Deck × 4 (deck — grid of the deck's cards + "Study")
        └── Card × 20 (card_front — question)
            └── (card_back — answer)   [the front's single child]
```

- Templates: `cover`, `section`, `deck`, `card_front`, `card_back`
- Default size: 166 nodes / 166 pages
- Page: reMarkable Paper Pro, 509 × 679

## The flip mechanic

Each card is a **front** (question) page that owns its **back** (answer) as its single child, so a
card's answer is permanently paired to its question. The front's `Flip to answer »` opens the back
(`child_index 0`); the back's `« Flip to question` returns to the front (`parent`); the back's `Deck`
chip jumps up to the deck (`ancestor 2`). Front prev/next steps through the deck's cards, and the
deck's `Study »` opens the first card (`child_index 0`).

## Navigation

- Cover → Decks; Decks grid → deck; deck grid → a card; deck `Study »` → first card
- Card front `Flip to answer »` → its back; back `« Flip to question` → its front
- Front corner triangles → prev/next card; `Deck` chip → the deck
- Every page: `Index` → Decks, `Cover` → cover

## Tweak knobs

Top of `hierarchy.js`: `numDecks`, `cardsPerDeck`.

## How to load

1. Editor → **Generator**.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. **Run Generator**.
