
export const notebookPresetData = {
  "rootId": "root",
  "nodes": {
    "root": {
      "id": "root",
      "parentId": null,
      "type": "notebook_cover",
      "title": "My Notebook",
      "data": {},
      "children": ["sec_1", "sec_2", "sec_3"]
    },
    "sec_1": {
      "id": "sec_1",
      "parentId": "root",
      "type": "section_divider",
      "title": "Project A",
      "data": {},
      "children": ["p1_1", "p1_2", "p1_3"]
    },
    "p1_1": { "id": "p1_1", "parentId": "sec_1", "type": "lined_page", "title": "Project A - Page 1", "data": {}, "children": [] },
    "p1_2": { "id": "p1_2", "parentId": "sec_1", "type": "lined_page", "title": "Project A - Page 2", "data": {}, "children": [] },
    "p1_3": { "id": "p1_3", "parentId": "sec_1", "type": "lined_page", "title": "Project A - Page 3", "data": {}, "children": [] },
    "sec_2": {
      "id": "sec_2",
      "parentId": "root",
      "type": "section_divider",
      "title": "Project B",
      "data": {},
      "children": ["p2_1", "p2_2", "p2_3"]
    },
    "p2_1": { "id": "p2_1", "parentId": "sec_2", "type": "lined_page", "title": "Project B - Page 1", "data": {}, "children": [] },
    "p2_2": { "id": "p2_2", "parentId": "sec_2", "type": "lined_page", "title": "Project B - Page 2", "data": {}, "children": [] },
    "p2_3": { "id": "p2_3", "parentId": "sec_2", "type": "lined_page", "title": "Project B - Page 3", "data": {}, "children": [] },
    "sec_3": {
      "id": "sec_3",
      "parentId": "root",
      "type": "section_divider",
      "title": "Ideas",
      "data": {},
      "children": ["p3_1", "p3_2", "p3_3"]
    },
    "p3_1": { "id": "p3_1", "parentId": "sec_3", "type": "lined_page", "title": "Ideas - Page 1", "data": {}, "children": [] },
    "p3_2": { "id": "p3_2", "parentId": "sec_3", "type": "lined_page", "title": "Ideas - Page 2", "data": {}, "children": [] },
    "p3_3": { "id": "p3_3", "parentId": "sec_3", "type": "lined_page", "title": "Ideas - Page 3", "data": {}, "children": [] }
  },
  "templates": {
    "notebook_cover": {
      "id": "notebook_cover",
      "name": "Notebook Cover",
      "width": 509,
      "height": 679,
      "elements": [
        { "id": "bg", "type": "rect", "x": 0, "y": 0, "w": 509, "h": 679, "rotation": 0, "fill": "#334155", "stroke": "", "strokeWidth": 0, "opacity": 1, "borderRadius": 0, "zIndex": 0 },
        { "id": "lbl", "type": "rect", "x": 50, "y": 100, "w": 409, "h": 120, "rotation": 0, "fill": "#ffffff", "stroke": "", "strokeWidth": 0, "opacity": 1, "borderRadius": 4, "zIndex": 1 },
        { "id": "title", "type": "text", "x": 50, "y": 140, "w": 409, "h": 40, "rotation": 0, "fill": "", "stroke": "", "strokeWidth": 0, "opacity": 1, "text": "{{title}}", "fontSize": 32, "fontWeight": "bold", "textColor": "#1e293b", "align": "center", "zIndex": 2 }
      ]
    },
    "section_divider": {
      "id": "section_divider",
      "name": "Section Divider",
      "width": 509,
      "height": 679,
      "elements": [
        { "id": "title", "type": "text", "x": 0, "y": 300, "w": 509, "h": 50, "rotation": 0, "fill": "", "stroke": "", "strokeWidth": 0, "opacity": 1, "text": "{{title}}", "fontSize": 48, "fontWeight": "bold", "textColor": "#334155", "align": "center", "zIndex": 1 },
        { "id": "toc", "type": "grid", "x": 50, "y": 400, "w": 409, "h": 50, "rotation": 0, "fill": "#f1f5f9", "stroke": "#cbd5e1", "strokeWidth": 1, "opacity": 1, "borderRadius": 4, "gridConfig": { "cols": 1, "gapX": 10, "gapY": 10, "sourceType": "current", "displayField": "title" }, "fontSize": 16, "textColor": "#475569", "zIndex": 1 }
      ]
    },
    "lined_page": {
      "id": "lined_page",
      "name": "Lined Page",
      "width": 509,
      "height": 679,
      "elements": [
        { "id": "header", "type": "text", "x": 40, "y": 40, "w": 400, "h": 30, "rotation": 0, "fill": "", "stroke": "", "strokeWidth": 0, "opacity": 1, "text": "{{title}}", "fontSize": 24, "textColor": "#94a3b8", "fontWeight": "bold", "zIndex": 1 },
        { "id": "lines", "type": "rect", "x": 40, "y": 100, "w": 429, "h": 530, "rotation": 0, "fill": "#fff", "fillType": "pattern", "patternType": "lines-h", "patternSpacing": 28, "patternWeight": 1, "stroke": "transparent", "strokeWidth": 0, "opacity": 1, "zIndex": 0 },
        { "id": "up", "type": "text", "x": 450, "y": 40, "w": 40, "h": 20, "rotation": 0, "fill": "", "stroke": "", "strokeWidth": 0, "opacity": 1, "text": "Up", "fontSize": 12, "textColor": "#64748b", "linkTarget": "parent", "align": "right", "zIndex": 10 }
      ]
    }
  }
};
