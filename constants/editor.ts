
export const UNIT_CONVERSION = { 'pt': 1, 'px': 1, 'in': 72, 'mm': 2.83465 };

export const FONTS = [
    { value: 'helvetica', label: 'Helvetica (Sans)' },
    { value: 'times', label: 'Times New Roman (Serif)' },
    { value: 'courier', label: 'Courier (Mono)' },
    { value: 'caveat', label: 'Caveat (Handwriting)' },
    { value: 'dancing-script', label: 'Dancing Script (Handwriting)' }, 
    { value: 'patrick-hand', label: 'Patrick Hand (Marker)' },
    { value: 'merriweather', label: 'Merriweather (Serif)' },
    { value: 'playfair-display', label: 'Playfair Display (Serif)' }, 
    { value: 'roboto-mono', label: 'Roboto Mono' }
];

export const BORDER_STYLES = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'double', label: 'Double' },
    { value: 'none', label: 'None' }
];

export const PAGE_PRESETS: Record<string, { name: string, w: number, h: number }> = {
  'a4': { name: 'A4', w: 595.28, h: 841.89 },
  'letter': { name: 'Letter (US)', w: 612, h: 792 },
  'legal': { name: 'Legal', w: 612, h: 1008 },
  'a5': { name: 'A5', w: 419.53, h: 595.28 },
  'note_10_3': { name: '10.3" E-Ink (RM2, A5X, Go 10.3)', w: 445, h: 592 }, 
  'rm_pp': { name: 'reMarkable Paper Pro (11.8")', w: 509, h: 679 },
  'note_13_3': { name: '13.3" E-Ink (Note Max, Tab X)', w: 574, h: 765 },
  'note_7_8': { name: '7.8" E-Ink (Nomad, Nova)', w: 336, h: 448 },
};
