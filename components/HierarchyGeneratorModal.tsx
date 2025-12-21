
import React, { useState, useRef, useEffect } from 'react';
import { AppState, RM_PP_WIDTH, RM_PP_HEIGHT, A4_WIDTH, A4_HEIGHT } from '../types';
import { X, Play, AlertTriangle, CheckCircle2, RotateCcw, LayoutTemplate, Network } from 'lucide-react';
import { HighlightedCode } from './HighlightedCode';
import clsx from 'clsx';

interface HierarchyGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (newState: Partial<AppState>) => void;
}

const SimpleEditor: React.FC<{ value: string, onChange: (v: string) => void }> = ({ value, onChange }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const preRef = useRef<HTMLPreElement>(null);

    const handleScroll = () => {
        if (textareaRef.current && preRef.current) {
            preRef.current.scrollTop = textareaRef.current.scrollTop;
            preRef.current.scrollLeft = textareaRef.current.scrollLeft;
        }
    };

    // Shared styles to ensure pixel-perfect alignment between textarea and pre
    const sharedStyle: React.CSSProperties = {
        fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
        fontSize: '14px',
        lineHeight: '1.5',
        padding: '1rem',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        overflowWrap: 'break-word',
        tabSize: 2,
    };

    return (
        <div className="relative w-full h-full bg-[#1e1e1e] overflow-hidden rounded-b-lg group">
             {/* Highlight Layer */}
             <pre 
                ref={preRef}
                className="absolute inset-0 m-0 overflow-hidden pointer-events-none"
                style={sharedStyle}
                aria-hidden="true"
             >
                <HighlightedCode code={value || ''} />
             </pre>
             
             {/* Input Layer */}
             <textarea 
                ref={textareaRef}
                className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white resize-none border-none outline-none"
                style={sharedStyle}
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                onScroll={handleScroll}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
             />
        </div>
    );
};

const DEFAULT_HIERARCHY_SCRIPT = `// 2. BUILD HIERARCHY FOR 2026 PLANNER
// Use 'nodes' object to store pages.
// 'templates' is available from step 1.
// 'createId(prefix)' helper is available.

const nodes = {};
const rootId = 'root';

// Helpers
const months = [
  { name: 'January', short: 'Jan', days: 31, q: 1, offset: 3 }, // Thu start
  { name: 'February', short: 'Feb', days: 28, q: 1, offset: 6 },
  { name: 'March', short: 'Mar', days: 31, q: 1, offset: 6 },
  { name: 'April', short: 'Apr', days: 30, q: 2, offset: 2 },
  { name: 'May', short: 'May', days: 31, q: 2, offset: 4 },
  { name: 'June', short: 'Jun', days: 30, q: 2, offset: 0 },
  { name: 'July', short: 'Jul', days: 31, q: 3, offset: 2 },
  { name: 'August', short: 'Aug', days: 31, q: 3, offset: 5 },
  { name: 'September', short: 'Sep', days: 30, q: 3, offset: 1 },
  { name: 'October', short: 'Oct', days: 31, q: 4, offset: 3 },
  { name: 'November', short: 'Nov', days: 30, q: 4, offset: 6 },
  { name: 'December', short: 'Dec', days: 31, q: 4, offset: 1 }
];
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Root
nodes[rootId] = {
  id: rootId,
  parentId: null,
  type: 'year',
  title: '2026 Planner',
  data: { year: '2026' },
  children: []
};

// Quarters
const qIds = {};
for(let i=1; i<=4; i++) {
    const qId = createId('q'+i);
    qIds[i] = qId;
    nodes[qId] = {
        id: qId,
        parentId: rootId,
        type: 'quarter',
        title: 'Quarter ' + i,
        data: { year: '2026', quarter_name: 'Quarter '+i, quarter_short: 'Q'+i, quarter_num: i.toString() },
        children: []
    };
    nodes[rootId].children.push(qId);
}

// Months & Days
const dayNodes = []; // Keep track for weeks references
let currentWeekDay = 4; // 2026 starts on Thursday (0=Sun, 4=Thu)

months.forEach((m, mIdx) => {
    const mId = createId('m_' + m.short);
    
    nodes[mId] = {
        id: mId,
        parentId: qIds[m.q],
        type: 'month',
        title: m.name,
        data: { 
            year: '2026', 
            month_name: m.name, 
            month_short: m.short, 
            month_initial: m.name[0],
            month_num: (mIdx+1).toString().padStart(2, '0'),
            quarter_name: 'Quarter '+m.q,
            quarter_short: 'Q'+m.q,
            quarter_num: m.q.toString(),
            month_start_offset: m.offset.toString()
        },
        children: []
    };
    nodes[qIds[m.q]].children.push(mId);

    for(let d=1; d<=m.days; d++) {
        const dId = createId('d');
        const dayName = weekdays[currentWeekDay];
        
        nodes[dId] = {
            id: dId,
            parentId: mId,
            type: 'day',
            title: \`\${m.name} \${d}, 2026\`,
            data: {
                 year: '2026',
                 quarter_name: 'Quarter '+m.q,
                 quarter_short: 'Q'+m.q,
                 quarter_num: m.q.toString(),
                 month_name: m.name, 
                 month_short: m.short, 
                 month_initial: m.name[0],
                 month_num: (mIdx+1).toString().padStart(2, '0'),
                 day_num: d.toString().padStart(2, '0'),
                 day_name: dayName,
                 day_short: dayName.substr(0,3),
                 day_initial: dayName[0],
                 weekday_num: currentWeekDay.toString()
            },
            children: []
        };
        nodes[mId].children.push(dId);
        dayNodes.push(nodes[dId]);

        // Journal
        const jId = createId('journal');
        nodes[jId] = {
             id: jId,
             parentId: dId,
             type: 'journal',
             title: 'Journal',
             data: { ...nodes[dId].data, parent_title: nodes[dId].title },
             children: []
        };
        nodes[dId].children.push(jId);

        // Daily Notes
        const dnId = createId('dnote');
        nodes[dnId] = {
             id: dnId,
             parentId: dId,
             type: 'daily_notes',
             title: 'Daily Notes',
             data: { ...nodes[dId].data, parent_title: nodes[dId].title },
             children: []
        };
        nodes[dId].children.push(dnId);

        currentWeekDay = (currentWeekDay + 1) % 7;
    }
});

// Weeks Container
const weeksRootId = createId('weeks_root');
nodes[weeksRootId] = {
    id: weeksRootId,
    parentId: rootId,
    type: 'list_index',
    title: 'Weeks',
    data: { year: '2026' },
    children: []
};
nodes[rootId].children.push(weeksRootId);

// Generate Weeks
// Logic: Week 1 starts Dec 29 2025, but we only have 2026 days in dayNodes array.
// dayNodes[0] is Jan 1 2026 (Thursday).
// Week 1 will contain 4 days: Thu, Fri, Sat, Sun.
let weekNum = 1;
let dIndex = 0;

// First partial week (Thu-Sun)
if (dayNodes.length > 0) {
    const wId = createId('w');
    nodes[wId] = {
        id: wId,
        parentId: weeksRootId,
        type: 'week',
        title: 'Week 1',
        data: { year: '2026', week_name: 'Week 1', week_num: '1', week_short: 'W1' },
        children: []
    };
    nodes[weeksRootId].children.push(wId);
    
    // Add Refs for Jan 1-4
    for(let i=0; i<4; i++) {
        if (dIndex >= dayNodes.length) break;
        const dayNode = dayNodes[dIndex++];
        const refId = createId('ref');
        nodes[refId] = {
             id: refId,
             parentId: wId,
             type: 'day', 
             title: dayNode.title,
             data: dayNode.data,
             children: [],
             referenceId: dayNode.id
        };
        nodes[wId].children.push(refId);
    }
    weekNum++;
}

// Remaining full weeks (Starting Mondays)
while (dIndex < dayNodes.length) {
     const wId = createId('w');
     nodes[wId] = {
        id: wId,
        parentId: weeksRootId,
        type: 'week',
        title: 'Week ' + weekNum,
        data: { year: '2026', week_name: 'Week '+weekNum, week_num: weekNum.toString(), week_short: 'W'+weekNum },
        children: []
    };
    nodes[weeksRootId].children.push(wId);
    weekNum++;
    
    // Add 7 days
    for(let i=0; i<7 && dIndex < dayNodes.length; i++) {
        const dayNode = dayNodes[dIndex++];
        const refId = createId('ref');
        nodes[refId] = {
             id: refId,
             parentId: wId,
             type: 'day',
             title: dayNode.title,
             data: dayNode.data,
             children: [],
             referenceId: dayNode.id
        };
        nodes[wId].children.push(refId);
    }
}

// Global Notes Container
const notesRootId = createId('notes_root');
nodes[notesRootId] = {
    id: notesRootId,
    parentId: rootId,
    type: 'list_index',
    title: 'Notes',
    data: { year: '2026' },
    children: []
};
nodes[rootId].children.push(notesRootId);

for(let i=1; i<=100; i++) {
    const nId = createId('note');
    nodes[nId] = {
        id: nId,
        parentId: notesRootId,
        type: 'global_note', 
        title: 'Note ' + i,
        data: { notes_num: i.toString(), title: 'Note ' + i, year: '2026' },
        children: []
    };
    nodes[notesRootId].children.push(nId);
}

// To-Dos Container
const todoRootId = createId('todos_root');
nodes[todoRootId] = {
    id: todoRootId,
    parentId: rootId,
    type: 'list_index',
    title: 'To-Do Lists',
    data: { year: '2026' },
    children: []
};
nodes[rootId].children.push(todoRootId);

for(let i=1; i<=100; i++) {
    const tId = createId('todo');
    nodes[tId] = {
        id: tId,
        parentId: todoRootId,
        type: 'todo_page',
        title: 'To-Do List ' + i,
        data: { todo_num: i.toString(), title: 'To-Do List ' + i, year: '2026' },
        children: []
    };
    nodes[todoRootId].children.push(tId);
}

return { nodes, rootId };`;

const DEFAULT_TEMPLATES_SCRIPT = `// 1. DEFINE TEMPLATES
// Use 't' object to store templates.
// Constants available: RM_PP_WIDTH, RM_PP_HEIGHT, A4_WIDTH, A4_HEIGHT

const t = {
    "year": {
      "id": "year",
      "name": "Year View",
      "width": 509,
      "height": 679,
      "elements": [
        { "id": "gen_year_bg", "type": "rect", "x": 0, "y": 0, "w": 509, "h": 679, "fill": "#000000" },
        { "id": "gen_year_title", "type": "text", "x": 0, "y": 100, "w": 509, "h": 60, "text": "{{title}}", "fontSize": 64, "align": "center", "fontWeight": "bold", "textColor": "#ffffff" },
        {
          "id": "gen_year_qgrid", "type": "grid", "x": 54, "y": 200, "w": 180, "h": 60,
          "gridConfig": { "cols": 2, "gapX": 20, "sourceType": "current", "displayField": "title", "dataSliceStart": 0, "dataSliceCount": 4, "gapY": 0 },
          "fill": "#2e3436", "stroke": "#555753", "strokeWidth": 1, "borderRadius": 8, "textColor": "#fff", "fontSize": 16
        },
        {
          "id": "gen_year_idxgrid", "type": "grid", "x": 154, "y": 345, "w": 180, "h": 40,
          "gridConfig": { "cols": 1, "gapX": 20, "sourceType": "current", "displayField": "title", "dataSliceStart": 4, "dataSliceCount": 3, "gapY": 0 },
          "fill": "#2e3436", "stroke": "#555753", "strokeWidth": 1, "borderRadius": 6, "textColor": "#e2e8f0", "fontSize": 14
        }
      ]
    },
    "quarter": {
      "id": "quarter",
      "name": "Quarter View",
      "width": 509,
      "height": 679,
      "elements": [
        {
          "id": "gen_q_dots", "type": "grid", "x": 44, "y": 46, "w": 130, "h": 129,
          "gridConfig": { "cols": 3, "gapX": 10, "gapY": 10, "sourceType": "current", "displayField": "title" },
          "fill": "#f1f5f9", "stroke": "#cbd5e1", "strokeWidth": 1, "borderRadius": 4, "fontSize": 12, "fillType": "pattern", "patternType": "dots", "align": "left", "verticalAlign": "top", "zIndex": -5
        },
        { "id": "gen_q_rect1", "type": "rect", "x": 152, "y": 65, "w": 17, "h": 106, "fill": "#e2e8f0", "stroke": "#000000", "strokeWidth": 1, "zIndex": -4 },
        { "id": "gen_q_rect2", "type": "rect", "x": 135, "y": 65, "w": 17, "h": 106, "fill": "#e2e8f0", "stroke": "#000000", "strokeWidth": 1, "zIndex": -4 },
        { "id": "gen_q_m1_days", "type": "grid", "x": 50, "y": 82, "w": 17, "h": 15, "fill": "#ffffff", "stroke": "#000000", "strokeWidth": 1, "fontSize": 8, "align": "center", "gridConfig": { "cols": 7, "gapX": 0, "gapY": 0, "sourceType": "current", "displayField": "day_num", "offsetStart": 0, "traversalPath": [{ "sliceStart": 0, "sliceCount": 1 }, { "sliceStart": 0 }], "offsetMode": "dynamic", "offsetField": "weekday_num", "offsetAdjustment": -1 }, "fontFamily": "helvetica", "zIndex": -3 },
        { "id": "gen_q_title", "type": "text", "x": 0, "y": 0, "w": 149, "h": 40, "text": "{{quarter_short}}", "fontSize": 32, "align": "center", "fontWeight": "bold", "zIndex": 1 },
        { "id": "gen_q_year", "type": "text", "x": 155, "y": 0, "w": 134, "h": 40, "text": "", "fontSize": 32, "align": "center", "fontWeight": "bold", "zIndex": 1, "dataBinding": "year", "fill": "#d3d7cf", "linkTarget": "parent", "strokeWidth": 1, "borderStyle": "solid" },
        { "id": "gen_q_line", "type": "line", "x": 0, "y": 40, "w": 518.75, "h": 0, "stroke": "#000000", "strokeWidth": 1, "zIndex": 1, "flip": false },

        // Headers M1
        { "id": "gen_q_m1_d1", "type": "text", "x": 51, "y": 65, "w": 17, "h": 17, "text": "M", "fontSize": 9, "align": "center", "zIndex": 4, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m1_d2", "type": "text", "x": 68, "y": 65, "w": 17, "h": 17, "text": "T", "fontSize": 9, "align": "center", "zIndex": 5, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m1_d3", "type": "text", "x": 85, "y": 65, "w": 17, "h": 17, "text": "W", "fontSize": 9, "align": "center", "zIndex": 6, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m1_d4", "type": "text", "x": 102, "y": 65, "w": 17, "h": 17, "text": "T", "fontSize": 9, "align": "center", "zIndex": 7, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m1_d5", "type": "text", "x": 119, "y": 65, "w": 17, "h": 17, "text": "F", "fontSize": 9, "align": "center", "zIndex": 8, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m1_d6", "type": "text", "x": 136, "y": 65, "w": 17, "h": 17, "text": "S", "fontSize": 9, "align": "center", "zIndex": 9, "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid" },
        { "id": "gen_q_m1_d7", "type": "text", "x": 153, "y": 65, "w": 17, "h": 17, "text": "S", "fontSize": 9, "align": "center", "zIndex": 10, "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid" },
        
        // M2
        { "id": "gen_q_rect3", "type": "rect", "x": 293, "y": 65, "w": 17, "h": 106, "fill": "#e2e8f0", "stroke": "#000000", "strokeWidth": 1, "zIndex": 8 },
        { "id": "gen_q_rect4", "type": "rect", "x": 276, "y": 65, "w": 17, "h": 106, "fill": "#e2e8f0", "stroke": "#000000", "strokeWidth": 1, "zIndex": 8 },
        { "id": "gen_q_m2_days", "type": "grid", "x": 191, "y": 82, "w": 17, "h": 15, "fill": "#ffffff", "stroke": "#000000", "strokeWidth": 1, "fontSize": 8, "align": "center", "gridConfig": { "cols": 7, "gapX": 0, "gapY": 0, "sourceType": "current", "displayField": "day_num", "offsetStart": 0, "traversalPath": [{ "sliceStart": 1, "sliceCount": 1 }, { "sliceStart": 0 }], "offsetMode": "dynamic", "offsetField": "weekday_num", "offsetAdjustment": -1 }, "fontFamily": "helvetica", "zIndex": 9 },
        
        // Headers M2
        { "id": "gen_q_m2_d1", "type": "text", "x": 192, "y": 65, "w": 17, "h": 17, "text": "M", "fontSize": 9, "align": "center", "zIndex": 13, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m2_d2", "type": "text", "x": 209, "y": 65, "w": 17, "h": 17, "text": "T", "fontSize": 9, "align": "center", "zIndex": 13, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m2_d3", "type": "text", "x": 226, "y": 65, "w": 17, "h": 17, "text": "W", "fontSize": 9, "align": "center", "zIndex": 13, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m2_d4", "type": "text", "x": 243, "y": 65, "w": 17, "h": 17, "text": "T", "fontSize": 9, "align": "center", "zIndex": 13, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m2_d5", "type": "text", "x": 260, "y": 65, "w": 17, "h": 17, "text": "F", "fontSize": 9, "align": "center", "zIndex": 13, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m2_d6", "type": "text", "x": 277, "y": 65, "w": 17, "h": 17, "text": "S", "fontSize": 9, "align": "center", "zIndex": 13, "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid" },
        { "id": "gen_q_m2_d7", "type": "text", "x": 294, "y": 65, "w": 17, "h": 17, "text": "S", "fontSize": 9, "align": "center", "zIndex": 13, "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid" },

        // M3
        { "id": "gen_q_rect5", "type": "rect", "x": 430, "y": 65, "w": 17, "h": 106, "fill": "#e2e8f0", "stroke": "#000000", "strokeWidth": 1, "zIndex": 8 },
        { "id": "gen_q_rect6", "type": "rect", "x": 413, "y": 65, "w": 17, "h": 106, "fill": "#e2e8f0", "stroke": "#000000", "strokeWidth": 1, "zIndex": 8 },
        { "id": "gen_q_m3_days", "type": "grid", "x": 328, "y": 82, "w": 17, "h": 15, "fill": "#ffffff", "stroke": "#000000", "strokeWidth": 1, "fontSize": 8, "align": "center", "gridConfig": { "cols": 7, "gapX": 0, "gapY": 0, "sourceType": "current", "displayField": "day_num", "offsetStart": 0, "traversalPath": [{ "sliceStart": 2, "sliceCount": 1 }, { "sliceStart": 0 }], "offsetMode": "dynamic", "offsetField": "weekday_num", "offsetAdjustment": -1 }, "fontFamily": "helvetica", "zIndex": 9 },

        // Headers M3
        { "id": "gen_q_m3_d1", "type": "text", "x": 328, "y": 65, "w": 17, "h": 17, "text": "M", "fontSize": 9, "align": "center", "zIndex": 14, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m3_d2", "type": "text", "x": 345, "y": 65, "w": 17, "h": 17, "text": "T", "fontSize": 9, "align": "center", "zIndex": 14, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m3_d3", "type": "text", "x": 362, "y": 65, "w": 17, "h": 17, "text": "W", "fontSize": 9, "align": "center", "zIndex": 14, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m3_d4", "type": "text", "x": 379, "y": 65, "w": 17, "h": 17, "text": "T", "fontSize": 9, "align": "center", "zIndex": 14, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m3_d5", "type": "text", "x": 396, "y": 65, "w": 17, "h": 17, "text": "F", "fontSize": 9, "align": "center", "zIndex": 14, "strokeWidth": 1, "borderStyle": "solid", "stroke": "#2e3436" },
        { "id": "gen_q_m3_d6", "type": "text", "x": 413, "y": 65, "w": 17, "h": 17, "text": "S", "fontSize": 9, "align": "center", "zIndex": 14, "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid" },
        { "id": "gen_q_m3_d7", "type": "text", "x": 430, "y": 65, "w": 17, "h": 17, "text": "S", "fontSize": 9, "align": "center", "zIndex": 14, "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid" },

        // Month Links at bottom
        { "id": "gen_q_g1", "type": "grid", "x": 12, "y": 188, "w": 156, "h": 15, "fill": "#555753", "fillType": "pattern", "stroke": "#000000", "strokeWidth": 0, "borderStyle": "none", "opacity": 1, "zIndex": 15, "fontSize": 9, "fontFamily": "helvetica", "textColor": "#000000", "align": "left", "gridConfig": { "cols": 1, "gapX": 0, "gapY": 0, "sourceType": "current", "displayField": "{{day_short}} {{day_num}}", "offsetStart": 0, "traversalPath": [{ "sliceStart": 0, "sliceCount": 1 }, { "sliceStart": 0 }] }, "flip": false, "patternType": "lines-h", "patternSpacing": 16 },
        { "id": "gen_q_g2", "type": "grid", "x": 177, "y": 188, "w": 156, "h": 15, "fill": "#555753", "fillType": "pattern", "stroke": "#000000", "strokeWidth": 0, "borderStyle": "none", "opacity": 1, "zIndex": 16, "fontSize": 9, "fontFamily": "helvetica", "textColor": "#000000", "align": "left", "gridConfig": { "cols": 1, "gapX": 0, "gapY": 0, "sourceType": "current", "displayField": "{{day_short}} {{day_num}}", "offsetStart": 0, "traversalPath": [{ "sliceStart": 1, "sliceCount": 1 }, { "sliceStart": 0 }] }, "flip": false, "patternType": "lines-h", "patternSpacing": 16 },
        { "id": "gen_q_g3", "type": "grid", "x": 342, "y": 188, "w": 156, "h": 15, "fill": "#555753", "fillType": "pattern", "stroke": "#000000", "strokeWidth": 0, "borderStyle": "none", "opacity": 1, "zIndex": 17, "fontSize": 9, "fontFamily": "helvetica", "textColor": "#000000", "align": "left", "gridConfig": { "cols": 1, "gapX": 0, "gapY": 0, "sourceType": "current", "displayField": "{{day_short}} {{day_num}}", "offsetStart": 0, "traversalPath": [{ "sliceStart": 2, "sliceCount": 1 }, { "sliceStart": 0 }] }, "flip": false, "patternType": "lines-h", "patternSpacing": 16 },
        
        // Triangles
        { "id": "gen_q_prev", "type": "triangle", "x": -7, "y": 13, "w": 35, "h": 15, "rotation": 270, "fill": "#000000", "stroke": "#000000", "strokeWidth": 1, "zIndex": 18, "linkTarget": "sibling", "linkValue": "-1" },
        { "id": "gen_q_next", "type": "triangle", "x": 124, "y": 13, "w": 35, "h": 15, "rotation": 90, "fill": "#000000", "stroke": "#000000", "strokeWidth": 1, "zIndex": 18, "linkTarget": "sibling", "linkValue": "1" }
      ]
    },
    "month": {
      "id": "month",
      "name": "Month View",
      "width": 509,
      "height": 679,
      "elements": [
        { "id": "gen_m_grid", "type": "grid", "x": 44, "y": 81, "w": 58, "h": 62.6, "gridConfig": { "cols": 7, "gapX": 2, "gapY": 2, "sourceType": "current", "displayField": "day_num", "offsetMode": "dynamic", "offsetField": "weekday_num", "offsetAdjustment": -1 }, "fill": "#ffffff", "stroke": "#cbd5e1", "strokeWidth": 1, "borderRadius": 0, "fontSize": 12, "id": "gen_month_2", "verticalAlign": "top", "align": "left" },
        
        // Weeks Refs
        { "id": "gen_m_w1", "type": "text", "x": 447, "y": 97, "w": 63, "h": 30, "rotation": 90, "fill": "#babdb6", "text": "", "fontSize": 14, "align": "center", "linkTarget": "child_referrer", "strokeWidth": 1, "borderStyle": "solid", "dataBinding": "child_referrer:6-month_start_offset:-7::title", "linkValue": "6-month_start_offset", "linkSecondaryValue": "-7" },
        { "id": "gen_m_w2", "type": "text", "x": 447, "y": 162, "w": 63, "h": 30, "rotation": 90, "fill": "#babdb6", "text": "", "fontSize": 14, "align": "center", "linkTarget": "child_referrer", "linkValue": "13-month_start_offset", "linkSecondaryValue": "-7", "strokeWidth": 1, "borderStyle": "solid", "dataBinding": "child_referrer:13-month_start_offset:-7::title" },
        { "id": "gen_m_w3", "type": "text", "x": 447, "y": 226, "w": 63, "h": 30, "rotation": 90, "fill": "#babdb6", "text": "", "fontSize": 14, "align": "center", "linkTarget": "child_referrer", "linkValue": "20-month_start_offset", "linkSecondaryValue": "-7", "strokeWidth": 1, "borderStyle": "solid", "dataBinding": "child_referrer:20-month_start_offset:-7::title" },
        { "id": "gen_m_w4", "type": "text", "x": 447, "y": 291, "w": 63, "h": 30, "rotation": 90, "fill": "#babdb6", "text": "", "fontSize": 14, "align": "center", "linkTarget": "child_referrer", "linkSecondaryValue": "-7", "strokeWidth": 1, "borderStyle": "solid", "dataBinding": "child_referrer:27-month_start_offset:-7::title", "linkValue": "27-month_start_offset" },
        { "id": "gen_m_w5", "type": "text", "x": 447, "y": 355, "w": 63, "h": 30, "rotation": 90, "fill": "#babdb6", "text": "", "fontSize": 14, "align": "center", "linkTarget": "child_referrer", "linkValue": "34-month_start_offset", "linkSecondaryValue": "-7", "strokeWidth": 1, "borderStyle": "solid", "dataBinding": "child_referrer:34-month_start_offset:-7::title" },
        { "id": "gen_m_w6", "type": "text", "x": 447, "y": 419, "w": 63, "h": 30, "rotation": 90, "fill": "#babdb6", "text": "", "fontSize": 14, "align": "center", "linkTarget": "child_referrer", "linkValue": "41-month_start_offset", "linkSecondaryValue": "-7", "strokeWidth": 1, "borderStyle": "solid", "dataBinding": "child_referrer:41-month_start_offset:-7::title", "zIndex": 16 },
        
        { "id": "gen_m_q_title", "type": "text", "x": 331, "y": 0, "w": 41, "h": 40, "text": "{{quarter_short}}", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 3, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "parent" },
        { "id": "gen_m_title", "type": "text", "x": 19, "y": 0, "w": 154, "h": 40, "text": "{{title}}", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 6 },
        { "id": "gen_m_year", "type": "text", "x": 194, "y": 0, "w": 139, "h": 40, "text": "", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 6, "dataBinding": "year", "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "specific_node", "linkValue": "root" },
        { "id": "gen_m_line", "type": "line", "x": 0, "y": 40, "w": 510, "h": 0, "stroke": "#000000", "strokeWidth": 1, "zIndex": 6 },
        
        { "id": "gen_m_d1", "type": "text", "x": 43, "y": 60, "w": 60, "h": 19, "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid", "text": "M", "fontSize": 14, "align": "center" },
        { "id": "gen_m_d2", "type": "text", "x": 103, "y": 60, "w": 60, "h": 19, "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid", "text": "T", "fontSize": 14, "align": "center" },
        { "id": "gen_m_d3", "type": "text", "x": 163, "y": 60, "w": 60, "h": 19, "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid", "text": "W", "fontSize": 14, "align": "center" },
        { "id": "gen_m_d4", "type": "text", "x": 223, "y": 60, "w": 60, "h": 19, "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid", "text": "T", "fontSize": 14, "align": "center" },
        { "id": "gen_m_d5", "type": "text", "x": 283, "y": 60, "w": 60, "h": 19, "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid", "text": "F", "fontSize": 14, "align": "center" },
        { "id": "gen_m_d6", "type": "text", "x": 343, "y": 60, "w": 60, "h": 19, "fill": "#babdb6", "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid", "text": "S", "fontSize": 14, "align": "center" },
        { "id": "gen_m_d7", "type": "text", "x": 403, "y": 60, "w": 60, "h": 19, "fill": "#babdb6", "stroke": "#2e3436", "strokeWidth": 1, "borderStyle": "solid", "text": "S", "fontSize": 14, "align": "center" },
        
        { "id": "gen_m_notes1", "type": "rect", "x": 24.3, "y": 476.5, "w": 229.8, "h": 192.3, "fill": "#e2e8f0", "fillType": "pattern", "stroke": "#000000", "strokeWidth": 0, "borderStyle": "solid", "zIndex": 14, "patternType": "lines-h", "patternSpacing": 14 },
        { "id": "gen_m_notes2", "type": "rect", "x": 259.3, "y": 476.5, "w": 229.8, "h": 192.3, "fill": "#e2e8f0", "fillType": "pattern", "stroke": "#000000", "strokeWidth": 0, "borderStyle": "solid", "zIndex": 17, "patternType": "lines-h", "patternSpacing": 14 },
        
        { "id": "gen_m_prev", "type": "triangle", "x": -6.8, "y": 13.1, "w": 35, "h": 15, "rotation": 270, "fill": "#000000", "stroke": "#000000", "strokeWidth": 1, "zIndex": 15, "linkTarget": "sibling", "linkValue": "-1" },
        { "id": "gen_m_next", "type": "triangle", "x": 163.8, "y": 13.1, "w": 35, "h": 15, "rotation": 90, "fill": "#000000", "stroke": "#000000", "strokeWidth": 1, "zIndex": 15, "linkTarget": "sibling", "linkValue": "1" }
      ]
    },
    "week": {
      "id": "week",
      "name": "Week View",
      "width": 509,
      "height": 679,
      "elements": [
        { "id": "gen_w_grid", "type": "grid", "x": 24, "y": 55, "w": 232, "h": 30, "gridConfig": { "cols": 2, "gapY": 120, "sourceType": "current", "displayField": "title", "gapX": 3, "offsetMode": "dynamic", "offsetField": "weekday_num", "offsetAdjustment": -1 }, "fill": "#ffffff", "stroke": "#e2e8f0", "strokeWidth": 0, "fontSize": 14, "align": "left", "borderRadius": 0, "id": "gen_week_2", "zIndex": -4 },
        { "id": "gen_w_r1", "type": "rect", "x": 25, "y": 85, "w": 465, "h": 120, "fill": "#eeeeec", "fillType": "pattern", "strokeWidth": 0, "zIndex": -2, "patternType": "lines-h", "patternSpacing": 14 },
        { "id": "gen_w_r2", "type": "rect", "x": 25, "y": 235, "w": 465, "h": 120, "fill": "#eeeeec", "fillType": "pattern", "strokeWidth": 0, "zIndex": 1, "patternType": "lines-h", "patternSpacing": 14 },
        { "id": "gen_w_r3", "type": "rect", "x": 25, "y": 385, "w": 465, "h": 120, "fill": "#eeeeec", "fillType": "pattern", "strokeWidth": 0, "zIndex": 2, "patternType": "lines-h", "patternSpacing": 14 },
        { "id": "gen_w_r4", "type": "rect", "x": 25, "y": 540, "w": 465, "h": 120, "fill": "#eeeeec", "fillType": "pattern", "strokeWidth": 0, "zIndex": 3, "patternType": "lines-h", "patternSpacing": 14 },
        { "id": "gen_w_line1", "type": "line", "x": 0, "y": 40, "w": 510, "h": 0, "stroke": "#000000", "strokeWidth": 1, "zIndex": 4 },
        { "id": "gen_w_line2", "type": "line", "x": 258, "y": 58, "w": 0, "h": 619, "stroke": "#888a85", "strokeWidth": 1, "zIndex": 5, "flip": true },
        { "id": "gen_w_title", "type": "text", "x": 20, "y": 0, "w": 155, "h": 40, "text": "", "fontSize": 24, "align": "center", "fontWeight": "bold", "dataBinding": "title", "zIndex": 6 },
        { "id": "gen_w_year", "type": "text", "x": 195, "y": 0, "w": 139, "h": 40, "text": "", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 6, "dataBinding": "year", "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "specific_node", "linkValue": "root" },
        { "id": "gen_w_prev", "type": "triangle", "x": -6.8, "y": 13.1, "w": 35, "h": 15, "rotation": 270, "fill": "#000000", "stroke": "#000000", "strokeWidth": 1, "zIndex": 6, "linkTarget": "sibling", "linkValue": "-1" },
        { "id": "gen_w_next", "type": "triangle", "x": 163.8, "y": 13.1, "w": 35, "h": 15, "rotation": 90, "fill": "#000000", "stroke": "#000000", "strokeWidth": 1, "zIndex": 6, "linkTarget": "sibling", "linkValue": "1" }
      ]
    },
    "day": {
      "id": "day",
      "name": "Day View",
      "width": 509,
      "height": 679,
      "elements": [
        { "id": "gen_d_month", "type": "text", "x": 332, "y": 0, "w": 61, "h": 40, "text": "{{month_short}}", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": -1, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "parent" },
        { "id": "gen_d_rect", "type": "rect", "x": 15, "y": 60, "w": 233.8, "h": 605, "fill": "#babdb6", "stroke": "#e2e8f0", "strokeWidth": 0, "fillType": "pattern", "patternType": "lines-h", "patternSpacing": 14, "id": "gen_day_7" },
        { "id": "gen_d_quarter", "type": "text", "x": 292, "y": 0, "w": 41, "h": 40, "text": "{{quarter_short}}", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 1, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "ancestor", "linkValue": "2" },
        { "id": "gen_d_title", "type": "text", "x": 30, "y": 0, "w": 139, "h": 40, "text": "{{month_short}} {{day_num}}", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 1 },
        { "id": "gen_d_year", "type": "text", "x": 195, "y": 0, "w": 99, "h": 40, "text": "", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 1, "dataBinding": "year", "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "specific_node", "linkValue": "root" },
        { "id": "gen_d_link_j", "type": "text", "x": 392, "y": 0, "w": 61, "h": 20, "text": "Journal", "fontSize": 9, "align": "center", "fontWeight": "bold", "zIndex": 2, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "child_index", "linkValue": "0" },
        { "id": "gen_d_link_n", "type": "text", "x": 392, "y": 20, "w": 61, "h": 20, "text": "Daily Notes", "fontSize": 9, "align": "center", "fontWeight": "bold", "zIndex": 3, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "child_index", "linkValue": "1" },
        { "id": "gen_d_w_link", "type": "text", "x": 452, "y": 0, "w": 57, "h": 40, "text": "{{day_short}}", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 4, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "referrer", "dataBinding": "" },
        { "id": "gen_d_line", "type": "line", "x": 0, "y": 40, "w": 510, "h": 0, "stroke": "#000000", "strokeWidth": 1, "zIndex": 9 },
        { "id": "gen_d_rect2", "type": "rect", "x": 260, "y": 60, "w": 233.8, "h": 610, "fill": "#babdb6", "stroke": "#e2e8f0", "strokeWidth": 0, "fillType": "pattern", "patternType": "lines-h", "patternSpacing": 14, "zIndex": 10 },
        { "id": "gen_d_prev", "type": "triangle", "x": -8.5, "y": 12.5, "w": 35, "h": 15, "rotation": 270, "fill": "#000000", "stroke": "#000000", "strokeWidth": 1, "zIndex": 11, "linkTarget": "sibling", "linkValue": "-1" },
        { "id": "gen_d_next", "type": "triangle", "x": 162.1, "y": 12.5, "w": 35, "h": 15, "rotation": 90, "fill": "#000000", "stroke": "#000000", "strokeWidth": 1, "zIndex": 12, "linkTarget": "sibling", "linkValue": "1" }
      ]
    },
    "journal": {
      "id": "journal",
      "name": "Journal",
      "width": 509,
      "height": 679,
      "elements": [
        { "id": "gen_j_bg", "type": "rect", "x": 15, "y": 55, "w": 480, "h": 605, "fill": "#babdb6", "stroke": "#e2e8f0", "strokeWidth": 0, "borderRadius": 0, "fillType": "pattern", "patternType": "dots", "patternSpacing": 14, "patternWeight": 2 },
        { "id": "gen_j_month", "type": "text", "x": 332, "y": 0, "w": 61, "h": 40, "text": "{{month_short}}", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 1, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "ancestor", "linkValue": "2" },
        { "id": "gen_j_quarter", "type": "text", "x": 292, "y": 0, "w": 41, "h": 40, "text": "{{quarter_short}}", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 1, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "ancestor", "linkValue": "3" },
        { "id": "gen_j_title", "type": "text", "x": 0, "y": 0, "w": 154, "h": 40, "text": "Journal", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 1 },
        { "id": "gen_j_year", "type": "text", "x": 155, "y": 0, "w": 139, "h": 40, "text": "", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 1, "dataBinding": "year", "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "specific_node", "linkValue": "root" },
        { "id": "gen_j_day", "type": "text", "x": 392, "y": 0, "w": 61, "h": 20, "text": "Day", "fontSize": 9, "align": "center", "fontWeight": "bold", "zIndex": 1, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "parent" },
        { "id": "gen_j_notes", "type": "text", "x": 392, "y": 20, "w": 61, "h": 20, "text": "Daily Notes", "fontSize": 9, "align": "center", "fontWeight": "bold", "zIndex": 1, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "sibling", "linkValue": "1" },
        { "id": "gen_j_line", "type": "line", "x": 0, "y": 40, "w": 510, "h": 0, "stroke": "#000000", "strokeWidth": 1, "zIndex": 1 },
        { "id": "gen_j_t1", "type": "text", "x": 9.5, "y": 58, "w": 61.3, "h": 22.4, "text": "Gratitude", "fontSize": 16, "fontFamily": "caveat", "textColor": "#000000", "align": "left", "zIndex": 2 },
        { "id": "gen_j_t2", "type": "text", "x": 10, "y": 213, "w": 51.3, "h": 22.4, "text": "Journal", "fontSize": 16, "fontFamily": "caveat", "textColor": "#000000", "align": "left", "zIndex": 3 },
        { "id": "gen_j_t3", "type": "text", "x": 9.5, "y": 498, "w": 76.3, "h": 22.4, "text": "Day's Motto", "fontSize": 16, "fontFamily": "caveat", "textColor": "#000000", "align": "center", "zIndex": 4 },
        { "id": "gen_j_l1", "type": "line", "x": 20, "y": 81, "w": 467, "h": 0, "stroke": "#000000", "strokeWidth": 1, "zIndex": 5 },
        { "id": "gen_j_l2", "type": "line", "x": 20, "y": 237.5, "w": 467, "h": 0, "stroke": "#000000", "strokeWidth": 1, "zIndex": 6 },
        { "id": "gen_j_l3", "type": "line", "x": 20, "y": 521, "w": 467, "h": 0, "stroke": "#000000", "strokeWidth": 1, "zIndex": 7 }
      ]
    },
    "daily_notes": {
      "id": "daily_notes",
      "name": "Daily Notes",
      "width": 509,
      "height": 679,
      "elements": [
        { "id": "gen_dn_bg", "type": "rect", "x": 15, "y": 60, "w": 480, "h": 600, "fill": "#888a85", "stroke": "#e2e8f0", "strokeWidth": 0, "borderRadius": 0, "fillType": "pattern", "patternType": "dots", "patternSpacing": 13, "patternWeight": 1 },
        { "id": "gen_dn_month", "type": "text", "x": 332, "y": 0, "w": 61, "h": 40, "text": "{{month_short}}", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 1, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "ancestor", "linkValue": "2" },
        { "id": "gen_dn_quarter", "type": "text", "x": 292, "y": 0, "w": 41, "h": 40, "text": "{{quarter_short}}", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 1, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "ancestor", "linkValue": "3" },
        { "id": "gen_dn_title", "type": "text", "x": 0, "y": 0, "w": 154, "h": 40, "text": "Daily Notes", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 1 },
        { "id": "gen_dn_year", "type": "text", "x": 155, "y": 0, "w": 139, "h": 40, "text": "", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 1, "dataBinding": "year", "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "specific_node", "linkValue": "root" },
        { "id": "gen_dn_day", "type": "text", "x": 392, "y": 0, "w": 61, "h": 20, "text": "Day", "fontSize": 9, "align": "center", "fontWeight": "bold", "zIndex": 1, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "parent" },
        { "id": "gen_dn_journal", "type": "text", "x": 392, "y": 20, "w": 61, "h": 20, "text": "Journal", "fontSize": 9, "align": "center", "fontWeight": "bold", "zIndex": 1, "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "sibling", "linkValue": "-1" },
        { "id": "gen_dn_line", "type": "line", "x": 0, "y": 40, "w": 510, "h": 0, "stroke": "#000000", "strokeWidth": 1, "zIndex": 1 },
        { "id": "gen_dn_t1", "type": "text", "x": 9.5, "y": 58, "w": 76.3, "h": 22.4, "text": "Tasks", "fontSize": 16, "fontFamily": "caveat", "textColor": "#000000", "align": "center", "zIndex": 2 },
        { "id": "gen_dn_t2", "type": "text", "x": 254.5, "y": 58, "w": 76.3, "h": 22.4, "text": "Notes", "fontSize": 16, "fontFamily": "caveat", "textColor": "#000000", "align": "center", "zIndex": 3 },
        { "id": "gen_dn_l2", "type": "line", "x": 255, "y": 65, "w": 0, "h": 590, "fill": "#000000", "stroke": "#babdb6", "strokeWidth": 1, "borderStyle": "dotted", "zIndex": 4 }
      ]
    },
    "list_index": {
      "id": "list_index",
      "name": "List Index",
      "width": 509,
      "height": 679,
      "elements": [
        { "id": "gen_li_title", "type": "text", "x": 20, "y": 0, "w": 155, "h": 40, "text": "", "fontSize": 24, "align": "center", "fontWeight": "bold", "dataBinding": "title" },
        { "id": "gen_li_grid", "type": "grid", "x": 20, "y": 60, "w": 119, "h": 24, "gridConfig": { "cols": 4, "gapY": 0, "sourceType": "current", "displayField": "title", "gapX": 0 }, "fill": "#ffffff", "stroke": "#e2e8f0", "strokeWidth": 1, "borderRadius": 4, "align": "left", "fontSize": 9 },
        { "id": "gen_li_year", "type": "text", "x": 195, "y": 0, "w": 139, "h": 40, "text": "", "fontSize": 24, "align": "center", "fontWeight": "bold", "zIndex": 1, "dataBinding": "year", "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "parent" },
        { "id": "gen_li_line", "type": "line", "x": 0, "y": 40, "w": 510, "h": 0, "stroke": "#000000", "strokeWidth": 1, "zIndex": 2 },
        { "id": "gen_li_prev", "type": "triangle", "x": -6.8, "y": 13.1, "w": 35, "h": 15, "rotation": 270, "fill": "#000000", "stroke": "#000000", "strokeWidth": 1, "zIndex": 3, "linkTarget": "sibling", "linkValue": "-1" },
        { "id": "gen_li_next", "type": "triangle", "x": 163.8, "y": 13.1, "w": 35, "h": 15, "rotation": 90, "fill": "#000000", "stroke": "#000000", "strokeWidth": 1, "zIndex": 3, "linkTarget": "sibling", "linkValue": "1" }
      ]
    },
    "global_note": {
      "id": "global_note",
      "name": "Global Note",
      "width": 509,
      "height": 679,
      "elements": [
        { "id": "gen_gn_bg", "type": "rect", "x": 15, "y": 60, "w": 480, "h": 600, "fill": "#babdb6", "stroke": "#e2e8f0", "strokeWidth": 0, "fillType": "pattern", "patternType": "lines-h", "patternSpacing": 14 },
        { "id": "gen_gn_title", "type": "text", "x": 0, "y": 0, "w": 154, "h": 40, "text": "{{title}}", "fontSize": 24, "align": "center", "fontWeight": "bold" },
        { "id": "gen_gn_year", "type": "text", "x": 155, "y": 0, "w": 139, "h": 40, "text": "", "fontSize": 24, "align": "center", "fontWeight": "bold", "dataBinding": "year", "fill": "#d3d7cf", "strokeWidth": 1, "borderStyle": "solid", "linkTarget": "specific_node", "linkValue": "root" },
        { "id": "gen_gn_line", "type": "line", "x": 0, "y": 40, "w": 510, "h": 0, "stroke": "#000000", "strokeWidth": 1 }
      ]
    },
    "todo_page": {
      "id": "todo_page",
      "name": "To-Do Page",
      "width": 509,
      "height": 679,
      "elements": [
        {
          "id": "gen_tp_bg",
          "type": "rect",
          "x": 11.2,
          "y": 56.3,
          "w": 238.7,
          "h": 603.6,
          "fill": "#babdb6",
          "stroke": "#e2e8f0",
          "strokeWidth": 0,
          "fillType": "pattern",
          "patternType": "lines-h",
          "patternSpacing": 20
        },
        {
          "id": "gen_tp_title",
          "type": "text",
          "x": 0,
          "y": 0,
          "w": 154,
          "h": 40,
          "text": "{{title}}",
          "fontSize": 24,
          "align": "center",
          "fontWeight": "bold"
        },
        {
          "id": "gen_tp_year",
          "type": "text",
          "x": 155,
          "y": 0,
          "w": 139,
          "h": 40,
          "text": "",
          "fontSize": 24,
          "align": "center",
          "fontWeight": "bold",
          "dataBinding": "year",
          "fill": "#d3d7cf",
          "strokeWidth": 1,
          "borderStyle": "solid",
          "linkTarget": "specific_node",
          "linkValue": "root"
        },
        {
          "id": "gen_tp_line",
          "type": "line",
          "x": 0,
          "y": 40,
          "w": 510,
          "h": 0,
          "stroke": "#000000",
          "strokeWidth": 1
        },
        {
          "id": "gen_tp_bg2",
          "type": "rect",
          "x": 261.2,
          "y": 56.3,
          "w": 238.7,
          "h": 603.6,
          "fill": "#babdb6",
          "stroke": "#e2e8f0",
          "strokeWidth": 0,
          "fillType": "pattern",
          "patternType": "lines-h",
          "patternSpacing": 20,
          "zIndex": 1
        },
        {
          "id": "gen_tp_check",
          "type": "rect",
          "x": 11,
          "y": 59,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 2
        },
        {
          "id": "q2qrumtzm",
          "type": "rect",
          "x": 260.5277981195761,
          "y": 59.00892233361111,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 3
        },
        {
          "id": "fvqkj2eu4",
          "type": "rect",
          "x": 11.061084316052625,
          "y": 79,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 4
        },
        {
          "id": "j0x5hh5f4",
          "type": "rect",
          "x": 260.58888243562876,
          "y": 79.00892233361111,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 4
        },
        {
          "id": "2xp3sdfj2",
          "type": "rect",
          "x": 11.174330614546772,
          "y": 118.99107766638889,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 5
        },
        {
          "id": "vu75ae4iu",
          "type": "rect",
          "x": 260.7021287341229,
          "y": 119,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 5
        },
        {
          "id": "d87j87si7",
          "type": "rect",
          "x": 11.113246298494147,
          "y": 98.99107766638889,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 5
        },
        {
          "id": "wnzf0rbv6",
          "type": "rect",
          "x": 260.64104441807024,
          "y": 99,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 5
        },
        {
          "id": "a1a8rn3r4",
          "type": "rect",
          "x": 10.535003324831866,
          "y": 138.97323299916667,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 6
        },
        {
          "id": "o0dkniamt",
          "type": "rect",
          "x": 261.06280144440797,
          "y": 138.98215533277778,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 6
        },
        {
          "id": "q7u72ugug",
          "type": "rect",
          "x": 10.596087640884491,
          "y": 158.97323299916667,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 6
        },
        {
          "id": "nu47sx65r",
          "type": "rect",
          "x": 261.1238857604606,
          "y": 158.98215533277778,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 6
        },
        {
          "id": "5cmk7ln79",
          "type": "rect",
          "x": 10.709333939378638,
          "y": 198.96431066555556,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 6
        },
        {
          "id": "349357dtv",
          "type": "rect",
          "x": 261.2371320589547,
          "y": 198.97323299916667,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 6
        },
        {
          "id": "nk8ka66v3",
          "type": "rect",
          "x": 10.648249623326013,
          "y": 178.96431066555556,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 6
        },
        {
          "id": "dw2cs40bq",
          "type": "rect",
          "x": 261.1760477429021,
          "y": 178.97323299916667,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 6
        },
        {
          "id": "soqujdioe",
          "type": "rect",
          "x": 10.535003324831862,
          "y": 218.93754366472226,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "rghomnip6",
          "type": "rect",
          "x": 261.06280144440797,
          "y": 218.94646599833337,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "redsguuex",
          "type": "rect",
          "x": 10.596087640884488,
          "y": 238.93754366472226,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "dcfkz70ty",
          "type": "rect",
          "x": 261.1238857604606,
          "y": 238.94646599833337,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "n7nx0fp7s",
          "type": "rect",
          "x": 10.709333939378634,
          "y": 278.9286213311111,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "ulot22nv1",
          "type": "rect",
          "x": 261.2371320589547,
          "y": 278.9375436647223,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "pkmdtnrwn",
          "type": "rect",
          "x": 10.64824962332601,
          "y": 258.9286213311111,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "b2ey1u1fu",
          "type": "rect",
          "x": 261.1760477429021,
          "y": 258.9375436647223,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "h3p8y5blc",
          "type": "rect",
          "x": 11.070006649663728,
          "y": 298.9107766638889,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "uavzjk5og",
          "type": "rect",
          "x": 260.5978047692398,
          "y": 298.91969899750006,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "6swqh9f7s",
          "type": "rect",
          "x": 11.131090965716353,
          "y": 318.9107766638889,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "eo50p4jwf",
          "type": "rect",
          "x": 260.65888908529246,
          "y": 318.91969899750006,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "ox9m4kykr",
          "type": "rect",
          "x": 11.2443372642105,
          "y": 358.90185433027784,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "qis4r9df5",
          "type": "rect",
          "x": 260.7721353837866,
          "y": 358.9107766638889,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "pvquhfalp",
          "type": "rect",
          "x": 11.183252948157875,
          "y": 338.90185433027784,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "cevk005eu",
          "type": "rect",
          "x": 260.71105106773393,
          "y": 338.9107766638889,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 7
        },
        {
          "id": "9223iaw5w",
          "type": "rect",
          "x": 10.787040031822116,
          "y": 378.4895395346013,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "gx0fdch0z",
          "type": "rect",
          "x": 261.31483815139825,
          "y": 378.4984618682124,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "pp0gxuspr",
          "type": "rect",
          "x": 10.848124347874741,
          "y": 398.4895395346013,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "ba5tqjgu8",
          "type": "rect",
          "x": 261.3759224674509,
          "y": 398.4984618682124,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "qo6zz8pa2",
          "type": "rect",
          "x": 10.961370646368888,
          "y": 438.4806172009902,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "qkjz4z104",
          "type": "rect",
          "x": 261.489168765945,
          "y": 438.4895395346013,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "akrhdkk6p",
          "type": "rect",
          "x": 10.900286330316263,
          "y": 418.4806172009902,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "4f00xmtko",
          "type": "rect",
          "x": 261.42808444989237,
          "y": 418.4895395346013,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "t7w4y3lq2",
          "type": "rect",
          "x": 11.322043356653982,
          "y": 458.462772533768,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "l9dtz3m09",
          "type": "rect",
          "x": 260.8498414762301,
          "y": 458.4716948673791,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "w58ri3o3n",
          "type": "rect",
          "x": 11.383127672706607,
          "y": 478.462772533768,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "bc61859kw",
          "type": "rect",
          "x": 260.91092579228274,
          "y": 478.4716948673791,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "5pquvak6d",
          "type": "rect",
          "x": 11.496373971200754,
          "y": 518.4538502001569,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "uwi2tiv7p",
          "type": "rect",
          "x": 261.02417209077686,
          "y": 518.462772533768,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "ksga3piis",
          "type": "rect",
          "x": 11.435289655148129,
          "y": 498.45385020015686,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "iaukh2lkh",
          "type": "rect",
          "x": 260.9630877747242,
          "y": 498.462772533768,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "kybhdoxgm",
          "type": "rect",
          "x": 11.322043356653978,
          "y": 538.4270831993235,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "5q45i8idu",
          "type": "rect",
          "x": 260.8498414762301,
          "y": 538.4360055329347,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "aspgtpkra",
          "type": "rect",
          "x": 11.383127672706603,
          "y": 558.4270831993235,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "zxu21ohr1",
          "type": "rect",
          "x": 260.91092579228274,
          "y": 558.4360055329346,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "huc5ad1qk",
          "type": "rect",
          "x": 11.49637397120075,
          "y": 598.4181608657125,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "g9f498415",
          "type": "rect",
          "x": 261.02417209077686,
          "y": 598.4270831993235,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "7lzdwhbj4",
          "type": "rect",
          "x": 11.435289655148125,
          "y": 578.4181608657125,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "o1k1zw1ks",
          "type": "rect",
          "x": 260.9630877747242,
          "y": 578.4270831993235,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "0d7ytlpln",
          "type": "rect",
          "x": 10.857046681485844,
          "y": 618.4003161984901,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "e8xd8kde3",
          "type": "rect",
          "x": 261.38484480106194,
          "y": 618.4092385321014,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "ypqd9bq3u",
          "type": "rect",
          "x": 10.91813099753847,
          "y": 638.4003161984901,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        },
        {
          "id": "x0a5lv8h6",
          "type": "rect",
          "x": 261.4459291171146,
          "y": 638.4092385321014,
          "w": 15,
          "h": 15,
          "fill": "#ffffff",
          "stroke": "#000000",
          "strokeWidth": 1,
          "zIndex": 8
        }
      ]
    }
  }
  return t;`;

export const HierarchyGeneratorModal: React.FC<HierarchyGeneratorModalProps> = ({ isOpen, onClose, onImport }) => {
  const [activeTab, setActiveTab] = useState<'templates' | 'hierarchy'>('templates');
  const [templateScript, setTemplateScript] = useState(DEFAULT_TEMPLATES_SCRIPT);
  const [hierarchyScript, setHierarchyScript] = useState(DEFAULT_HIERARCHY_SCRIPT);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const runGenerator = () => {
    setError(null);
    setSuccess(false);
    try {
        // 1. Execute Templates Script
        const SCOPE_CONSTANTS = {
            RM_PP_WIDTH, RM_PP_HEIGHT, A4_WIDTH, A4_HEIGHT
        };
        
        const templateFn = new Function('consts', `
            with (consts) {
                ${templateScript}
            }
        `);
        
        const templates = templateFn(SCOPE_CONSTANTS);
        
        if (!templates || typeof templates !== 'object') {
            throw new Error("Template script must return an object where keys are template IDs.");
        }

        // Auto-generate IDs for elements if missing to prevent selection issues
        Object.values(templates).forEach((tpl: any) => {
            if (tpl.elements && Array.isArray(tpl.elements)) {
                tpl.elements.forEach((el: any, idx: number) => {
                    if (!el.id) {
                        el.id = `gen_${tpl.id}_${idx}_${Math.random().toString(36).substr(2, 5)}`;
                    }
                });
            }
        });

        // 2. Execute Hierarchy Script
        const createId = (prefix: string = 'node') => `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
        
        const hierarchyFn = new Function('templates', 'createId', `
            ${hierarchyScript}
        `);

        const result = hierarchyFn(templates, createId);

        if (!result || !result.nodes || !result.rootId) {
            throw new Error("Hierarchy script must return an object with { nodes, rootId }.");
        }

        // 3. Validation
        if (!result.nodes[result.rootId]) {
            throw new Error(`Root ID '${result.rootId}' not found in nodes.`);
        }

        // 4. Import
        onImport({
            nodes: result.nodes,
            rootId: result.rootId,
            templates: templates
        });
        setSuccess(true);
        setTimeout(() => {
            setSuccess(false);
            onClose();
        }, 1500);

    } catch (e: any) {
        console.error("Generator Error:", e);
        setError(e.message || "Unknown error occurred during generation.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
         {/* Header */}
         <div className="flex justify-between items-center p-4 border-b bg-slate-50">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                    <Network size={20} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Hierarchy Generator</h2>
                    <p className="text-xs text-slate-500">Programmatically generate nodes and templates using JavaScript.</p>
                </div>
            </div>
            <div className="flex gap-2">
                <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>
         </div>

         {/* Toolbar */}
         <div className="flex items-center justify-between px-4 py-2 border-b bg-white">
            <div className="flex gap-2">
                <button 
                    onClick={() => setActiveTab('templates')}
                    className={clsx(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                        activeTab === 'templates' ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" : "text-slate-600 hover:bg-slate-50"
                    )}
                >
                    <LayoutTemplate size={16} /> 1. Define Templates
                </button>
                <div className="text-slate-300 self-center">→</div>
                <button 
                    onClick={() => setActiveTab('hierarchy')}
                    className={clsx(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                        activeTab === 'hierarchy' ? "bg-purple-50 text-purple-700 ring-1 ring-purple-200" : "text-slate-600 hover:bg-slate-50"
                    )}
                >
                    <Network size={16} /> 2. Build Hierarchy
                </button>
            </div>
            
            <div className="flex items-center gap-3">
                {error && <span className="text-red-600 text-xs flex items-center gap-1 font-medium"><AlertTriangle size={14} /> {error}</span>}
                {success && <span className="text-green-600 text-xs flex items-center gap-1 font-medium"><CheckCircle2 size={14} /> Generated Successfully!</span>}
                
                <button onClick={() => {
                    if(confirm("Reset scripts to default?")) {
                        setTemplateScript(DEFAULT_TEMPLATES_SCRIPT);
                        setHierarchyScript(DEFAULT_HIERARCHY_SCRIPT);
                    }
                }} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 px-2">
                    <RotateCcw size={12} /> Reset
                </button>
                
                <button 
                    onClick={runGenerator}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all hover:shadow hover:-translate-y-0.5"
                >
                    <Play size={16} fill="currentColor" /> Run Generator
                </button>
            </div>
         </div>

         {/* Editor Area */}
         <div className="flex-1 flex overflow-hidden relative bg-[#1e1e1e]">
            {activeTab === 'templates' && (
                <SimpleEditor value={templateScript} onChange={setTemplateScript} />
            )}
            {activeTab === 'hierarchy' && (
                <SimpleEditor value={hierarchyScript} onChange={setHierarchyScript} />
            )}
         </div>
      </div>
    </div>
  );
};
