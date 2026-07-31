# The Reading Room

A reading journal for reMarkable Paper Pro built around a tappable bookshelf. Two drawn shelves of twelve spines each stand over twenty-four book pages – tap a spine and its book opens, with dates, rating dots, format chips, a review block, and a favourite-quote slot. Behind the shelves sit a sixteen-leaf quote vault, four series ledgers, a two-page TBR stack, and wrap up sheets for the year's reckoning.

## Why you'll like it

- **The shelf is the index.** Every spine is a tap into that slot's book page, and the spine and the page share one title line – the book keeps the field, the shelf reads it, so writing the title once updates both.
- **Book pages with the right furniture.** Started and finished dates, five rating dots to ink, format tick-chips (hardback to audio), a ruled review block, and a framed favourite-quote slot with its page number.
- **A vault for the lines worth keeping.** Sixteen quote leaves, two framed quotes to a leaf with book · author · page source lines, chained front to back.
- **Ledgers with opinions.** Series ledgers that ask what you own *and* what you've read, a TBR stack that expects to be crossed off, and a wrap up sheet demanding month counts, a top five, and an honest DNF list.
- **A worked example that shows the handwriting.** Jane Eyre filled end to end – real book, real author, invented journal-style dates and verdicts – plus a filled quote leaf, all clearly marked EXAMPLE with a skip link to your blank library.

## Workflow

1. Read Before You Shelve, then flip through the worked Jane Eyre to see the intended handwriting.
2. Claim a spine: open a shelf, tap a slot, and write the book's title into the title line – the spine shows the same field.
3. Keep the book page as you read; when a line stops you, copy it into the quote vault with its page.
4. Feed series ledgers and the TBR stack as the year suggests them.
5. In December, settle the year on the wrap up sheet – counts, the top five, the DNF list.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { bookCount: 24, quotePageCount: 16 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `bookCount` | 12-36 | Book pages; shelves appear one per twelve (up to three) |
| `quotePageCount` | 8-24 | Quote leaves in the vault |

Unsupported values fail with a clear `The Reading Room config` error. With a book count that is not a multiple of twelve, the last shelf's spare spine slots print as silent ghost spines.

## Inventory

Default configuration exports 56 pages:

- 1 cover and 1 reader guide
- 1 worked-example table with Jane Eyre filled end to end and a filled quote leaf, all EXAMPLE-labelled
- 1 Your Library hub
- 2 bookshelves (twelve spine chips each over a drawn two-bay case)
- 24 book pages (titled Slot 1 through Slot 24 until written)
- 16 quote leaves, 4 series ledgers, 2 TBR pages, 2 wrap up sheets

Minimum configuration (`bookCount: 12, quotePageCount: 8`) exports 35 pages; maximum exports 77.

## Navigation

- Cover (full-page tap and CTA) -> `start_here`
- Reader guide doors -> worked example, Your Library, `shelf_01`, the quote vault, the TBR stack, and the wrap up by stable id
- Library Hub chips -> shelves, vault, series, TBR, wrap up, and the worked example; the example table's two slot chips (`child_index` 0-1) open its Jane Eyre and quote leaf
- Spine chips -> book pages as real shelf children (`child_index` 0-11); slots past the book count bind `''` on the shelf and vanish
- Each book's spine field (`spine_N_label`) lives on the book node itself; the shelf chip and the book's title line bind the same field, so one edit renames both. The node's sidebar title (`Slot N`) is a label only.
- Books chain with `sibling` links, crossing shelf boundaries through the PDF engine's cousin fallback; the first and last book bind `''`
- Every book carries an always-labelled shelf chip (`parent`) and an ancestor link back to the library; quote leaves, series ledgers, TBR pages, and wrap up sheets chain with `sibling` links, `''` at true dead ends
- The worked example shows **EXAMPLE** chrome with a working skip link to the blank workspace

## Visual And Border Construction

Original artwork throughout: the cover plate (a two-bay bookcase with drawn spines, a leaning book, a green-shaded reading lamp, and a mug), the open-book bookplate mark in the page head, and the shelf-page case – two bays of six ghost spines with band lines standing on leather boards, drawn 1:1 under the tappable chips. Leather `#533b33` carries frames, rules, spines, and primary text; lamp green `#37564e` carries the plate marks, nails, ticks, and ornaments; page `#f3ecdf` is the ground with near-white `#fbf6ec` writable plates – tones that stay apart in grayscale. The chrome is a library plate: an inset head rule pinned by two lamp-green nails under a small bookplate mark, and a split foot rule around an EX LIBRIS folio with plate ticks in the bottom corners – geometrically unlike the chrome of products 09-15. Series tables, month-count cells, and totals boxes are explicit bordered rects; the product uses no grid elements.

## Publishing

Suggested tags: `reading, books, journal, library, quotes, tracker`

Suggested preview pages (six, by template tab): Room Cover, Bookshelf, Book Page, Quote Leaf, Series Ledger, Wrap Up Sheet.
