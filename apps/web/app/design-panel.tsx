'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_FONT, FONT_GROUPS, FONT_OPTIONS } from './font-options';

// Development-only design controls, fixed to the left of the screen and outside the app
// column, for trying settings without a code change. Each setting sets a data attribute on
// <html>, which globals.css turns into a CSS variable. Add future settings (brand colours,
// spacing) as another section here plus rules there.

const FONT_STORAGE_KEY = 'tastecult:design:font';

export function DesignPanel() {
  const [font, setFont] = useState(DEFAULT_FONT);
  const [open, setOpen] = useState(true);

  // Restore the last choice; the page paints in the default font until this runs
  useEffect(() => {
    const saved = window.localStorage.getItem(FONT_STORAGE_KEY);
    if (saved) setFont(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.font = font;
  }, [font]);

  function chooseFont(key: string) {
    setFont(key);
    window.localStorage.setItem(FONT_STORAGE_KEY, key);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-4 left-0 z-50 rounded-r border border-l-0 border-neutral-300 bg-white px-2 py-1 text-xs"
      >
        Design
      </button>
    );
  }

  const selected = FONT_OPTIONS.find((option) => option.key === font);

  return (
    <aside className="fixed top-4 left-4 z-50 w-60 rounded border border-neutral-300 bg-white p-3 text-left text-sm shadow">
      <div className="mb-2 flex items-center justify-between">
        <strong className="text-xs tracking-wide uppercase">Design</strong>
        <button type="button" onClick={() => setOpen(false)} className="text-xs">
          Hide
        </button>
      </div>

      <label htmlFor="design-font" className="mb-1 block text-xs text-neutral-500">
        Text font
      </label>
      <select
        id="design-font"
        value={font}
        onChange={(event) => chooseFont(event.target.value)}
        className="w-full rounded border border-neutral-300 px-2 py-1"
      >
        {FONT_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {FONT_OPTIONS.filter((option) => option.group === group).map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {selected ? <p className="mt-1 text-xs text-neutral-500">{selected.note}</p> : null}
    </aside>
  );
}
