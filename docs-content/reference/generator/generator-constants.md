---
title: Page-Size Constants
summary: Four bare identifiers pre-injected into the templates script — A4 and reMarkable Paper Pro page dimensions in points.
aliases: A4_WIDTH, RM_PP_WIDTH, page sizes, constants
keywords: A4_WIDTH, A4_HEIGHT, RM_PP_WIDTH, RM_PP_HEIGHT, constants, page size, points, remarkable, a4
---

Four page-size constants are pre-injected into the **Define Templates** script as bare identifiers, and nothing stops you computing with them (`A4_WIDTH / 2`, `A4_HEIGHT - 60`):

| Constant | Value | Measures |
| --- | --- | --- |
| `A4_WIDTH` | 595.28 | A4 page width in points |
| `A4_HEIGHT` | 841.89 | A4 page height in points |
| `RM_PP_WIDTH` | 509 | reMarkable Paper Pro width |
| `RM_PP_HEIGHT` | 679 | reMarkable Paper Pro height |

They exist **only in the templates script** — the [hierarchy script](/docs/reference/hierarchy-script)'s scope holds just `createId` and `templates`, so referencing `A4_WIDTH` there is a ReferenceError. All values are PDF points (1 pt = 1/72 inch), the same unit the canvas uses.

See [Geometry and constants](/docs/generator/templates-in-code#geometry-and-constants).
