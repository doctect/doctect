
import React, { useEffect, useRef, useState } from 'react';
import { TemplateElement } from '../../types';

// Duplicate font map to ensure consistency without refactoring risk
const FONT_FAMILY_MAP: Record<string, string> = {
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

const getFontFamily = (font: string) => FONT_FAMILY_MAP[font] || font;

interface OverlayTextEditorProps {
    element: TemplateElement;
    onChange: (id: string, updates: Partial<TemplateElement>) => void;
    onFinish: () => void;
    onSwitchToSelect?: () => void;
}

export const OverlayTextEditor: React.FC<OverlayTextEditorProps> = ({ element, onChange, onFinish, onSwitchToSelect }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [initialText] = useState(element.text || '');

    // Universal Scroll Lock Refs
    const lockedScrollsRef = useRef<Map<HTMLElement | Window, { left: number, top: number }>>(new Map());
    const lockBufferRef = useRef<NodeJS.Timeout | null>(null);

    // Universal Capture Listener
    useEffect(() => {
        const onScrollCapture = (e: Event) => {
            if (lockedScrollsRef.current.size > 0) {
                const target = e.target as HTMLElement | Document;
                const el = target instanceof Document ? window : target as HTMLElement;

                if (lockedScrollsRef.current.has(el)) {
                    const saved = lockedScrollsRef.current.get(el);
                    if (saved) {
                        const currentLeft = el === window ? window.scrollX : (el as HTMLElement).scrollLeft;
                        const currentTop = el === window ? window.scrollY : (el as HTMLElement).scrollTop;

                        if (Math.abs(currentLeft - saved.left) > 0 || Math.abs(currentTop - saved.top) > 0) {
                            // Revert!
                            if (el === window) {
                                window.scrollTo(saved.left, saved.top);
                            } else {
                                (el as HTMLElement).scrollLeft = saved.left;
                                (el as HTMLElement).scrollTop = saved.top;
                            }
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }
                }
            }
        };

        window.addEventListener('scroll', onScrollCapture, { capture: true, passive: false });
        return () => window.removeEventListener('scroll', onScrollCapture, { capture: true });
    }, []);

    const captureScrolls = () => {
        lockedScrollsRef.current.clear();
        let curr = editorRef.current?.parentElement;
        while (curr) {
            if (curr.scrollHeight > curr.clientHeight || curr.scrollWidth > curr.clientWidth) {
                lockedScrollsRef.current.set(curr, { left: curr.scrollLeft, top: curr.scrollTop });
            }
            curr = curr.parentElement;
        }
        // Always lock window too
        lockedScrollsRef.current.set(window, { left: window.scrollX, top: window.scrollY });
    };

    // Auto-focus on mount
    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.focus({ preventScroll: true });

            // Set cursor to end
            const range = document.createRange();
            range.selectNodeContents(editorRef.current);
            range.collapse(false);
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    }, []);

    // Cleanup: Clear selection on unmount to prevent ghost cursor
    useEffect(() => {
        return () => {
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
            }
        };
    }, []);

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        // Activate Lock
        captureScrolls();

        if (lockBufferRef.current) clearTimeout(lockBufferRef.current);
        lockBufferRef.current = setTimeout(() => {
            lockedScrollsRef.current.clear();
        }, 150); // Lock for 150ms

        const val = e.currentTarget.innerText;
        const updates: Partial<TemplateElement> = { text: val };

        if (element.autoWidth && editorRef.current) {
            const w = editorRef.current.offsetWidth;
            const h = editorRef.current.offsetHeight;
            updates.w = Math.ceil(w + 25);
            updates.h = Math.max(20, Math.ceil(h));
        }

        onChange(element.id, updates);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
            onFinish();
            onSwitchToSelect?.();
        }
    };

    const handleBlur = (e: React.FocusEvent) => {
        if (e.relatedTarget instanceof Element && e.relatedTarget.closest('[data-prevent-finish-edit]')) {
            return;
        }
        onFinish();
    };

    const fontFamily = getFontFamily(element.fontFamily || 'helvetica');

    return (
        <div
            style={{
                position: 'absolute',
                left: element.x,
                top: element.y,
                width: element.w,
                height: element.h,
                transform: `rotate(${element.rotation || 0}deg)`,
                zIndex: 1000,
                // Match CanvasElement Flex Layout
                display: 'flex',
                justifyContent: element.align === 'center' ? 'center' : element.align === 'right' ? 'flex-end' : 'flex-start',
                alignItems: element.verticalAlign === 'top' ? 'flex-start' : element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                // Explicitly allow visible overflow
                overflow: 'visible',
                // Match Font Styles
                fontFamily: fontFamily,
                fontSize: element.fontSize,
                lineHeight: 1.2, // Match CanvasElement line-height
                fontWeight: element.fontWeight,
                fontStyle: element.fontStyle,
                textDecoration: element.textDecoration,
                textDecorationColor: element.textColor,
                color: element.textColor,
                // Cursor interaction
                cursor: 'text',
                pointerEvents: 'auto',
                // Outline to indicate editing state
                outline: '1px solid #3b82f6',
                // MATCHING CanvasElement: NO Padding
                padding: 0,
                caretColor: '#000000'
            }}
            onClick={() => editorRef.current?.focus()}
        >
            <div
                ref={editorRef}
                data-testid="overlay-text-editor"
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                style={{
                    outline: 'none',
                    minWidth: '1px',
                    // EXACT MATCH to CanvasElement whiteSpace logic to prevent jump
                    whiteSpace: element.autoWidth ? 'pre' : 'pre-wrap',
                    maxWidth: element.autoWidth ? 'none' : '100%',
                    textAlign: element.align || 'left',
                    // Removed lineHeight to match CanvasElement (inherits default)
                }}
            >
                {initialText}
            </div>
        </div>
    );
};
