import type { InstalledWebApp } from '../types/pwa.types';

export interface WebAppListing {
  readonly id: string;
  readonly name: string;
  readonly launchUrl: string;
  readonly aliases?: readonly string[];
  readonly starter?: boolean;
}

export const webAppCatalog: readonly WebAppListing[] = [
  { id: 'instagram', name: 'Instagram', launchUrl: 'https://www.instagram.com/', starter: true },
  { id: 'x', name: 'X', launchUrl: 'https://x.com/', aliases: ['https://x.com/home', 'https://twitter.com/', 'https://twitter.com/home'], starter: true },
  { id: 'threads', name: 'Threads', launchUrl: 'https://www.threads.com/', aliases: ['https://www.threads.net/'] },
  { id: 'tiktok', name: 'TikTok', launchUrl: 'https://www.tiktok.com/' },
  { id: 'youtube', name: 'YouTube', launchUrl: 'https://m.youtube.com/', aliases: ['https://www.youtube.com/'] },
  { id: 'reddit', name: 'Reddit', launchUrl: 'https://www.reddit.com/' }
];

export function catalogIcon(listing: WebAppListing): string {
  return './web-app-icons/' + listing.id + '.png';
}

export function createCatalogApp(listing: WebAppListing, addedAt: number): InstalledWebApp {
  return {
    id: 'catalog:' + listing.id,
    name: listing.name,
    launchUrl: listing.launchUrl,
    iconUrl: catalogIcon(listing),
    opensAsWebApp: true,
    statusBarStyle: 'default',
    themeColor: null,
    backgroundColor: null,
    addedAt
  };
}

function launchKey(address: string): string | undefined {
  const url = URL.parse(address);
  if (!url || url.protocol !== 'https:') return;
  return url.host.replace(/^www\./, '') + url.pathname.replace(/\/$/, '') + url.search + url.hash;
}

/** A manually installed service homepage counts too. Deep links remain independent. */
export function matchesCatalogApp(listing: WebAppListing, app: InstalledWebApp): boolean {
  if (app.id === 'catalog:' + listing.id) return true;
  const key = launchKey(app.launchUrl);
  return key !== undefined && [listing.launchUrl, ...(listing.aliases ?? [])].some(address => launchKey(address) === key);
}
