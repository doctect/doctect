# Semester Study Planner

Gallery metadata + generator scripts for the Semester Planner sample project.

## Gallery metadata

- **Title:** Semester Study Planner
- **Tags:** `student` `study` `school` `university` `planner` `semester`
- **Description:** Everything for a term in one book. A semester hub links to your courses, a master assignment tracker, a weekly timetable, and a grade sheet. Each course keeps its info (instructor, room, credits) and a page of class notes for every week. Rename the semester and courses, then fill it in as the term rolls on.

## Structure

```
cover (root)
└── Semester hub (hub, id "contents")   — Courses / Assignments / Schedule / Grades
    ├── Courses (section)   [button 0]
    │   └── Course × 6 (course — info + weekly class-note grid)
    │       └── Week × 14 (session — date/topic, notes, homework)
    ├── Assignments (assignments)  [button 1] — course / assignment / due / done table
    ├── Schedule (schedule)        [button 2] — weekly timetable (times × Mon–Fri)
    └── Grades (grades)            [button 3] — course / assessment / weight / grade table
```

- Templates: `cover`, `hub`, `section`, `course`, `session`, `assignments`, `schedule`, `grades`
- Default size: 96 nodes / 96 pages (84 class sessions)
- Page: reMarkable Paper Pro, 509 × 679

## Navigation

- Cover → Semester hub; hub buttons → Courses / Assignments / Schedule / Grades (`child_index 0–3`)
- Courses → course → week session
- Every page: `Index` → hub, `Cover` → cover, `Back`/`Courses`/`Course`/`Semester` chip → parent, corner triangles → prev/next

## Tweak knobs

Top of `hierarchy.js`: `semesterName`, `numCourses`, `sessionsPerCourse`. Table rows live in the
`makeTable(...)` calls in `templates.js`.

## How to load

1. Editor → **Generator**.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. **Run Generator**.
