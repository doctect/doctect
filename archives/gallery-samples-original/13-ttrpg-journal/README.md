# TTRPG Campaign Journal

Gallery metadata + generator scripts for the TTRPG Campaign Journal sample project.

## Gallery metadata

- **Title:** TTRPG Campaign Journal
- **Tags:** `ttrpg` `dnd` `tabletop` `rpg` `gamemaster` `campaign`
- **Description:** Run and remember a whole campaign. Log every session — recap, what happened, loot, XP — with a tabbed edge that jumps straight to your NPC, location, and quest banks so you can reference the world without flipping around. Keep a sheet for every character, place, and quest. Rename the campaign and every entry to your table.

## Structure

```
cover (root, d20 art)
└── Campaign hub (hub, id "contents")   — Sessions / NPCs / Locations / Quests
    ├── Sessions (section, id "sessions")   └ Session × 24 (session — log + bank tabs)
    ├── NPCs (section, id "npcs")            └ NPC × 24 (npc — role/faction/location + notes)
    ├── Locations (section, id "locations")  └ Location × 16 (location — region/type + map notes)
    └── Quests (section, id "quests")        └ Quest × 16 (quest — giver/status/reward/objectives)
```

- Templates: `cover`, `hub`, `section`, `session`, `npc`, `location`, `quest`
- Default size: 86 nodes / 86 pages
- Page: reMarkable Paper Pro, 509 × 679

## Session tabs (browse, don't pin)

Session pages carry a right-edge tab strip — **NPCs / Places / Quests** — linking to the three
banks by fixed id (`npcs`, `locations`, `quests`). So while writing a session you jump to any
entry in a bank, rather than pre-pinning specific NPCs to a session (which encounters are decided
at the table, not in advance). The hub's four buttons link to the banks the same way.

## Navigation

- Cover → Campaign hub; hub buttons / session tabs → Sessions / NPCs / Locations / Quests
- Each bank → its entries; entry `Back` chip → its bank
- Every page: `Index` → hub, `Cover` → cover, corner triangles → prev/next

## Tweak knobs

Top of `hierarchy.js`: `campaignName`, `numSessions`, `numNPCs`, `numLocations`, `numQuests`.

## How to load

1. Editor → **Generator**.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. **Run Generator**.
