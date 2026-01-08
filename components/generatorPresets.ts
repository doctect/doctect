/**
 * Generator Script Presets
 * 
 * These presets provide progressive examples from simple to complex,
 * helping users learn how to create their own generator scripts.
 */

import { RM_PP_WIDTH, RM_PP_HEIGHT, A4_WIDTH, A4_HEIGHT } from '../types';

export interface GeneratorPreset {
    id: string;
    name: string;
    description: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    templateScript: string;
    hierarchyScript: string;
}

// =============================================================================
// BLANK PRESET - Fresh start with minimal working example
// =============================================================================
const BLANK_TEMPLATES = `// Define your templates here
// Constants available: RM_PP_WIDTH (${RM_PP_WIDTH}), RM_PP_HEIGHT (${RM_PP_HEIGHT}), A4_WIDTH (${A4_WIDTH}), A4_HEIGHT (${A4_HEIGHT})
//
// TIP: You can leave 'elements' as an empty array [] if you want to design
// the template visually in the editor later. Just define the template structure here.

const templates = {
    "page": {
        id: "page",
        name: "Blank Page",
        width: RM_PP_WIDTH,
        height: RM_PP_HEIGHT,
        elements: []  // Empty - design visually in the editor!
    }
};

return templates;`;

const BLANK_HIERARCHY = `// Build your node hierarchy here
// 'templates' object is available from step 1.
//
// createId(prefix) - Helper function that generates unique IDs.
//   Example: createId('chapter') might return 'chapter_abc123xyz'
//   Use this for all node IDs to ensure uniqueness.

const nodes = {};
const rootId = 'root';

// Root node - required! Edit this to customize your project.
nodes[rootId] = {
    id: rootId,
    parentId: null,
    type: 'page',  // must match a template id
    title: 'My Project',
    data: {},      // custom data fields accessible via {{field_name}}
    children: []
};

// Add more nodes here as children of the root:
// const childId = createId('page');
// nodes[childId] = { id: childId, parentId: rootId, type: 'page', title: 'Page 1', data: {}, children: [] };
// nodes[rootId].children.push(childId);

return { nodes, rootId };`;

// =============================================================================
// SIMPLE PRESET - Minimal working example
// =============================================================================
const SIMPLE_TEMPLATES = `// SIMPLE EXAMPLE: A book with 2 chapters
// This creates 2 templates: a cover page and a chapter page
//
// TIP: You can leave 'elements' as an empty array [] if you want to design
// the template visually in the editor later. Just define the template structure here.

const templates = {
    "cover": {
        id: "cover",
        name: "Cover Page",
        width: RM_PP_WIDTH,
        height: RM_PP_HEIGHT,
        elements: [
            { id: "title", type: "text", x: 50, y: 200, w: 409, h: 80, 
              text: "{{title}}", fontSize: 48, align: "center", fontWeight: "bold" },
            { id: "subtitle", type: "text", x: 50, y: 300, w: 409, h: 40, 
              text: "A Simple Book", fontSize: 24, align: "center", textColor: "#666666" }
        ]
    },
    "chapter": {
        id: "chapter",
        name: "Chapter Page",
        width: RM_PP_WIDTH,
        height: RM_PP_HEIGHT,
        elements: [
            { id: "header", type: "text", x: 20, y: 20, w: 200, h: 30, 
              text: "{{title}}", fontSize: 20, fontWeight: "bold" },
            { id: "line", type: "line", x: 20, y: 55, w: 469, h: 0, 
              stroke: "#000000", strokeWidth: 1 },
            { id: "content", type: "rect", x: 20, y: 70, w: 469, h: 580, 
              fill: "#f5f5f5", fillType: "pattern", patternType: "lines-h", patternSpacing: 20 }
        ]
    }
};

return templates;`;

const SIMPLE_HIERARCHY = `// SIMPLE EXAMPLE: A book with 2 chapters
// Creates: Cover -> Chapter 1 -> Chapter 2
//
// createId(prefix) - Helper function that generates unique IDs.
//   Example: createId('chapter') might return 'chapter_abc123xyz'
//   Use this for all node IDs to ensure uniqueness.

const nodes = {};
const rootId = 'root';

// Root node (cover page)
nodes[rootId] = {
    id: rootId,
    parentId: null,
    type: 'cover',
    title: 'My Simple Book',
    data: { author: 'You' },
    children: []
};

// Add 2 chapters
for (let i = 1; i <= 2; i++) {
    const chapterId = createId('chapter');
    nodes[chapterId] = {
        id: chapterId,
        parentId: rootId,
        type: 'chapter',
        title: 'Chapter ' + i,
        data: { chapter_num: i.toString() },
        children: []
    };
    nodes[rootId].children.push(chapterId);
}

return { nodes, rootId };`;

// =============================================================================
// MEDIUM PRESET - Notebook with sections
// =============================================================================
const MEDIUM_TEMPLATES = `// MEDIUM EXAMPLE: Notebook with sections and pages
// Shows: grids, data bindings, navigation links
//
// TIP: You can leave 'elements' as an empty array [] if you want to design
// the template visually in the editor later. Just define the template structure here.

const templates = {
    "notebook_cover": {
        id: "notebook_cover",
        name: "Notebook Cover",
        width: RM_PP_WIDTH,
        height: RM_PP_HEIGHT,
        elements: [
            { id: "bg", type: "rect", x: 0, y: 0, w: RM_PP_WIDTH, h: RM_PP_HEIGHT, fill: "#2c3e50" },
            { id: "title", type: "text", x: 50, y: 250, w: 409, h: 80, 
              text: "{{title}}", fontSize: 48, align: "center", fontWeight: "bold", textColor: "#ffffff" },
            // Grid showing all sections
            { id: "sections_grid", type: "grid", x: 50, y: 400, w: 180, h: 40,
              gridConfig: { cols: 2, gapX: 10, gapY: 10, sourceType: "current", displayField: "title" },
              fill: "#34495e", stroke: "#7f8c8d", strokeWidth: 1, borderRadius: 8, 
              textColor: "#ecf0f1", fontSize: 14 }
        ]
    },
    "section": {
        id: "section",
        name: "Section Index",
        width: RM_PP_WIDTH,
        height: RM_PP_HEIGHT,
        elements: [
            { id: "header", type: "text", x: 20, y: 10, w: 300, h: 40, 
              text: "{{title}}", fontSize: 28, fontWeight: "bold" },
            { id: "back", type: "text", x: 400, y: 10, w: 80, h: 40, 
              text: "← Back", fontSize: 14, fill: "#e0e0e0", strokeWidth: 1, borderStyle: "solid",
              linkTarget: "parent" },
            { id: "line", type: "line", x: 0, y: 55, w: RM_PP_WIDTH, h: 0, stroke: "#000", strokeWidth: 1 },
            // Grid showing pages in this section
            { id: "pages_grid", type: "grid", x: 20, y: 70, w: 150, h: 30,
              gridConfig: { cols: 3, gapX: 5, gapY: 5, sourceType: "current", displayField: "title" },
              fill: "#fff", stroke: "#ccc", strokeWidth: 1, fontSize: 12 }
        ]
    },
    "page": {
        id: "page",
        name: "Note Page",
        width: RM_PP_WIDTH,
        height: RM_PP_HEIGHT,
        elements: [
            { id: "header", type: "text", x: 20, y: 10, w: 200, h: 30, 
              text: "{{title}}", fontSize: 18, fontWeight: "bold" },
            { id: "section_link", type: "text", x: 350, y: 10, w: 80, h: 30,
              text: "{{section_name}}", fontSize: 12, fill: "#e8e8e8", 
              linkTarget: "parent", strokeWidth: 1, borderStyle: "solid" },
            { id: "line", type: "line", x: 0, y: 45, w: RM_PP_WIDTH, h: 0, stroke: "#000", strokeWidth: 1 },
            { id: "content", type: "rect", x: 20, y: 55, w: 469, h: 600,
              fill: "#888", fillType: "pattern", patternType: "lines-h", patternSpacing: 18 },
            // Navigation arrows
            { id: "prev", type: "triangle", x: -5, y: 15, w: 30, h: 12, rotation: 270, 
              fill: "#000", linkTarget: "sibling", linkValue: "-1" },
            { id: "next", type: "triangle", x: 220, y: 15, w: 30, h: 12, rotation: 90, 
              fill: "#000", linkTarget: "sibling", linkValue: "1" }
        ]
    }
};

return templates;`;

const MEDIUM_HIERARCHY = `// MEDIUM EXAMPLE: Notebook with sections and pages
// Structure: Notebook -> Section 1 -> Page 1, Page 2, ...
//                     -> Section 2 -> Page 1, Page 2, ...
//
// createId(prefix) - Helper function that generates unique IDs.
//   Example: createId('section') might return 'section_abc123xyz'
//   Use this for all node IDs to ensure uniqueness.

const nodes = {};
const rootId = 'root';

// Notebook cover
nodes[rootId] = {
    id: rootId,
    parentId: null,
    type: 'notebook_cover',
    title: 'My Notebook',
    data: { year: '2026' },
    children: []
};

// Create sections
const sectionNames = ['Ideas', 'Tasks', 'Notes'];
const pagesPerSection = 10;

sectionNames.forEach((sectionName, sIdx) => {
    const sectionId = createId('section');
    
    nodes[sectionId] = {
        id: sectionId,
        parentId: rootId,
        type: 'section',
        title: sectionName,
        data: { section_num: (sIdx + 1).toString() },
        children: []
    };
    nodes[rootId].children.push(sectionId);
    
    // Create pages in each section
    for (let p = 1; p <= pagesPerSection; p++) {
        const pageId = createId('page');
        nodes[pageId] = {
            id: pageId,
            parentId: sectionId,
            type: 'page',
            title: sectionName + ' ' + p,
            data: { 
                section_name: sectionName,
                page_num: p.toString()
            },
            children: []
        };
        nodes[sectionId].children.push(pageId);
    }
});

return { nodes, rootId };`;

// =============================================================================
// EXPORT ALL PRESETS
// =============================================================================
export const GENERATOR_PRESETS: GeneratorPreset[] = [
    {
        id: 'blank',
        name: 'Blank',
        description: 'Start fresh with empty scripts',
        difficulty: 'beginner',
        templateScript: BLANK_TEMPLATES,
        hierarchyScript: BLANK_HIERARCHY
    },
    {
        id: 'simple',
        name: 'Simple Book',
        description: 'A cover page + 2 chapters',
        difficulty: 'beginner',
        templateScript: SIMPLE_TEMPLATES,
        hierarchyScript: SIMPLE_HIERARCHY
    },
    {
        id: 'medium',
        name: 'Notebook',
        description: 'Sections with multiple pages, navigation links',
        difficulty: 'intermediate',
        templateScript: MEDIUM_TEMPLATES,
        hierarchyScript: MEDIUM_HIERARCHY
    },
    {
        id: 'complex',
        name: '2026 Planner',
        description: 'Full yearly planner with months, weeks, and days',
        difficulty: 'advanced',
        templateScript: '', // Will use the existing DEFAULT_TEMPLATES_SCRIPT
        hierarchyScript: '' // Will use the existing DEFAULT_HIERARCHY_SCRIPT
    }
];
