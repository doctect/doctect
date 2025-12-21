

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
  // Standard Paper
  'a4': { name: 'A4', w: 595.28, h: 841.89 },
  'letter': { name: 'Letter (US)', w: 612, h: 792 },
  'legal': { name: 'Legal', w: 612, h: 1008 },
  'a5': { name: 'A5', w: 419.53, h: 595.28 },

  // 11.8" Devices
  'rm_pp': { name: 'reMarkable Paper Pro', w: 509, h: 679 },

  // 10.3" Devices (1404 x 1872 px approx)
  'rm2': { name: 'reMarkable 2', w: 445, h: 592 },
  'boox_note_air': { name: 'Boox Note Air 3 / 3C', w: 445, h: 592 },
  'boox_go_10': { name: 'Boox Go 10.3', w: 445, h: 592 },
  'supernote_a5x': { name: 'Supernote A5 X / A5 X2', w: 445, h: 592 },
  'kindle_scribe': { name: 'Kindle Scribe', w: 432, h: 576 }, 
  'note_10_3': { name: 'Generic 10.3"', w: 445, h: 592 }, 

  // 13.3" Devices
  'boox_tab_x': { name: 'Boox Tab X', w: 574, h: 765 },
  'boox_note_max': { name: 'Boox Note Max', w: 574, h: 765 },
  'note_13_3': { name: 'Generic 13.3"', w: 574, h: 765 },

  // 7.8" Devices
  'supernote_nomad': { name: 'Supernote Nomad (A6 X2)', w: 336, h: 448 },
  'boox_nova_air': { name: 'Boox Nova Air', w: 336, h: 448 },
  'note_7_8': { name: 'Generic 7.8"', w: 336, h: 448 },

  // 7" Devices
  'rm_pp_move': { name: 'reMarkable Paper Pro Move', w: 462.55, h: 260.18 },
};