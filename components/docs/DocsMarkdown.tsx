import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { Lightbulb, Info, AlertTriangle } from 'lucide-react';
import { HighlightedCode } from '../HighlightedCode';
import { slugifyHeading } from '../../lib/docsContent';

// Recursively extract the plain text of a React node tree.
const textOf = (node: React.ReactNode): string => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join('');
    if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
    return '';
};

// --- Minimal pipe-table support (no remark-gfm dependency) ---------------
//
// react-markdown v10's default pipeline (remark-parse + remark-rehype) is
// plain CommonMark: without the remark-gfm plugin, `| a | b |` table syntax
// is not a table AST node at all - it's a single paragraph whose text value
// still contains literal "|" and "\n" characters. Adding remark-gfm would be
// a new dependency, which this project avoids, so instead we recognize the
// same syntax ourselves as a tiny remark plugin.
//
// mdast-util-to-hast (already a react-markdown dependency) ships generic
// handlers for the `table` / `tableRow` / `tableCell` mdast node types -
// those are standard mdast, not GFM-specific - so once we hand it real
// nodes of those types, rendering "just works" through the normal pipeline
// and our `components.table` override below.
//
// Because remark-parse still tokenizes inline markup (bold, links, inline
// code - including our `kbd:` chips) inside the paragraph before we see it,
// splitting only the plain-text runs on "|" and "\n" (and passing every
// other inline node through untouched) preserves that formatting inside
// cells for free.
type MdNode = { type: string; value?: string; children?: MdNode[]; [key: string]: unknown };

const ALIGN_CELL = /^:?-+:?$/;

function paragraphToTable(children: MdNode[] | undefined): MdNode | null {
    if (!children) return null;
    const rows: MdNode[][][] = [[[]]];
    let sawPipe = false;
    for (const node of children) {
        if (node.type === 'text' && typeof node.value === 'string' && /[|\n]/.test(node.value)) {
            const lines = node.value.split('\n');
            lines.forEach((line, li) => {
                if (li > 0) rows.push([[]]);
                const parts = line.split('|');
                if (parts.length > 1) sawPipe = true;
                parts.forEach((part, pi) => {
                    const row = rows[rows.length - 1];
                    if (pi > 0) row.push([]);
                    if (part !== '') row[row.length - 1].push({ type: 'text', value: part });
                });
            });
        } else {
            const row = rows[rows.length - 1];
            row[row.length - 1].push(node);
        }
    }
    // Not even one "|" seen anywhere - definitely not a table paragraph.
    if (!sawPipe || rows.length < 2) return null;

    // Outer pipes are optional in GFM: "| a | b |" splits into an empty
    // leading/trailing phantom cell we should drop. Also trim the
    // whitespace GFM trims from each cell's outer edge.
    const trimmedRows = rows.map((cells) => {
        let c = cells;
        if (c.length > 1 && c[0].length === 0) c = c.slice(1);
        if (c.length > 1 && c[c.length - 1].length === 0) c = c.slice(0, -1);
        return c.map((cellNodes) => {
            if (cellNodes.length === 0) return cellNodes;
            const out = cellNodes.slice();
            const first = out[0];
            if (first.type === 'text' && typeof first.value === 'string') out[0] = { ...first, value: first.value.replace(/^\s+/, '') };
            const last = out[out.length - 1];
            if (last.type === 'text' && typeof last.value === 'string') out[out.length - 1] = { ...last, value: last.value.replace(/\s+$/, '') };
            return out;
        });
    });

    const [header, sep, ...body] = trimmedRows;
    if (!header || !sep || sep.length !== header.length) return null;
    const sepIsAlignmentRow = sep.every((cell) => {
        if (cell.length !== 1 || cell[0].type !== 'text' || typeof cell[0].value !== 'string') return false;
        return ALIGN_CELL.test(cell[0].value.trim());
    });
    if (!sepIsAlignmentRow) return null;

    const toRow = (cells: MdNode[][]): MdNode => ({
        type: 'tableRow',
        children: cells.map((cellNodes) => ({ type: 'tableCell', children: cellNodes })),
    });
    return { type: 'table', children: [toRow(header), ...body.map(toRow)] };
}

// Unified plugin: promote table-shaped paragraphs anywhere in the tree.
function remarkPipeTables() {
    return (tree: MdNode) => {
        const visit = (node: MdNode) => {
            if (!Array.isArray(node.children)) return;
            node.children = node.children.map((child) => {
                if (child.type === 'paragraph') {
                    const table = paragraphToTable(child.children);
                    if (table) return table;
                }
                visit(child);
                return child;
            });
        };
        visit(tree);
    };
}

const CALLOUTS = {
    tip: { marker: '[!TIP]', icon: Lightbulb, cls: 'bg-green-50 border-green-200 text-green-900', iconCls: 'text-green-600' },
    note: { marker: '[!NOTE]', icon: Info, cls: 'bg-blue-50 border-blue-200 text-blue-900', iconCls: 'text-blue-600' },
    warning: { marker: '[!WARNING]', icon: AlertTriangle, cls: 'bg-amber-50 border-amber-300 text-amber-900', iconCls: 'text-amber-600' },
} as const;

// Remove the leading "[!TIP]" marker text (and a following soft-break) from
// the blockquote's first paragraph.
const stripMarker = (node: React.ReactNode, marker: string): React.ReactNode => {
    let stripped = false;
    const walk = (n: React.ReactNode): React.ReactNode => {
        if (stripped) return n;
        if (typeof n === 'string') {
            const i = n.indexOf(marker);
            if (i !== -1) { stripped = true; return n.slice(0, i) + n.slice(i + marker.length).replace(/^\s*\n?/, ''); }
            return n;
        }
        if (Array.isArray(n)) return n.map(walk);
        if (React.isValidElement(n)) {
            const props = n.props as { children?: React.ReactNode };
            return React.cloneElement(n, undefined, walk(props.children));
        }
        return n;
    };
    return walk(node);
};

const Heading = (Tag: 'h2' | 'h3' | 'h4') => {
    const H: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
        const id = slugifyHeading(textOf(children));
        return <Tag id={id} className="group scroll-mt-20">
            {children}
            <a href={`#${id}`} className="ml-2 opacity-0 group-hover:opacity-60 text-blue-500 no-underline text-sm align-middle" aria-label="Link to section">#</a>
        </Tag>;
    };
    return H;
};

const DocsFigure: React.FC<{ src?: string; alt?: string; title?: string }> = ({ src = '', alt = '', title }) => {
    const [open, setOpen] = useState(false);
    const isClip = /\/clip-[^/]+\.webp$/.test(src);
    return (
        <figure className="my-6 not-prose">
            <div className="relative inline-block max-w-full">
                <img
                    src={src} alt={alt} loading="lazy"
                    onClick={() => setOpen(true)}
                    className="rounded-xl border border-slate-200 shadow-sm max-w-full cursor-zoom-in"
                />
                {isClip && <span className="absolute top-2 right-2 bg-slate-900/70 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">clip</span>}
            </div>
            {(title || alt) && <figcaption className="text-sm text-slate-500 mt-2">{title || alt}</figcaption>}
            {open && (
                <div data-lightbox onClick={() => setOpen(false)}
                    className="fixed inset-0 z-[100] bg-slate-900/80 flex items-center justify-center p-6 cursor-zoom-out">
                    <img src={src} alt={alt} className="max-w-full max-h-full rounded-lg shadow-2xl" />
                </div>
            )}
        </figure>
    );
};

export function DocsMarkdown({ markdown }: { markdown: string }) {
    return (
        <div className="prose prose-slate max-w-none prose-p:leading-7 prose-li:leading-7 prose-headings:font-bold prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
            <ReactMarkdown
                remarkPlugins={[remarkPipeTables]}
                components={{
                    h2: Heading('h2'),
                    h3: Heading('h3'),
                    h4: Heading('h4'),
                    img: ({ src, alt, title }) => <DocsFigure src={typeof src === 'string' ? src : ''} alt={alt ?? ''} title={title ?? undefined} />,
                    // react-markdown wraps a lone image in <p>; keep <figure> valid by
                    // unwrapping paragraphs whose only child is our figure.
                    //
                    // Note: the element react-markdown puts here is the `img` override
                    // function below, not `DocsFigure` itself (that's just what the
                    // override *returns*), so identity-checking `arr[0].type` against
                    // `DocsFigure` never matches and this never unwraps - react-markdown
                    // still hands the original hast node through as a `node` prop, so we
                    // check its tag name instead, which is precise (only images unwrap,
                    // not e.g. a standalone-code-only paragraph, which is also a non-DOM
                    // custom-component child).
                    p: ({ children }) => {
                        const arr = React.Children.toArray(children);
                        const sole = arr.length === 1 ? arr[0] : null;
                        const soleTag = React.isValidElement(sole)
                            ? (sole.props as { node?: { tagName?: string } }).node?.tagName
                            : undefined;
                        if (soleTag === 'img') return <>{arr}</>;
                        return <p>{children}</p>;
                    },
                    blockquote: ({ children }) => {
                        const text = textOf(children).trim();
                        for (const [kind, c] of Object.entries(CALLOUTS)) {
                            if (text.startsWith(c.marker)) {
                                const Icon = c.icon;
                                return (
                                    <aside data-callout={kind} className={`not-prose my-6 border rounded-xl p-4 flex gap-3 ${c.cls}`}>
                                        <Icon size={20} className={`flex-shrink-0 mt-0.5 ${c.iconCls}`} />
                                        <div className="text-sm leading-6 [&>p]:m-0 [&>p+p]:mt-2">{stripMarker(children, c.marker)}</div>
                                    </aside>
                                );
                            }
                        }
                        return <blockquote>{children}</blockquote>;
                    },
                    code: ({ className, children }) => {
                        const text = String(children ?? '');
                        const isBlock = className != null || text.includes('\n');
                        if (!isBlock) {
                            if (text.startsWith('kbd:')) {
                                return <kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-700 shadow-[0_1px_0_rgba(0,0,0,0.15)]">{text.slice(4)}</kbd>;
                            }
                            return <code>{children}</code>;
                        }
                        const lang = /language-(\w+)/.exec(className ?? '')?.[1];
                        const code = text.replace(/\n$/, '');
                        return (
                            <pre className="not-prose bg-slate-800 text-slate-200 p-4 rounded-lg font-mono text-sm overflow-x-auto my-6">
                                {lang === 'js' || lang === 'javascript' || lang === 'ts'
                                    ? <HighlightedCode code={code} />
                                    : <code>{code}</code>}
                            </pre>
                        );
                    },
                    pre: ({ children }) => <>{children}</>, // code renderer emits its own <pre>
                    a: ({ href = '', children }) => {
                        if (href.startsWith('/')) return <Link to={href}>{children}</Link>;
                        if (href.startsWith('#')) return <a href={href}>{children}</a>;
                        return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                    },
                    table: ({ children }) => (
                        <div className="overflow-x-auto my-6 border border-slate-200 rounded-xl not-prose">
                            <table className="w-full text-sm [&_th]:bg-slate-50 [&_th]:text-left [&_th]:font-semibold [&_th]:text-slate-600 [&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3 [&_td]:border-t [&_td]:border-slate-100 [&_td]:text-slate-600 [&_td]:align-top">{children}</table>
                        </div>
                    ),
                }}
            >
                {markdown}
            </ReactMarkdown>
        </div>
    );
}
