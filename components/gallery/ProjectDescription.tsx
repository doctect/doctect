import React from 'react';
import ReactMarkdown from 'react-markdown';

// Gallery descriptions are cross-user content: react-markdown never parses raw
// HTML (it stays visible text) and its default url transform drops javascript:
// hrefs, so no sanitizer or innerHTML is needed on this path.
export function ProjectDescription({ text }: { text: string }) {
    if (!text) return null;
    return (
        <div className="text-sm text-slate-600 mt-4 space-y-2 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-slate-800 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-800 [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:underline [&_code]:bg-slate-100 [&_code]:rounded [&_code]:px-1 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500">
            <ReactMarkdown
                components={{
                    a: ({ node: _node, children, ...props }) => (
                        <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>
                    ),
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}
