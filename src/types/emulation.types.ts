import { DevicePreset, Orientation, SafeAreaInsets } from './device.types';
import { BrowserShellMode, EmulationFailureError, PwaStatusBarStyle, Result } from './simulator.types';

export interface CdpDeviceMetricsPayload {
  readonly width: number;
  readonly height: number;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly deviceScaleFactor: number;
  readonly mobile: boolean;
  readonly screenOrientation: {
    readonly type: 'portraitPrimary' | 'landscapePrimary';
    readonly angle: number;
  };
}

export interface CdpTouchEmulationPayload {
  readonly enabled: boolean;
  readonly maxTouchPoints: number;
}

export interface EmulationProfile {
  readonly userAgent: string;
  readonly platform: string;
  readonly standalone: boolean;
  readonly mediaFeatures: { name: string; value: string }[];
  readonly metrics: CdpDeviceMetricsPayload;
  readonly touch: CdpTouchEmulationPayload;
  readonly pageSafeArea: SafeAreaInsets;
  readonly safeAreaCss: string;
  readonly standaloneInitScript: string;
}

export interface EmulationProfileInput {
  readonly preset: DevicePreset;
  readonly orientation: Orientation;
  readonly shellMode: BrowserShellMode;
  readonly safariIosVersion: string;
  readonly chromeIosVersion: string;
  readonly darkMode: boolean;
  readonly scale?: number;
  readonly touchCursorEnabled?: boolean;
  readonly pwaStatusBarStyle?: PwaStatusBarStyle;
}

export interface RelatedTargetEvent {
  readonly sessionId: string;
  readonly targetInfo?: { readonly type: string };
  readonly waitingForDebugger?: boolean;
}

export interface DebuggerCommandSender {
  readonly isAttached: () => boolean;
  readonly attach: (protocolVersion?: string) => void;
  readonly on: (event: 'message', listener: (event: unknown, method: string, params: RelatedTargetEvent) => void) => unknown;
  readonly removeListener: DebuggerCommandSender['on'];
  readonly sendCommand: (method: string, commandParams?: Record<string, unknown>, sessionId?: string) => Promise<unknown>;
}

export interface EmulationTargetWebContents {
  readonly id: number;
  readonly session?: {setUserAgent: (userAgent: string) => void};
  readonly setUserAgent: (userAgent: string) => void;
  readonly setZoomFactor?: (factor: number) => void;
  readonly insertCSS: (css: string) => Promise<string>;
  readonly removeInsertedCSS?: (key: string) => Promise<void>;
  readonly executeJavaScript: (code: string) => Promise<unknown>;
  readonly debugger: DebuggerCommandSender;
}

export interface EmulationService {
  readonly buildUserAgent: (
    shellMode: BrowserShellMode,
    safariIosVersion: string,
    chromeIosVersion: string
  ) => string;
  readonly buildSafeAreaCss: (safeArea: SafeAreaInsets, darkMode?: boolean) => string;
  readonly buildEmulationProfile: (input: EmulationProfileInput) => EmulationProfile;
  readonly applyEmulationToTarget: (
    target: EmulationTargetWebContents,
    input: EmulationProfileInput
  ) => Promise<Result<EmulationProfile, EmulationFailureError>>;
}
