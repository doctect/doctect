# 2. Core Data Models

PDF Architect relies on a strict separation between textual/hierarchical data and visual presentation. This separation is enforced by its core TypeScript interfaces, found primarily in `types.ts`.

## 1. `AppNode` (The Data & Structure)
An `AppNode` represents a single logical "page" or "container" in the document's structure (e.g., "January", "Week 1", "Day 1"). It contains *no visual information*.

```typescript
export interface AppNode {
  id: string;               // Unique ID generated via createId()
  parentId: string | null;  // Null for the root node
  type: string;             // IMPORTANT: This correlates to a Template ID (e.g., 'day_view')
  title: string;            // The human-readable name shown in the sidebar tree
  data: Record<string, string>; // Key-value pairs for data binding (e.g., { day: "Monday" })
  children: string[];       // Ordered list of child Node IDs
  referenceId?: string;     // If set, this node acts as a pointer to another node
}
```

*   **`type`**: This is the crucial link. When the app renders an `AppNode`, it looks up the `PageTemplate` whose `id` matches this `type`.
*   **`data`**: This dictionary powers the `{{variable}}` binding system in Text templates and grid offsets.
*   **`referenceId`**: Allows creating a complex graph from a strict tree. See [Advanced Features](6-advanced-features.md) for details on shared children.

## 2. `TemplateElement` (The Visual Component)
A `TemplateElement` defines a single shape, text box, or grid placed on a canvas.

```typescript
export interface TemplateElement {
  id: string;
  type: 'rect' | 'ellipse' | 'text' | 'triangle' | 'grid' | 'line';
  
  // Spatial Data
  x: number;
  y: number;
  w: number;
  h: number; 
  rotation: number;
  transformOrigin?: { x: number, y: number }; // Relative pivot point (0 to 1)
  zIndex?: number;
  
  // Styling
  fill: string; // Background color or pattern base color (Hex)
  stroke: string; // Outline color (Hex)
  strokeWidth: number;
  opacity: number;
  // ... pattern types, border radius, etc.

  // Typography (specifically for 'text' elements)
  text?: string;        // Can contain bindings like "Day: {{day_num}}"
  fontSize?: number;
  fontFamily?: string;  
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textColor?: string;
  // ... alignment, text decoration, etc.

  // Advanced Configurations
  gridConfig?: GridConfig; // See [Canvas Render Engine](4-canvas-render-engine.md)
  
  // Interactive Links
  linkTarget?: 'none' | 'parent' | 'child_index' | 'specific_node' | 'sibling' | 'ancestor' | 'referrer' | 'child_referrer';
  linkValue?: string; 
}
```

## 3. `PageTemplate` (The Layout)
A `PageTemplate` groups `TemplateElement`s together into a single reusable page layout.

```typescript
export interface PageTemplate {
  id: string;          // Must match AppNode.type to be applied
  name: string;        // Human-readable name (e.g., "Day View")
  width: number;       // Page dimensions in device pixels
  height: number;
  elements: TemplateElement[];
}
```

## 4. `Variant` (Multi-Device Support)
To support different device sizes (e.g., reMarkable Paper Pro vs. an iPad) without duplicating the entire document hierarchy, templates are grouped into `Variant`s.

```typescript
export interface Variant {
  id: string;
  name: string;
  templates: Record<string, PageTemplate>; 
}
```
*   When a "Day" node (type: `day_view`) is rendered, the system looks at the `activeVariantId`.
*   If active is "RM Pro", it renders using `variants["rm_pro"].templates["day_view"]`.
*   If active is "iPad", it renders using `variants["ipad"].templates["day_view"]`.
*   Both variants share the exact same `AppNode` hierarchy and data.

## 5. `GeneratorProvenance`
Generator-created projects can retain the exact scripts that produced their document. This
metadata is optional because legacy and manually created projects have no generator source.

```typescript
export interface GeneratorProvenance {
  formatVersion: 1;
  templateScript: string;
  hierarchyScript: string;
  generatedAt: string;
}
```

Scripts preserve whitespace and Unicode byte-exactly. Each script has a 512 KiB UTF-8 limit,
with a 1 MiB combined limit. The timestamp records when the source was applied. Manual document
edits do not rewrite this source.

## 6. `AppState` (The Global Truth)
This represents the fully serialized state of a single Project.

```typescript
export interface AppState {
  nodes: Record<string, AppNode>;   // Flat dictionary of all nodes 
  rootId: string;                   // The starting node ID
  
  variants: Record<string, Variant>; // Dictionary of all variants
  activeVariantId: string;          // Which variant is currently selected in the UI
  
  // Temporary UI State (often reset on load or excluded from deep saves depending on context)
  viewMode: 'hierarchy' | 'templates'; 
  selectedNodeId: string;
  selectedTemplateId: string;
  selectedElementIds: string[];
  scale: number; // Zoom level
  tool: 'select' | 'hand' | ElementType;
  // ... layout sizes, modal states, clipboard
  
  schemaVersion?: number; // Used for migrating state objects loaded from older versions.
  generator?: GeneratorProvenance; // Optional exact Hierarchy Generator source.
}
```
