---
title: Text Overflow
summary: What happens when text doesn't fit a fixed-size box — Clip, Ellipsis, Shrink, or Visible — plus the Wrap toggle beside it.
aliases: clip, ellipsis, shrink, overflow modes
keywords: overflow, textOverflow, clip, ellipsis, shrink, visible, wrap, textWrap, fit, cut off, truncate
---

**Overflow** (the `textOverflow` field) decides what happens when text is too long for a fixed-size text box:

| Mode | What happens |
| --- | --- |
| Clip | Text past the edge is cut off, with nothing marking it. |
| Ellipsis | Cut off the same way, but the last visible line ends in "…". |
| Shrink | The font size shrinks automatically, just enough to fit. |
| Visible | Nothing is cut — text spills out past the box's edges. |

**Wrap**, the checkbox beside it (`textWrap`), turns line-wrapping on or off; off, everything stays on one line however wide the box. **Both controls only mean something for a fixed-size box:** turn [Auto width](/docs/reference/auto-width) on and they grey out, since a box that resizes to its own content never has anything left to overflow.

See [Typography](/docs/editor/elements-and-properties#typography).
