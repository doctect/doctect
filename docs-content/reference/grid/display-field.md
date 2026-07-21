---
title: Display Field
summary: The template that decides what text lands in each grid cell — seeded to the child's title, and quietly falling back to it if you clear the field.
aliases: cell text, what cells show
keywords: display field, displayField, display template, title, cell text, field, binding, day_num, quick insert
---

**Display Template** (the `displayField` field), in **Grid Configuration** below the layout fields, decides what text lands in each cell. It runs against whichever child that cell represents, exactly like a bound text box — once per child instead of once per page. Type a bare field name and PDF Architect wraps it in `{{ }}` automatically (`day_num` becomes `{{day_num}}`); type a full template with literal characters and more than one placeholder (`{{month_short}} {{day_num}}`) and that works too. A row of quick-insert buttons lists every field found across the first 20 resolved children.

**A fresh grid seeds `displayField` to `title`,** so cells show each child's title from the first moment. **Clearing the field doesn't blank the cells** — a grid with an empty Display Template quietly falls back to the title anyway, a grid-specific safety net that an ordinary (blank-rendering) text box doesn't have.

See [Columns, gaps, display field](/docs/editor/grids-basics-and-styling#columns-gaps-display-field).
