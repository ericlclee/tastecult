import { describe, expect, it } from 'vitest';
import { parseDishesCsv, parseLondonMentions } from './source';

const HEADER =
  'dish_id,dish,url,group_of,is_group_head,cuisine,cuisine_region,cuisine_macro,category,other_names,ingredients,score,description';

describe('parseDishesCsv', () => {
  it('parses quoted multi-line fields and ignores columns it does not use', () => {
    const csv = [
      HEADER,
      'bolani,Bolani,https://www.tasteatlas.com/bolani,Bolani,1,South Asian,South Asian,Asian,Breads and Flatbreads,"Perakai, Poraki",Potato; Spinach,4.2,"A stuffed flatbread,',
      'often served warm."',
    ].join('\n');

    const rows = parseDishesCsv(csv);

    expect(rows).toEqual([
      {
        dish_id: 'bolani',
        dish: 'Bolani',
        url: 'https://www.tasteatlas.com/bolani',
        group_of: 'Bolani',
        cuisine: 'South Asian',
        cuisine_region: 'South Asian',
        cuisine_macro: 'Asian',
        category: 'Breads and Flatbreads',
        other_names: 'Perakai, Poraki',
        ingredients: 'Potato; Spinach',
      },
    ]);
    // Descriptions and scores must never make it through
    expect(rows[0]).not.toHaveProperty('description');
    expect(rows[0]).not.toHaveProperty('score');
  });

  it('rejects a file missing a required column', () => {
    const csv = ['dish_id,dish', 'bolani,Bolani'].join('\n');
    expect(() => parseDishesCsv(csv)).toThrow(/Dish record 1 is invalid/);
  });
});

describe('parseLondonMentions', () => {
  it('reads London counts and defaults to zero when only other cities are present', () => {
    const json = JSON.stringify({
      hits: {
        'https://www.tasteatlas.com/pizza': { london: 46051, newyork: 900 },
        'https://www.tasteatlas.com/poutine': { newyork: 40 },
      },
    });

    const result = parseLondonMentions(json);

    expect(result.get('https://www.tasteatlas.com/pizza')).toBe(46051);
    expect(result.get('https://www.tasteatlas.com/poutine')).toBe(0);
  });
});
