---
title: Version History & Restore
summary: Restore rolls the active project tab back to any earlier commit — a purely local act that never writes to the cloud and resets the undo stack.
aliases: restore, revert, previous version, version history, roll back
keywords: version history, restore, revert, previous version, commit, head, undo stack, local, confirm, snapshot, rollback
---

**Version history** (Cloud menu) lists every [commit](/docs/reference/commit) newest-first, the current one marked **HEAD**, each with its message, timestamp, and a **Restore** button. Click Restore, confirm the *"Replace the current editor contents with this version?"* prompt, and the whole active tab snaps back to that snapshot — the sidebar, the canvas, down to which node was selected. It's not an undo of one change; it's the entire project exactly as it was at that save.

Restore is **purely local**: it changes what's in your editor, not what's on the server — open Version history again and every commit is still there, HEAD unchanged. Two caveats: whatever was in the editor and not yet saved is gone when you restore, and a restore **resets the undo stack**, so `kbd:Ctrl+Z` won't bring the pre-restore state back (save first if the current state matters). Want an old version as the *newest* one too? Just [save again](/docs/reference/cloud-save) — that stacks a new commit with the old content on top, and the history only ever records more.

See [Restoring an old version](/docs/gallery/cloud-saves-and-history#restoring-an-old-version).
