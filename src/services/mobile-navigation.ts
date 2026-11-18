import type { Session } from 'electron';

// Public YouTube pages have a separate mobile web entry point. The player,
// Studio, account flows and an explicit desktop request keep their own routes.
export function mobileYouTubeDestination(url: URL): string | undefined {
  if (url.hostname !== 'www.youtube.com' && url.hostname !== 'youtube.com') return;
  if (url.port || url.username || url.password || !/^https?:$/.test(url.protocol) ||
      url.searchParams.get('app') === 'desktop') return;
  if (!/^\/(?:$|(?:watch|results|playlist)\/?$|(?:shorts|feed|channel|live|c|user)\/|@)/.test(url.pathname)) return;
  const mobile = new URL(url.href);
  mobile.hostname = 'm.youtube.com';
  return mobile.href;
}

export function installMobileNavigation(session: Session) {
  // A site can redirect back to www (e.g. for consent or an unavailable mobile
  // page). Respect that redirect for the rest of this Chromium request chain.
  const visited = new Set<number>();
  const filter = {urls:['*://www.youtube.com/*','*://youtube.com/*','*://m.youtube.com/*']};
  session.webRequest.onBeforeRequest(filter, (details, reply) => {
    if (details.method !== 'GET' || details.resourceType !== 'mainFrame' ||
        details.webContents?.getType() !== 'webview' || visited.has(details.id)) return reply({});
    const url = new URL(details.url);
    if (url.hostname === 'm.youtube.com') {
      visited.add(details.id);
      return reply({});
    }
    const redirectURL = mobileYouTubeDestination(url);
    if (redirectURL) visited.add(details.id);
    reply(redirectURL ? {redirectURL} : {});
  });
  // A redirect chain can finish on a different host.
  session.webRequest.onCompleted(details => { visited.delete(details.id); });
  session.webRequest.onErrorOccurred(details => { visited.delete(details.id); });
}
