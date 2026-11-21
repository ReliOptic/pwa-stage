import { ConfigValidationError, QuickUrlBookmark, Result } from '../types/simulator.types';
import { parseWebsiteAddress } from '../utils/website-address.util';

export interface SimulatorEnvConfig {
  readonly defaultTargetUrl: string;
  readonly secondaryTargetUrl: string;
  readonly devServerUrl: string | null;
  readonly defaultScale: number;
  readonly defaultAlwaysOnTop: boolean;
  readonly appStorageFileName: string;
  readonly safariIosVersion: string;
  readonly chromeIosVersion: string;
  readonly quickBookmarks: readonly QuickUrlBookmark[];
}

const FALLBACK_TARGET_URL = 'http://127.0.0.1:18765/index.html';
const FALLBACK_REBOOT_REFERENCE_URL = FALLBACK_TARGET_URL;

const FALLBACK_LOCAL_VITE_URL = [
  'http',
  '://',
  'localhost',
  ':5173'
].join('');

const FALLBACK_LOCAL_NEXT_URL = [
  'http',
  '://',
  'localhost',
  ':3000'
].join('');

function readRawEnv(): Record<string, string | undefined> {
  if (typeof process !== 'undefined' && process.env) {
    return process.env;
  }
  return {};
}

export function validateHttpUrl(rawUrl: string, fieldName: string): Result<string, ConfigValidationError> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: {
        kind: 'CONFIG_VALIDATION_ERROR',
        field: fieldName,
        message: `${fieldName} cannot be empty`,
        recoveryHint: 'Provide a valid http:// or https:// URL'
      }
    };
  }

  const parsed = parseWebsiteAddress(trimmed);
  if (parsed) return { ok: true, value: parsed.href };
  return {
    ok: false,
    error: {
      kind: 'CONFIG_VALIDATION_ERROR',
      field: fieldName,
      message: 'Enter an HTTP(S) website or a local development address.',
      recoveryHint: 'Use a domain, localhost:5173, or an HTTP(S) URL.'
    }
  };
}

export function loadSimulatorEnvConfig(
  overrides?: Readonly<Record<string, string | undefined>>
): Result<SimulatorEnvConfig, ConfigValidationError> {
  const env = overrides ?? readRawEnv();
  const rawDefaultUrl = env.SIMULATOR_DEFAULT_URL ?? FALLBACK_TARGET_URL;
  const validatedPrimary = validateHttpUrl(rawDefaultUrl, 'SIMULATOR_DEFAULT_URL');
  if (!validatedPrimary.ok) {
    return validatedPrimary;
  }

  const rawSecondaryUrl = env.SIMULATOR_SECONDARY_URL ?? FALLBACK_LOCAL_VITE_URL;
  const validatedSecondary = validateHttpUrl(rawSecondaryUrl, 'SIMULATOR_SECONDARY_URL');
  if (!validatedSecondary.ok) {
    return validatedSecondary;
  }

  const rawScale = Number(env.SIMULATOR_DEFAULT_SCALE ?? '1.0');
  const clampedScale = Number.isFinite(rawScale) ? Math.min(1.25, Math.max(0.5, rawScale)) : 1.0;

  const devServerUrl = env.SIMULATOR_DEV_SERVER_URL?.trim() || null;
  const rebootReferenceUrl = env.SIMULATOR_REBOOT_URL?.trim() || FALLBACK_REBOOT_REFERENCE_URL;

  return {
    ok: true,
    value: {
      defaultTargetUrl: validatedPrimary.value,
      secondaryTargetUrl: validatedSecondary.value,
      devServerUrl,
      defaultScale: clampedScale,
      defaultAlwaysOnTop: env.SIMULATOR_ALWAYS_ON_TOP !== 'false',
      appStorageFileName: env.SIMULATOR_STORAGE_FILE ?? 'simulator-state-v2.json',
      safariIosVersion: env.SIMULATOR_IOS_VERSION ?? '27_3',
      chromeIosVersion: env.SIMULATOR_CRIOS_VERSION ?? '142.0.7440.0',
      quickBookmarks: [
        { id: 'start', label: 'Start page', url: rebootReferenceUrl },
        { id: 'local-vite', label: 'Localhost :5173', url: FALLBACK_LOCAL_VITE_URL },
        { id: 'local-next', label: 'Localhost :3000', url: FALLBACK_LOCAL_NEXT_URL }
      ]
    }
  };
}
