import React, { useEffect, useRef, useState } from 'react';
import { FileCode } from 'lucide-react';
import clsx from 'clsx';
import { CollapsibleSection } from '../CollapsibleSection';
import { validateSvgMarkup } from '../../services/svgEditing';

const DEBOUNCE_MS = 400;
const SIZE_WARN_CHARS = 100000; // mirrors the import warning threshold in ProjectEditor

interface SvgSourceSectionProps {
    svgContent: string;
    // saveHistory=true only on the first commit of an edit burst (one focus
    // session = one undo step, however many debounced commits it produces).
    onCommit: (svg: string, saveHistory: boolean) => void;
}

export const SvgSourceSection: React.FC<SvgSourceSectionProps> = ({ svgContent, onCommit }) => {
    const [expanded, setExpanded] = useState(true);
    const [draft, setDraft] = useState(svgContent);
    const [error, setError] = useState<string | null>(null);
    const lastCommittedRef = useRef(svgContent);
    const historySavedRef = useRef(false);
    const timerRef = useRef<number | null>(null);

    // Re-seed only on EXTERNAL svgContent changes (undo/redo/restore) — our own
    // commits update lastCommittedRef first, so they don't clobber the draft.
    useEffect(() => {
        if (svgContent !== lastCommittedRef.current) {
            lastCommittedRef.current = svgContent;
            setDraft(svgContent);
            setError(null);
        }
    }, [svgContent]);

    useEffect(() => () => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    }, []);

    const handleChange = (text: string) => {
        setDraft(text);
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            const result = validateSvgMarkup(text);
            if (!result.ok) {
                setError('Invalid SVG — canvas shows last valid version');
                return;
            }
            setError(null);
            if (text === lastCommittedRef.current) return;
            lastCommittedRef.current = text;
            onCommit(text, !historySavedRef.current);
            historySavedRef.current = true;
        }, DEBOUNCE_MS);
    };

    const sizeKb = (draft.length / 1024).toFixed(1);

    return (
        <CollapsibleSection
            title="SVG Source"
            icon={FileCode}
            testId="svg-source-section"
            expanded={expanded}
            onToggle={() => setExpanded(v => !v)}
        >
            <div className="px-4 pb-4 space-y-2">
                <textarea
                    data-testid="svg-source-textarea"
                    className="w-full border rounded px-2 py-1 text-[11px] font-mono resize-y bg-white"
                    rows={10}
                    spellCheck={false}
                    value={draft}
                    // Burst flag resets only on focus: a commit that lands after
                    // blur still belongs to the old session (saveHistory=false).
                    onFocus={() => { historySavedRef.current = false; }}
                    onChange={e => handleChange(e.target.value)}
                />
                {error && <div className="text-[11px] text-red-600">{error}</div>}
                <div
                    data-testid="svg-source-size"
                    className={clsx('text-[10px]', draft.length > SIZE_WARN_CHARS ? 'text-amber-600 font-semibold' : 'text-slate-400')}
                >
                    {sizeKb} KB{draft.length > SIZE_WARN_CHARS ? ' — large SVGs increase project file size' : ''}
                </div>
            </div>
        </CollapsibleSection>
    );
};
