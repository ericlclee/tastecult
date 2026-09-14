import type { Tier } from '@tastecult/shared-types';

/** Every mock person's id starts with this, so demo rows can always be found and removed. */
export const DEMO_ID_PREFIX = 'd0000000-0000-4000-8000-';

/** Placeholder photos live under this folder in the photo bucket. */
export const DEMO_PHOTO_FOLDER = 'demo';

export function demoUserId(n: number): string {
  return `${DEMO_ID_PREFIX}${n.toString(16).padStart(12, '0')}`;
}

export interface Theme {
  key: string;
  /** Postgres regex matched against lower-cased restaurant names. */
  venuePattern: string;
  /** Names that match the pattern but are the wrong kind of place (e.g. chicken shops). */
  excludePattern?: string;
  /** Colour family for placeholder photos. */
  hue: number;
  /** Exact catalogue dish names; ones missing from the catalogue are skipped. */
  dishes: string[];
}

export const THEMES: Theme[] = [
  {
    key: 'ramen',
    venuePattern: 'ramen|kanada|bone daddies|tonkotsu|koya|udon|kanpai|shoryu|ippudo',
    hue: 32,
    dishes: [
      'Ramen',
      'Tonkotsu ramen',
      'Miso ramen',
      'Shoyu ramen',
      'Gyoza',
      'Karaage',
      'Udon',
      'Takoyaki',
    ],
  },
  {
    key: 'pizza',
    venuePattern: 'pizza|pizzeria|franco manca|homeslice|pilgrims|napoli|forno',
    excludePattern: 'chicken|kebab|burger|peri',
    hue: 6,
    dishes: ['Pizza', 'Pizza Margherita', 'Pizza marinara', 'Pizza alla diavola', 'Calzone Pizza'],
  },
  {
    key: 'indian',
    venuePattern:
      'dishoom|tandoor|masala|curry|bombay|punjab|indian|mumbai|dhaba|kricket|gymkhana|tayyabs',
    hue: 40,
    dishes: [
      'Murgh makhani (Butter chicken)',
      'Chicken Tikka Masala',
      'Biryani',
      'Naan',
      'Dal makhani',
      'Rogan josh',
      'Chana masala',
      'Masala dosa',
      'Panipuri',
    ],
  },
  {
    key: 'sushi',
    venuePattern: 'sushi|izakaya|sashimi|nobu|roka',
    hue: 350,
    dishes: ['Sushi', 'Sashimi', 'Nigiri', 'Maki', 'Tempura', 'Teriyaki', 'Chirashizushi'],
  },
  {
    key: 'burger',
    venuePattern: 'burger|patty|bleecker|honest|byron|five guys|shake shack|smash',
    excludePattern: 'chicken|kebab|pizza|peri',
    hue: 22,
    dishes: ['Burger', 'Cheeseburger', 'Hot Dog'],
  },
  {
    key: 'chinese',
    venuePattern: 'dim sum|yauatcha|dumpling|noodle|chinese|hakkasan|bao',
    hue: 0,
    dishes: [
      'Dim sum',
      'Xiaolongbao',
      'Chāshāo (Char siu)',
      'Beijing kao ya (Peking duck)',
      'Xiājiǎo (Har gow)',
      'Gong bao (Kung pao chicken)',
      'Chow mein',
    ],
  },
  {
    key: 'mexican',
    venuePattern: 'taco|taqueria|mexican|burrito|cantina|chilango|wahaca|breddos',
    hue: 45,
    dishes: ['Tacos', 'Tacos al pastor', 'Burrito', 'Quesadilla', 'Guacamole', 'Nachos', 'Elote'],
  },
  {
    key: 'turkish',
    venuePattern: 'kebab|turkish|ocakbasi|mangal|anatolia|istanbul|lahmacun',
    excludePattern: 'pizza|chicken|burger',
    hue: 14,
    dishes: ['Kebab', 'Adana kebap', 'Lahmacun', 'İskender kebap', 'Pide', 'Köfte'],
  },
  {
    key: 'thai',
    venuePattern: 'thai|som saa|kiln|bangkok|siam|smoking goat',
    hue: 110,
    dishes: ['Pad Thai', 'Green Curry', 'Massaman Curry', 'Tom yum', 'Khao soi', 'Larb'],
  },
  {
    key: 'vietnamese',
    venuePattern: 'pho |pho$|vietnam|banh mi|saigon|hanoi',
    hue: 95,
    dishes: ['Pho'],
  },
  {
    key: 'british',
    venuePattern: 'fish.*chip|chippy|poppies| arms$|tavern|hawksmoor|pie & mash|pie and mash',
    hue: 36,
    dishes: [
      'Fish and chips',
      'Sunday Roast',
      'English breakfast',
      'Scotch eggs',
      'Pie and mash',
      'Beef Wellington',
      'Bangers and mash',
      "Shepherd's pie",
    ],
  },
  {
    key: 'spanish',
    venuePattern: 'tapas|barrafina|spanish|bodega|brindisa|iberica|pizarro',
    hue: 26,
    dishes: [
      'Tapas',
      'Patatas bravas',
      'Croquetas',
      'Paella',
      'Tortilla de patata',
      'Gambas al ajillo',
    ],
  },
  {
    key: 'italian',
    venuePattern:
      'padella|trattoria|italian|pasta|osteria|bancone|lina stores|bocca di lupo|ristorante',
    hue: 12,
    dishes: ['Cacio e pepe', 'Carbonara', 'Lasagne', 'Risotto', 'Arancini', 'Gnocchi'],
  },
  {
    key: 'korean',
    venuePattern: 'korean|bibimbap|kimchi|seoul|jinjuu',
    hue: 355,
    dishes: [
      'Bibimbap',
      'Chikin (Korean fried chicken)',
      'Kimchi jjigae',
      'Bulgogi',
      'Tteokbokki',
      'Japchae',
    ],
  },
  {
    key: 'middleeast',
    venuePattern:
      'lebanese|falafel|shawarma|maroush|comptoir|beirut|yalla|palestin|ottolenghi|honey & co',
    hue: 52,
    dishes: [
      'Hummus',
      'Falafel',
      'Shawarma',
      'Shakshouka',
      'Baba ghanoush',
      'Tabbouleh',
      'Manakish',
      'Fattoush',
    ],
  },
  {
    key: 'cafe',
    venuePattern: 'bakery|bakehouse|patisserie|brunch',
    hue: 30,
    dishes: [
      'Eggs Benedict',
      'Avocado Toast',
      'Banana Bread',
      'American pancakes',
      'English breakfast',
    ],
  },
];

/** What restaurants actually call some dishes on their menus, keyed by catalogue name. */
export const MENU_NAMES: Record<string, string[]> = {
  Ramen: ['Tonkotsu Ramen', 'Spicy Miso Ramen', 'Black Garlic Ramen', 'Shoyu Chicken Ramen'],
  Gyoza: ['Pork Gyoza', 'Crispy Chicken Gyoza'],
  Pizza: ['Nduja & Honey', 'Pepperoni', 'Four Cheese', 'Salsiccia & Friarielli'],
  'Pizza Margherita': ['Margherita', 'Margherita DOP'],
  'Murgh makhani (Butter chicken)': ['House Butter Chicken', 'Murgh Makhani'],
  Biryani: ['Lamb Biryani', 'Chicken Dum Biryani'],
  'Dal makhani': ['House Black Daal'],
  Naan: ['Garlic Naan', 'Cheese Naan'],
  Sushi: ['Salmon Nigiri Set', "Chef's Omakase Plate"],
  Tempura: ['Prawn Tempura'],
  Burger: ['Double Smash', 'Bacon Double', 'Chilli Burger'],
  Cheeseburger: ['Classic Cheeseburger'],
  'Dim sum': ['Dim Sum Platter', 'Har Gow & Siu Mai Basket'],
  'Beijing kao ya (Peking duck)': ['Half Roast Duck'],
  Tacos: ['Pork Carnitas Tacos', 'Fish Tacos', 'Birria Tacos'],
  Burrito: ['Chicken Burrito', 'Chipotle Beef Burrito'],
  Kebab: ['Mixed Grill', 'Lamb Shish', 'Chicken Doner Wrap'],
  'Pad Thai': ['Prawn Pad Thai', 'Chicken Pad Thai'],
  'Green Curry': ['Chicken Green Curry'],
  Pho: ['Pho Bo', 'Pho Ga'],
  'Fish and chips': ['Cod & Chips', 'Haddock & Chips'],
  'Sunday Roast': ['Roast Beef', 'Roast Chicken', 'Nut Roast'],
  Tapas: ['Tapas Selection'],
  Croquetas: ['Jamón Croquetas'],
  Carbonara: ['Rigatoni Carbonara'],
  'Cacio e pepe': ['Pici Cacio e Pepe'],
  Bibimbap: ['Dolsot Bibimbap'],
  'Chikin (Korean fried chicken)': ['Yangnyeom Chicken'],
  Hummus: ['Hummus with Lamb'],
  Shawarma: ['Chicken Shawarma Wrap'],
  Falafel: ['Falafel Wrap'],
  'Eggs Benedict': ['Eggs Royale'],
  'American pancakes': ['Buttermilk Pancakes'],
};

export interface DemoPerson {
  username: string;
  displayName: string;
  /** Favourite kinds of place, most-loved first. */
  themes: string[];
  /** FHRS local authority names where their regular spots are. */
  boroughs: string[];
}

export const PEOPLE: DemoPerson[] = [
  {
    username: 'maya_eats',
    displayName: 'Maya R.',
    themes: ['ramen', 'thai', 'korean'],
    boroughs: ['Hackney', 'Islington'],
  },
  {
    username: 'tomsdinners',
    displayName: 'Tom W.',
    themes: ['british', 'italian', 'pizza'],
    boroughs: ['Wandsworth', 'Lambeth'],
  },
  {
    username: 'priya_k',
    displayName: 'Priya K.',
    themes: ['indian', 'middleeast', 'cafe'],
    boroughs: ['Brent', 'Ealing'],
  },
  {
    username: 'jonnoodles',
    displayName: 'Jonathan L.',
    themes: ['chinese', 'ramen', 'vietnamese'],
    boroughs: ['Westminster', 'Tower Hamlets'],
  },
  {
    username: 'aisha_bites',
    displayName: 'Aisha O.',
    themes: ['middleeast', 'turkish', 'british'],
    boroughs: ['Haringey', 'Enfield'],
  },
  {
    username: 'lucas_london',
    displayName: 'Lucas M.',
    themes: ['spanish', 'italian', 'pizza'],
    boroughs: ['Southwark', 'Lambeth'],
  },
  {
    username: 'hannah_brunches',
    displayName: 'Hannah S.',
    themes: ['cafe', 'british', 'italian'],
    boroughs: ['Hammersmith and Fulham', 'Kensington and Chelsea'],
  },
  {
    username: 'kwame_eats',
    displayName: 'Kwame A.',
    themes: ['burger', 'mexican', 'british'],
    boroughs: ['Lewisham', 'Greenwich'],
  },
  {
    username: 'sofia_tastes',
    displayName: 'Sofia G.',
    themes: ['sushi', 'korean', 'thai'],
    boroughs: ['Camden', 'Westminster'],
  },
  {
    username: 'dan_the_diner',
    displayName: 'Daniel P.',
    themes: ['pizza', 'burger', 'turkish'],
    boroughs: ['Newham', 'Waltham Forest'],
  },
  {
    username: 'mei_ling',
    displayName: 'Mei Ling C.',
    themes: ['chinese', 'sushi', 'vietnamese'],
    boroughs: ['Westminster', 'Barnet'],
  },
  {
    username: 'ollie_orders',
    displayName: 'Oliver B.',
    themes: ['british', 'indian', 'burger'],
    boroughs: ['Islington', 'Camden'],
  },
  {
    username: 'zara_nibbles',
    displayName: 'Zara H.',
    themes: ['middleeast', 'indian', 'cafe'],
    boroughs: ['Tower Hamlets', 'Hackney'],
  },
  {
    username: 'ravi_rates',
    displayName: 'Ravi S.',
    themes: ['indian', 'thai', 'chinese'],
    boroughs: ['Hounslow', 'Ealing'],
  },
  {
    username: 'bella_bocca',
    displayName: 'Isabella F.',
    themes: ['italian', 'pizza', 'spanish'],
    boroughs: ['Camden', 'Islington'],
  },
  {
    username: 'sam_slurps',
    displayName: 'Sam T.',
    themes: ['ramen', 'vietnamese', 'korean'],
    boroughs: ['Southwark', 'Lewisham'],
  },
  {
    username: 'chloe_cooks',
    displayName: 'Chloe D.',
    themes: ['cafe', 'mexican', 'italian'],
    boroughs: ['Richmond-Upon-Thames', 'Wandsworth'],
  },
  {
    username: 'ade_eats',
    displayName: 'Adebayo O.',
    themes: ['burger', 'turkish', 'british'],
    boroughs: ['Croydon', 'Southwark'],
  },
  {
    username: 'nina_nomnom',
    displayName: 'Nina V.',
    themes: ['sushi', 'thai', 'middleeast'],
    boroughs: ['Kensington and Chelsea', 'Westminster'],
  },
  {
    username: 'marcus_munch',
    displayName: 'Marcus J.',
    themes: ['pizza', 'mexican', 'burger'],
    boroughs: ['Hackney', 'Haringey'],
  },
  {
    username: 'yuki_t',
    displayName: 'Yuki T.',
    themes: ['ramen', 'sushi', 'korean'],
    boroughs: ['City of London Corporation', 'Westminster'],
  },
  {
    username: 'grace_grazes',
    displayName: 'Grace N.',
    themes: ['spanish', 'cafe', 'middleeast'],
    boroughs: ['Greenwich', 'Lewisham'],
  },
  {
    username: 'leo_lunches',
    displayName: 'Leo K.',
    themes: ['turkish', 'chinese', 'indian'],
    boroughs: ['Enfield', 'Haringey'],
  },
  {
    username: 'fatima_feasts',
    displayName: 'Fatima Z.',
    themes: ['middleeast', 'indian', 'turkish'],
    boroughs: ['Newham', 'Redbridge'],
  },
  {
    username: 'will_wanders',
    displayName: 'William E.',
    themes: ['british', 'spanish', 'thai'],
    boroughs: ['Richmond-Upon-Thames', 'Hammersmith and Fulham'],
  },
];

/** How many logs each person makes — a few enthusiasts and a long tail. Sums to ~390. */
export const LOG_COUNTS = [
  30, 28, 26, 24, 22, 20, 20, 18, 18, 16, 16, 15, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6,
];

/** Ratings lean positive, as they do on real review sites. */
export const TIER_WEIGHTS: Record<Tier, number> = { 1: 6, 2: 17, 3: 35, 4: 30, 5: 12 };

export const NOTES: Record<Tier, string[]> = {
  1: [
    "Overcooked and under-seasoned. Wouldn't order again.",
    'Lukewarm by the time it arrived.',
    'Tiny portion for the price.',
    'Bland — needed a lot more salt and acid.',
  ],
  2: [
    'Perfectly fine, nothing memorable.',
    'Decent but a bit greasy.',
    'OK for a quick lunch.',
    'Good value, average flavour.',
  ],
  3: [
    'Solid — would get it again.',
    'Really well balanced.',
    'Generous portion and tasty.',
    'Better than I expected from the outside.',
  ],
  4: [
    'Order this. One of the best in the area.',
    'Came back just for this.',
    'Incredible depth of flavour.',
    'The reason to come here.',
  ],
  5: [
    'Still thinking about it days later.',
    "Best version I've had in London.",
    'Worth crossing town for.',
    'Unreal. Booking again already.',
  ],
};
