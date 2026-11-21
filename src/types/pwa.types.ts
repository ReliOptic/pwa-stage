export interface TouchIcon {
  readonly src: string;
  readonly sizes: string | null;
}

export interface PageViewport {
  readonly layoutWidth: number;
  readonly layoutHeight: number;
  readonly visualWidth: number;
  readonly visualHeight: number;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly dpr: number;
  readonly scale: number;
}

/** Raw facts read from the page under test (see services/page-inspector.ts). */
export interface PageInspection {
  readonly url: string;
  readonly title: string;
  readonly isSecureContext: boolean;
  readonly viewport: PageViewport | null;
  readonly environment: {
    readonly language: string | null;
    readonly locale: string | null;
    readonly timeZone: string | null;
    readonly documentLanguage: string | null;
    readonly direction: 'ltr' | 'rtl' | null;
  } | null;
  readonly touchIcons: readonly TouchIcon[];
  readonly viewportContent: string | null;
  readonly themeColor: string | null;
  readonly bodyBackground: string | null;
  readonly appleCapable: string | null;
  readonly appleStatusBarStyle: string | null;
  readonly appleTitle: string | null;
  readonly appleTouchIcon: string | null;
  readonly appleTouchIconSizes: string | null;
  readonly hasStartupImage: boolean;
  readonly manifestHref: string | null;
  readonly manifest: WebAppManifestSubset | null;
  readonly manifestError: string | null;
  readonly serviceWorker: 'controlled' | 'registered' | 'none' | 'unsupported';
}

export interface WebAppManifestIcon {
  readonly src: string;
  readonly sizes?: string;
  readonly type?: string;
  readonly purpose?: string;
}

export interface WebAppManifestSubset {
  readonly name?: string;
  readonly short_name?: string;
  readonly start_url?: string;
  readonly scope?: string;
  readonly display?: string;
  readonly theme_color?: string;
  readonly background_color?: string;
  readonly orientation?: string;
  readonly id?: string;
  readonly icons?: readonly WebAppManifestIcon[];
}

export type PwaCheckLevel = 'pass' | 'warn' | 'fail' | 'info';

export interface PwaCheck {
  readonly id: string;
  readonly level: PwaCheckLevel;
  readonly title: string;
  readonly detail: string;
}

/** What iOS would use when the page is added to the Home Screen. */
export interface HomeScreenIdentity {
  readonly name: string;
  readonly touchIcons?: readonly TouchIcon[];
  readonly iconUrl: string | null;
  readonly launchUrl: string;
  readonly opensAsWebApp: boolean;
  readonly backgroundColor: string | null;
  readonly themeColor: string | null;
  readonly statusBarStyle: 'default' | 'black' | 'black-translucent';
}

export interface InstalledWebApp extends HomeScreenIdentity {
  readonly id: string;
  readonly browser?: 'safari' | 'chrome';
  readonly addedAt: number;
}
