import { DeviceModelId, Orientation } from './device.types';

export enum BrowserShellMode {
  IOS_SAFARI = 'ios-safari',
  IOS_CHROME = 'ios-chrome',
  PWA_STANDALONE = 'pwa-standalone'
}

export enum DuoDisplayMode {
  SINGLE_SPAN = 'single-span',
  SPLIT_COMPARISON = 'split-comparison'
}

export interface QuickUrlBookmark {
  readonly id: string;
  readonly label: string;
  readonly url: string;
}

export type PwaStatusBarStyle = 'default' | 'black' | 'black-translucent';

export interface SimulatorState {
  readonly currentUrl: string;
  readonly secondaryUrl: string;
  readonly selectedDeviceId: DeviceModelId;
  readonly orientation: Orientation;
  readonly shellMode: BrowserShellMode;
  readonly duoDisplayMode: DuoDisplayMode;
  readonly showHingeOverlay: boolean;
  readonly hudCollapsed: boolean;
  readonly scale: number;
  readonly alwaysOnTop: boolean;
  readonly touchCursorEnabled: boolean;
  readonly darkMode: boolean;
  readonly isFramed: boolean;
  /** From the page's apple-mobile-web-app-status-bar-style (Home Screen web app geometry). */
  readonly pwaStatusBarStyle: PwaStatusBarStyle;
}

export interface ConfigValidationError {
  readonly kind: 'CONFIG_VALIDATION_ERROR';
  readonly field: string;
  readonly message: string;
  readonly recoveryHint: string;
}

export interface EmulationFailureError {
  readonly kind: 'EMULATION_FAILURE_ERROR';
  readonly operation: string;
  readonly message: string;
  readonly recoveryHint: string;
}

export interface WindowOperationError {
  readonly kind: 'WINDOW_OPERATION_ERROR';
  readonly operation: string;
  readonly message: string;
  readonly recoveryHint: string;
}

export interface StorageOperationError {
  readonly kind: 'STORAGE_OPERATION_ERROR';
  readonly operation: string;
  readonly message: string;
  readonly recoveryHint: string;
}

export type SimulatorError =
  | ConfigValidationError
  | EmulationFailureError
  | WindowOperationError
  | StorageOperationError;

export interface ResultSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface ResultFailure<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E = SimulatorError> = ResultSuccess<T> | ResultFailure<E>;
