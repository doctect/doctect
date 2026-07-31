# Opening Atlas

A chess opening repertoire for reMarkable Paper Pro, drawn as a navigable move tree. Four chapters - the Italian Game and the Queen's Gambit for White, the Sicilian Defence and the French Defence for Black - hold forty real book positions. Every position is a page: a rule-framed diagram, the move list that produced it, a book assessment, one line on the idea, and up to three candidate-move chips that each link one position deeper. Transpositions are reference pages that land on the original position, wherever it lives in the book. A practice kit of blank-board line worksheets and study log sheets turns the atlas into a training tool.

## Why you'll like it

- **A repertoire you can tap through.** Candidate moves are links: follow `3... Bc5 »` and the Giuoco Piano position after 4. c3 opens as its own page, diagram and all.
- **Chess-correct boards, letter pieces.** Every diagram was derived by replaying its move list from the initial position - uppercase letters are White, lowercase black, and the board always faces White. No fragile chess fonts anywhere.
- **Transpositions behave like transpositions.** When a move order rejoins the mainline (the Two Knights into the Pianissimo, `5... Nbd7` into the Orthodox tabiya), the chip is a reference page that lands on the original position page.
- **Real, evergreen theory.** Giuoco Pianissimo with c3/d3, the Orthodox QGD with Rc1 and the minority attack, the Najdorf with 6...e5, the French Advance/Tarrasch/Winawer - century-stable mainlines, not engine fashion.
- **A practice kit that trains recall.** Blank 64-cell boards to rebuild lines from memory, ruled line and idea spaces, and study logs that score every session out of ten.

## Workflow

1. Open the study guide, pick a repertoire hub - White or Black - and open a chapter.
2. Play the chapter mainline through on a real board, page by page, to its tabiya.
3. Go back and follow each branch; `· transposes »` chips jump you to the line they rejoin.
4. Write your own findings on each position's annotation lines.
5. In the practice kit, rebuild a line from memory on a worksheet's blank board.
6. Score the session in a study log; revisit the branches that scored lowest.

All move sequences and diagrams follow legally from their move lists; the lines are established book theory and will read the same in twenty years.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { worksheetCount: 8, studyLogCount: 4 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `worksheetCount` | 4-16 | Blank line worksheets in the practice kit |
| `studyLogCount` | 2-8 | Study log sheets in the practice kit |

Unsupported values fail with a clear `Opening Atlas config` error.

## Inventory

Default configuration exports 62 pages:

- 1 cover and 1 study guide (piece-letter legend, how-to, page anatomy)
- 2 repertoire hubs (White and Black, two chapter cards each)
- 4 chapter openers (plan, key ideas, `Begin the line »`)
- 40 position pages across four chapters (10 each), every one with a full 64-cell bound diagram, SAN move list, assessment, idea line, and candidate chips
- 3 transposition reference nodes (zero extra pages - they resolve to the original positions)
- 1 fully annotated worked example position (the EXAMPLE page) whose candidate chips open live chapter pages
- 1 practice kit hub with 8 line worksheets and 4 study logs

Minimum configuration (`worksheetCount: 4, studyLogCount: 2`) exports 56 pages; maximum exports 74.

## Navigation

- Cover (full-page tap and CTA) -> `start_here`
- Study guide -> White hub, Black hub, `example_workspace`, or `blank_workspace`
- Repertoire hub chapter cards -> their chapter openers (`child_index` 0-1)
- Chapter `Begin the line »` -> the chapter's root position (`child_index` 0)
- Position candidate chips -> child positions (`child_index` 0-2); unused chips bind `''` and vanish with their annotations
- `· transposes »` chips -> reference nodes that resolve to the original position page (Two Knights -> Pianissimo mainline, early ...O-O -> the 7. Re1 tabiya, 5...Nbd7 -> the Orthodox 7. Rc1 position)
- Worked example chips -> reference nodes into the live Italian chapter
- Footers: `« Back` (parent) on every position, `STUDY GUIDE »` on study pages, `« Practice kit` on worksheets and logs
- The worked example shows **EXAMPLE** chrome with a working skip link to the blank workspace

## Visual And Border Construction

Original cover art (mini board, branching move tree, rook and pawn silhouettes), the brass diamond divider, and the pawn-rank ornament were newly authored for this product. Slate `#2b3542` carries the masthead band and piece letters, brass `#a08248` carries navigation, rules, and diagram frames, cool ivory `#edf0f4` is the page ground; the tones stay distinct in grayscale. The board is one static SVG checkerboard (a1 dark, White's view) under 64 individually positioned bound text cells with serif file and rank labels on the edges. The study log draws every cell as an explicit bordered rect - no grid elements are used anywhere in this product.

## Publishing

Suggested tags: `chess, openings, repertoire, strategy, study, games`

Suggested preview pages (six, by template tab): Atlas Cover, Repertoire Hub, Chapter Opener, Position Page, Line Worksheet, Practice Hub.
