import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const PAGES = ['index.html', 'game.html', 'games.html'];

describe('static pages', () => {
  // Without it, phones lay the page out 980px wide and shrink it to fit.
  it.each(PAGES)('%s declares a device-width viewport', (page) => {
    const html = readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />');
  });
});
