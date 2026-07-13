

import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import JSZip from "jszip";
import { AppState, AppNode, PageTemplate, TemplateElement, RM_PP_WIDTH, RM_PP_HEIGHT, TraversalStep } from "../types";
import { FONTS } from "../constants/editor";
import { normalizeSvgColorsInTree, desaturateSvgColorsInTree, bakeElementOpacityIntoSvg } from "./svgColorNormalize";
import { sortElementsForRender } from "./layers";
import { isVisibleText, resolveTextFontSize } from "./textVisibility";

const DEBUG_PDF = false; // Set to true to see debug visuals

// Mapping of supported custom fonts to their source TTF files
// Using raw.githubusercontent.com for reliable access to the Google Fonts repo
// Note: Many fonts are now Variable Fonts in the repo, indicated by [wght].
// We point 'bold' to the same VF file; jsPDF might not render full weight without static files,
// but this prevents 404 errors during generation.
const FONT_URLS: Record<string, Record<string, string>> = {
    // Sans-Serif
    'helvetica': {
        normal: 'https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusSans-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusSans-Bold.ttf',
        italic: 'https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusSans-Italic.ttf'
    },
    'open-sans': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/open-sans@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/open-sans@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/open-sans@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/open-sans@latest/latin-700-italic.ttf'
    },
    'lato': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Bold.ttf',
        italic: 'https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Italic.ttf'
    },
    'montserrat': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-700-italic.ttf'
    },
    'roboto': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-700-italic.ttf'
    },
    'poppins': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf',
        italic: 'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Italic.ttf'
    },
    'nunito': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/nunito@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/nunito@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/nunito@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/nunito@latest/latin-700-italic.ttf'
    },
    'inter': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-italic.ttf'
    },
    'work-sans': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/work-sans@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/work-sans@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/work-sans@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/work-sans@latest/latin-700-italic.ttf'
    },
    'source-sans-pro': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3@latest/latin-700-italic.ttf'
    },
    'raleway': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/raleway@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/raleway@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/raleway@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/raleway@latest/latin-700-italic.ttf'
    },
    'ubuntu': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntu/Ubuntu-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntu/Ubuntu-Bold.ttf',
        italic: 'https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntu/Ubuntu-Italic.ttf'
    },
    'pt-sans': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ptsans/PT_Sans-Web-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ptsans/PT_Sans-Web-Bold.ttf',
        italic: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ptsans/PT_Sans-Web-Italic.ttf'
    },
    'noto-sans': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-700-italic.ttf'
    },
    'oxygen': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/oxygen/Oxygen-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/oxygen/Oxygen-Bold.ttf',
        italic: 'https://raw.githubusercontent.com/google/fonts/main/ofl/oxygen/Oxygen-Regular.ttf' // No italic?
    },
    'fira-sans': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/firasans/FiraSans-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/firasans/FiraSans-Bold.ttf',
        italic: 'https://raw.githubusercontent.com/google/fonts/main/ofl/firasans/FiraSans-Italic.ttf'
    },

    // Serif
    'times': {
        normal: 'https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusRoman-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusRoman-Bold.ttf',
        italic: 'https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusRoman-Italic.ttf'
    },
    'lora': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/lora@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/lora@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/lora@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/lora@latest/latin-700-italic.ttf'
    },
    'merriweather': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/merriweather@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/merriweather@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/merriweather@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/merriweather@latest/latin-700-italic.ttf'
    },
    'playfair-display': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-700-italic.ttf'
    },
    'pt-serif': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ptserif/PT_Serif-Web-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ptserif/PT_Serif-Web-Bold.ttf',
        italic: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ptserif/PT_Serif-Web-Italic.ttf'
    },
    'libre-baskerville': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/libre-baskerville@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/libre-baskerville@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/libre-baskerville@latest/latin-400-italic.ttf'
    },
    'crimson-text': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/crimsontext/CrimsonText-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/crimsontext/CrimsonText-Bold.ttf',
        italic: 'https://raw.githubusercontent.com/google/fonts/main/ofl/crimsontext/CrimsonText-Italic.ttf'
    },
    'eb-garamond': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/eb-garamond@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/eb-garamond@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/eb-garamond@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/eb-garamond@latest/latin-700-italic.ttf'
    },
    'cormorant-garamond': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-700-italic.ttf'
    },
    'noto-serif': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-serif@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-serif@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-serif@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-serif@latest/latin-700-italic.ttf'
    },

    // Monospace
    'courier': {
        normal: 'https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusMonoPS-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusMonoPS-Bold.ttf',
        italic: 'https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusMonoPS-Italic.ttf'
    },
    'roboto-mono': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto-mono@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto-mono@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto-mono@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto-mono@latest/latin-700-italic.ttf'
    },
    'fira-code': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/fira-code@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/fira-code@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/fira-code@latest/latin-400-normal.ttf' // Fira Code has no italic
    },
    'source-code-pro': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/source-code-pro@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/source-code-pro@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/source-code-pro@latest/latin-400-italic.ttf',
        bolditalic: 'https://cdn.jsdelivr.net/fontsource/fonts/source-code-pro@latest/latin-700-italic.ttf'
    },
    'jetbrains-mono': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-700-normal.ttf',
        italic: 'https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-400-italic.ttf'
    },
    'ubuntu-mono': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntumono/UbuntuMono-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntumono/UbuntuMono-Bold.ttf',
        italic: 'https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntumono/UbuntuMono-Italic.ttf'
    },

    // Handwriting / Script
    'caveat': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/caveat@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/caveat@latest/latin-700-normal.ttf'
    },
    'dancing-script': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/dancing-script@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/dancing-script@latest/latin-700-normal.ttf'
    },
    'patrick-hand': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/PatrickHand-Regular.ttf'
    },
    'pacifico': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/pacifico/Pacifico-Regular.ttf'
    },
    'great-vibes': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf'
    },
    'satisfy': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/apache/satisfy/Satisfy-Regular.ttf'
    },
    'sacramento': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/sacramento/Sacramento-Regular.ttf'
    },
    'allura': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/allura/Allura-Regular.ttf'
    },
    'amatic-sc': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/amaticsc/AmaticSC-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/amaticsc/AmaticSC-Bold.ttf'
    },
    'indie-flower': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/indieflower/IndieFlower-Regular.ttf'
    },
    'kalam': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/kalam/Kalam-Regular.ttf',
        bold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/kalam/Kalam-Bold.ttf'
    },
    'shadows-into-light': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/shadowsintolight/ShadowsIntoLight.ttf'
    },

    // Display
    'bebas-neue': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf'
    },
    'oswald': {
        normal: 'https://cdn.jsdelivr.net/fontsource/fonts/oswald@latest/latin-400-normal.ttf',
        bold: 'https://cdn.jsdelivr.net/fontsource/fonts/oswald@latest/latin-700-normal.ttf'
    },
    'anton': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf'
    },
    'righteous': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/righteous/Righteous-Regular.ttf'
    },
    'archivo-black': {
        normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/archivoblack/ArchivoBlack-Regular.ttf'
    }
};

// Helper: Evaluate simple arithmetic expression or look up field
const evaluateMath = (expr: string | number, data: Record<string, string>): number => {
    const str = String(expr).trim();
    if (!str) return 0;

    // Simple integer
    if (/^-?\d+$/.test(str)) return parseInt(str, 10);

    // Addition
    const plusIdx = str.indexOf('+');
    if (plusIdx > -1) {
        const l = str.substring(0, plusIdx).trim();
        const r = str.substring(plusIdx + 1).trim();
        return evaluateMath(l, data) + evaluateMath(r, data);
    }

    // Subtraction (Right-most minus that isn't start)
    const minusIdx = str.lastIndexOf('-');
    if (minusIdx > 0) {
        // Check if preceding char is operator
        const prevChar = str.charAt(minusIdx - 1);
        if (prevChar !== '+' && prevChar !== '-') {
            const l = str.substring(0, minusIdx).trim();
            const r = str.substring(minusIdx + 1).trim();
            return evaluateMath(l, data) - evaluateMath(r, data);
        }
    }

    // Variable lookup
    const val = data[str];
    if (val !== undefined && val !== "") return parseInt(val, 10);

    return 0;
};

// Helper: Find a node that refers to a specific child of the current node
// Used for "child_referrer" linking and text resolution
const findChildReferrerNode = (
    currentNode: AppNode,
    allNodes: Record<string, AppNode>,
    startIndexVal: string | number,
    countVal: string | number,
    typeFilter?: string
): AppNode | undefined => {
    // 1. Resolve Start Index & Count with arithmetic
    const start = evaluateMath(startIndexVal, currentNode.data || {});
    const count = evaluateMath(countVal, currentNode.data || {});

    // Default count to 1 if 0 provided (unless explicitly 0 meant no search, but usually implies 1 attempt)
    // Actually, count 0 means loop runs 0 times. 
    // If user provides count=0, nothing happens.
    // However, for single link, usually count is at least 1 or -1.
    const direction = count >= 0 ? 1 : -1;
    const absCount = Math.abs(count);

    // 3. Iterate
    for (let i = 0; i < absCount; i++) {
        const idx = start + (i * direction);
        if (idx < 0) continue;

        let targetChildId = (currentNode.children && currentNode.children[idx]) ? currentNode.children[idx] : undefined;
        if (!targetChildId) continue;

        const allReferrers = Object.values(allNodes).filter(n => n.referenceId === targetChildId);
        let bestReferrer: AppNode | undefined;

        if (typeFilter && typeFilter.trim() !== '') {
            bestReferrer = allReferrers.find(ref => {
                const parent = ref.parentId ? allNodes[ref.parentId] : null;
                return parent && parent.type === typeFilter;
            });
        }

        if (!bestReferrer && allReferrers.length > 0) {
            bestReferrer = allReferrers[0];
        }

        if (bestReferrer && bestReferrer.parentId) {
            return allNodes[bestReferrer.parentId];
        }
    }
    return undefined;
};

// Helper: Get all nodes that provide context to the current node (Ancestors, Referrers, Children)
const getContextNodes = (startNode: AppNode, state: AppState): AppNode[] => {
    const nodes: AppNode[] = [];
    const seen = new Set<string>();

    const add = (n: AppNode) => {
        if (n && !seen.has(n.id)) {
            seen.add(n.id);
            nodes.push(n);
        }
    };

    // 1. Self & Ancestors
    let curr: AppNode | undefined = startNode;
    while (curr) {
        add(curr);
        curr = curr.parentId ? state.nodes[curr.parentId] : undefined;
    }

    // 2. Reference Target & its Ancestors (if startNode is a reference)
    if (startNode.referenceId && state.nodes[startNode.referenceId]) {
        let target: AppNode | undefined = state.nodes[startNode.referenceId];
        while (target) {
            add(target);
            target = target.parentId ? state.nodes[target.parentId] : undefined;
        }
    }

    // 3. Referrers (Nodes that point TO startNode or its target) & their Ancestors
    // This allows a Day page to know about the Week page that links to it.
    const potentialTargets = [startNode.id];
    if (startNode.referenceId) potentialTargets.push(startNode.referenceId);

    const referrers = Object.values(state.nodes).filter(n =>
        n.referenceId && potentialTargets.includes(n.referenceId)
    );

    referrers.forEach(ref => {
        let r: AppNode | undefined = ref;
        while (r) {
            add(r);
            r = r.parentId ? state.nodes[r.parentId] : undefined;
        }
    });

    // 4. Children (Immediate only) - useful for grids or summaries
    startNode.children.forEach(childId => {
        if (state.nodes[childId]) add(state.nodes[childId]);
    });
    if (startNode.referenceId && state.nodes[startNode.referenceId]) {
        state.nodes[startNode.referenceId].children.forEach(childId => {
            if (state.nodes[childId]) add(state.nodes[childId]);
        });
    }

    return nodes;
};

// Helper to resolve text content with data binding
const resolveText = (text: string | undefined, node: AppNode, state: AppState): string => {
    let content = text || "";
    if (!content.includes('{{')) return content;

    // 1. Handle explicit Child Referrer lookups first
    // Syntax: {{child_referrer:startIndex:count:type:field}}
    // Updated regex to support arithmetic characters in first two groups
    content = content.replace(/\{\{child_referrer:([^:]+):([^:]+):([^:]*):([^}]+)\}\}/g, (_, startStr, countStr, typeFilter, field) => {
        const referrerParent = findChildReferrerNode(node, state.nodes, startStr, countStr, typeFilter);

        if (referrerParent) {
            if (field === 'title') return referrerParent.title;
            if (referrerParent.data && referrerParent.data[field] !== undefined) return referrerParent.data[field];
        }
        return "";
    });

    // 2. Standard Context Resolution
    const contextNodes = getContextNodes(node, state);

    return content.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        const trimmedKey = key.trim();

        // Search in context nodes order
        for (const ctxNode of contextNodes) {
            if (trimmedKey === 'title') return ctxNode.title;
            if (ctxNode.data && ctxNode.data[trimmedKey] !== undefined) {
                return ctxNode.data[trimmedKey];
            }
        }
        return ""; // Not found
    });
};

const hexToRgb = (hex: string | undefined) => {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return null;
    let cleanHex = hex.slice(1);

    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(char => char + char).join('');
    }

    if (cleanHex.length !== 6) return null;

    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
};

// Helper: Convert ArrayBuffer to Binary String for jsPDF
const arrayBufferToBinaryString = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return binary;
};

// Apply a clipping path inset from the shape to create "padding" for the pattern
const clipToShape = (doc: jsPDF, type: string, x: number, y: number, w: number, h: number, radius: number = 0, padding: number = 0) => {
    // Explicitly end any previous path to avoid pollution
    if ((doc as any).discardPath) (doc as any).discardPath();
    else (doc as any).internal.write('n');

    const p = padding;
    // Ensure dimensions don't go negative
    const effW = Math.max(0, w - 2 * p);
    const effH = Math.max(0, h - 2 * p);
    const effX = x + p;
    const effY = y + p;

    // Safety cast
    const r = Number(radius) || 0;

    if (type === 'rect' || type === 'text' || type === 'grid') {
        if (r > 0) {
            // Rounded Rect Path
            const rx = Math.min(r, effW / 2);
            const ry = Math.min(r, effH / 2);
            const k = 0.551915024494; // Bezier Kappa

            doc.moveTo(effX + rx, effY);
            doc.lineTo(effX + effW - rx, effY);

            // Top Right
            doc.curveTo(effX + effW - rx + (k * rx), effY, effX + effW, effY + ry - (k * ry), effX + effW, effY + ry);
            doc.lineTo(effX + effW, effY + effH - ry);

            // Bottom Right
            doc.curveTo(effX + effW, effY + effH - ry + (k * ry), effX + effW - rx + (k * rx), effY + effH, effX + effW - rx, effY + effH);
            doc.lineTo(effX + rx, effY + effH);

            // Bottom Left
            doc.curveTo(effX + rx - (k * rx), effY + effH, effX, effY + effH - ry + (k * ry), effX, effY + effH - ry);
            doc.lineTo(effX, effY + ry);

            // Top Left
            doc.curveTo(effX, effY + ry - (k * ry), effX + rx - (k * rx), effY, effX + rx, effY);
        } else {
            // Rect Path
            doc.moveTo(effX, effY);
            doc.lineTo(effX + effW, effY);
            doc.lineTo(effX + effW, effY + effH);
            doc.lineTo(effX, effY + effH);
            doc.lineTo(effX, effY);
        }
    } else if (type === 'ellipse') {
        // Ellipse Path
        const rx = effW / 2;
        const ry = effH / 2;
        const cx = effX + rx;
        const cy = effY + ry;
        const k = 0.551915024494;

        doc.moveTo(cx + rx, cy);
        doc.curveTo(cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry);
        doc.curveTo(cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy);
        doc.curveTo(cx - rx, cy - k * ry, cx - k * ry, cy - ry, cx, cy - ry);
        doc.curveTo(cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy);
    } else if (type === 'triangle') {
        // Triangle Path
        doc.moveTo(effX + effW / 2, effY);
        doc.lineTo(effX, effY + effH);
        doc.lineTo(effX + effW, effY + effH);
        doc.lineTo(effX + effW / 2, effY);
    }

    // Apply clipping to the path constructed above
    doc.clip();

    // Cleanup: Ensure the path is consumed/discarded so it doesn't get stroked later
    if ((doc as any).discardPath) (doc as any).discardPath();
    else (doc as any).internal.write('n');
};

// Draw dots pattern using optimized dashed lines
const drawDotsOptimized = (doc: jsPDF, x: number, y: number, w: number, h: number, color: { r: number, g: number, b: number }, spacing: number, weight: number) => {
    doc.saveGraphicsState();
    try {
        doc.setDrawColor(color.r, color.g, color.b);
        doc.setLineWidth(weight);
        doc.setLineCap('round'); // Round cap creates the dot shape
        doc.setLineDashPattern([0, spacing], 0); // 0-length dash + round cap = dot. Spacing is the gap.

        const step = Math.max(1, spacing);

        // Iterate rows only (drawing horizontal dotted lines)
        for (let j = 0; j <= h; j += step) {
            // Explicitly start a new path for each line to avoid accumulation issues
            doc.moveTo(x, y + j);
            doc.lineTo(x + w, y + j);
            doc.stroke();
        }

    } finally {
        doc.setLineCap('butt');
        doc.setLineDashPattern([], 0);
        doc.restoreGraphicsState();
    }
};

const hexToGreyscale = (hex: string): { r: number, g: number, b: number } | null => {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    // Luminance formula
    const y = Math.round(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
    return { r: y, g: y, b: y };
};

const drawPattern = (doc: jsPDF, type: string, x: number, y: number, w: number, h: number, color: string, spacing: number = 4, weight: number = 0.5) => {
    const rgb = hexToRgb(color);
    if (!rgb) return;

    const step = Math.max(0.5, Number(spacing) || 4);
    const lw = Number(weight) || 0.5;

    if (type === 'dots') {
        drawDotsOptimized(doc, x, y, w, h, rgb, step, lw);
        return;
    }

    doc.setDrawColor(rgb.r, rgb.g, rgb.b);
    doc.setLineWidth(lw);
    // Explicitly set solid line for patterns to prevent inheriting border dash style
    doc.setLineDashPattern([], 0);

    // halfW offset needed: CSS draws 1px line from 0-1px, jsPDF centers line on y.
    // Adding halfW makes jsPDF line cover same pixels as CSS gradient.
    const halfW = lw / 2;

    if (type === 'lines-h') {
        for (let i = 0; i <= h; i += step) {
            const ly = y + i + halfW;
            doc.line(x, ly, x + w, ly);
        }
    } else if (type === 'lines-v') {
        for (let i = 0; i <= w; i += step) {
            const lx = x + i + halfW;
            doc.line(lx, y, lx, y + h);
        }
    }
};

const applyFont = (doc: jsPDF, el: TemplateElement, isGreyscale = false) => {
    let family = el.fontFamily || 'helvetica';
    if (family.toLowerCase() === 'georgia') family = 'times';

    // Normalize family name: If it's a label (e.g. "Playfair Display"), convert to value (e.g. "playfair-display")
    if (!FONT_URLS[family]) {
        const found = FONTS.find(f => f.label === family);
        if (found) family = found.value;
        else {
            // Try lowercased fallback if exact label match fails
            const lower = family.toLowerCase().replace(/\s+/g, '-');
            if (FONT_URLS[lower]) family = lower;
        }
    }

    let style = 'normal';

    // Check if it's a custom loaded font
    if (FONT_URLS[family]) {
        if (el.fontWeight === 'bold' && el.fontStyle === 'italic') style = 'bolditalic';
        else if (el.fontWeight === 'bold') style = 'bold';
        else if (el.fontStyle === 'italic') style = 'italic';

        // Ensure requested style exists, otherwise fallback to normal
        const availableStyles = Object.keys(FONT_URLS[family]);
        if (!availableStyles.includes(style)) {
            // Try fallback
            if (style === 'bolditalic' && availableStyles.includes('bold')) style = 'bold';
            else if (style === 'bolditalic' && availableStyles.includes('italic')) style = 'italic';
            else style = 'normal';
        }
    } else {
        // Standard fonts
        if (el.fontWeight === 'bold' && el.fontStyle === 'italic') style = 'bolditalic';
        else if (el.fontWeight === 'bold') style = 'bold';
        else if (el.fontStyle === 'italic') style = 'italic';
    }

    try {
        doc.setFont(family, style);
    } catch (e) {
        console.warn(`[PDFService] Failed to set font ${family} ${style}. Falling back to helvetica.`, e);
        doc.setFont('helvetica', 'normal');
    }
    doc.setFontSize(resolveTextFontSize(el.fontSize));

    const rgb = isGreyscale
        ? hexToGreyscale(el.textColor || "#000000")
        : hexToRgb(el.textColor || "#000000");
    if (rgb) doc.setTextColor(rgb.r, rgb.g, rgb.b);
};

// Calculate AABB for rotated elements to place links correctly
const getRotatedAABB = (x: number, y: number, w: number, h: number, angle: number) => {
    if (!angle || angle === 0) return { x, y, w, h };
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rad = angle * (Math.PI / 180);
    const c = Math.cos(rad);
    const s = Math.sin(rad);

    // Corners relative to center
    const p = [
        { dx: -w / 2, dy: -h / 2 },
        { dx: w / 2, dy: -h / 2 },
        { dx: w / 2, dy: h / 2 },
        { dx: -w / 2, dy: h / 2 }
    ];

    const rotated = p.map(pt => ({
        x: cx + (pt.dx * c - pt.dy * s),
        y: cy + (pt.dx * s + pt.dy * c)
    }));

    const minX = Math.min(...rotated.map(pt => pt.x));
    const maxX = Math.max(...rotated.map(pt => pt.x));
    const minY = Math.min(...rotated.map(pt => pt.y));
    const maxY = Math.max(...rotated.map(pt => pt.y));

    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

const traverseGridData = (
    currentNodes: string[],
    steps: TraversalStep[],
    depth: number,
    nodes: Record<string, AppNode>
): string[] => {
    if (depth >= steps.length) return currentNodes;
    if (!currentNodes || currentNodes.length === 0) return [];

    const step = steps[depth];
    const nextLevelNodes: string[] = [];

    currentNodes.forEach(nodeId => {
        const node = nodes[nodeId];
        if (!node) return;

        let targetNode = node;
        if (node.referenceId && nodes[node.referenceId]) {
            targetNode = nodes[node.referenceId];
        }

        const children = targetNode.children || [];

        const start = step.sliceStart || 0;
        const end = step.sliceCount !== undefined ? start + step.sliceCount : undefined;
        const sliced = children.slice(start, end);

        nextLevelNodes.push(...sliced);
    });

    return traverseGridData(nextLevelNodes, steps, depth + 1, nodes);
};

interface GeneratePDFOptions {
    isGreyscale?: boolean;
    variantId?: string;
    projectName?: string;
    output?: 'save' | 'arraybuffer';
}

export const computePageOrder = (state: AppState): string[] => {
    const pageNodes: string[] = [];
    const traverse = (nodeId: string) => {
        const node = state.nodes[nodeId];
        if (!node) return;
        if (!node.referenceId) {
            pageNodes.push(nodeId);
            if (node.children) node.children.forEach(childId => traverse(childId));
        }
    };
    if (state.rootId) traverse(state.rootId);
    return pageNodes;
};

export const generatePDF = async (state: AppState, options: GeneratePDFOptions = {}) => {
    const pageNodes = computePageOrder(state);
    const pageMap = new Map<string, number>(pageNodes.map((id, i) => [id, i + 1]));

    const resolvePage = (id: string): number | undefined => {
        if (pageMap.has(id)) return pageMap.get(id);
        const node = state.nodes[id];
        if (node && node.referenceId) return resolvePage(node.referenceId);
        return undefined;
    };

    // 1. Determine dimensions for the first page to initialize the document correctly
    let initialFormat = [RM_PP_WIDTH, RM_PP_HEIGHT];
    let initialOrientation: "portrait" | "landscape" = "portrait";
    const targetVariantId = options.variantId || state.activeVariantId;

    if (pageNodes.length > 0) {
        const firstNode = state.nodes[pageNodes[0]];
        if (firstNode) {
            const tpl = state.variants[targetVariantId]?.templates[firstNode.type];
            if (tpl) {
                initialFormat = [tpl.width, tpl.height];
                initialOrientation = tpl.width > tpl.height ? "landscape" : "portrait";
            }
        }
    }

    const doc = new jsPDF({
        orientation: initialOrientation,
        unit: "pt",
        format: initialFormat
    });

    // --- FONT LOADING START ---
    const usedFamilies = new Set<string>();
    Object.values(state.variants[targetVariantId]?.templates || {}).forEach(tpl => {
        tpl.elements.forEach(el => {
            if (el.fontFamily) {
                let fam = el.fontFamily;
                // Normalize label -> value
                const found = FONTS.find(f => f.label === fam);
                if (found) fam = found.value;
                else {
                    const lower = fam.toLowerCase().replace(/\s+/g, '-');
                    if (FONT_URLS[lower]) fam = lower;
                }
                usedFamilies.add(fam);
            }
        });
    });

    // Default text carries no fontFamily and renders as 'helvetica'. Without this, that text
    // stays on jsPDF's built-in Helvetica — WinAnsi-only (no Unicode glyphs) and metrically
    // different from the canvas. Embed the bundled Nimbus Sans (a metric-compatible Helvetica
    // clone, already configured in FONT_URLS) so default/helvetica text is consistent too.
    usedFamilies.add('helvetica');

    const fontPromises: Promise<void>[] = [];

    for (const family of usedFamilies) {
        const config = FONT_URLS[family];
        if (!config) continue;

        const variants = Object.keys(config) as Array<keyof typeof config>;

        for (const variant of variants) {
            const url = config[variant];
            if (!url) continue;

            fontPromises.push((async () => {
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`Failed to fetch ${url} (Status: ${response.status})`);

                    const buffer = await response.arrayBuffer();
                    // Correctly convert ArrayBuffer to binary string for jsPDF
                    const binaryStr = arrayBufferToBinaryString(buffer);

                    const fileName = `${family}-${variant}.ttf`;
                    doc.addFileToVFS(fileName, binaryStr);
                    doc.addFont(fileName, family, variant);
                } catch (err) {
                    console.error(`[PDFService] Error loading font ${family} ${variant}:`, err);
                }
            })());
        }
    }

    if (fontPromises.length > 0) {
        await Promise.all(fontPromises);
    }
    // --- FONT LOADING END ---

    let pageIndex = 0;
    for (const nodeId of pageNodes) {
        const index = pageIndex++;
        const node = state.nodes[nodeId];
        const template = state.variants[targetVariantId]?.templates[node.type];

        if (!template) {
            if (index > 0) doc.addPage();
            continue;
        }

        if (index > 0) {
            doc.addPage(
                [template.width, template.height],
                template.width > template.height ? "landscape" : "portrait"
            );
        }

        // Determine current page height for coordinate flipping
        const pageHeight = template.height;

        // Two-level stacking (layer.order asc, zIndex asc) + hidden-layer exclusion.
        // Thumbnails (services/thumbnailService.ts) render via generatePDF, so they inherit this.
        const sortedElements = sortElementsForRender(template.elements, template.layers);

        // Writes the clickable link annotation for an element. Must run for every
        // element type — branches that `continue` before the end of the loop
        // (line, svg) call this themselves.
        const applyElementLink = (el: TemplateElement, x: number, y: number, w: number, h: number, angle: number, resolvedTargetId: string | undefined) => {
            if (!el.linkTarget || el.linkTarget === 'none') return;
            const linkArea = getRotatedAABB(x, y, w, h, angle);
            if (resolvedTargetId) {
                const targetPage = resolvePage(resolvedTargetId);
                if (targetPage) doc.link(linkArea.x, linkArea.y, linkArea.w, linkArea.h, { pageNumber: targetPage });
            } else if (el.linkTarget === 'url' && el.linkValue) {
                doc.link(linkArea.x, linkArea.y, linkArea.w, linkArea.h, { url: el.linkValue });
            }
        };

        for (const el of sortedElements) {
            // --- LINK VALIDATION (Pre-check) ---
            // If an element has an internal link target but resolves to nothing, we skip rendering it entirely.
            // This allows buttons like "Next Page" to disappear when there is no next page.

            let resolvedTargetId: string | undefined;

            if (el.linkTarget && el.linkTarget !== 'none' && el.linkTarget !== 'url') {
                if (el.linkTarget === 'parent' && node.parentId) {
                    resolvedTargetId = node.parentId;
                }
                else if (el.linkTarget === 'child_index') {
                    const idx = parseInt(el.linkValue || "0");
                    if (!isNaN(idx) && node.children && node.children[idx]) {
                        resolvedTargetId = node.children[idx];
                    }
                }
                else if (el.linkTarget === 'specific_node' && el.linkValue) {
                    resolvedTargetId = el.linkValue;
                }
                else if (el.linkTarget === 'sibling') {
                    if (node.parentId) {
                        const parent = state.nodes[node.parentId];
                        if (parent) {
                            const myIndex = parent.children.indexOf(node.id);
                            if (myIndex !== -1) {
                                const offset = parseInt(el.linkValue || "1");
                                const targetIndex = myIndex + offset;

                                // 1. Try standard sibling link
                                if (targetIndex >= 0 && targetIndex < parent.children.length) {
                                    resolvedTargetId = parent.children[targetIndex];
                                }
                                // 2. Cousin Fallback Logic (if sibling doesn't exist)
                                else if (parent.parentId) {
                                    const grandparent = state.nodes[parent.parentId];
                                    if (grandparent) {
                                        const parentIndex = grandparent.children.indexOf(parent.id);
                                        if (parentIndex !== -1) {
                                            // Determine direction: Forward (>0) or Backward (<0)
                                            const direction = offset > 0 ? 1 : -1;
                                            let uncleIndex = parentIndex + direction;

                                            // Search for the nearest "Uncle" (Parent's Sibling) that has children of the same template type
                                            while (uncleIndex >= 0 && uncleIndex < grandparent.children.length) {
                                                const uncleId = grandparent.children[uncleIndex];
                                                const uncle = state.nodes[uncleId];

                                                if (uncle && uncle.children && uncle.children.length > 0) {
                                                    // Find children of same type as current node
                                                    const candidates = uncle.children
                                                        .map(cId => state.nodes[cId])
                                                        .filter(c => c && c.type === node.type);

                                                    if (candidates.length > 0) {
                                                        // Forward: Pick First Child. Backward: Pick Last Child.
                                                        const cousin = direction > 0 ? candidates[0] : candidates[candidates.length - 1];
                                                        resolvedTargetId = cousin.id;
                                                        break; // Found matching cousin, stop searching
                                                    }
                                                }
                                                uncleIndex += direction;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                else if (el.linkTarget === 'ancestor') {
                    const levels = Math.max(1, parseInt(el.linkValue || "1"));
                    let curr: AppNode | undefined = node;
                    for (let i = 0; i < levels; i++) {
                        if (curr && curr.parentId) curr = state.nodes[curr.parentId];
                        else { curr = undefined; break; }
                    }
                    if (curr) resolvedTargetId = curr.id;
                }
                else if (el.linkTarget === 'referrer') {
                    const myId = node.referenceId || node.id;
                    const referrers = Object.values(state.nodes).filter(n => n.referenceId === myId);
                    if (referrers.length > 0) {
                        const refNode = referrers[0];
                        if (refNode.parentId) {
                            resolvedTargetId = refNode.parentId;
                        }
                    }
                }
                else if (el.linkTarget === 'child_referrer') {
                    const startIndex = el.linkValue || "0";
                    const count = el.linkValue ? (el.linkSecondaryValue || "1") : "1";

                    const referrerNode = findChildReferrerNode(node, state.nodes, startIndex, count, el.linkReferrerParentType);
                    if (referrerNode) resolvedTargetId = referrerNode.id;
                }

                // If internal link configured but no target resolved, or target page doesn't exist -> SKIP
                if (!resolvedTargetId || !resolvePage(resolvedTargetId)) {
                    continue;
                }
            }

            const x = Number(el.x) || 0;
            const y = Number(el.y) || 0;
            const w = Number(el.w) || 0;
            const h = Number(el.h) || 0;

            // --- TRANSFORM HANDLING (Opacity & Rotation) ---
            const opacity = Number(el.opacity) ?? 1;
            const hasOpacity = opacity < 1;
            const angle = Number(el.rotation) || 0;
            const hasRotation = angle !== 0;
            const hasTransform = hasOpacity || hasRotation;

            // Calculate rotation pivot using transformOrigin if set, otherwise default to center
            const ox = el.transformOrigin ? el.transformOrigin.x : 0.5;
            const oy = el.transformOrigin ? el.transformOrigin.y : 0.5;
            const cx = x + w * ox;
            const cy = y + h * oy;

            // Drawing Coordinates
            let lx = x;
            let ly = y;
            let yOffset = 0; // The magic offset to neutralize jsPDF's Y-flip

            if (hasTransform) {
                doc.saveGraphicsState();

                // SVG elements are excluded: svg2pdf emits its own per-shape graphics
                // states which REPLACE (not multiply) this outer /ca — the element
                // opacity is baked into the SVG tree instead (bakeElementOpacityIntoSvg).
                if (hasOpacity && el.type !== 'svg') {
                    try {
                        const GState = (doc as any).GState;
                        if (GState) {
                            // 'opacity' alone only sets /ca (fill alpha); strokes would
                            // stay fully opaque. /CA must carry the same value.
                            doc.setGState(new GState({ opacity: opacity, 'stroke-opacity': opacity }));
                        }
                    } catch (e) { }
                }

                if (hasRotation) {
                    // Convert Top-Left Coords to PDF Bottom-Left Coords for the Pivot
                    const pdfCx = cx;
                    const pdfCy = pageHeight - cy; // Flip Y for PDF origin

                    // Angle: PDF rotation is Counter-Clockwise. Screen is Clockwise.
                    // So we invert the angle.
                    const pdfAngle = -angle;

                    const rad = pdfAngle * (Math.PI / 180);
                    const c = Math.cos(rad);
                    const s = Math.sin(rad);

                    // Matrix: Translate(pdfCx, pdfCy) * Rotate(pdfAngle)
                    const matrixStr = `${c.toFixed(5)} ${s.toFixed(5)} ${(-s).toFixed(5)} ${c.toFixed(5)} ${pdfCx.toFixed(3)} ${pdfCy.toFixed(3)} cm`;

                    (doc as any).internal.write(matrixStr);

                    // Local Drawing Bounds: Pivot is now (0,0), so element top-left is at (-w*ox, -h*oy)
                    lx = -w * ox;
                    ly = -h * oy;

                    // Apply offset to neutralize jsPDF's Y-flip logic inside drawing commands
                    yOffset = pageHeight;
                }
            }

            // Handle Line
            if (el.type === 'line') {
                const strokeRgb = hexToRgb(el.stroke || '#000000');
                if (strokeRgb) {
                    doc.setDrawColor(strokeRgb.r, strokeRgb.g, strokeRgb.b);
                    doc.setLineWidth(Number(el.strokeWidth) || 1);
                    doc.setLineCap('butt');
                    doc.setLineDashPattern([], 0);
                    if (el.flip) {
                        doc.line(lx, ly + h + yOffset, lx + w, ly + yOffset);
                    } else {
                        doc.line(lx, ly + yOffset, lx + w, ly + h + yOffset);
                    }
                }
                if (hasTransform) doc.restoreGraphicsState();
                applyElementLink(el, x, y, w, h, angle, resolvedTargetId);
                continue;
            }
            // Handle SVG
            if (el.type === 'svg' && el.svgContent) {
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(el.svgContent, 'image/svg+xml');
                const svgElement = svgDoc.documentElement;

                // svg2pdf can't parse hsl()/hsla()/#rgba/#rrggbbaa — it silently
                // drops those fills/strokes (shape renders stroke-only or vanishes).
                // Rewrite them to rgb() + *-opacity, which it handles.
                normalizeSvgColorsInTree(svgElement);

                // Greyscale export: svg2pdf gets the tree verbatim, so desaturate
                // it here like hexToGreyscale does for every other element type.
                if (options.isGreyscale) desaturateSvgColorsInTree(svgElement);

                // Element opacity composes with the SVG's internal opacities by
                // baking it into the tree (see bakeElementOpacityIntoSvg for why
                // an outer graphics state cannot work).
                if (opacity < 1) bakeElementOpacityIntoSvg(svgElement, opacity);

                if (!svgElement.hasAttribute('width')) svgElement.setAttribute('width', String(w));
                if (!svgElement.hasAttribute('height')) svgElement.setAttribute('height', String(h));

                try {
                    await svg2pdf(svgElement, doc, {
                        x: lx,
                        y: ly + yOffset,
                        width: w,
                        height: h
                    });
                } catch (err) {
                    console.error('[PDFService] Error rendering SVG:', err);
                }

                if (hasTransform) doc.restoreGraphicsState();
                applyElementLink(el, x, y, w, h, angle, resolvedTargetId);
                continue;
            }

            // Handle Grid
            if (el.type === 'grid' && el.gridConfig) {
                const { cols, gapX, gapY, sourceType, sourceId, displayField, dataSliceStart, dataSliceCount, traversalPath } = el.gridConfig;

                let items: string[] = [];

                // 1. Determine Root(s)
                let roots: string[] = [];
                if (sourceType === 'current') {
                    roots = [nodeId]; // Current page
                } else if (sourceType === 'specific' && sourceId) {
                    if (state.nodes[sourceId]) roots = [sourceId];
                }

                // 2. Traversal
                if (traversalPath && traversalPath.length > 0) {
                    items = traverseGridData(roots, traversalPath, 0, state.nodes);
                } else {
                    // Legacy behavior: Direct children
                    if (roots.length > 0) {
                        const rootNode = state.nodes[roots[0]];
                        if (rootNode) items = rootNode.children || [];
                    }
                }

                // 3. Apply Slice
                const start = Number(dataSliceStart) || 0;
                const limit = dataSliceCount !== undefined ? Number(dataSliceCount) : undefined;
                if (start > 0 || limit !== undefined) {
                    const end = limit !== undefined ? start + limit : undefined;
                    items = items.slice(start, end);
                }

                if (items.length === 0) {
                    if (hasTransform) doc.restoreGraphicsState();
                    continue;
                }

                let offset = Number(el.gridConfig.offsetStart) || 0;
                const offsetMode = el.gridConfig.offsetMode || 'static';
                const safeCols = Math.max(1, Number(cols) || 3);

                if (offsetMode === 'dynamic' && el.gridConfig.offsetField && items.length > 0) {
                    const firstId = items[0];
                    let firstNode = state.nodes[firstId];
                    if (firstNode && firstNode.referenceId && state.nodes[firstNode.referenceId]) {
                        firstNode = state.nodes[firstNode.referenceId];
                    }
                    if (firstNode && firstNode.data[el.gridConfig.offsetField]) {
                        const parsed = parseInt(firstNode.data[el.gridConfig.offsetField]);
                        if (!isNaN(parsed)) {
                            offset = parsed + (el.gridConfig.offsetAdjustment || 0);
                        }
                    }
                }

                // Fix: If offset is negative, shift it into the grid by adding columns
                if (offset < 0) offset += safeCols;

                const sGapX = gapX ?? 10;
                const sGapY = gapY ?? 10;

                const cellW = w;
                const cellH = h;

                const fillRgb = hexToRgb(el.fill);
                const strokeRgb = hexToRgb(el.stroke);
                const strokeWidth = Number(el.strokeWidth) || 0;
                const radius = Number(el.borderRadius) || 0;

                // --- Template support for grid display field ---
                let templatePattern = displayField || '{{title}}';
                if (!templatePattern.includes('{{')) {
                    templatePattern = `{{${templatePattern}}}`;
                }

                if (el.borderStyle === 'dashed') doc.setLineDashPattern([3, 3], 0);
                else if (el.borderStyle === 'dotted') doc.setLineDashPattern([1, 1], 0);
                else doc.setLineDashPattern([], 0);
                doc.setLineCap('butt');

                // Grid formatting config
                const gc = el.gridConfig;
                const cellRadius = gc.gridBorderRadius ?? 0;
                const gridBorderMode = gc.gridBorderMode || 'all';
                const totalGridItems = items.length + offset;
                const totalRows = Math.max(1, Math.ceil(totalGridItems / safeCols));

                // Type for per-side config
                type BSide = { width: number; color: string; style: 'solid' | 'dashed' | 'dotted' | 'none' | 'double' } | undefined;
                // Per-cell border config — uses ONLY grid-specific settings (independent from element stroke)
                const cellBorderWidth = gc.gridBorderWidth ?? 0;
                const cellBorderColor = gc.gridBorderColor || '';
                const cellBorderStyle = gc.gridBorderStyle || 'solid';
                const cellBorderRgb = hexToRgb(cellBorderColor);
                const hasCellBorderDef = cellBorderWidth > 0 && !!cellBorderRgb && cellBorderStyle !== 'none';
                const defaultBorderSide: BSide = hasCellBorderDef
                    ? { width: cellBorderWidth, color: cellBorderColor, style: cellBorderStyle as any }
                    : undefined;

                // Helper: compute border sides config for a cell
                const getCellBorderSides = (row: number, col: number): { top?: BSide; right?: BSide; bottom?: BSide; left?: BSide } | null => {
                    if (!defaultBorderSide) return null;
                    if (gridBorderMode === 'none') return {};
                    if (gridBorderMode === 'all') {
                        return { top: defaultBorderSide, right: defaultBorderSide, bottom: defaultBorderSide, left: defaultBorderSide };
                    }
                    const isTop = row === 0;
                    const isBottom = row === totalRows - 1;
                    const isLeft = col === 0;
                    const isRight = col === safeCols - 1;
                    if (gridBorderMode === 'outside') {
                        return { top: isTop ? defaultBorderSide : undefined, right: isRight ? defaultBorderSide : undefined, bottom: isBottom ? defaultBorderSide : undefined, left: isLeft ? defaultBorderSide : undefined };
                    }
                    if (gridBorderMode === 'inside') {
                        return { top: !isTop ? defaultBorderSide : undefined, right: !isRight ? defaultBorderSide : undefined, bottom: !isBottom ? defaultBorderSide : undefined, left: !isLeft ? defaultBorderSide : undefined };
                    }
                    return { top: defaultBorderSide, right: defaultBorderSide, bottom: defaultBorderSide, left: defaultBorderSide };
                };

                // Helper: draw per-side borders with independent styles (inset by half stroke width to stay inside cell)
                const drawCellBorders = (cx: number, cy: number, cw: number, ch: number, yo: number, sides: { top?: BSide; right?: BSide; bottom?: BSide; left?: BSide }) => {
                    // If cellRadius > 0 and all 4 sides are present with same config, use roundedRect
                    if (cellRadius > 0 && sides.top && sides.right && sides.bottom && sides.left
                        && sides.top.color === sides.right.color && sides.top.color === sides.bottom.color && sides.top.color === sides.left.color
                        && sides.top.width === sides.right.width && sides.top.width === sides.bottom.width && sides.top.width === sides.left.width
                        && sides.top.style === sides.right.style && sides.top.style === sides.bottom.style && sides.top.style === sides.left.style) {
                        const side = sides.top;
                        const sw = side.width;
                        const rgb = options.isGreyscale ? hexToGreyscale(side.color) : hexToRgb(side.color);
                        if (!rgb) return;
                        doc.setDrawColor(rgb.r, rgb.g, rgb.b);
                        doc.setLineWidth(sw);
                        if (side.style === 'dashed') doc.setLineDashPattern([3, 3], 0);
                        else if (side.style === 'dotted') doc.setLineDashPattern([1, 1], 0);
                        else doc.setLineDashPattern([], 0);
                        // Inset by half stroke width so border stays inside the cell
                        doc.roundedRect(cx + sw / 2, cy + yo + sw / 2, cw - sw, ch - sw, cellRadius, cellRadius, 'D');
                        return;
                    }
                    // Fallback: draw individual lines (no radius), inset by half each side's width
                    const topW = sides.top?.width || 0;
                    const rightW = sides.right?.width || 0;
                    const bottomW = sides.bottom?.width || 0;
                    const leftW = sides.left?.width || 0;
                    const drawSide = (side: BSide, x1: number, y1: number, x2: number, y2: number) => {
                        if (!side) return;
                        const rgb = options.isGreyscale ? hexToGreyscale(side.color) : hexToRgb(side.color);
                        if (!rgb) return;
                        doc.setDrawColor(rgb.r, rgb.g, rgb.b);
                        doc.setLineWidth(side.width);
                        if (side.style === 'dashed') doc.setLineDashPattern([3, 3], 0);
                        else if (side.style === 'dotted') doc.setLineDashPattern([1, 1], 0);
                        else doc.setLineDashPattern([], 0);
                        doc.line(x1, y1, x2, y2);
                    };
                    // Top: inset by topW/2 from top edge
                    drawSide(sides.top, cx, cy + yo + topW / 2, cx + cw, cy + yo + topW / 2);
                    // Right: inset by rightW/2 from right edge
                    drawSide(sides.right, cx + cw - rightW / 2, cy + yo, cx + cw - rightW / 2, cy + ch + yo);
                    // Bottom: inset by bottomW/2 from bottom edge
                    drawSide(sides.bottom, cx, cy + ch + yo - bottomW / 2, cx + cw, cy + ch + yo - bottomW / 2);
                    // Left: inset by leftW/2 from left edge
                    drawSide(sides.left, cx + leftW / 2, cy + yo, cx + leftW / 2, cy + ch + yo);
                };

                // Draw empty cell borders (offset + trailing) if enabled
                if (gc.showEmptyCellBorders && gridBorderMode !== 'none') {
                    // Offset cells at the beginning
                    for (let i = 0; i < offset; i++) {
                        const row = Math.floor(i / safeCols);
                        const col = ((i % safeCols) + safeCols) % safeCols;
                        const cellX = lx + col * (cellW + sGapX);
                        const cellY = ly + row * (cellH + sGapY);
                        const sides = getCellBorderSides(row, col);
                        if (sides && (sides.top || sides.right || sides.bottom || sides.left)) {
                            drawCellBorders(cellX, cellY, cellW, cellH, yOffset, sides);
                        }
                    }
                    // Trailing cells to fill the last row
                    const lastItemPos = items.length + offset - 1;
                    const lastRow = Math.floor(lastItemPos / safeCols);
                    const lastCol = ((lastItemPos % safeCols) + safeCols) % safeCols;
                    for (let c = lastCol + 1; c < safeCols; c++) {
                        const cellX = lx + c * (cellW + sGapX);
                        const cellY = ly + lastRow * (cellH + sGapY);
                        const sides = getCellBorderSides(lastRow, c);
                        if (sides && (sides.top || sides.right || sides.bottom || sides.left)) {
                            drawCellBorders(cellX, cellY, cellW, cellH, yOffset, sides);
                        }
                    }
                }

                items.forEach((childId, idx) => {
                    const pos = idx + offset;
                    const row = Math.floor(pos / safeCols);
                    const col = ((pos % safeCols) + safeCols) % safeCols;

                    const cellX = lx + col * (cellW + sGapX);
                    const cellY = ly + row * (cellH + sGapY);

                    let childNode = state.nodes[childId];
                    if (childNode && childNode.referenceId && state.nodes[childNode.referenceId]) {
                        childNode = state.nodes[childNode.referenceId];
                    }

                    // Determine cell fill color (with overrides)
                    let cellFillHex = el.fill;
                    let cellTextColorHex = el.textColor || '#000000';
                    let cellFontWeight = el.fontWeight;

                    // Alternating row/column colors FIRST (lowest priority)
                    const dataRow = gc.headerRow ? row - 1 : row;
                    if (gc.alternateRows && gc.alternateRowFill && dataRow >= 0 && dataRow % 2 === 1) {
                        cellFillHex = gc.alternateRowFill;
                    }
                    if (gc.alternateColumns && gc.alternateColumnFill && col % 2 === 1) {
                        cellFillHex = gc.alternateColumnFill;
                    }

                    // Header row overrides (higher priority)
                    if (gc.headerRow && row === 0) {
                        if (gc.headerRowFill) cellFillHex = gc.headerRowFill;
                        if (gc.headerRowTextColor) cellTextColorHex = gc.headerRowTextColor;
                        if (gc.headerRowFontWeight) cellFontWeight = gc.headerRowFontWeight;
                    }
                    // First column overrides (highest priority)
                    if (gc.firstColumn && col === 0) {
                        if (gc.firstColumnFill) cellFillHex = gc.firstColumnFill;
                        if (gc.firstColumnTextColor) cellTextColorHex = gc.firstColumnTextColor;
                        if (gc.firstColumnFontWeight) cellFontWeight = gc.firstColumnFontWeight;
                    }

                    const cellFillRgb = options.isGreyscale ? hexToGreyscale(cellFillHex) : hexToRgb(cellFillHex);
                    const cellBorderSides = getCellBorderSides(row, col);
                    const hasCellBorder = cellBorderSides && (cellBorderSides.top || cellBorderSides.right || cellBorderSides.bottom || cellBorderSides.left);

                    // Draw Cell
                    if (el.fillType === 'pattern' && el.patternType) {
                        if (cellFillHex) {
                            doc.saveGraphicsState();
                            clipToShape(doc, 'rect', cellX, cellY + yOffset, cellW, cellH, cellRadius, 0);
                            let patternFill = cellFillHex;
                            if (options.isGreyscale) {
                                const grey = hexToGreyscale(patternFill);
                                if (grey) patternFill = '#' + ((1 << 24) + (grey.r << 16) + (grey.g << 8) + grey.b).toString(16).slice(1).toUpperCase();
                            }
                            drawPattern(doc, el.patternType, cellX, cellY + yOffset, cellW, cellH, patternFill, Number(el.patternSpacing), Number(el.patternWeight));
                            doc.restoreGraphicsState();
                        }
                        if (hasCellBorder) {
                            drawCellBorders(cellX, cellY, cellW, cellH, yOffset, cellBorderSides!);
                        }
                    } else {
                        // Check if we can combine fill+stroke in one roundedRect('FD') call
                        // This prevents fill from leaking outside the border at rounded corners
                        const bs = cellBorderSides;
                        const uniformBorder = hasCellBorder && bs && bs.top && bs.right && bs.bottom && bs.left
                            && bs.top.color === bs.right.color && bs.top.color === bs.bottom.color && bs.top.color === bs.left.color
                            && bs.top.width === bs.right.width && bs.top.width === bs.bottom.width && bs.top.width === bs.left.width
                            && bs.top.style === bs.right.style && bs.top.style === bs.bottom.style && bs.top.style === bs.left.style;

                        if (cellRadius > 0 && cellFillRgb && uniformBorder && bs!.top) {
                            const side = bs!.top!;
                            const sw = side.width;
                            const borderRgb = options.isGreyscale ? hexToGreyscale(side.color) : hexToRgb(side.color);
                            if (borderRgb) {
                                doc.setFillColor(cellFillRgb.r, cellFillRgb.g, cellFillRgb.b);
                                doc.setDrawColor(borderRgb.r, borderRgb.g, borderRgb.b);
                                doc.setLineWidth(sw);
                                if (side.style === 'dashed') doc.setLineDashPattern([3, 3], 0);
                                else if (side.style === 'dotted') doc.setLineDashPattern([1, 1], 0);
                                else doc.setLineDashPattern([], 0);
                                // Single FD call: fill and stroke share the same path — no leaking
                                doc.roundedRect(cellX + sw / 2, cellY + yOffset + sw / 2, cellW - sw, cellH - sw, cellRadius, cellRadius, 'FD');
                            }
                        } else {
                            // Fill
                            if (cellFillRgb) {
                                doc.setFillColor(cellFillRgb.r, cellFillRgb.g, cellFillRgb.b);
                                doc.roundedRect(cellX, cellY + yOffset, cellW, cellH, cellRadius, cellRadius, 'F');
                            }
                            // Stroke
                            if (hasCellBorder) {
                                drawCellBorders(cellX, cellY, cellW, cellH, yOffset, cellBorderSides!);
                            }
                        }
                    }

                    // Text
                    let txt = "";
                    if (childNode) {
                        txt = resolveText(templatePattern, childNode, state);
                    }

                    if (isVisibleText(txt, el.fontSize)) {
                        // Apply font with cell-specific overrides
                        const cellEl = { ...el, textColor: cellTextColorHex, fontWeight: cellFontWeight } as any;
                        applyFont(doc, cellEl, options.isGreyscale);
                        // Vertical Alignment Logic
                        let textY = cellY + cellH / 2;
                        let baseline: any = 'middle';

                        if (el.verticalAlign === 'top') {
                            textY = cellY + 4;
                            baseline = 'top';
                        } else if (el.verticalAlign === 'bottom') {
                            textY = cellY + cellH - 4;
                            baseline = 'bottom';
                        }

                        let textX = cellX + cellW / 2;
                        if (el.align === 'left') textX = cellX + 4;
                        if (el.align === 'right') textX = cellX + cellW - 4;

                        try {
                            doc.text(String(txt), textX, textY + yOffset, { align: el.align || 'center', baseline: baseline });
                        } catch (err) {
                            console.error(`[PDFService] Grid doc.text CRASH args:`, { txt, textX, textY, align: el.align || 'center', baseline });
                            throw err;
                        }
                    }

                    // Link logic inside grid
                    const targetPage = resolvePage(childId);
                    if (targetPage && angle === 0) {
                        doc.link(cellX, cellY, cellW, cellH, { pageNumber: targetPage });
                    }
                });

                // Draw outer grid border (from element's stroke settings — highest priority, drawn last)
                // Grid bounds = all cols * cellW + gaps, all rows * cellH + gaps
                const gridW = safeCols * cellW + (safeCols - 1) * sGapX;
                const gridH = totalRows * cellH + (totalRows - 1) * sGapY;

                if (el.borderSides) {
                    // Per-side outer border using borderSides config
                    const outerSides: { top?: BSide; right?: BSide; bottom?: BSide; left?: BSide } = {};
                    if (el.borderSides.top) outerSides.top = { width: el.borderSides.top.width, color: el.borderSides.top.color, style: el.borderSides.top.style as any };
                    if (el.borderSides.right) outerSides.right = { width: el.borderSides.right.width, color: el.borderSides.right.color, style: el.borderSides.right.style as any };
                    if (el.borderSides.bottom) outerSides.bottom = { width: el.borderSides.bottom.width, color: el.borderSides.bottom.color, style: el.borderSides.bottom.style as any };
                    if (el.borderSides.left) outerSides.left = { width: el.borderSides.left.width, color: el.borderSides.left.color, style: el.borderSides.left.style as any };
                    if (outerSides.top || outerSides.right || outerSides.bottom || outerSides.left) {
                        drawCellBorders(lx, ly, gridW, gridH, yOffset, outerSides);
                    }
                } else {
                    const outerStrokeRgb = options.isGreyscale ? hexToGreyscale(el.stroke) : strokeRgb;
                    if (outerStrokeRgb && strokeWidth > 0 && el.borderStyle !== 'none') {
                        doc.setDrawColor(outerStrokeRgb.r, outerStrokeRgb.g, outerStrokeRgb.b);
                        doc.setLineWidth(strokeWidth);
                        if (el.borderStyle === 'dashed') doc.setLineDashPattern([3, 3], 0);
                        else if (el.borderStyle === 'dotted') doc.setLineDashPattern([1, 1], 0);
                        else doc.setLineDashPattern([], 0);
                        // Inset by half stroke width so border stays inside the grid
                        const sw2 = strokeWidth / 2;
                        doc.roundedRect(lx + sw2, ly + yOffset + sw2, gridW - strokeWidth, gridH - strokeWidth, radius, radius, 'D');
                    }
                }

                doc.setLineDashPattern([], 0);
                if (hasTransform) doc.restoreGraphicsState();
                continue;
            }

            // Standard Shapes & Text
            const fillRgb = options.isGreyscale ? hexToGreyscale(el.fill) : hexToRgb(el.fill);
            const strokeRgb = options.isGreyscale ? hexToGreyscale(el.stroke) : hexToRgb(el.stroke);
            const strokeWidth = Number(el.strokeWidth) || 0;
            const radius = Number(el.borderRadius) || 0;

            // Setup styles for this element
            if (el.borderStyle === 'dashed') doc.setLineDashPattern([3, 3], 0);
            else if (el.borderStyle === 'dotted') doc.setLineDashPattern([1, 1], 0);
            else doc.setLineDashPattern([], 0);
            doc.setLineCap('butt');

            const drawShape = (drawStyle: string) => {
                if (el.type === 'rect' || el.type === 'text') {
                    doc.roundedRect(lx, ly + yOffset, w, h, radius, radius, drawStyle);
                } else if (el.type === 'ellipse') {
                    doc.ellipse(lx + w / 2, ly + h / 2 + yOffset, w / 2, h / 2, drawStyle);
                } else if (el.type === 'triangle') {
                    // Triangle: Top, BottomLeft, BottomRight
                    // ly is top-left of bounding box
                    doc.triangle(
                        lx + w / 2, ly + yOffset,
                        lx, ly + h + yOffset,
                        lx + w, ly + h + yOffset,
                        drawStyle
                    );
                }
            };

            if (el.fillType === 'pattern' && el.patternType && el.fill) {
                doc.saveGraphicsState();
                clipToShape(doc, el.type, lx, ly + yOffset, w, h, radius, 0);
                // For patterns, if greyscale, we might want to convert the pattern fill color too
                // Since drawPattern uses fill hex directly, let's fix that or convert hex if needed
                let patternFill = el.fill;
                if (options.isGreyscale && patternFill) {
                    const g = hexToGreyscale(patternFill);
                    if (g) patternFill = '#' + ((1 << 24) + (g.r << 16) + (g.g << 8) + g.b).toString(16).slice(1).toUpperCase();
                }
                drawPattern(doc, el.patternType, lx, ly + yOffset, w, h, patternFill, Number(el.patternSpacing), Number(el.patternWeight));
                doc.restoreGraphicsState();

                if (strokeRgb && strokeWidth > 0 && el.borderStyle !== 'none') {
                    // Per-side borders for rect/text with new config type
                    if (el.borderSides && (el.type === 'rect' || el.type === 'text')) {
                        const bs = el.borderSides;
                        const topW = bs.top?.width || 0;
                        const rightW = bs.right?.width || 0;
                        const bottomW = bs.bottom?.width || 0;
                        const leftW = bs.left?.width || 0;
                        const bx = lx, by = ly + yOffset;

                        // Draw a filled trapezoid for solid borders (CSS-like mitered corners)
                        const drawSolidTrapezoid = (side: typeof bs.top, points: [number, number][]) => {
                            if (!side || side.width <= 0) return;
                            const rgb = options.isGreyscale ? hexToGreyscale(side.color) : hexToRgb(side.color);
                            if (!rgb) return;
                            doc.setFillColor(rgb.r, rgb.g, rgb.b);
                            // Build path as delta vectors from starting point
                            const vectors: [number, number][] = [];
                            for (let i = 1; i < points.length; i++) {
                                vectors.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]);
                            }
                            doc.lines(vectors, points[0][0], points[0][1], [1, 1], 'F', true);
                        };

                        // Draw an inset line for dashed/dotted borders
                        const drawDashedLine = (side: typeof bs.top, x1: number, y1: number, x2: number, y2: number) => {
                            if (!side || side.width <= 0) return;
                            const rgb = options.isGreyscale ? hexToGreyscale(side.color) : hexToRgb(side.color);
                            if (!rgb) return;
                            doc.setDrawColor(rgb.r, rgb.g, rgb.b);
                            doc.setLineWidth(side.width);
                            if (side.style === 'dashed') doc.setLineDashPattern([3, 3], 0);
                            else if (side.style === 'dotted') doc.setLineDashPattern([1, 1], 0);
                            doc.line(x1, y1, x2, y2);
                        };

                        // Top border
                        if (bs.top && bs.top.width > 0) {
                            if (bs.top.style === 'dashed' || bs.top.style === 'dotted') {
                                drawDashedLine(bs.top, bx + leftW, by + topW / 2, bx + w - rightW, by + topW / 2);
                            } else {
                                drawSolidTrapezoid(bs.top, [[bx, by], [bx + w, by], [bx + w - rightW, by + topW], [bx + leftW, by + topW]]);
                            }
                        }
                        // Right border
                        if (bs.right && bs.right.width > 0) {
                            if (bs.right.style === 'dashed' || bs.right.style === 'dotted') {
                                drawDashedLine(bs.right, bx + w - rightW / 2, by + topW, bx + w - rightW / 2, by + h - bottomW);
                            } else {
                                drawSolidTrapezoid(bs.right, [[bx + w, by], [bx + w, by + h], [bx + w - rightW, by + h - bottomW], [bx + w - rightW, by + topW]]);
                            }
                        }
                        // Bottom border
                        if (bs.bottom && bs.bottom.width > 0) {
                            if (bs.bottom.style === 'dashed' || bs.bottom.style === 'dotted') {
                                drawDashedLine(bs.bottom, bx + leftW, by + h - bottomW / 2, bx + w - rightW, by + h - bottomW / 2);
                            } else {
                                drawSolidTrapezoid(bs.bottom, [[bx + w, by + h], [bx, by + h], [bx + leftW, by + h - bottomW], [bx + w - rightW, by + h - bottomW]]);
                            }
                        }
                        // Left border
                        if (bs.left && bs.left.width > 0) {
                            if (bs.left.style === 'dashed' || bs.left.style === 'dotted') {
                                drawDashedLine(bs.left, bx + leftW / 2, by + topW, bx + leftW / 2, by + h - bottomW);
                            } else {
                                drawSolidTrapezoid(bs.left, [[bx, by + h], [bx, by], [bx + leftW, by + topW], [bx + leftW, by + h - bottomW]]);
                            }
                        }
                    } else {
                        doc.setDrawColor(strokeRgb.r, strokeRgb.g, strokeRgb.b);
                        doc.setLineWidth(strokeWidth);
                        if (el.borderStyle === 'dashed') doc.setLineDashPattern([3, 3], 0);
                        else if (el.borderStyle === 'dotted') doc.setLineDashPattern([1, 1], 0);
                        else doc.setLineDashPattern([], 0);
                        doc.setLineCap('butt');
                        drawShape('D');
                    }
                }
            } else if (fillRgb) {
                doc.setFillColor(fillRgb.r, fillRgb.g, fillRgb.b);
                drawShape('F');
            }

            if (strokeRgb && strokeWidth > 0 && el.borderStyle !== 'none' && el.fillType !== 'pattern') {
                // Per-side borders for rect/text with new config type
                if (el.borderSides && (el.type === 'rect' || el.type === 'text')) {
                    const bs = el.borderSides;
                    const topW = bs.top?.width || 0;
                    const rightW = bs.right?.width || 0;
                    const bottomW = bs.bottom?.width || 0;
                    const leftW = bs.left?.width || 0;
                    const bx = lx, by = ly + yOffset;

                    const drawSolidTrapezoid = (side: typeof bs.top, points: [number, number][]) => {
                        if (!side || side.width <= 0) return;
                        const rgb = options.isGreyscale ? hexToGreyscale(side.color) : hexToRgb(side.color);
                        if (!rgb) return;
                        doc.setFillColor(rgb.r, rgb.g, rgb.b);
                        const vectors: [number, number][] = [];
                        for (let i = 1; i < points.length; i++) {
                            vectors.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]);
                        }
                        doc.lines(vectors, points[0][0], points[0][1], [1, 1], 'F', true);
                    };

                    const drawDashedLine = (side: typeof bs.top, x1: number, y1: number, x2: number, y2: number) => {
                        if (!side || side.width <= 0) return;
                        const rgb = options.isGreyscale ? hexToGreyscale(side.color) : hexToRgb(side.color);
                        if (!rgb) return;
                        doc.setDrawColor(rgb.r, rgb.g, rgb.b);
                        doc.setLineWidth(side.width);
                        if (side.style === 'dashed') doc.setLineDashPattern([3, 3], 0);
                        else if (side.style === 'dotted') doc.setLineDashPattern([1, 1], 0);
                        doc.line(x1, y1, x2, y2);
                    };

                    if (bs.top && bs.top.width > 0) {
                        if (bs.top.style === 'dashed' || bs.top.style === 'dotted') {
                            drawDashedLine(bs.top, bx + leftW, by + topW / 2, bx + w - rightW, by + topW / 2);
                        } else {
                            drawSolidTrapezoid(bs.top, [[bx, by], [bx + w, by], [bx + w - rightW, by + topW], [bx + leftW, by + topW]]);
                        }
                    }
                    if (bs.right && bs.right.width > 0) {
                        if (bs.right.style === 'dashed' || bs.right.style === 'dotted') {
                            drawDashedLine(bs.right, bx + w - rightW / 2, by + topW, bx + w - rightW / 2, by + h - bottomW);
                        } else {
                            drawSolidTrapezoid(bs.right, [[bx + w, by], [bx + w, by + h], [bx + w - rightW, by + h - bottomW], [bx + w - rightW, by + topW]]);
                        }
                    }
                    if (bs.bottom && bs.bottom.width > 0) {
                        if (bs.bottom.style === 'dashed' || bs.bottom.style === 'dotted') {
                            drawDashedLine(bs.bottom, bx + leftW, by + h - bottomW / 2, bx + w - rightW, by + h - bottomW / 2);
                        } else {
                            drawSolidTrapezoid(bs.bottom, [[bx + w, by + h], [bx, by + h], [bx + leftW, by + h - bottomW], [bx + w - rightW, by + h - bottomW]]);
                        }
                    }
                    if (bs.left && bs.left.width > 0) {
                        if (bs.left.style === 'dashed' || bs.left.style === 'dotted') {
                            drawDashedLine(bs.left, bx + leftW / 2, by + topW, bx + leftW / 2, by + h - bottomW);
                        } else {
                            drawSolidTrapezoid(bs.left, [[bx, by + h], [bx, by], [bx + leftW, by + topW], [bx + leftW, by + h - bottomW]]);
                        }
                    }
                } else {
                    doc.setDrawColor(strokeRgb.r, strokeRgb.g, strokeRgb.b);
                    doc.setLineWidth(strokeWidth);
                    if (el.borderStyle === 'dashed') doc.setLineDashPattern([3, 3], 0);
                    else if (el.borderStyle === 'dotted') doc.setLineDashPattern([1, 1], 0);
                    else doc.setLineDashPattern([], 0);
                    doc.setLineCap('butt');
                    drawShape('D');
                }
            }

            // Text Content with Ancestral/Referrer Resolution
            let textContent = el.text || "";
            if (el.dataBinding && !textContent) {
                if (el.dataBinding === 'title') textContent = '{{title}}';
                else textContent = `{{${el.dataBinding}}}`;
            }

            // Resolve variables using the node and global state (to find ancestors/referrers)
            textContent = resolveText(textContent, node, state);
            const fontSize = resolveTextFontSize(el.fontSize);
            const renderText = isVisibleText(textContent, el.fontSize);

            if (renderText) {
                applyFont(doc, el, options.isGreyscale);

                // Line height matching CSS lineHeight: 1.2
                const lineHeight = fontSize * 1.2;

                // Half-leading: CSS distributes extra line-height space equally above and below
                const halfLeading = (lineHeight - fontSize) / 2;

                // Baseline offset from top of line-box: halfLeading + ascent
                // Most fonts have ascent around 80% of em-box
                const baselineFromLineTop = halfLeading + fontSize * 0.8;

                // Auto-Width Logic: Treat as left-aligned with no width limit
                const isAutoWidth = !!el.autoWidth;
                const effectiveAlign = isAutoWidth ? 'left' : (el.align || 'left');

                // Calculate max width for text wrapping
                let maxWidth = w;
                if (isAutoWidth) {
                    maxWidth = 10000; // Effectively no wrapping
                } else if (el.type === 'text') {
                    maxWidth = w - 2; // Small padding
                } else {
                    maxWidth = w - 10; // More padding for shapes
                }

                // Split text into lines that fit within maxWidth
                const lines: string[] = doc.splitTextToSize(textContent, maxWidth);
                const totalTextHeight = lines.length * lineHeight;

                // Calculate starting Y position based on vertical alignment
                // CSS flexbox with lineHeight: 1.2 aligns the line-box, not the visual text
                let startY: number;
                if (el.verticalAlign === 'top') {
                    // Top alignment: line-box top at container top
                    startY = ly + baselineFromLineTop;
                    if (el.type === 'triangle') startY += h / 6;
                } else if (el.verticalAlign === 'bottom') {
                    // Bottom alignment: last line-box bottom at container bottom
                    startY = ly + h - totalTextHeight + baselineFromLineTop;
                } else {
                    // Middle/center alignment: center the line-boxes
                    const topOffset = (h - totalTextHeight) / 2;
                    startY = ly + topOffset + baselineFromLineTop;
                    if (el.type === 'triangle') startY += h / 6;
                }

                // Calculate X position based on alignment
                let posX: number;
                if (el.type === 'text') {
                    if (effectiveAlign === 'center') posX = lx + w / 2;
                    else if (effectiveAlign === 'right') posX = lx + w;
                    else posX = lx;
                } else {
                    // Shapes
                    posX = lx + w / 2;
                    if (el.align === 'left') posX = lx + 5;
                    if (el.align === 'right') posX = lx + w - 5;
                }

                // Render each line
                lines.forEach((line: string, idx: number) => {
                    const lineY = startY + idx * lineHeight + yOffset;
                    doc.text(line, posX, lineY, { align: effectiveAlign, baseline: 'alphabetic' });
                });

                if (el.textDecoration === 'underline') {
                    // Set underline color to match text color
                    const underlineRgb = options.isGreyscale ? hexToGreyscale(el.textColor || '#000000') : hexToRgb(el.textColor || '#000000');
                    if (underlineRgb) {
                        doc.setDrawColor(underlineRgb.r, underlineRgb.g, underlineRgb.b);
                    }
                    doc.setLineWidth(Math.max(0.5, fontSize * 0.05)); // Scale line width to font size

                    // Calculate underline for each line
                    lines.forEach((line: string, idx: number) => {
                        const txtWidth = doc.getTextWidth(line);
                        // Underline offset: ~15% of fontSize below baseline
                        const underlineOffset = fontSize * 0.15;
                        const lineY = startY + idx * lineHeight + underlineOffset + yOffset;
                        let lineX = posX;
                        // Use effectiveAlign (not el.align) to match text rendering
                        if (effectiveAlign === 'center') lineX -= txtWidth / 2;
                        if (effectiveAlign === 'right') lineX -= txtWidth;

                        doc.setLineDashPattern([], 0);
                        doc.setLineCap('butt');
                        doc.line(lineX, lineY, lineX + txtWidth, lineY);
                    });
                }
            }

            if (hasTransform) doc.restoreGraphicsState();

            // Apply Link (if resolvedTargetId exists from earlier validation check)
            if (el.type !== 'text' || renderText) {
                applyElementLink(el, x, y, w, h, angle, resolvedTargetId);
            }
        }
    }

    if (options.output === 'arraybuffer') {
        return doc.output('arraybuffer');
    }
    const vName = state.variants[targetVariantId]?.name || 'export';
    doc.save(`${options.projectName || 'project'}_${vName}.pdf`);
};

/**
 * Renders one PDF per variant in `state.variants` (reusing the existing `generatePDF`
 * arraybuffer mode) and packages them into a single zip archive. Does not trigger a
 * download itself — see `downloadVariantsZip` for that.
 */
export const generateVariantsZip = async (state: AppState, projectName: string): Promise<Blob> => {
    if (!state.variants || Object.keys(state.variants).length === 0) {
        throw new Error('This project has no variants to export.');
    }
    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const variantId of Object.keys(state.variants)) {
        const variant = state.variants[variantId];
        const buffer = (await generatePDF(state, { variantId, projectName, output: 'arraybuffer' })) as ArrayBuffer;
        let fileName = (variant.name || variantId).replace(/[\\/:*?"<>|]+/g, '_').trim() || variantId;
        if (usedNames.has(fileName)) {
            let n = 2;
            while (usedNames.has(`${fileName}_${n}`)) n++;
            fileName = `${fileName}_${n}`;
        }
        usedNames.add(fileName);
        zip.file(`${fileName}.pdf`, buffer);
    }
    return zip.generateAsync({ type: 'blob' });
};

/** Generates the zip (see `generateVariantsZip`) and triggers a single browser download of it. */
export const downloadVariantsZip = async (state: AppState, projectName: string): Promise<void> => {
    const blob = await generateVariantsZip(state, projectName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_all_variants.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};
