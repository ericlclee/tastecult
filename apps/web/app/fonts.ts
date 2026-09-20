import {
  Bricolage_Grotesque,
  Crimson_Pro,
  DM_Sans,
  EB_Garamond,
  Figtree,
  Fraunces,
  Instrument_Serif,
  Inter,
  Lora,
  Manrope,
  Newsreader,
  Outfit,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Poppins,
  Rubik,
  Sora,
  Source_Serif_4,
  Space_Grotesk,
  Work_Sans,
} from 'next/font/google';

// Every choice in the design panel is loaded here and exposed as a CSS variable, so
// switching fonts is just a change of data attribute on <html> (see globals.css).
//
// Two rules from Next.js shape this file: each loader must be called and assigned to its
// own const in module scope, and the options can't be shared between calls, because every
// font accepts its own set of subsets and weights. The names and descriptions live in
// font-options.ts instead, so the (client) design panel can import them without pulling
// font loaders into the browser bundle.

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const dmSans = DM_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-dm-sans' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});
const manrope = Manrope({ subsets: ['latin'], display: 'swap', variable: '--font-manrope' });
const figtree = Figtree({ subsets: ['latin'], display: 'swap', variable: '--font-figtree' });
const outfit = Outfit({ subsets: ['latin'], display: 'swap', variable: '--font-outfit' });
const workSans = Work_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-work-sans' });
const rubik = Rubik({ subsets: ['latin'], display: 'swap', variable: '--font-rubik' });
const sora = Sora({ subsets: ['latin'], display: 'swap', variable: '--font-sora' });
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bricolage',
});
// Not a variable font, so its weights are listed
const poppins = Poppins({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
});
const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-fraunces' });
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-source-serif',
});
const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-playfair',
});
const lora = Lora({ subsets: ['latin'], display: 'swap', variable: '--font-lora' });
const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-newsreader',
});
const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-eb-garamond',
});
const crimson = Crimson_Pro({ subsets: ['latin'], display: 'swap', variable: '--font-crimson' });
// Only comes in one weight
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  display: 'swap',
  weight: '400',
  variable: '--font-instrument-serif',
});

/** Goes on <html> so every font's variable is available to switch between. */
export const fontVariables = [
  inter,
  dmSans,
  jakarta,
  manrope,
  figtree,
  outfit,
  workSans,
  rubik,
  sora,
  spaceGrotesk,
  bricolage,
  poppins,
  fraunces,
  sourceSerif,
  playfair,
  lora,
  newsreader,
  ebGaramond,
  crimson,
  instrumentSerif,
]
  .map((font) => font.variable)
  .join(' ');
