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
        let active = true;
        let initialReadinessHandled = false;
        const refreshLayout = () => {
            if (!active) return;
            session.clear();
            rerender();
        };
        const handleFontsLoaded = () => {
            initialReadinessHandled = true;
            refreshLayout();
        };
        fonts?.addEventListener('loadingdone', handleFontsLoaded);
        void fonts?.ready?.then(() => {
            if (initialReadinessHandled) return;
            initialReadinessHandled = true;
            refreshLayout();
        });

        return () => {
            active = false;
            fonts?.removeEventListener('loadingdone', handleFontsLoaded);
            session.clear();
        };
    }, [injectedSession, session]);

    return session;
}
