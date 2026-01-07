

export interface AppNode {
  id: string;
  parentId: string | null;
  type: string; // correlates to a Template ID
  title: string;
  data: Record<string, string>; // User defined metadata fields
  children: string[]; // Ordered list of child IDs
  referenceId?: string; // If set, this node acts as a pointer to another node
}

export type ElementType = 'rect' | 'ellipse' | 'text' | 'triangle' | 'grid' | 'line';
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
}

export interface TemplateElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number; // For grid, w/h now represent ONE CELL dimensions
  rotation: number;
  zIndex?: number;
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
}

export interface PageTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  elements: TemplateElement[];
}

export interface AppState {
  nodes: Record<string, AppNode>;
  rootId: string;
  templates: Record<string, PageTemplate>;

  // UI State
  viewMode: 'hierarchy' | 'templates';
  selectedNodeId: string;
  selectedTemplateId: string;
  selectedElementIds: string[];
  scale: number;
  tool: 'select' | 'hand' | ElementType;
  showJsonModal: boolean;

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
}

export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;
export const RM_PP_WIDTH = 509;
export const RM_PP_HEIGHT = 679;