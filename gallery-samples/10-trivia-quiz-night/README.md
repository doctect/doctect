# Quiz Night

A self-scoring pub trivia companion for reMarkable Paper Pro. Six themed rounds of ten evergreen questions each – general knowledge, science, history, geography, arts, and a wildcard – where every question card reveals its answer with one tap, every answer carries a fun fact for settling arguments, and a chalkboard score ledger tracks up to six teams through to the grand total. A host kit of pre-wired blank rounds means your own handwritten quiz navigates exactly like the printed one.

## Why you'll like it

- **It scores itself.** Tap `Reveal »` on any question card to land on its answer, `Next question »` to keep the round moving, and mark points in the per-team boxes on each round hub.
- **Sixty evergreen questions.** Capitals, chemical symbols, classic literature, landmark dates – checked facts that will read the same in ten years, ordered easy to hard within each round.
- **A fun fact with every answer.** One extra true thing per question, for the quizmaster to read out or the table to argue over.
- **A real score system.** Two six-team score ledgers with all-cell chalk borders, plus a grand total sheet with a winner box worth photographing.
- **Write your own quiz for free.** The host kit's blank rounds are already cross-linked question-to-answer-to-next-question, so a handwritten quiz gets working reveal navigation without touching a link.

## Workflow

1. Open the host guide, then start Round 1 from its hub.
2. Read a question aloud; teams write answers down while the card's lines hold yours.
3. Tap `Reveal »` to check, award points in the round hub's team boxes, then `Next question »`.
4. After each round, copy team scores onto the score ledger.
5. After Round 6, fill the grand total sheet and chalk up the winner.
6. To host your own: pick a blank round in the host kit, write a topic and ten questions, and the navigation is already wired.

All sixty questions and their fun facts are evergreen, verifiable general knowledge – nothing time-sensitive, no trick questions.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { blankRoundCount: 2 };
```

Supported integer range:

| Setting | Range | Purpose |
|---|---:|---|
| `blankRoundCount` | 0-4 | Pre-wired blank rounds in the host kit |

Unsupported values fail with a clear `Quiz Night config` error.

## Inventory

Default configuration exports 175 pages:

- 1 cover and 1 host guide
- 6 round hubs (ten linked question rows and six team score boxes each)
- 60 question cards and 60 answer cards, fully cross-linked
- 2 score ledgers (6 rounds x 6 teams, explicit all-cell borders) and 1 grand total sheet
- 1 worked example hub (the EXAMPLE page) whose specimen rows open the live Round 1 opener
- 1 host kit hub with 2 blank rounds (each: hub + 10 question cards + 10 answer cards, pre-linked)

Minimum configuration (`blankRoundCount: 0`) exports 133 pages; maximum exports 217.

## Navigation

- Cover (full-page tap and CTA) -> `start_here`
- Host guide -> each round hub, `scoreboard_1`, `example_workspace`, or `blank_workspace`
- Round hub rows -> their question cards (`child_index` 0-9); each row carries six per-team score boxes
- Question card `Reveal »` -> its answer card (the question's only child, `child_index` 0)
- Answer card `Next question »` -> the next question via a reference-node child (`child_index` 0); the label is empty on each round's last answer, so the chip and its annotation vanish
- Answer card `« Back to round` -> the round hub (`ancestor` 2); footers link question -> round hub and answer -> question (`parent`)
- Score ledger round labels -> their round hubs; `Grand totals »` -> the grand total sheet
- Blank host-kit rounds mirror the authored wiring exactly with `''` content
- The worked example hub shows **EXAMPLE** chrome with a working skip link to the blank workspace

## Visual And Border Construction

Original pint-glass, chalk question-mark, and tally-mark SVG motifs were newly authored for this product. Board `#2e3438` carries the masthead panels and text, brass `#b08d3f` carries navigation, rules, and score-box borders, chalk paper `#f0ede4` is the page ground; the three tones stay distinct in grayscale. Double brass rules divide every page; oversized round and question numerals anchor the hubs and cards. The score ledger draws every cell as an explicit bordered rect – no grid elements are used anywhere in this product.

## Publishing

Suggested tags: `trivia, quiz, party, games, pub-quiz, questions`

Suggested preview pages (six, by template tab): Quiz Cover, Round Hub, Question Card, Answer Card, Score Sheet, Host Kit Hub.
