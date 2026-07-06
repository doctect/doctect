import React, { useRef, useState } from 'react';
import { Star } from 'lucide-react';

const Stars = ({ size }: { size: number }) => (
    <>
        {[0, 1, 2, 3, 4].map(i => (
            <Star key={i} size={size} fill="currentColor" strokeWidth={0} className="shrink-0" />
        ))}
    </>
);

export function StarRating({ value, count, size = 14 }: { value: number | null; count?: number; size?: number }) {
    if (value == null) return <span className="text-xs text-slate-400">No ratings yet</span>;
    return (
        <span className="inline-flex items-center gap-1" aria-label={`Rated ${value} out of 5`}>
            <span className="relative inline-block leading-none">
                <span className="flex text-slate-300"><Stars size={size} /></span>
                <span data-testid="star-fill"
                    className="absolute inset-y-0 left-0 flex overflow-hidden text-amber-400"
                    style={{ width: `${(Math.max(0, Math.min(5, value)) / 5) * 100}%` }}>
                    <Stars size={size} />
                </span>
            </span>
            <span className="text-xs text-slate-500">
                {value.toFixed(1)}{count !== undefined ? ` (${count})` : ''}
            </span>
        </span>
    );
}

export function StarRatingInput({ value, onChange, size = 20 }: { value: number; onChange: (v: number) => void; size?: number }) {
    const [hover, setHover] = useState(0);
    const shown = hover || value;
    const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
    const select = (n: number) => {
        onChange(n);
        buttonsRef.current[n - 1]?.focus();
    };
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            select(Math.min(5, (value || 0) + 1));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            select(Math.max(1, (value || 1) - 1));
        }
    };
    const tabbable = value >= 1 && value <= 5 ? value : 1;
    return (
        <div role="radiogroup" aria-label="Rating" className="flex gap-0.5" onKeyDown={handleKeyDown}>
            {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" role="radio" aria-checked={value === n}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    tabIndex={n === tabbable ? 0 : -1}
                    ref={el => { buttonsRef.current[n - 1] = el; }}
                    onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                    onClick={() => onChange(n)}
                    className={`transition-colors ${n <= shown ? 'text-amber-400' : 'text-slate-300'}`}>
                    <Star size={size} fill="currentColor" strokeWidth={0} />
                </button>
            ))}
        </div>
    );
}
