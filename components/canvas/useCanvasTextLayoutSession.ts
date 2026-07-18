import { useEffect, useReducer, useRef } from 'react';
import {
    createCanvasTextLayoutSession,
    type CanvasTextLayoutSession,
} from '../../services/canvasTextLayout';

export function useCanvasTextLayoutSession(
    injectedSession?: CanvasTextLayoutSession,
): CanvasTextLayoutSession {
    const ownedSessionRef = useRef<CanvasTextLayoutSession | null>(null);
    const [, rerender] = useReducer((version: number) => version + 1, 0);

    if (!injectedSession && !ownedSessionRef.current) {
        ownedSessionRef.current = createCanvasTextLayoutSession();
    }
    const session = injectedSession ?? ownedSessionRef.current!;

    useEffect(() => {
        if (injectedSession) return;

        const fonts = typeof document === 'undefined' ? undefined : document.fonts;
        const handleFontsLoaded = () => {
            session.clear();
            rerender();
        };
        fonts?.addEventListener('loadingdone', handleFontsLoaded);

        return () => {
            fonts?.removeEventListener('loadingdone', handleFontsLoaded);
            session.clear();
        };
    }, [injectedSession, session]);

    return session;
}
