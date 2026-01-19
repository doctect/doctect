

export const UNIT_CONVERSION = { 'pt': 1, 'px': 1, 'in': 72, 'mm': 2.83465 };

export const RM_PP_WIDTH = 509;
export const RM_PP_HEIGHT = 679;

export const FONTS = [
  { value: 'allura', label: 'Allura' },
  { value: 'amatic-sc', label: 'Amatic SC' },
  { value: 'anton', label: 'Anton' },
  { value: 'archivo-black', label: 'Archivo Black' },
  { value: 'bebas-neue', label: 'Bebas Neue' },
  { value: 'caveat', label: 'Caveat' },
  { value: 'cormorant-garamond', label: 'Cormorant Garamond' },
  { value: 'courier', label: 'Courier' },
  { value: 'crimson-text', label: 'Crimson Text' },
  { value: 'dancing-script', label: 'Dancing Script' },
  { value: 'eb-garamond', label: 'EB Garamond' },
  { value: 'fira-code', label: 'Fira Code' },
  { value: 'fira-sans', label: 'Fira Sans' },
  { value: 'great-vibes', label: 'Great Vibes' },
  { value: 'helvetica', label: 'Helvetica' },
  { value: 'indie-flower', label: 'Indie Flower' },
  { value: 'inter', label: 'Inter' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
  { value: 'kalam', label: 'Kalam' },
  { value: 'lato', label: 'Lato' },
  { value: 'libre-baskerville', label: 'Libre Baskerville' },
  { value: 'lora', label: 'Lora' },
  { value: 'merriweather', label: 'Merriweather' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'noto-sans', label: 'Noto Sans' },
  { value: 'noto-serif', label: 'Noto Serif' },
  { value: 'nunito', label: 'Nunito' },
  { value: 'open-sans', label: 'Open Sans' },
  { value: 'oswald', label: 'Oswald' },
  { value: 'oxygen', label: 'Oxygen' },
  { value: 'pacifico', label: 'Pacifico' },
  { value: 'patrick-hand', label: 'Patrick Hand' },
  { value: 'playfair-display', label: 'Playfair Display' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'pt-sans', label: 'PT Sans' },
  { value: 'pt-serif', label: 'PT Serif' },
  { value: 'raleway', label: 'Raleway' },
  { value: 'righteous', label: 'Righteous' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'roboto-mono', label: 'Roboto Mono' },
  { value: 'sacramento', label: 'Sacramento' },
  { value: 'satisfy', label: 'Satisfy' },
  { value: 'shadows-into-light', label: 'Shadows Into Light' },
  { value: 'source-code-pro', label: 'Source Code Pro' },
  { value: 'source-sans-pro', label: 'Source Sans Pro' },
  { value: 'times', label: 'Times New Roman' },
  { value: 'ubuntu', label: 'Ubuntu' },
  { value: 'ubuntu-mono', label: 'Ubuntu Mono' },
  { value: 'work-sans', label: 'Work Sans' },
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