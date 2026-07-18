
import React, { useState } from 'react';
import { AppNode, AppState, TemplateElement, TextOverflow, TraversalStep } from '../../types';
import { Grid3X3, ArrowLeft, Palette, Type, MousePointer2, Bold, Italic, Underline, ArrowUp, ArrowDown, Plus, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignEndVertical, AlignCenterVertical, Trash2, Layers, Network, Trash, Settings2, RectangleHorizontal, RectangleVertical, Share2, Link2, ChevronUp, ChevronDown, PanelTop, PanelRight, PanelBottom, PanelLeft, ToggleRight, ToggleLeft } from 'lucide-react';
import { ChildIndexSelector } from './ChildIndexSelector';
import { SvgSourceSection } from './SvgSourceSection';
import { BORDER_STYLES, FONTS } from '../../constants/editor';
import clsx from 'clsx';
import { resolveTextOverflowSettings } from '../../services/textOverflow';
import { measureAutoWidthText } from '../../services/autoWidthText';
import { resolveElementPreviewText } from '../../services/previewText';
import { DEFAULT_TEXT_FONT_SIZE, resolveTextFontSize } from '../../services/textVisibility';
import { CollapsibleSection } from '../CollapsibleSection';

// Font family mapping for CSS (used for font dropdown preview)
const getFontFamily = (fontValue: string): string => {
    const fontMap: Record<string, string> = {
        'helvetica': 'Helvetica, Arial, sans-serif',
        'open-sans': '"Open Sans", sans-serif',
        'lato': 'Lato, sans-serif',
        'montserrat': 'Montserrat, sans-serif',
        'roboto': 'Roboto, sans-serif',
        'poppins': 'Poppins, sans-serif',
        'nunito': 'Nunito, sans-serif',
        'inter': 'Inter, sans-serif',
        'work-sans': '"Work Sans", sans-serif',
        'source-sans-pro': '"Source Sans Pro", sans-serif',
        'raleway': 'Raleway, sans-serif',
        'ubuntu': 'Ubuntu, sans-serif',
        'pt-sans': '"PT Sans", sans-serif',
        'noto-sans': '"Noto Sans", sans-serif',
        'oxygen': 'Oxygen, sans-serif',
        'fira-sans': '"Fira Sans", sans-serif',
        'times': '"Times New Roman", Times, serif',
        'lora': 'Lora, serif',
        'merriweather': 'Merriweather, serif',
        'playfair-display': '"Playfair Display", serif',
        'pt-serif': '"PT Serif", serif',
        'libre-baskerville': '"Libre Baskerville", serif',
        'crimson-text': '"Crimson Text", serif',
        'eb-garamond': '"EB Garamond", serif',
        'cormorant-garamond': '"Cormorant Garamond", serif',
        'noto-serif': '"Noto Serif", serif',
        'courier': 'Courier, monospace',
        'roboto-mono': '"Roboto Mono", monospace',
        'fira-code': '"Fira Code", monospace',
        'source-code-pro': '"Source Code Pro", monospace',
        'jetbrains-mono': '"JetBrains Mono", monospace',
        'ubuntu-mono': '"Ubuntu Mono", monospace',
        'caveat': 'Caveat, cursive',
        'dancing-script': '"Dancing Script", cursive',
        'patrick-hand': '"Patrick Hand", cursive',
        'pacifico': 'Pacifico, cursive',
        'great-vibes': '"Great Vibes", cursive',
        'satisfy': 'Satisfy, cursive',
        'sacramento': 'Sacramento, cursive',
        'allura': 'Allura, cursive',
        'amatic-sc': '"Amatic SC", cursive',
        'indie-flower': '"Indie Flower", cursive',
        'kalam': 'Kalam, cursive',
        'shadows-into-light': '"Shadows Into Light", cursive',
        'bebas-neue': '"Bebas Neue", sans-serif',
        'oswald': 'Oswald, sans-serif',
        'anton': 'Anton, sans-serif',
        'righteous': 'Righteous, cursive',
        'archivo-black': '"Archivo Black", sans-serif',
    };
    return fontMap[fontValue] || fontValue;
};

export type AutoWidthSelection = boolean | 'mixed';

export type ElementPropertySectionKey =
    | 'grid'
    | 'geometry'
    | 'appearance'
    | 'typography'
    | 'interaction'
    | 'svgSource';

export type ElementPropertySectionState = Record<ElementPropertySectionKey, boolean>;

interface SingleElementEditorProps {
    element: TemplateElement;
    onUpdate: (updates: Partial<TemplateElement> | ((prev: TemplateElement) => Partial<TemplateElement>), saveHistory?: boolean) => void;
    onOpenNodeSelector: (mode: 'grid_source' | 'link_element') => void;
    state: AppState;
    selectionIsTextOnly: boolean;
    autoWidthSelection: AutoWidthSelection;
    sectionExpanded: ElementPropertySectionState;
    onToggleSection: (section: ElementPropertySectionKey) => void;
    activeNode?: AppNode;
}

const SmartValueInput: React.FC<{
    label: string,
    value: string,
    onChange: (val: string) => void,
    placeholder?: string,
    availableFields: string[]
}> = ({ label, value, onChange, placeholder, availableFields }) => {
    // Detect if value is NOT a simple integer. 
    // Expressions like "field + 1" or "field" should trigger field mode.
    const isExpression = !/^-?\d+$/.test(value) && value !== "";
    const [mode, setMode] = useState<'static' | 'field'>(isExpression ? 'field' : 'static');

    return (
        <div className="mb-2">
            <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-slate-400">{label}</label>
                <div className="flex bg-slate-100 rounded p-0.5">
                    <button
                        onClick={() => { setMode('static'); onChange("0"); }}
                        className={clsx("text-[9px] px-1.5 py-0.5 rounded", mode === 'static' ? "bg-white shadow-sm text-blue-600" : "text-slate-500")}
                    >
                        Static
                    </button>
                    <button
                        onClick={() => { setMode('field'); onChange(""); }}
                        className={clsx("text-[9px] px-1.5 py-0.5 rounded", mode === 'field' ? "bg-white shadow-sm text-blue-600" : "text-slate-500")}
                    >
                        Field/Expr
                    </button>
                </div>
            </div>
            {mode === 'static' ? (
                <input
                    type="number"
                    className="w-full border rounded px-2 py-1 text-xs"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder || "0"}
                />
            ) : (
                <div className="relative">
                    <input
                        className="w-full border rounded px-2 py-1 text-xs bg-indigo-50 border-indigo-200 text-indigo-700"
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        placeholder="Field or 'Field + 1'"
                        list={`fields-${label}`}
                    />
                    <datalist id={`fields-${label}`}>
                        {availableFields.map(f => <option key={f} value={f} />)}
                    </datalist>
                </div>
            )}
        </div>
    );
};

const SmartInput = ({
    label,
    value,
    onChange,
    onNudge,
    min,
    max,
    step = 1,
    className = ""
}: {
    label: string,
    value: number | string | undefined,
    onChange: (val: number) => void,
    onNudge: (delta: number) => void,
    min?: number,
    max?: number,
    step?: number,
    className?: string
}) => {
    // Helper to safely parse input
    const displayValue = (value === '' || value === 'Mixed' || value === undefined || isNaN(Number(value))) ? '' : value;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            onNudge(step);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onNudge(-step);
        }
    };

    // Repeat logic
    const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const onNudgeRef = React.useRef(onNudge);

    // Keep ref updated
    React.useEffect(() => {
        onNudgeRef.current = onNudge;
    }, [onNudge]);

    const stopRepeat = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        intervalRef.current = null;
        timeoutRef.current = null;
    };

    const startRepeat = (direction: 'up' | 'down') => {
        stopRepeat();
        const delta = direction === 'up' ? step : -step;

        // Immediate action
        onNudgeRef.current(delta);

        // Delay then repeat
        timeoutRef.current = setTimeout(() => {
            intervalRef.current = setInterval(() => {
                onNudgeRef.current(delta);
            }, 50); // Speed of repeat
        }, 300); // Initial delay before repeat
    };

    // Cleanup on unmount
    React.useEffect(() => stopRepeat, []);

    return (
        <div className={`relative group ${className}`}>
            <label className="text-[10px] text-slate-400 block mb-0.5">{label}</label>
            <div className="relative">
                <input
                    type="number"
                    value={displayValue}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    onKeyDown={handleKeyDown}
                    className="w-full border rounded px-1 text-sm py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pr-5"
                    placeholder="Mixed"
                    min={min}
                    max={max}
                    step={step}
                />
                <div className="absolute right-0.5 top-0.5 bottom-0.5 flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white border-l px-0.5">
                    <button
                        className="h-2.5 flex items-center justify-center hover:bg-slate-100 active:bg-slate-200 text-slate-500 rounded-sm"
                        onMouseDown={() => startRepeat('up')}
                        onMouseUp={stopRepeat}
                        onMouseLeave={stopRepeat}
                        tabIndex={-1}
                    >
                        <ChevronUp size={10} />
                    </button>
                    <button
                        className="h-2.5 flex items-center justify-center hover:bg-slate-100 active:bg-slate-200 text-slate-500 rounded-sm"
                        onMouseDown={() => startRepeat('down')}
                        onMouseUp={stopRepeat}
                        onMouseLeave={stopRepeat}
                        tabIndex={-1}
                    >
                        <ChevronDown size={10} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export const SingleElementEditor: React.FC<SingleElementEditorProps> = ({
    element,
    onUpdate,
    onOpenNodeSelector,
    state,
    selectionIsTextOnly,
    autoWidthSelection,
    sectionExpanded,
    onToggleSection,
    activeNode,
}) => {

    const [showRefBuilder, setShowRefBuilder] = useState(false);
    const [showFontPicker, setShowFontPicker] = useState(false);
    const [fontSearch, setFontSearch] = useState('');
    const textOverflowControlId = React.useId();
    const setAutoWidthCheckboxRef = React.useCallback((checkbox: HTMLInputElement | null) => {
        if (checkbox) checkbox.indeterminate = autoWidthSelection === 'mixed';
    }, [autoWidthSelection]);
    const shouldAutoFocusTextRef = React.useRef(element.type === 'text' && !element.text);
    const setTextAreaRef = React.useCallback((textarea: HTMLTextAreaElement | null) => {
        if (textarea && shouldAutoFocusTextRef.current) {
            shouldAutoFocusTextRef.current = false;
            textarea.focus();
        }
    }, []);
    const textOverflowSettings = resolveTextOverflowSettings(element);
    const textOverflowControlsDisabled = element.type === 'text' && !!element.autoWidth;

    // Ref Builder State (Strings now to support fields)
    const [refPIdx, setRefPIdx] = useState("0");
    const [refSIdx, setRefSIdx] = useState("1");
    const [refType, setRefType] = useState("");
    const [refField, setRefField] = useState("title");

    const availableFields = React.useMemo(() => {
        if (!activeNode) return [];
        const fields = new Set<string>();
        fields.add('title');

        let curr: AppNode | undefined = activeNode;
        while (curr) {
            if (curr.data) Object.keys(curr.data).forEach(k => fields.add(k));
            curr = curr.parentId ? state.nodes[curr.parentId] : undefined;
        }
        return Array.from(fields).sort();
    }, [activeNode, state.nodes]);

    const gridAvailableFields = React.useMemo(() => {
        if (element.type !== 'grid' || !element.gridConfig) return ['title'];

        const { sourceType, sourceId, traversalPath } = element.gridConfig;
        let currentIds: string[] = [];

        // 1. Determine Root(s)
        if (sourceType === 'specific' && sourceId) {
            if (state.nodes[sourceId]) currentIds = [sourceId];
        } else {
            // sourceType === 'current'
            if (activeNode) currentIds = [activeNode.id];
        }

        // 2. Traverse / Drill Down
        if (traversalPath && traversalPath.length > 0) {
            const traverse = (ids: string[], depth: number): string[] => {
                if (depth >= traversalPath.length) return ids;
                const step = traversalPath[depth];
                const nextIds: string[] = [];
                ids.forEach(pid => {
                    const node = state.nodes[pid];
                    if (!node) return;
                    // Resolve ref
                    const target = (node.referenceId && state.nodes[node.referenceId]) ? state.nodes[node.referenceId] : node;
                    const children = target.children || [];

                    const start = step.sliceStart || 0;
                    const end = step.sliceCount !== undefined ? start + step.sliceCount : undefined;
                    nextIds.push(...children.slice(start, end));
                });
                return traverse(nextIds, depth + 1);
            };
            currentIds = traverse(currentIds, 0);
        } else {
            // Default behavior (no traversal path): Children of source
            const childrenIds: string[] = [];
            currentIds.forEach(id => {
                const node = state.nodes[id];
                if (node) {
                    const target = (node.referenceId && state.nodes[node.referenceId]) ? state.nodes[node.referenceId] : node;
                    childrenIds.push(...(target.children || []));
                }
            });
            currentIds = childrenIds;
        }

        // 3. Collect Fields from result nodes (limit to first 20 for performance)
        const fields = new Set<string>(['title']);
        currentIds.slice(0, 20).forEach(id => {
            const node = state.nodes[id];
            if (node) {
                let target = node;
                if (target.referenceId && state.nodes[target.referenceId]) {
                    target = state.nodes[target.referenceId];
                }

                if (target.data) {
                    Object.keys(target.data).forEach(k => fields.add(k));
                }
            }
        });

        return Array.from(fields).sort();
    }, [element.gridConfig, state.nodes, activeNode]);

    const insertText = (textToInsert: string) => {
        const currentText = element.text || "";
        // Simple append for now
        onUpdate({ text: currentText + textToInsert, dataBinding: '' });
    };

    const insertRefTag = () => {
        const tag = `{{child_referrer:${refPIdx}:${refSIdx}:${refType}:${refField}}}`;
        if (element.type === 'grid' && element.gridConfig) {
            insertGridDisplayText(tag);
        } else {
            insertText(tag);
        }
        setShowRefBuilder(false);
    };

    const insertGridDisplayText = (textToInsert: string) => {
        if (!element.gridConfig) return;
        const current = element.gridConfig.displayField || "";
        onUpdate({ gridConfig: { ...element.gridConfig, displayField: current + textToInsert } });
    };

    const addTraversalStep = () => {
        if (element.gridConfig) {
            const currentPath = element.gridConfig.traversalPath || [];
            onUpdate({
                gridConfig: {
                    ...element.gridConfig,
                    traversalPath: [...currentPath, { sliceStart: 0, sliceCount: undefined }]
                }
            });
        }
    };

    const updateTraversalStep = (index: number, updates: Partial<TraversalStep>) => {
        if (element.gridConfig && element.gridConfig.traversalPath) {
            const newPath = [...element.gridConfig.traversalPath];
            newPath[index] = { ...newPath[index], ...updates };
            onUpdate({ gridConfig: { ...element.gridConfig, traversalPath: newPath } });
        }
    };

    const removeTraversalStep = (index: number) => {
        if (element.gridConfig && element.gridConfig.traversalPath) {
            const newPath = element.gridConfig.traversalPath.filter((_, i) => i !== index);
            onUpdate({ gridConfig: { ...element.gridConfig, traversalPath: newPath } });
        }
    };

    // Render the Referrer Builder UI
    const renderRefBuilder = () => (
        <div className="p-2 bg-slate-100 rounded border border-slate-200 mt-2 space-y-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                <Network size={10} /> Insert Child Referrer Field
            </div>
            <div className="grid grid-cols-2 gap-2">
                <SmartValueInput
                    label="Start Index"
                    value={refPIdx}
                    onChange={setRefPIdx}
                    availableFields={availableFields}
                />
                <SmartValueInput
                    label="Count / Direction"
                    value={refSIdx}
                    onChange={setRefSIdx}
                    availableFields={availableFields}
                    placeholder="1 or -1"
                />
            </div>
            <div>
                <label className="text-[9px] text-slate-400">Parent Type (Optional)</label>
                <select className="w-full border rounded px-1 text-xs bg-white" value={refType} onChange={e => setRefType(e.target.value)}>
                    <option value="">Any</option>
                    {Object.values(state.variants[state.activeVariantId]?.templates || {}).map((t: any) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
            </div>
            <div>
                <label className="text-[9px] text-slate-400">Field Name</label>
                <input className="w-full border rounded px-1 text-xs" value={refField} onChange={e => setRefField(e.target.value)} placeholder="title" />
            </div>
            <div className="flex justify-end gap-1">
                <button onClick={() => setShowRefBuilder(false)} className="px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-200 rounded">Cancel</button>
                <button onClick={insertRefTag} className="px-2 py-1 text-[10px] bg-blue-600 text-white hover:bg-blue-700 rounded">Insert</button>
            </div>
        </div>
    );

    const safeVal = (val: any) => {
        if (val === 'Mixed' || val === undefined || val === null || isNaN(Number(val))) return '';
        return Math.round(Number(val));
    };

    const handleAutoWidthToggle = () => {
        const enable = autoWidthSelection !== true;
        onUpdate(previous => {
            if (!enable) return { autoWidth: false };
            const previewText = resolveElementPreviewText(previous, activeNode, state.nodes);
            const measurement = measureAutoWidthText(previewText, previous);
            if (measurement) return { autoWidth: true, ...measurement };

            const resolvedFontSize = resolveTextFontSize(previous.fontSize);
            const fontSize = Number.isFinite(resolvedFontSize) && resolvedFontSize > 0
                ? resolvedFontSize
                : DEFAULT_TEXT_FONT_SIZE;
            return {
                autoWidth: true,
                w: Number.isFinite(previous.w) && previous.w > 0
                    ? previous.w
                    : Math.max(10, fontSize),
                h: Number.isFinite(previous.h) && previous.h > 0
                    ? previous.h
                    : Math.max(20, fontSize * 1.5),
            };
        });
    };

    return (
        <div className="space-y-4 pb-10">
            {/* Grid Config */}
            {element.type === 'grid' && element.gridConfig && (
                <CollapsibleSection
                    title="Grid Configuration"
                    icon={Grid3X3}
                    variant="compact"
                    testId="grid-configuration-section"
                    expanded={sectionExpanded.grid}
                    onToggle={() => onToggleSection('grid')}
                >
                    <div className="space-y-2 bg-indigo-50 p-2 rounded border border-indigo-100">
                    <div className="grid grid-cols-3 gap-1">
                        <div><label className="text-[10px] text-slate-500">Cols</label><input type="number" min="1" value={safeVal(element.gridConfig.cols)} onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, cols: parseInt(e.target.value) } })} className="w-full border rounded px-1 text-sm" /></div>
                        <div><label className="text-[10px] text-slate-500">Gap X</label><input type="number" min="0" value={safeVal(element.gridConfig.gapX)} onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, gapX: parseInt(e.target.value) } })} className="w-full border rounded px-1 text-sm" /></div>
                        <div><label className="text-[10px] text-slate-500">Gap Y</label><input type="number" min="0" value={safeVal(element.gridConfig.gapY)} onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, gapY: parseInt(e.target.value) } })} className="w-full border rounded px-1 text-sm" /></div>
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500">Source</label>
                        <div className="flex items-center gap-1">
                            <select className="flex-1 text-xs border rounded py-1 px-1 bg-white" value={(element.gridConfig.sourceType as string) === 'Mixed' ? '' : element.gridConfig.sourceType} onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, sourceType: e.target.value as any } })}>
                                <option value="current">Children of Current Page</option>
                                <option value="specific">Children of Specific Page...</option>
                            </select>
                        </div>
                        {element.gridConfig.sourceType === 'specific' && (
                            <button onClick={() => onOpenNodeSelector('grid_source')} className="w-full text-xs bg-white border border-dashed rounded p-1 mt-1 text-left flex items-center justify-between hover:bg-slate-50">
                                <span className="truncate text-slate-600">{element.gridConfig.sourceId ? (state.nodes[element.gridConfig.sourceId]?.title || 'Unknown') : 'Select Page...'}</span>
                                <ArrowLeft size={10} className="text-slate-400" />
                            </button>
                        )}
                    </div>

                    {/* Traversal Path */}
                    <div className="border-t border-indigo-100 pt-2 mt-2">
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                                <Layers size={10} /> Deep Traversal
                            </label>
                            <button onClick={addTraversalStep} className="text-[9px] bg-white border border-indigo-200 text-indigo-600 px-1.5 py-0.5 rounded hover:bg-indigo-50 flex items-center gap-0.5">
                                <Plus size={8} /> Add Level
                            </button>
                        </div>

                        <div className="space-y-1">
                            {element.gridConfig.traversalPath?.map((step, idx) => (
                                <div key={idx} className="flex items-center gap-1 bg-white p-1 rounded border border-indigo-100">
                                    <div className="text-[9px] text-slate-400 w-4 font-mono text-center">{idx + 1}</div>
                                    <div className="flex-1 flex gap-1">
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="Start"
                                            className="w-full border rounded px-1 text-xs py-0.5"
                                            value={step.sliceStart ?? ''}
                                            onChange={e => updateTraversalStep(idx, { sliceStart: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                                        />
                                        <input
                                            type="number"
                                            min="1"
                                            placeholder="Count"
                                            className="w-full border rounded px-1 text-xs py-0.5"
                                            value={step.sliceCount ?? ''}
                                            onChange={e => updateTraversalStep(idx, { sliceCount: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <button onClick={() => removeTraversalStep(idx)} className="text-red-400 hover:text-red-600 p-0.5">
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                            ))}
                            {(!element.gridConfig.traversalPath || element.gridConfig.traversalPath.length === 0) && (
                                <div className="text-[9px] text-slate-400 italic text-center py-1">Direct children only</div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-indigo-100 pt-2 mt-2">
                        <label className="text-[10px] text-slate-500 flex items-center gap-1">Final Data Subset</label>
                        <div className="flex gap-1">
                            <div className="flex-1">
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="Start (0)"
                                    className="w-full border rounded px-1 text-xs py-1"
                                    value={element.gridConfig.dataSliceStart ?? ''}
                                    onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, dataSliceStart: e.target.value === '' ? undefined : parseInt(e.target.value) } })}
                                />
                                <div className="text-[8px] text-slate-400">Start Index</div>
                            </div>
                            <div className="flex-1">
                                <input
                                    type="number"
                                    min="1"
                                    placeholder="Count (All)"
                                    className="w-full border rounded px-1 text-xs py-1"
                                    value={element.gridConfig.dataSliceCount ?? ''}
                                    onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, dataSliceCount: e.target.value === '' ? undefined : parseInt(e.target.value) } })}
                                />
                                <div className="text-[8px] text-slate-400">Count</div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] text-slate-500">Display Template</label>
                        <input
                            className="w-full border rounded px-1 py-1 text-xs bg-white"
                            placeholder="{{title}} (Default)"
                            value={element.gridConfig.displayField || ""}
                            onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, displayField: e.target.value } })}
                        />
                        {gridAvailableFields.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                                {gridAvailableFields.map(f => (
                                    <button
                                        key={f}
                                        onClick={() => insertGridDisplayText(`{{${f}}}`)}
                                        className="text-[9px] bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 px-1.5 py-0.5 rounded border border-slate-200 transition-colors flex items-center gap-0.5"
                                        title={`Insert {{${f}}}`}
                                    >
                                        <Plus size={8} /> {f}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="mt-1">
                            <button onClick={() => setShowRefBuilder(!showRefBuilder)} className="text-[9px] text-indigo-600 hover:underline flex items-center gap-1">
                                <Network size={8} /> Insert Referrer Field...
                            </button>
                            {showRefBuilder && renderRefBuilder()}
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 flex items-center gap-1">Offset (Skip items) <span className="text-slate-300 text-[8px]">(Advance)</span></label>
                        <div className="flex gap-1">
                            <input type="number" className="w-16 border rounded px-1 text-sm" value={element.gridConfig.offsetStart || 0} onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, offsetStart: parseInt(e.target.value) } })} />
                            <select className="flex-1 border rounded text-xs bg-white" value={element.gridConfig.offsetMode || 'static'} onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, offsetMode: e.target.value as any } })}>
                                <option value="static">Static</option>
                                <option value="dynamic">Dynamic (Field)</option>
                            </select>
                        </div>
                        {element.gridConfig.offsetMode === 'dynamic' && (
                            <div className="flex gap-1 mt-1">
                                <input
                                    placeholder="Field Name"
                                    className="flex-1 border rounded px-1 text-xs"
                                    value={element.gridConfig.offsetField || ""}
                                    onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, offsetField: e.target.value } })}
                                    list="grid-display-fields"
                                />
                                <input type="number" placeholder="+/-" className="w-12 border rounded px-1 text-xs" value={element.gridConfig.offsetAdjustment || 0} onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, offsetAdjustment: parseInt(e.target.value) } })} />
                            </div>
                        )}
                    </div>

                    {/* Grid Formatting */}
                    <div className="border-t border-indigo-100 pt-2 mt-2">
                        <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1 mb-2">
                            <Palette size={10} /> Grid Formatting
                        </label>

                        {/* Border Mode */}
                        <div className="mb-2">
                            <label className="text-[9px] text-slate-400">Cell Border Mode</label>
                            <select
                                className="w-full border rounded px-1 text-xs py-1 bg-white"
                                value={element.gridConfig.gridBorderMode || 'all'}
                                onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, gridBorderMode: e.target.value as any } })}
                            >
                                <option value="all">All Borders</option>
                                <option value="outside">Outside Only</option>
                                <option value="inside">Inside Only</option>
                                <option value="none">No Borders</option>
                            </select>
                        </div>

                        {/* Cell Border Styling */}
                        {element.gridConfig.gridBorderMode !== 'none' && (
                            <div className="mb-2 flex items-center gap-1">
                                <label className="text-[9px] text-slate-400 flex-shrink-0 w-12">Cell Border</label>
                                <input type="color" className="w-5 h-5 p-0 border-0 rounded cursor-pointer flex-shrink-0"
                                    value={element.gridConfig.gridBorderColor || element.stroke || '#000000'}
                                    onInput={e => onUpdate({ gridConfig: { ...element.gridConfig!, gridBorderColor: (e.target as HTMLInputElement).value } })} />
                                <input type="number" min="0" step="1" className="w-10 border rounded px-0.5 text-[10px] text-center"
                                    value={element.gridConfig.gridBorderWidth ?? element.strokeWidth ?? 1}
                                    onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, gridBorderWidth: Math.max(0, Number(e.target.value)) } })} />
                                <select className="flex-1 text-[10px] border rounded bg-white px-0.5"
                                    value={element.gridConfig.gridBorderStyle || element.borderStyle || 'solid'}
                                    onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, gridBorderStyle: e.target.value as any } })}>
                                    {BORDER_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                                <input type="number" min="0" step="1" className="w-10 border rounded px-0.5 text-[10px] text-center" title="Cell Border Radius"
                                    placeholder="R"
                                    value={element.gridConfig.gridBorderRadius ?? 0}
                                    onChange={e => onUpdate({ gridConfig: { ...element.gridConfig!, gridBorderRadius: Math.max(0, Number(e.target.value)) } })} />
                            </div>
                        )}

                        {/* Empty Cell Borders Toggle */}
                        {element.gridConfig.gridBorderMode !== 'none' && (
                            <div className="mb-2 flex items-center justify-between">
                                <label className="text-[9px] text-slate-400">Empty Cell Borders</label>
                                <button
                                    onClick={() => onUpdate({ gridConfig: { ...element.gridConfig!, showEmptyCellBorders: !element.gridConfig!.showEmptyCellBorders } })}
                                    className="flex-shrink-0 text-indigo-600 focus:outline-none"
                                >
                                    {element.gridConfig.showEmptyCellBorders ? <ToggleRight size={18} /> : <ToggleLeft size={18} className="text-slate-400" />}
                                </button>
                            </div>
                        )}

                        {/* Header Row */}
                        <div className="mb-2 p-1.5 bg-white rounded border border-indigo-50">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[9px] font-medium text-slate-600">Header Row</label>
                                <button
                                    onClick={() => onUpdate({ gridConfig: { ...element.gridConfig!, headerRow: !element.gridConfig!.headerRow } })}
                                    className="flex-shrink-0 text-indigo-600 focus:outline-none"
                                >
                                    {element.gridConfig.headerRow ? <ToggleRight size={18} /> : <ToggleLeft size={18} className="text-slate-400" />}
                                </button>
                            </div>
                            {element.gridConfig.headerRow && (
                                <div className="flex gap-1 items-center">
                                    <input type="color" className="w-5 h-5 p-0 border-0 rounded cursor-pointer" value={element.gridConfig.headerRowFill || '#e2e8f0'}
                                        onInput={e => onUpdate({ gridConfig: { ...element.gridConfig!, headerRowFill: (e.target as HTMLInputElement).value } })} />
                                    <input type="color" className="w-5 h-5 p-0 border-0 rounded cursor-pointer" value={element.gridConfig.headerRowTextColor || '#000000'}
                                        onInput={e => onUpdate({ gridConfig: { ...element.gridConfig!, headerRowTextColor: (e.target as HTMLInputElement).value } })} title="Text color" />
                                    <button
                                        onClick={() => onUpdate({ gridConfig: { ...element.gridConfig!, headerRowFontWeight: element.gridConfig!.headerRowFontWeight === 'bold' ? 'normal' : 'bold' } })}
                                        className={clsx('p-0.5 rounded text-[9px]', element.gridConfig.headerRowFontWeight === 'bold' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}
                                    ><Bold size={10} /></button>
                                    <span className="text-[8px] text-slate-400 ml-1">Fill / Text / Bold</span>
                                </div>
                            )}
                        </div>

                        {/* First Column */}
                        <div className="mb-2 p-1.5 bg-white rounded border border-indigo-50">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[9px] font-medium text-slate-600">First Column</label>
                                <button
                                    onClick={() => onUpdate({ gridConfig: { ...element.gridConfig!, firstColumn: !element.gridConfig!.firstColumn } })}
                                    className="flex-shrink-0 text-indigo-600 focus:outline-none"
                                >
                                    {element.gridConfig.firstColumn ? <ToggleRight size={18} /> : <ToggleLeft size={18} className="text-slate-400" />}
                                </button>
                            </div>
                            {element.gridConfig.firstColumn && (
                                <div className="flex gap-1 items-center">
                                    <input type="color" className="w-5 h-5 p-0 border-0 rounded cursor-pointer" value={element.gridConfig.firstColumnFill || '#e2e8f0'}
                                        onInput={e => onUpdate({ gridConfig: { ...element.gridConfig!, firstColumnFill: (e.target as HTMLInputElement).value } })} />
                                    <input type="color" className="w-5 h-5 p-0 border-0 rounded cursor-pointer" value={element.gridConfig.firstColumnTextColor || '#000000'}
                                        onInput={e => onUpdate({ gridConfig: { ...element.gridConfig!, firstColumnTextColor: (e.target as HTMLInputElement).value } })} title="Text color" />
                                    <button
                                        onClick={() => onUpdate({ gridConfig: { ...element.gridConfig!, firstColumnFontWeight: element.gridConfig!.firstColumnFontWeight === 'bold' ? 'normal' : 'bold' } })}
                                        className={clsx('p-0.5 rounded text-[9px]', element.gridConfig.firstColumnFontWeight === 'bold' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}
                                    ><Bold size={10} /></button>
                                    <span className="text-[8px] text-slate-400 ml-1">Fill / Text / Bold</span>
                                </div>
                            )}
                        </div>

                        {/* Alternating Rows */}
                        <div className="mb-2 p-1.5 bg-white rounded border border-indigo-50">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[9px] font-medium text-slate-600">Alternate Rows</label>
                                <button
                                    onClick={() => onUpdate({ gridConfig: { ...element.gridConfig!, alternateRows: !element.gridConfig!.alternateRows } })}
                                    className="flex-shrink-0 text-indigo-600 focus:outline-none"
                                >
                                    {element.gridConfig.alternateRows ? <ToggleRight size={18} /> : <ToggleLeft size={18} className="text-slate-400" />}
                                </button>
                            </div>
                            {element.gridConfig.alternateRows && (
                                <div className="flex gap-1 items-center">
                                    <input type="color" className="w-5 h-5 p-0 border-0 rounded cursor-pointer" value={element.gridConfig.alternateRowFill || '#f1f5f9'}
                                        onInput={e => onUpdate({ gridConfig: { ...element.gridConfig!, alternateRowFill: (e.target as HTMLInputElement).value } })} />
                                    <span className="text-[8px] text-slate-400 ml-1">Even row fill</span>
                                </div>
                            )}
                        </div>

                        {/* Alternating Columns */}
                        <div className="p-1.5 bg-white rounded border border-indigo-50">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[9px] font-medium text-slate-600">Alternate Columns</label>
                                <button
                                    onClick={() => onUpdate({ gridConfig: { ...element.gridConfig!, alternateColumns: !element.gridConfig!.alternateColumns } })}
                                    className="flex-shrink-0 text-indigo-600 focus:outline-none"
                                >
                                    {element.gridConfig.alternateColumns ? <ToggleRight size={18} /> : <ToggleLeft size={18} className="text-slate-400" />}
                                </button>
                            </div>
                            {element.gridConfig.alternateColumns && (
                                <div className="flex gap-1 items-center">
                                    <input type="color" className="w-5 h-5 p-0 border-0 rounded cursor-pointer" value={element.gridConfig.alternateColumnFill || '#f1f5f9'}
                                        onInput={e => onUpdate({ gridConfig: { ...element.gridConfig!, alternateColumnFill: (e.target as HTMLInputElement).value } })} />
                                    <span className="text-[8px] text-slate-400 ml-1">Even column fill</span>
                                </div>
                            )}
                        </div>
                    </div>
                    </div>
                </CollapsibleSection>
            )}

            {/* Position */}
            <CollapsibleSection
                title="Geometry"
                variant="compact"
                testId="geometry-section"
                expanded={sectionExpanded.geometry}
                onToggle={() => onToggleSection('geometry')}
            >
                <div className="grid grid-cols-4 gap-2">
                    <SmartInput
                        label="X"
                        value={element.x}
                        onChange={v => onUpdate({ x: v })}
                        onNudge={d => onUpdate(prev => ({ x: (Number(prev.x) || 0) + d }))}
                    />
                    <SmartInput
                        label="Y"
                        value={element.y}
                        onChange={v => onUpdate({ y: v })}
                        onNudge={d => onUpdate(prev => ({ y: (Number(prev.y) || 0) + d }))}
                    />
                    <SmartInput
                        label="W"
                        value={element.w}
                        onChange={v => onUpdate({ w: v })}
                        onNudge={d => onUpdate(prev => ({ w: Math.max(1, (Number(prev.w) || 0) + d) }))}
                        min={1}
                    />
                    <SmartInput
                        label="H"
                        value={element.h}
                        onChange={v => onUpdate({ h: v })}
                        onNudge={d => onUpdate(prev => ({ h: Math.max(1, (Number(prev.h) || 0) + d) }))}
                        min={1}
                    />
                    <SmartInput
                        label="Rot"
                        value={element.rotation}
                        onChange={v => onUpdate({ rotation: v })}
                        onNudge={d => onUpdate(prev => ({ rotation: (Number(prev.rotation) || 0) + d }))}
                    />

                    <div className="col-span-2 flex items-end gap-1">
                        <SmartInput
                            label="Z-Index"
                            value={element.zIndex}
                            onChange={v => onUpdate({ zIndex: v })}
                            onNudge={d => onUpdate(prev => ({ zIndex: (Number(prev.zIndex) || 0) + d }))}
                            className="flex-1"
                        />
                        <div className="flex gap-0.5">
                            <button onClick={() => {
                                // console.log("DEBUG: Custom Up Clicked");
                                onUpdate(prev => ({ zIndex: (Number(prev.zIndex) || 0) + 1 }));
                            }} className="p-1 hover:bg-slate-100 rounded text-slate-600" title="Bring Forward"><ArrowUp size={14} /></button>
                            <button onClick={() => {
                                // console.log("DEBUG: Custom Down Clicked");
                                onUpdate(prev => ({ zIndex: (Number(prev.zIndex) || 0) - 1 }));
                            }} className="p-1 hover:bg-slate-100 rounded text-slate-600" title="Send Backward"><ArrowDown size={14} /></button>
                        </div>
                    </div>
                </div>
            </CollapsibleSection>

            {/* Appearance */}
            <CollapsibleSection
                title="Appearance"
                icon={Palette}
                variant="compact"
                testId="appearance-section"
                expanded={sectionExpanded.appearance}
                onToggle={() => onToggleSection('appearance')}
            >
                <div className="space-y-3">

                {/* Fill */}
                <div className="flex items-center gap-2">
                    <div className="w-16 text-xs text-slate-600">Fill</div>
                    <div className="flex-1 flex gap-1 items-center">
                        <div className="relative w-6 h-6">
                            <input
                                type="color"
                                className="w-6 h-6 p-0 border-0 rounded overflow-hidden cursor-pointer"
                                value={element.fill === 'Mixed' ? '#000000' : (element.fill || '#ffffff')} // Use black if mixed, or visually indicate mixed elsewhere

                                onInput={e => onUpdate({ fill: (e.target as HTMLInputElement).value })}
                            />
                            {(!element.fill || element.fill === 'Mixed') && element.fill !== 'Mixed' && (
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-white bg-opacity-50 rounded">
                                    <div className="w-4 h-0.5 bg-red-500 rotate-45" />
                                </div>
                            )}
                            {element.fill === 'Mixed' && <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-[8px]">?</div>}
                        </div>
                        <button
                            onClick={() => (element.fill && element.fill !== 'Mixed') && onUpdate({ fill: '' })}
                            className={`text-xs px-1 font-bold ${element.fill && element.fill !== 'Mixed' ? 'text-red-500 hover:text-red-700 cursor-pointer' : 'text-gray-300 cursor-default'}`}
                            title={element.fill ? 'Clear fill color' : 'No fill to clear'}
                        >
                            ✕
                        </button>
                        <select
                            className="flex-1 text-xs border rounded bg-white"
                            value={(element.fillType as string) === 'Mixed' ? '' : (element.fillType || 'solid')}
                            onChange={e => {
                                const newType = e.target.value as any;
                                const updates: Partial<TemplateElement> = { fillType: newType };
                                if (newType === 'pattern' && !element.patternType) {
                                    updates.patternType = 'lines-h';
                                }
                                onUpdate(updates);
                            }}
                        >
                            <option value="solid">Solid Color</option>
                            <option value="pattern">Pattern</option>
                            {(element.fillType as string) === 'Mixed' && <option value="" disabled>Mixed</option>}
                        </select>
                    </div>
                </div>
                {element.fillType === 'pattern' && (
                    <div className="ml-16 mt-2 space-y-2">
                        <select className="w-full text-xs border rounded bg-white py-1" value={element.patternType || 'lines-h'} onChange={e => onUpdate({ patternType: e.target.value as any })}>
                            <option value="lines-h">Horizontal Lines</option>
                            <option value="lines-v">Vertical Lines</option>
                            <option value="dots">Dots</option>
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                            <SmartInput
                                label="Gap"
                                value={element.patternSpacing}
                                onChange={v => onUpdate({ patternSpacing: v })}
                                onNudge={d => onUpdate(prev => ({ patternSpacing: Math.max(1, (Number(prev.patternSpacing) || 10) + d) }))}
                                min={1}
                            />
                            <SmartInput
                                label="Weight"
                                value={element.patternWeight}
                                onChange={v => onUpdate({ patternWeight: v })}
                                onNudge={d => onUpdate(prev => ({ patternWeight: Math.max(0.1, (Number(prev.patternWeight) || 1) + (d * 0.1)) }))}
                                step={0.1}
                                min={0.1}
                            />
                        </div>
                    </div>
                )}

                {/* Stroke */}
                <div className="flex items-center gap-2">
                    <div className="w-16 text-xs text-slate-600">Stroke</div>
                    <div className="flex-1 flex gap-1 items-center">
                        <div className="relative w-6 h-6">
                            <input
                                type="color"
                                className="w-6 h-6 p-0 border-0 rounded overflow-hidden cursor-pointer"
                                value={element.stroke === 'Mixed' ? '#000000' : (element.stroke || '#000000')}

                                onInput={e => onUpdate({ stroke: (e.target as HTMLInputElement).value })}
                            />
                            {(!element.stroke || element.stroke === 'Mixed') && element.stroke !== 'Mixed' && (
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-white bg-opacity-50 rounded">
                                    <div className="w-4 h-0.5 bg-red-500 rotate-45" />
                                </div>
                            )}
                            {element.stroke === 'Mixed' && <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-[8px]">?</div>}
                        </div>
                        <button
                            onClick={() => (element.stroke && element.stroke !== 'Mixed') && onUpdate({ stroke: '' })}
                            className={`text-xs px-1 font-bold ${element.stroke && element.stroke !== 'Mixed' ? 'text-red-500 hover:text-red-700 cursor-pointer' : 'text-gray-300 cursor-default'}`}
                            title={element.stroke ? 'Clear stroke color' : 'No stroke to clear'}
                        >
                            ✕
                        </button>
                        <input type="number" min="0" className="w-12 border rounded px-1 text-xs" placeholder="W" value={safeVal(element.strokeWidth)}
                            onChange={e => {
                                const val = Number(e.target.value);
                                const updates: Partial<TemplateElement> = { strokeWidth: val };
                                if (val > 0 && (!element.borderStyle || element.borderStyle === 'none')) {
                                    updates.borderStyle = 'solid';
                                }
                                onUpdate(updates);
                            }}
                        />
                        <select className="w-20 text-xs border rounded bg-white" value={element.borderStyle || 'solid'} onChange={e => onUpdate({ borderStyle: e.target.value as any })}>
                            {BORDER_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                </div>

                {/* Per-Side Borders (for rect, text, grid) */}
                {(element.type === 'rect' || element.type === 'text' || element.type === 'grid') && (
                    <div className="mt-1">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[10px] text-slate-500 font-medium">Per-Side Borders</div>
                            {!element.borderSides && (
                                <button
                                    onClick={() => {
                                        const def = { width: element.strokeWidth || 1, color: element.stroke || '#000000', style: (element.borderStyle || 'solid') as any };
                                        onUpdate({ borderSides: { top: { ...def }, right: { ...def }, bottom: { ...def }, left: { ...def } } });
                                    }}
                                    className="text-[9px] text-indigo-600 hover:underline"
                                >Customize</button>
                            )}
                            {element.borderSides && (
                                <button
                                    onClick={() => onUpdate({ borderSides: undefined as any })}
                                    className="text-[9px] text-red-500 hover:underline"
                                >Reset to uniform</button>
                            )}
                        </div>
                        {element.borderSides && (
                            <div className="space-y-1">
                                {(['top', 'right', 'bottom', 'left'] as const).map(side => {
                                    const sideConfig = element.borderSides?.[side];
                                    const icons = { top: <PanelTop size={12} />, right: <PanelRight size={12} />, bottom: <PanelBottom size={12} />, left: <PanelLeft size={12} /> };
                                    const label = side.charAt(0).toUpperCase();
                                    return (
                                        <div key={side} className="flex items-center gap-1">
                                            <button
                                                onClick={() => {
                                                    const currentSides = { ...element.borderSides! };
                                                    if (sideConfig) {
                                                        delete currentSides[side];
                                                    } else {
                                                        currentSides[side] = { width: element.strokeWidth || 1, color: element.stroke || '#000000', style: (element.borderStyle || 'solid') as any };
                                                    }
                                                    onUpdate({ borderSides: currentSides });
                                                }}
                                                className={clsx(
                                                    'p-0.5 rounded border flex-shrink-0',
                                                    sideConfig ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-400'
                                                )}
                                                title={`${side} border`}
                                            >
                                                {icons[side]}
                                            </button>
                                            {sideConfig && (
                                                <>
                                                    <input type="color" className="w-4 h-4 p-0 border-0 rounded cursor-pointer flex-shrink-0" value={sideConfig.color}
                                                        onInput={e => {
                                                            const updated = { ...element.borderSides!, [side]: { ...sideConfig, color: (e.target as HTMLInputElement).value } };
                                                            onUpdate({ borderSides: updated });
                                                        }} />
                                                    <input type="number" min="0" step="1" className="w-10 border rounded px-0.5 text-[10px] text-center" value={sideConfig.width}
                                                        onChange={e => {
                                                            const updated = { ...element.borderSides!, [side]: { ...sideConfig, width: Math.max(0, Number(e.target.value)) } };
                                                            onUpdate({ borderSides: updated });
                                                        }} />
                                                    <select className="flex-1 text-[10px] border rounded bg-white px-0.5" value={sideConfig.style}
                                                        onChange={e => {
                                                            const updated = { ...element.borderSides!, [side]: { ...sideConfig, style: e.target.value as any } };
                                                            onUpdate({ borderSides: updated });
                                                        }}>
                                                        {BORDER_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                                    </select>
                                                </>
                                            )}
                                            {!sideConfig && <span className="text-[9px] text-slate-400 italic ml-1">{label} — none</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Opacity & Radius */}
                <div className="flex gap-2">
                    <div className="flex-1">
                        <label className="text-[10px] text-slate-400">Opacity</label>
                        <input type="range" min="0" max="1" step="0.1" className="w-full" value={(element.opacity as unknown as string) === 'Mixed' ? 1 : (element.opacity ?? 1)} onChange={e => onUpdate({ opacity: parseFloat(e.target.value) })} />
                    </div>
                    <div className="w-16">
                        <label className="text-[10px] text-slate-400">Radius</label>
                        <input type="number" min="0" className="w-full border rounded px-1 text-xs" value={element.borderRadius || 0} onChange={e => onUpdate({ borderRadius: parseInt(e.target.value) })} />
                    </div>
                </div>
                </div>
            </CollapsibleSection>

            {/* Typography */}
            {(element.type === 'text' || element.type === 'grid' || element.text || element.dataBinding) && (
                <CollapsibleSection
                    title="Typography"
                    icon={Type}
                    variant="compact"
                    testId="typography-section"
                    expanded={sectionExpanded.typography}
                    onToggle={() => onToggleSection('typography')}
                >
                    <div className="space-y-3">

                    {selectionIsTextOnly && (
                        <div className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5">
                            <input
                                ref={setAutoWidthCheckboxRef}
                                id={`${textOverflowControlId}-auto-width`}
                                type="checkbox"
                                checked={autoWidthSelection === true}
                                aria-checked={autoWidthSelection === 'mixed' ? 'mixed' : autoWidthSelection}
                                onChange={handleAutoWidthToggle}
                            />
                            <label
                                htmlFor={`${textOverflowControlId}-auto-width`}
                                className="text-xs text-slate-600"
                            >
                                Auto width
                            </label>
                        </div>
                    )}

                    {element.type !== 'grid' && (
                        <div>
                            <textarea
                                ref={setTextAreaRef}
                                className="w-full border rounded px-2 py-1 text-sm min-h-[60px]"
                                placeholder="Text content or {{field}}"
                                value={element.text || (element.dataBinding ? `{{${element.dataBinding}}}` : '')}
                                onChange={e => {
                                    const val = e.target.value;
                                    let updates: any = {};
                                    if (val.startsWith('{{') && val.endsWith('}}')) {
                                        updates = { text: '', dataBinding: val.slice(2, -2) };
                                    } else {
                                        updates = { text: val, dataBinding: '' };
                                    }

                                    if (element.type === 'text' && element.autoWidth) {
                                        const nextElement = { ...element, ...updates } as TemplateElement;
                                        const previewText = resolveElementPreviewText(nextElement, activeNode, state.nodes);
                                        const measurement = measureAutoWidthText(previewText, nextElement);
                                        if (measurement) Object.assign(updates, measurement);
                                    }
                                    onUpdate(updates);
                                }}
                            />

                            {/* Available Fields Helper */}
                            {availableFields.length > 0 && (
                                <div className="mt-2">
                                    <label className="text-[9px] text-slate-400 mb-1 block">Insert Data Field:</label>
                                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                        {availableFields.map(f => (
                                            <button
                                                key={f}
                                                onClick={() => insertText(`{{${f}}}`)}
                                                className="text-[9px] bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 px-1.5 py-0.5 rounded border border-slate-200 transition-colors flex items-center gap-0.5"
                                                title={`Insert {{${f}}}`}
                                            >
                                                <Plus size={8} /> {f}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-2">
                                <button onClick={() => setShowRefBuilder(!showRefBuilder)} className="text-[9px] text-indigo-600 hover:underline flex items-center gap-1">
                                    <Network size={8} /> Insert Referrer Field...
                                </button>
                                {showRefBuilder && renderRefBuilder()}
                            </div>

                            <div className="flex justify-end mt-1">
                                <button className="text-[10px] text-blue-500 flex items-center gap-1 hover:underline" onClick={() => onUpdate({ text: '', dataBinding: 'title' })}>
                                    Reset to Title
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2 relative">
                            <button
                                type="button"
                                className="w-full border rounded px-2 py-2 text-sm bg-white text-left flex justify-between items-center hover:bg-slate-50"
                                style={{ fontFamily: getFontFamily(element.fontFamily || 'helvetica') }}
                                onClick={() => setShowFontPicker(!showFontPicker)}
                            >
                                {FONTS.find(f => f.value === (element.fontFamily || 'helvetica'))?.label || 'Helvetica'}
                                <span className="text-slate-400 text-xs">▼</span>
                            </button>
                            {showFontPicker && (
                                <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-lg">
                                    <input
                                        type="text"
                                        className="w-full px-2 py-1.5 border-b text-sm focus:outline-none"
                                        placeholder="Search fonts..."
                                        value={fontSearch}
                                        onChange={e => setFontSearch(e.target.value)}
                                    />
                                    <div className="max-h-56 overflow-y-auto">
                                        {[...FONTS]
                                            .sort((a, b) => a.label.localeCompare(b.label))
                                            .filter(f => f.label.toLowerCase().includes(fontSearch.toLowerCase()))
                                            .map(f => (
                                                <button
                                                    key={f.value}
                                                    type="button"
                                                    className={clsx(
                                                        "w-full px-2 py-1.5 text-left text-sm hover:bg-blue-50",
                                                        element.fontFamily === f.value && "bg-blue-100"
                                                    )}
                                                    style={{ fontFamily: getFontFamily(f.value) }}
                                                    onClick={() => {
                                                        localStorage.setItem('doctect_last_fontFamily', f.value);
                                                        onUpdate({ fontFamily: f.value });
                                                        setShowFontPicker(false);
                                                        setFontSearch('');
                                                    }}
                                                >
                                                    {f.label}
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1 border rounded px-1">
                            <input type="number" className="w-full border-none text-xs focus:ring-0" value={element.fontSize || 12} onChange={e => { localStorage.setItem('doctect_last_fontSize', e.target.value); onUpdate({ fontSize: parseInt(e.target.value) }); }} />
                            <span className="text-[10px] text-slate-400">px</span>
                        </div>
                        <input type="color" className="w-full h-7 p-0 border rounded" value={element.textColor || '#000000'} onChange={e => { localStorage.setItem('doctect_last_textColor', e.target.value); onUpdate({ textColor: e.target.value }); }} />
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex bg-slate-100 rounded p-1 gap-1 justify-between">
                            <div className="flex gap-1">
                                <button onClick={() => { const newWeight = element.fontWeight === 'bold' ? 'normal' : 'bold'; localStorage.setItem('doctect_last_fontWeight', newWeight); onUpdate({ fontWeight: newWeight }); }} className={clsx("p-1 rounded", element.fontWeight === 'bold' && "bg-white shadow-sm text-blue-600")}><Bold size={12} /></button>
                                <button onClick={() => { const newStyle = element.fontStyle === 'italic' ? 'normal' : 'italic'; localStorage.setItem('doctect_last_fontStyle', newStyle); onUpdate({ fontStyle: newStyle }); }} className={clsx("p-1 rounded", element.fontStyle === 'italic' && "bg-white shadow-sm text-blue-600")}><Italic size={12} /></button>
                                <button onClick={() => { const newDeco = element.textDecoration === 'underline' ? 'none' : 'underline'; localStorage.setItem('doctect_last_textDecoration', newDeco); onUpdate({ textDecoration: newDeco }); }} className={clsx("p-1 rounded", element.textDecoration === 'underline' && "bg-white shadow-sm text-blue-600")}><Underline size={12} /></button>
                            </div>
                        </div>
                        {textOverflowSettings && (
                            <div className="space-y-2 rounded border border-slate-200 p-2">
                                <div>
                                    <label
                                        htmlFor={`${textOverflowControlId}-mode`}
                                        className="text-[10px] text-slate-500 block mb-1"
                                    >
                                        {element.type === 'grid' ? 'Cell text overflow' : 'Overflow'}
                                    </label>
                                    <select
                                        id={`${textOverflowControlId}-mode`}
                                        className="w-full border rounded px-2 py-1 text-xs bg-white disabled:bg-slate-100 disabled:text-slate-400"
                                        value={textOverflowSettings.textOverflow}
                                        disabled={textOverflowControlsDisabled}
                                        onChange={e => onUpdate({ textOverflow: e.target.value as TextOverflow })}
                                    >
                                        <option value="clip">Clip</option>
                                        <option value="ellipsis">Ellipsis</option>
                                        <option value="shrink">Shrink</option>
                                        <option value="visible">Visible</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        id={`${textOverflowControlId}-wrap`}
                                        type="checkbox"
                                        checked={textOverflowSettings.textWrap}
                                        disabled={textOverflowControlsDisabled}
                                        onChange={e => onUpdate({ textWrap: e.target.checked })}
                                    />
                                    <label
                                        htmlFor={`${textOverflowControlId}-wrap`}
                                        className="text-xs text-slate-600"
                                    >
                                        {element.type === 'grid' ? 'Wrap cell text' : 'Wrap'}
                                    </label>
                                </div>
                                {textOverflowControlsDisabled && (
                                    <p className="text-[10px] leading-snug text-slate-500">
                                        Auto-width text sizes to content; overflow and wrap apply only to fixed-size text.
                                    </p>
                                )}
                            </div>
                        )}
                        <div className="flex bg-slate-100 rounded p-1 gap-1 justify-between">
                            <div className="flex gap-1">
                                <button onClick={() => { localStorage.setItem('doctect_last_align', 'left'); onUpdate({ align: 'left' }); }} className={clsx("p-1 rounded", element.align === 'left' && "bg-white shadow-sm text-blue-600")} title="Align Left"><AlignLeft size={12} /></button>
                                <button onClick={() => { localStorage.setItem('doctect_last_align', 'center'); onUpdate({ align: 'center' }); }} className={clsx("p-1 rounded", (element.align === 'center' || !element.align) && "bg-white shadow-sm text-blue-600")} title="Align Center"><AlignCenter size={12} /></button>
                                <button onClick={() => { localStorage.setItem('doctect_last_align', 'right'); onUpdate({ align: 'right' }); }} className={clsx("p-1 rounded", element.align === 'right' && "bg-white shadow-sm text-blue-600")} title="Align Right"><AlignRight size={12} /></button>
                            </div>
                            <div className="w-px bg-slate-300 mx-1"></div>
                            <div className="flex gap-1">
                                <button onClick={() => onUpdate({ verticalAlign: 'top' })} className={clsx("p-1 rounded", element.verticalAlign === 'top' && "bg-white shadow-sm text-blue-600")} title="Align Top"><AlignStartVertical size={12} /></button>
                                <button onClick={() => onUpdate({ verticalAlign: 'middle' })} className={clsx("p-1 rounded", (element.verticalAlign === 'middle' || !element.verticalAlign) && "bg-white shadow-sm text-blue-600")} title="Align Middle"><AlignCenterVertical size={12} /></button>
                                <button onClick={() => onUpdate({ verticalAlign: 'bottom' })} className={clsx("p-1 rounded", element.verticalAlign === 'bottom' && "bg-white shadow-sm text-blue-600")} title="Align Bottom"><AlignEndVertical size={12} /></button>
                            </div>
                        </div>
                    </div>
                    </div>
                </CollapsibleSection>
            )}

            {element.type === 'svg' && state.selectedElementIds.length === 1 && (
                <SvgSourceSection
                    svgContent={element.svgContent || ''}
                    expanded={sectionExpanded.svgSource}
                    onToggle={() => onToggleSection('svgSource')}
                    onCommit={(svg, saveHistory) => onUpdate({ svgContent: svg }, saveHistory)}
                />
            )}

            {/* Links / Interactions */}
            <CollapsibleSection
                title="Interaction"
                icon={MousePointer2}
                variant="compact"
                testId="interaction-section"
                expanded={sectionExpanded.interaction}
                onToggle={() => onToggleSection('interaction')}
            >
                <div className="space-y-3">

                <div>
                    <label className="text-[10px] text-slate-400">On Click</label>
                    <select className="w-full border rounded px-2 py-1 text-xs bg-white mt-1" value={element.linkTarget || 'none'} onChange={e => onUpdate({ linkTarget: e.target.value as any })}>
                        <option value="none">None</option>
                        <option value="parent">Go to Parent Page</option>
                        <option value="child_index">Go to Child (by Index)</option>
                        <option value="sibling">Go to Sibling (Offset)</option>
                        <option value="ancestor">Go to Ancestor (Level)</option>
                        <option value="referrer">Go to Referrer (Backlink)</option>
                        <option value="specific_node">Go to Specific Page</option>
                        <option value="child_referrer">Go to Child's Referrer</option>
                        <option value="url">Open URL</option>
                    </select>
                </div>

                {element.linkTarget === 'child_index' && (
                    <ChildIndexSelector
                        label="Target Child"
                        value={element.linkValue}
                        onChange={val => onUpdate({ linkValue: val })}
                        activeNode={activeNode}
                        nodes={state.nodes}
                    />
                )}

                {element.linkTarget === 'sibling' && (
                    <div>
                        <label className="text-[10px] text-slate-400">Offset (+1 Next, -1 Prev)</label>
                        <input type="number" className="w-full border rounded px-2 py-1 text-xs" value={element.linkValue || ''} placeholder="e.g. 1" onChange={e => onUpdate({ linkValue: e.target.value })} />
                    </div>
                )}

                {element.linkTarget === 'ancestor' && (
                    <div>
                        <label className="text-[10px] text-slate-400">Levels Up (1 = Parent, 2 = Grandparent)</label>
                        <input type="number" min="1" className="w-full border rounded px-2 py-1 text-xs" value={element.linkValue || ''} placeholder="e.g. 2" onChange={e => onUpdate({ linkValue: e.target.value })} />
                    </div>
                )}

                {element.linkTarget === 'url' && (
                    <div>
                        <label className="text-[10px] text-slate-400">URL</label>
                        <input type="text" className="w-full border rounded px-2 py-1 text-xs" value={element.linkValue || ''} onChange={e => onUpdate({ linkValue: e.target.value })} />
                    </div>
                )}

                {element.linkTarget === 'specific_node' && (
                    <button onClick={() => onOpenNodeSelector('link_element')} className="w-full text-xs bg-white border border-dashed rounded p-2 text-left flex items-center justify-between hover:bg-slate-50">
                        <span className="truncate text-slate-600">{element.linkValue ? (state.nodes[element.linkValue]?.title || 'Unknown') : 'Select Target Page...'}</span>
                        <ArrowLeft size={10} className="text-slate-400" />
                    </button>
                )}

                {element.linkTarget === 'child_referrer' && (
                    <div className="space-y-2">
                        <SmartValueInput
                            label="Start Index"
                            value={element.linkValue || "0"}
                            onChange={val => onUpdate({ linkValue: val })}
                            availableFields={availableFields}
                        />
                        <SmartValueInput
                            label="Count / Direction"
                            value={element.linkSecondaryValue || "1"}
                            onChange={val => onUpdate({ linkSecondaryValue: val })}
                            availableFields={availableFields}
                            placeholder="1, 7, -1..."
                        />
                        <div>
                            <label className="text-[10px] text-slate-400">Filter by Parent Template (Optional)</label>
                            <select className="w-full border rounded px-2 py-1 text-xs bg-white" value={element.linkReferrerParentType || ''} onChange={e => onUpdate({ linkReferrerParentType: e.target.value })}>
                                <option value="">Any Template</option>
                                {Object.values(state.variants[state.activeVariantId]?.templates || {}).map((t: any) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
                </div>
            </CollapsibleSection>
        </div>
    );
};
