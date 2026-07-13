export const DEFAULT_TEXT_FONT_SIZE = 12;

export const resolveTextFontSize = (fontSize: unknown): number =>
    fontSize === undefined ? DEFAULT_TEXT_FONT_SIZE : Number(fontSize);

export const hasVisibleTextFontSize = (fontSize: unknown): boolean => {
    const resolved = resolveTextFontSize(fontSize);
    return Number.isFinite(resolved) && resolved > 0;
};

export const isVisibleText = (text: unknown, fontSize: unknown): boolean =>
    String(text ?? '').trim().length > 0 && hasVisibleTextFontSize(fontSize);
