import { ConfigValidationError, QuickUrlBookmark, Result } from '../types/simulator.types';

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

const FALLBACK_TARGET_URL = [
  'https',
  '://',
  'campsite',
  '.ing/'
].join('');

const FALLBACK_REBOOT_REFERENCE_URL = [
  'http',
  '://',
  '127.0.0.1',
  ':18765/reference.html'
].join('');

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

  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^:\d+/.test(trimmed)
      ? `http://localhost${trimmed}`
      : /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+|\/|$)/i.test(trimmed)
        ? `http://${trimmed}`
        : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        error: {
          kind: 'CONFIG_VALIDATION_ERROR',
          field: fieldName,
          message: `Unsupported protocol: ${parsed.protocol}`,
          recoveryHint: 'Use http:// or https:// protocol'
        }
      };
    }
    return { ok: true, value: parsed.toString() };
  } catch {
    return {
      ok: false,
      error: {
        kind: 'CONFIG_VALIDATION_ERROR',
        field: fieldName,
        message: `Invalid URL format: ${rawUrl}`,
        recoveryHint: 'Enter a valid domain or localhost URL'
      }
    };
  }
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
        { id: 'reboot-reference', label: 'Reboot 393×852', url: rebootReferenceUrl },
        { id: 'prod-campsite', label: 'campsite.ing (Prod)', url: FALLBACK_TARGET_URL },
        { id: 'local-vite', label: 'Localhost :5173', url: FALLBACK_LOCAL_VITE_URL },
        { id: 'local-next', label: 'Localhost :3000', url: FALLBACK_LOCAL_NEXT_URL }
      ]
    }
  };
}
