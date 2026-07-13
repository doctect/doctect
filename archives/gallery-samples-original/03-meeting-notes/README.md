# Meeting Notes System

Gallery metadata + generator scripts for the Meeting Notes sample project.

## Gallery metadata

- **Title:** Meeting Notes System
- **Tags:** `meetings` `work` `professional` `productivity` `agenda` `notes`
- **Description:** A structured binder for every meeting that matters. Group your work into projects, and give each meeting its own page — date, attendees, agenda, notes, action-item checkboxes, and decisions, all laid out so nothing slips. Each project keeps a tappable index of its meetings plus a project-notes space. Rename the projects to your teams or clients and start filling pages.

## Structure

```
cover (root)
└── Projects (projects_index, id "contents")
    └── Project 1..N        (project — meeting index + project notes)
        └── Meeting 1..M     (meeting — date/attendees/agenda/notes/actions/decisions)
```

- Templates: `cover`, `projects_index`, `project`, `meeting`
- Default size: 152 nodes (1 + 1 + 6 projects + 144 meetings)
- Page: reMarkable Paper Pro, 509 × 679
- Projects are generic ("Project 1" …) — **rename each in the editor's tree**.

## The meeting page

Date and Attendees fields, an Agenda block, a large Notes area, four action-item checkboxes with
lines, and a Decisions block — the standard anatomy of a good meeting note.

## Navigation

- Cover → Projects index (whole cover tappable + "Open binder" button)
- Projects grid → project; project meeting-row → meeting page
- Every page: `Index` chip → Projects, `Cover` chip → cover
- Project: `Projects` chip → index; corner triangles → prev/next project
- Meeting: `Project` chip → its project; corner triangles → prev/next meeting

## Tweak knobs

Top of `hierarchy.js`: `numProjects`, `meetingsPerProject`.

## How to load

1. Editor → **Generator**.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. **Run Generator**.
