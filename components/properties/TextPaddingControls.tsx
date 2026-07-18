import React from 'react';
import { TEXT_PADDING_SIDES, type TextPaddingSide } from '../../services/textPadding';

export type TextPaddingSelection = Record<TextPaddingSide, number | 'mixed'>;

interface TextPaddingControlsProps {
    values: TextPaddingSelection;
    disabled: boolean;
    selectionKey: string;
    onCommit: (side: TextPaddingSide, value: number, linked: boolean) => void;
}

const LABELS: Record<TextPaddingSide, string> = {
    top: 'Top',
    right: 'Right',
    bottom: 'Bottom',
    left: 'Left',
};

export const TextPaddingControls: React.FC<TextPaddingControlsProps> = ({
    values,
    disabled,
    selectionKey,
    onCommit,
}) => {
    const [linked, setLinked] = React.useState(true);
    const [drafts, setDrafts] = React.useState<Partial<Record<TextPaddingSide, string>>>({});

    React.useEffect(() => {
        setLinked(true);
        setDrafts({});
    }, [selectionKey]);

    const clearDraft = (side: TextPaddingSide) => {
        setDrafts(current => {
            const next = { ...current };
            delete next[side];
            return next;
        });
    };

    return (
        <div className="space-y-2 rounded border border-slate-200 p-2" data-testid="text-padding-controls">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-500">Padding</span>
                <label className="flex items-center gap-1 text-[10px] text-slate-500">
                    <input
                        type="checkbox"
                        aria-label="Link padding sides"
                        checked={linked}
                        disabled={disabled}
                        onChange={event => setLinked(event.target.checked)}
                    />
                    Linked
                </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {TEXT_PADDING_SIDES.map(side => {
                    const value = Object.hasOwn(drafts, side)
                        ? drafts[side]!
                        : values[side] === 'mixed' ? '' : String(values[side]);
                    return (
                        <label key={side} className="text-[10px] text-slate-400">
                            {LABELS[side]}
                            <input
                                type="number"
                                min="0"
                                step="any"
                                aria-label={`Padding ${side}`}
                                className="mt-0.5 w-full rounded border px-1 py-1 text-xs disabled:bg-slate-100 disabled:text-slate-400"
                                value={value}
                                placeholder={values[side] === 'mixed' ? 'Mixed' : undefined}
                                disabled={disabled}
                                onChange={event => {
                                    const raw = event.target.value;
                                    setDrafts(current => ({ ...current, [side]: raw }));
                                    if (raw.trim() === '') return;
                                    const parsed = Number(raw);
                                    if (Number.isFinite(parsed)) onCommit(side, Math.max(0, parsed), linked);
                                }}
                                onBlur={() => clearDraft(side)}
                            />
                        </label>
                    );
                })}
            </div>
            {disabled && (
                <p className="text-[10px] leading-snug text-slate-500">
                    Padding applies only to fixed-size text.
                </p>
            )}
        </div>
    );
};
