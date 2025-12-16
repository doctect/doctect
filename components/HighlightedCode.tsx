import React from 'react';

const tokenize = (code: string) => {
    // Strict safety check
    if (code === undefined || code === null) return [];
    if (typeof code !== 'string') {
        return [{ type: 'text', value: String(code || '') }];
    }
    
    const tokens: { type: string, value: string }[] = [];
    const regex = /(".*?"|'.*?'|\/\/.*$|\/\*[\s\S]*?\*\/|\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|this|import|from|try|catch|throw|typeof|in|of)\b|\b(true|false|null|undefined)\b|\b\d+(\.\d+)?\b|\b[A-Z][a-zA-Z0-9_$]*\b|\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\()|[(){}\[\],.;:]|[^\s(){}\[\],.;:"'\/]+|\s+)/gm;
    
    let match;
    let lastIndex = 0;
    
    try {
        while ((match = regex.exec(code)) !== null) {
            if (match.index > lastIndex) {
                 tokens.push({ type: 'text', value: code.slice(lastIndex, match.index) });
            }
            const val = match[0];
            let type = 'text';
            
            if (val.startsWith('//') || val.startsWith('/*')) type = 'comment';
            else if (val.startsWith('"') || val.startsWith("'")) type = 'string';
            else if (['const','let','var','function','return','if','else','for','while','switch','case','break','continue','new','this','try','catch','throw','typeof','in','of'].includes(val)) type = 'keyword';
            else if (['true','false','null','undefined'].includes(val)) type = 'boolean';
            else if (/^\d/.test(val)) type = 'number';
            else if (/^[A-Z]/.test(val)) type = 'class';
            else if (['{','}','(',')','[',']'].includes(val)) type = 'bracket';
            
            // Refined function/variable detection with safety check
            if (type === 'text' && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(val)) {
                 if (regex.lastIndex < code.length) {
                     const nextChar = code[regex.lastIndex];
                     if (nextChar === '(') {
                         type = 'function';
                     } else {
                         type = 'variable';
                     }
                 } else {
                     type = 'variable';
                 }
            }
    
            tokens.push({ type, value: val });
            lastIndex = regex.lastIndex;
        }
    } catch (e) {
        // Fallback to simple text on error
        return [{ type: 'text', value: code }];
    }
    
    if (lastIndex < code.length) {
        tokens.push({ type: 'text', value: code.slice(lastIndex) });
    }
    return tokens;
};

export const HighlightedCode: React.FC<{ code: string }> = ({ code }) => {
    // Wrap in try-catch to prevent rendering crashes
    try {
        const tokens = tokenize(code);
        return (
            <>
                {tokens.map((t, i) => {
                    let color = 'text-slate-300';
                    if (t.type === 'comment') color = 'text-green-600 italic';
                    if (t.type === 'string') color = 'text-amber-600';
                    if (t.type === 'keyword') color = 'text-purple-400 font-bold';
                    if (t.type === 'boolean') color = 'text-orange-400';
                    if (t.type === 'number') color = 'text-emerald-300';
                    if (t.type === 'class') color = 'text-yellow-300';
                    if (t.type === 'function') color = 'text-blue-300';
                    if (t.type === 'bracket') color = 'text-yellow-500';
                    if (t.type === 'variable') color = 'text-sky-100';

                    return <span key={i} className={color}>{t.value}</span>;
                })}
            </>
        );
    } catch (e) {
        console.error("Highlighting error:", e);
        return <span className="text-slate-300">{code || ''}</span>;
    }
};