

export interface AppNode {
  id: string;
  parentId: string | null;
  type: string; // correlates to a Template ID
  title: string;
  data: Record<string, string>; // User defined metadata fields
  children: string[]; // Ordered list of child IDs
  referenceId?: string; // If set, this node acts as a pointer to another node
}

export type ElementType = 'rect' | 'ellipse' | 'text' | 'triangle' | 'grid' | 'line' | 'svg';
export type FillType = 'solid' | 'pattern';
export type PatternType = 'lines-h' | 'lines-v' | 'lines-d' | 'dots';

export interface TraversalStep {
  sliceStart?: number;
  sliceCount?: number;
}

export interface GridConfig {
  cols: number;
  gapX: number; // Split gap into X and Y
  gapY: number;
  sourceType: 'current' | 'specific';
  sourceId?: string;
  displayField?: string;
  offsetStart?: number; // Number of empty cells before first item (Static value)
  offsetMode?: 'static' | 'dynamic'; // Switch between static number and field-based offset
  offsetField?: string; // The field name in the first child's data to determine offset
  offsetAdjustment?: number; // Arithmetic adjustment to add to the dynamic field value (can be negative)
  dataSliceStart?: number; // Index of the first child to include (0-based) (Applied AFTER traversal)
  dataSliceCount?: number; // Number of children to include (Applied AFTER traversal)
  traversalPath?: TraversalStep[]; // Steps to drill down into descendants

  // Border mode and styling for grid cells
  gridBorderMode?: 'all' | 'outside' | 'inside' | 'none'; // Default: 'all'
  gridBorderColor?: string;   // Override cell border color (defaults to element stroke)
  gridBorderWidth?: number;   // Override cell border width (defaults to element strokeWidth)
  gridBorderStyle?: 'solid' | 'dashed' | 'dotted' | 'none' | 'double'; // Override cell border style
  gridBorderRadius?: number; // Override cell border radius (defaults to 0)
  showEmptyCellBorders?: boolean; // Show borders on empty/offset cells (default: false)

  // Header row styling
  headerRow?: boolean;
  headerRowFill?: string;
  headerRowTextColor?: string;
  headerRowFontWeight?: 'normal' | 'bold';

  // First column styling
  firstColumn?: boolean;
  firstColumnFill?: string;
  firstColumnTextColor?: string;
  firstColumnFontWeight?: 'normal' | 'bold';

  // Alternating row/column colors
  alternateRows?: boolean;
  alternateRowFill?: string;
  alternateColumns?: boolean;
  alternateColumnFill?: string;
}

export interface TemplateElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number; // For grid, w/h now represent ONE CELL dimensions
  rotation: number;
  transformOrigin?: { x: number, y: number }; // Normalized coordinates (0-1). Default { x: 0.5, y: 0.5 }
  zIndex?: number;
  layerId?: string; // Layer membership (Shape B). Always present after v8 migration; optional so pre-migration states type-check.
  flip?: boolean; // For lines: false = \, true = /

  // Styling
  fill: string; // Background color or pattern color
  fillType?: FillType;
  patternType?: PatternType;
  patternSpacing?: number; // Distance between pattern elements
  patternWeight?: number;  // Stroke width or dot size
  stroke: string;
  strokeWidth: number;
  opacity: number;
  borderRadius?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none' | 'double'; // Grid/Shape border style
  borderSides?: {  // Per-side border overrides. Undefined = use global stroke. null side = no border on that side.
    top?: { width: number; color: string; style: 'solid' | 'dashed' | 'dotted' | 'none' | 'double' };
    right?: { width: number; color: string; style: 'solid' | 'dashed' | 'dotted' | 'none' | 'double' };
    bottom?: { width: number; color: string; style: 'solid' | 'dashed' | 'dotted' | 'none' | 'double' };
    left?: { width: number; color: string; style: 'solid' | 'dashed' | 'dotted' | 'none' | 'double' };
  };

  // Typography
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  autoWidth?: boolean;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through';
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  textColor?: string;

  // Grid specific
  gridConfig?: GridConfig;

  // Logic
  linkTarget?: 'none' | 'parent' | 'child_index' | 'specific_node' | 'url' | 'child_referrer' | 'sibling' | 'ancestor' | 'referrer';
  linkValue?: string; // Primary value (Node ID, Index, URL, Depth, Offset)
  linkSecondaryValue?: string; // Secondary value (Secondary Index for fallbacks)
  linkReferrerParentType?: string; // Filter for child_referrer: only link to referrers whose parent has this type
  dataBinding?: string;

  // SVG
  svgContent?: string; // Raw SVG markup for svg elements
}

export interface Layer {
  id: string;
  name: string;
  order: number;       // outer stacking; higher order = frontmost
  visible: boolean;    // false => excluded from canvas, PDF, and thumbnails
  locked: boolean;     // elements not selectable/editable on canvas (still rendered)
  color?: string;      // optional label chip for panel grouping
  collapsed?: boolean; // panel fold state (UI-only; safe to persist)
}

export interface PageTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  elements: TemplateElement[];
  layers?: Layer[]; // Layer metadata (Shape B). Always present after v8 migration; optional so pre-migration states type-check.
}

export interface Variant {
  id: string;
  name: string;
  templates: Record<string, PageTemplate>;
}

export interface GeneratorProvenance {
  formatVersion: 1;
  templateScript: string;
  hierarchyScript: string;
  generatedAt: string;
}

export interface AppState {
  nodes: Record<string, AppNode>;
  rootId: string;
  variants: Record<string, Variant>;
  activeVariantId: string;

  // UI State
  viewMode: 'hierarchy' | 'templates';
  selectedNodeId: string;
  selectedNodeIds: string[];
  selectedTemplateId: string;
  selectedTemplateIds: string[];
  selectedElementIds: string[];
  scale: number;
  tool: 'select' | 'hand' | ElementType;
  showJsonModal: boolean;
  activeLayerId?: string;    // Layer new elements are created into (resolved per active template; fallback: frontmost)
  showLayersPanel?: boolean; // Layers panel visibility (toolbar toggle)

  // Layout State
  sidebarWidth: number;
  propertiesPanelWidth: number;
  snapToGrid: boolean;
  showGrid: boolean;

  // Node Selector
  showNodeSelector: boolean;
  nodeSelectorMode: 'grid_source' | 'link_element' | 'create_reference';
  editingElementId: string | null;

  // Clipboard
  clipboard: TemplateElement[];

  // Template Preview
  templatePreviewNodeId?: string; // Node ID to use for preview when in template view

  // Schema Version for migration
  schemaVersion?: number;
  generator?: GeneratorProvenance;
}

export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;
export const RM_PP_WIDTH = 509;
export const RM_PP_HEIGHT = 679;
