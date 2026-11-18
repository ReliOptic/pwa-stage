import { describe, expect, it } from 'vitest';
import { createCatalogApp, matchesCatalogApp, webAppCatalog } from '../../src/config/web-app-catalog';

describe('catalogue matches for manually saved websites', () => {
  const x = webAppCatalog.find(listing => listing.id === 'x')!;
  const manual = { ...createCatalogApp(x, 1), id: 'my-home-screen-item', name: 'My saved page' };
  it.each(['https://x.com/', 'https://www.x.com', 'https://x.com/home/', 'https://twitter.com/home'])(
    'recognises the service homepage %s', launchUrl => {
      expect(matchesCatalogApp(x, {...manual, launchUrl})).toBe(true);
    });
  it.each(['https://x.com/someone', 'https://x.com/?list=42', 'https://another.example/', 'http://x.com/', 'invalid'])(
    'preserves the separate shortcut %s', launchUrl => {
      expect(matchesCatalogApp(x, {...manual, launchUrl})).toBe(false);
    });
});
