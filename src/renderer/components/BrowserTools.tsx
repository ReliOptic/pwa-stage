import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Minus,
  Plus,
  RotateCw,
  Search,
  Settings,
  Share,
  Trash2,
  X
} from 'lucide-react';
import { BrowserShellMode } from '../../types/simulator.types';
import { ElectronWebviewElement } from '../../types/renderer.types';
import {
  PAGE_ZOOMS,
  readLibrary,
  readPageZoom,
  savePageZoom,
  updateLibrary
} from '../browser-preferences';
import type { LibraryKind } from '../browser-preferences';
import type { ScreenContextValue } from './ScreenLayers';

function primaryGuest(): ElectronWebviewElement | null {
  return document.querySelector('.duo-slice-primary webview, .iphone-screen webview');
}

function FindOnPage({ close, dark }: { close: () => void; dark: boolean }): React.ReactElement {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState('');
  const request = useRef<number | null>(null);
  useEffect(() => {
    const el = primaryGuest();
    if (!el) return;
    const onFound = (event: Event): void => {
      const { result } = event as Event & {
        result: { requestId: number; activeMatchOrdinal: number; matches: number };
      };
      if (request.current === result.requestId)
        setMatches(`${result.activeMatchOrdinal} / ${result.matches}`);
    };
    el.addEventListener('found-in-page', onFound);
    return () => {
      el.removeEventListener('found-in-page', onFound);
      if (el.isConnected) el.stopFindInPage('clearSelection');
    };
  }, []);
  const find = (text: string, forward: boolean, next: boolean): void => {
    const el = primaryGuest();
    if (!el) return;
    if (text) request.current = el.findInPage(text, { forward, findNext: !next });
    else {
      request.current = null;
      el.stopFindInPage('clearSelection');
    }
  };
  return (
    <form
      className={`browser-find ${dark ? 'ios-sheet-dark' : 'ios-sheet-light'}`}
      aria-label="Find on Page"
      onSubmit={(e) => {
        e.preventDefault();
        find(query, true, true);
      }}
    >
      <Search size={16} />
      <input
        autoFocus
        aria-label="Find text"
        value={query}
        placeholder="Find on Page"
        onChange={(e) => {
          const text = e.target.value;
          setQuery(text);
          setMatches('');
          find(text, true, false);
        }}
      />
      <output aria-live="polite">{matches}</output>
      <button
        type="button"
        disabled={!query}
        aria-label="Previous match"
        onClick={() => find(query, false, true)}
      >
        <ArrowUp size={16} />
      </button>
      <button type="submit" disabled={!query} aria-label="Next match">
        <ArrowDown size={16} />
      </button>
      <button type="button" aria-label="Close find" onClick={close}>
        <X size={17} />
      </button>
    </form>
  );
}

function SiteLibrary({
  screen,
  kind
}: {
  screen: ScreenContextValue;
  kind: LibraryKind;
}): React.ReactElement {
  const [entries, setEntries] = useState(() => readLibrary(screen.browserMode, kind));
  return (
    <div className="browser-library">
      {entries.length === 0 && (
        <p>{kind === 'bookmarks' ? 'No bookmarks yet.' : 'No browsing history yet.'}</p>
      )}
      {entries.map((entry) => (
        <div className="browser-library-row" key={entry.url}>
          <button
            onClick={() => {
              screen.openSheet('none');
              screen.openUrl(entry.url);
            }}
          >
            <strong>{entry.title}</strong>
            <small>{entry.url}</small>
          </button>
          <button
            aria-label={'Remove ' + entry.title}
            onClick={() => setEntries(updateLibrary(screen.browserMode, kind, entry, true))}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function BrowserTools({ screen }: { screen: ScreenContextValue }): React.ReactElement {
  const kind = screen.sheet.kind;
  const safari = screen.browserMode === BrowserShellMode.IOS_SAFARI;
  const name = safari ? 'Safari' : 'Chrome';
  const entry = {
    url: screen.currentUrl,
    title: screen.report?.inspection.title || new URL(screen.currentUrl).host
  };
  const [, refreshLibrary] = useState(0);
  const saved = readLibrary(screen.browserMode, 'bookmarks').some((site) => site.url === entry.url);
  const [zoom, setZoom] = useState(() => readPageZoom(screen.browserMode, entry.url));
  const applyZoom = (next: number): void => {
    savePageZoom(screen.browserMode, entry.url, next);
    setZoom(next);
  };
  const close = () => screen.openSheet('none');
  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        screen.openSheet('none');
      }
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [screen.openSheet]);
  if (kind === 'find') return <FindOnPage close={close} dark={screen.darkMode} />;
  const title =
    kind === 'settings'
      ? safari
        ? 'Website Settings'
        : 'Settings'
      : kind === 'bookmarks'
        ? 'Bookmarks'
        : kind === 'history'
          ? 'History'
          : name;
  const at = PAGE_ZOOMS.findIndex((value) => value === zoom);
  return (
    <div className="ios-sheet-scrim" onClick={close}>
      <section
        className={`native-browser-sheet ${screen.darkMode ? 'ios-sheet-dark' : 'ios-sheet-light'}`}
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ios-sheet-handle" aria-hidden="true" />
        <header>
          {kind !== 'browser-menu' && (
            <button
              aria-label="Back to browser menu"
              onClick={() => screen.openSheet('browser-menu')}
            >
              <ChevronLeft size={19} />
            </button>
          )}
          <div>
            <strong>{title}</strong>
            <small>{kind === 'settings' && !safari ? name : new URL(entry.url).host}</small>
          </div>
          <button aria-label="Done" onClick={close}>
            <X size={17} />
          </button>
        </header>
        {kind === 'settings' ? (
          <div className="browser-setting-list">
            <div className="browser-setting">
              <span>Page Zoom</span>
              <div className="browser-stepper">
                <button
                  aria-label="Decrease page zoom"
                  disabled={at <= 0}
                  onClick={() => applyZoom(PAGE_ZOOMS[at - 1])}
                >
                  <Minus size={15} />
                </button>
                <button aria-label="Reset page zoom" onClick={() => applyZoom(100)}>
                  {zoom}%
                </button>
                <button
                  aria-label="Increase page zoom"
                  disabled={at === PAGE_ZOOMS.length - 1}
                  onClick={() => applyZoom(PAGE_ZOOMS[at + 1])}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <label className="browser-setting">
              <span>Dark appearance</span>
              <input
                className="browser-appearance-switch"
                type="checkbox"
                role="switch"
                checked={screen.darkMode}
                onChange={(e) => screen.setAppearance(e.target.checked)}
              />
            </label>
          </div>
        ) : kind === 'history' || kind === 'bookmarks' ? (
          <SiteLibrary key={kind} screen={screen} kind={kind} />
        ) : (
          <>
            <div className="browser-menu-tiles">
              <button onClick={() => screen.openSheet('share')}>
                <Share />
                Share
              </button>
              <button
                onClick={() => {
                  screen.reload();
                  close();
                }}
              >
                <RotateCw />
                Reload Page
              </button>
              <button
                onClick={() => {
                  screen.navigate('forward');
                  close();
                }}
              >
                <ChevronRight />
                Forward
              </button>
            </div>
            <div className="browser-menu-list">
              <button onClick={() => screen.openSheet('settings')}>
                <Settings />
                {safari ? 'Website Settings' : 'Settings'}
                <ChevronRight />
              </button>
              <button onClick={() => screen.openSheet('find')}>
                <Search />
                Find on Page
                <ChevronRight />
              </button>
              <button
                onClick={() => {
                  updateLibrary(screen.browserMode, 'bookmarks', entry, saved);
                  refreshLibrary((value) => value + 1);
                }}
              >
                {saved ? <Check /> : <Plus />}
                {saved ? 'Remove Bookmark' : 'Add Bookmark'}
              </button>
              <button onClick={() => screen.openSheet('bookmarks')}>
                <Bookmark />
                Bookmarks
                <ChevronRight />
              </button>
              <button onClick={() => screen.openSheet('history')}>
                <Clock />
                History
                <ChevronRight />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
