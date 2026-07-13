# Study Compass

Study Compass is an academic success system for reMarkable Paper Pro. It connects semester orientation, weekly planning, Cornell notes, active-recall cards, assignment tracking, and exam preparation without turning writing pages into dashboards.

## Workflow

1. Open **Start Here** and choose the guided example or blank workspace.
2. Use the semester overview to enter a course or teaching week.
3. Plan weekly learning and submission commitments.
4. Capture lectures with a 30/70 Cornell cue-to-note split and bottom summary.
5. Open the guided note's referenced card, or a blank note's referenced course deck; answer a question, then use **Turn over for answer**.
6. Keep assignments and exam preparation visible from each course dashboard.

The guided branch follows an environmental-science idea from a carbon-cycle lecture through a Cornell note, two-sided revision card, assignment, and exam plan. Every guided page carries an `EXAMPLE` marker and a direct **Skip to blank workspace** link.

## Page Inventory

- Distinct Study Compass cover and one-page orientation
- Guided workspace, semester, course, weekly plan, Cornell note, linked two-sided card, assignment register, and exam plan
- Blank workspace and semester overview
- Configurable teaching-week plans shared across the semester
- Configurable course dashboards
- Reusable Cornell note bank per course
- Referenced revision-card bank with linked question and answer faces
- Assignment register and exam plan per course

Default configuration generates 158 nodes. Minimum configuration generates 28 nodes.

## Configuration

Edit `DEFAULT_CONFIG` in `hierarchy.js`, or pass matching fields through `SAMPLE_CONFIG`:

| Field | Default | Supported range | Meaning |
| --- | ---: | ---: | --- |
| `courseCount` | 4 | 1-6 | Blank semester courses |
| `teachingWeeks` | 14 | 4-18 | Semester-level weekly plans |
| `notesPerCourse` | 6 | 1-12 | Cornell notes and note-to-deck references per course |
| `cardsPerCourse` | 8 | 1-20 | Two-sided revision cards per course |

Values must be integers. Unsupported values stop generation with a field-specific error instead of producing partial navigation.

## Navigation Map

`Study Compass cover` -> `Start Here` -> `Guided Example` or `Blank Study Workspace`

`Workspace` -> `Semester` -> `Teaching Week` or `Course` -> `Cornell Notes` / `Revision Deck` / `Assignments` / `Exam Plan`

The guided Cornell note references an existing question face and answer face. Blank notes reference their course's real deck, avoiding duplicate card pages. Every real or referenced question face resolves **Turn over for answer** to its matching answer. Stable destinations are `root`, `start_here`, `example_workspace`, and `blank_workspace`. Page chrome provides **Home** and **Up** controls; dashboards and cards provide contextual forward links only where destinations exist.

## Visual System

Warm parchment keeps writing regions calm. Eucalyptus identifies navigation and answer states; terracotta marks examples, questions, and current priorities. Original compass, leaf, and open-book line art reinforces orientation and study. All navigation labels are at least 11px, and every grid declares border mode, color, width, and style explicitly.
