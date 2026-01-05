

export const UNIT_CONVERSION = { 'pt': 1, 'px': 1, 'in': 72, 'mm': 2.83465 };

export const FONTS = [
  // Sans-Serif
  { value: 'helvetica', label: 'Helvetica' },
  { value: 'open-sans', label: 'Open Sans' },
  { value: 'lato', label: 'Lato' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'nunito', label: 'Nunito' },
  { value: 'inter', label: 'Inter' },
  { value: 'work-sans', label: 'Work Sans' },
  { value: 'source-sans-pro', label: 'Source Sans Pro' },
  { value: 'raleway', label: 'Raleway' },
  { value: 'ubuntu', label: 'Ubuntu' },
  { value: 'pt-sans', label: 'PT Sans' },
  { value: 'noto-sans', label: 'Noto Sans' },
  { value: 'oxygen', label: 'Oxygen' },
  { value: 'fira-sans', label: 'Fira Sans' },

  // Serif
  { value: 'times', label: 'Times New Roman' },
  { value: 'lora', label: 'Lora' },
  { value: 'merriweather', label: 'Merriweather' },
  { value: 'playfair-display', label: 'Playfair Display' },
  { value: 'pt-serif', label: 'PT Serif' },
  { value: 'libre-baskerville', label: 'Libre Baskerville' },
  { value: 'crimson-text', label: 'Crimson Text' },
  { value: 'eb-garamond', label: 'EB Garamond' },
  { value: 'cormorant-garamond', label: 'Cormorant Garamond' },
  { value: 'noto-serif', label: 'Noto Serif' },

  // Monospace
  { value: 'courier', label: 'Courier' },
  { value: 'roboto-mono', label: 'Roboto Mono' },
  { value: 'fira-code', label: 'Fira Code' },
  { value: 'source-code-pro', label: 'Source Code Pro' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
  { value: 'ubuntu-mono', label: 'Ubuntu Mono' },

  // Handwriting / Script
  { value: 'caveat', label: 'Caveat' },
  { value: 'dancing-script', label: 'Dancing Script' },
  { value: 'patrick-hand', label: 'Patrick Hand' },
  { value: 'pacifico', label: 'Pacifico' },
  { value: 'great-vibes', label: 'Great Vibes' },
  { value: 'satisfy', label: 'Satisfy' },
  { value: 'sacramento', label: 'Sacramento' },
  { value: 'allura', label: 'Allura' },
  { value: 'amatic-sc', label: 'Amatic SC' },
  { value: 'indie-flower', label: 'Indie Flower' },
  { value: 'kalam', label: 'Kalam' },
  { value: 'shadows-into-light', label: 'Shadows Into Light' },

  // Display
  { value: 'bebas-neue', label: 'Bebas Neue' },
  { value: 'oswald', label: 'Oswald' },
  { value: 'anton', label: 'Anton' },
  { value: 'righteous', label: 'Righteous' },
  { value: 'archivo-black', label: 'Archivo Black' },
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