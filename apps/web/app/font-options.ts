// The fonts offered by the design panel. Kept apart from fonts.ts because that file calls
// Next.js font loaders, which can't be imported by a client component like the panel.
// Each key matches a [data-font] rule in globals.css and a loaded font in fonts.ts.

export interface FontOption {
  key: string;
  label: string;
  note: string;
  group: 'Sans-serif' | 'Serif' | 'Other';
}

export const FONT_OPTIONS: FontOption[] = [
  {
    key: 'inter',
    label: 'Inter',
    note: 'Neutral and plain — the default of most apps',
    group: 'Sans-serif',
  },
  { key: 'dm-sans', label: 'DM Sans', note: 'Rounder and friendlier', group: 'Sans-serif' },
  {
    key: 'jakarta',
    label: 'Plus Jakarta Sans',
    note: 'Modern, a little more character',
    group: 'Sans-serif',
  },
  {
    key: 'manrope',
    label: 'Manrope',
    note: 'Clean and semi-rounded, slightly premium',
    group: 'Sans-serif',
  },
  {
    key: 'figtree',
    label: 'Figtree',
    note: 'Soft and approachable, good at small sizes',
    group: 'Sans-serif',
  },
  {
    key: 'outfit',
    label: 'Outfit',
    note: 'Geometric and even — quite fashion-led',
    group: 'Sans-serif',
  },
  { key: 'work-sans', label: 'Work Sans', note: 'Straightforward and sturdy', group: 'Sans-serif' },
  { key: 'rubik', label: 'Rubik', note: 'Slightly rounded corners, informal', group: 'Sans-serif' },
  { key: 'sora', label: 'Sora', note: 'Squarish and contemporary', group: 'Sans-serif' },
  {
    key: 'space-grotesk',
    label: 'Space Grotesk',
    note: 'Distinctive, slightly technical',
    group: 'Sans-serif',
  },
  {
    key: 'bricolage',
    label: 'Bricolage Grotesque',
    note: 'Quirky and editorial — lots of personality',
    group: 'Sans-serif',
  },
  {
    key: 'poppins',
    label: 'Poppins',
    note: 'Circular and bold, very recognisable',
    group: 'Sans-serif',
  },
  {
    key: 'fraunces',
    label: 'Fraunces',
    note: 'Warm editorial serif — magazine feel',
    group: 'Serif',
  },
  {
    key: 'source-serif',
    label: 'Source Serif',
    note: 'Classic serif, easy to read',
    group: 'Serif',
  },
  {
    key: 'playfair',
    label: 'Playfair Display',
    note: 'High contrast and elegant — fine dining',
    group: 'Serif',
  },
  { key: 'lora', label: 'Lora', note: 'Balanced bookish serif', group: 'Serif' },
  {
    key: 'newsreader',
    label: 'Newsreader',
    note: 'Newspaper feel, good for long notes',
    group: 'Serif',
  },
  { key: 'eb-garamond', label: 'EB Garamond', note: 'Old-style and literary', group: 'Serif' },
  { key: 'crimson', label: 'Crimson Pro', note: 'Refined and compact', group: 'Serif' },
  {
    key: 'instrument-serif',
    label: 'Instrument Serif',
    note: 'Tall and stylish — strong headlines',
    group: 'Serif',
  },
  { key: 'system', label: 'System default', note: "The device's own font", group: 'Other' },
];

export const FONT_GROUPS = ['Sans-serif', 'Serif', 'Other'] as const;

export const DEFAULT_FONT = FONT_OPTIONS[0]!.key;
