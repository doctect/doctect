# Lexicon Lab

A language-agnostic vocabulary lab for reMarkable Paper Pro. Flashcard decks where every card is a pre-linked two-page pair – tap `Reveal »` on the front to flip to the back, `Next card »` to keep the run going – plus grammar sheets, pattern drills, a conversation journal, and a Day 1/3/7/14/30 review schedule. No template assumes a language: the four blank decks speak whatever you are learning, and only the worked-example deck speaks Spanish.

## Why you'll like it

- **Cards that flip themselves.** Each card front's only child is its back, and each back advances to the next front in the deck, so `Reveal »` and `Next card »` work before you have written a single word.
- **Write a deck, get an app.** The word lab ships 4 blank decks of 12 pre-linked pairs with every word, meaning, and example field empty – a handwritten deck navigates exactly like the printed demo.
- **A real review schedule.** Every deck hub carries a Day 1 / 3 / 7 / 14 / 30 checkbox strip, and the progress wall crosses every deck with the same five days.
- **An honest Spanish demo.** Eight everyday words (hola, gracias, agua, casa, comer, libro, tiempo, amigo) with accurate meanings, pronunciation respellings, and natural example sentences – clearly marked EXAMPLE throughout.
- **The bench around the cards.** Six grammar sheets (rule, pattern, examples table), four drill sheets (cue / your form / check), and a dated conversation journal that feeds new words back into your decks.

## Workflow

1. Open the field guide, then flip through the Spanish demo deck to feel the mechanic.
2. In the word lab, name a blank deck's focus and write a word on each card front, its meaning and an example on the back.
3. Run the deck: say the word, tap `Reveal »`, mark yourself honestly, tap `Next card »`.
4. Shade the deck's review boxes on Day 1, 3, 7, 14, and 30; mirror them on the progress wall.
5. Catch live phrases in the conversation journal, then turn them into cards.
6. Keep grammar rules and conjugation drills on their own sheets – one rule, one pattern per page.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { deckCount: 4, cardsPerDeck: 12, journalPageCount: 8 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `deckCount` | 2-6 | Blank decks in the word lab |
| `cardsPerDeck` | 8-16 | Pre-linked card pairs per blank deck |
| `journalPageCount` | 4-16 | Conversation journal pages |

Unsupported values fail with a clear `Lexicon Lab config` error.

## Inventory

Default configuration exports 140 pages:

- 1 cover and 1 field guide
- 1 demo bench hub with the 8-card Spanish starter deck (hub + 8 fronts + 8 backs), all EXAMPLE-labelled
- 1 word lab hub with 4 blank decks (each: deck hub + 12 card fronts + 12 card backs, pre-linked)
- 6 grammar sheets and 4 drill sheets (blank worksheets – no language is assumed)
- 8 conversation journal pages with dated entry rows
- 1 progress wall (deck rows × Day 1/3/7/14/30 columns)

Minimum configuration (`deckCount: 2, cardsPerDeck: 8, journalPageCount: 4`) exports 70 pages; maximum exports 246.

## Navigation

- Cover (full-page tap and CTA) -> `start_here`
- Field guide -> demo bench, word lab, `grammar_01`, `drill_01`, `journal_01`, or `progress_board`
- Lab hub deck chips -> their decks (`child_index` 0-5; unused chips bind `''` and vanish); reference chips -> grammar, drills, journal, progress by id
- Deck hub card grid enumerates the deck's card fronts (tap a row to open its card); `Start the run »` -> card 1 (`child_index` 0)
- Card front `Reveal »` -> its back (the front's only child, `child_index` 0); the front's footer returns to the deck (`parent`)
- Card back `Next card »` -> the next front via a reference-node child (`child_index` 0); the label is `''` on each deck's last card, so the chip and its annotation vanish
- Card back `« Deck sheet` -> the deck hub (`ancestor` 2, always labelled); footer returns to the card front (`parent`)
- Grammar/drill/journal pages chain with `sibling` links whose end-of-run labels bind `''`
- Progress wall rows -> the decks via reference-node children (`child_index` 0-5, unused rows bind `''`)
- The demo bench and every demo card show **EXAMPLE** chrome with a working skip link to the blank workspace

## Visual And Border Construction

Original flask and word-tag SVG motifs were newly authored for this product. Teal `#2f5d5a` carries the spine band, specimen-card frames, and primary text; amber `#b3703f` carries the tag motif and navigation; mist `#eef0ea` is the page ground with paper `#f9faf6` specimen cards – the tones stay distinct in grayscale. The lab-notebook chrome is a full-height teal spine with amber index ticks and fine double rules at head and foot; card pages sit inside double specimen frames. Every table (grammar examples, drill columns, journal date cells, progress matrix) is explicit bordered rects; the single grid element – the deck hub's card list – sets all `gridBorder*` properties explicitly.

## Publishing

Suggested tags: `language, vocabulary, flashcards, study, learning, grammar`

Suggested preview pages (six, by template tab): Lab Cover, Deck Hub, Card Front, Card Back, Grammar Sheet, Drill Sheet.
