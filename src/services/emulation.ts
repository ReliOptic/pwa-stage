import { Orientation, SafeAreaInsets } from '../types/device.types';
import {
  EmulationProfile,
  EmulationProfileInput,
  EmulationTargetWebContents
} from '../types/emulation.types';
import { BrowserShellMode, EmulationFailureError, Result } from '../types/simulator.types';
import { logStructured } from '../utils/logger.util';
import { computeShellChromeHeights, resolveSafeAreaInsets } from '../utils/viewport-math.util';

export function buildMobileUserAgent(
  shellMode: BrowserShellMode,
  safariIosVersion: string,
  chromeIosVersion: string
): string {
  const iosToken = safariIosVersion.replace(/\./g, '_');
  const safariVersion = safariIosVersion.replace(/_/g, '.');

  if (shellMode === BrowserShellMode.IOS_CHROME) {
    return (
      `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosToken} like Mac OS X) ` +
      `AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${chromeIosVersion} ` +
      `Mobile/15E148 Safari/604.1`
    );
  }

  return (
    `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosToken} like Mac OS X) ` +
    `AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${safariVersion} ` +
    `Mobile/15E148 Safari/604.1`
  );
}

export function buildSafeAreaCss(safeArea: SafeAreaInsets, darkMode: boolean): string {
  const colorScheme = darkMode ? 'dark' : 'light';
  return [
    ':root {',
    `  --sat: ${safeArea.top}px;`,
    `  --sar: ${safeArea.right}px;`,
    `  --sab: ${safeArea.bottom}px;`,
    `  --sal: ${safeArea.left}px;`,
    `  --safe-area-inset-top: ${safeArea.top}px;`,
    `  --safe-area-inset-right: ${safeArea.right}px;`,
    `  --safe-area-inset-bottom: ${safeArea.bottom}px;`,
    `  --safe-area-inset-left: ${safeArea.left}px;`,
    `  color-scheme: ${colorScheme};`,
    '}',
    '.portrait-feed {',
    '  --portrait-safe-top: max(59px, var(--sat)) !important;',
    '  --portrait-safe-bottom: max(34px, var(--sab)) !important;',
    '}',
    ':not(.portrait-feed) > .topbar {',
    '  min-height: calc(var(--size-top-chrome-row, 60px) + var(--sat)) !important;',
    '  padding-top: calc(var(--sat) + var(--space-2, 8px)) !important;',
    '}',
    ':not(.portrait-feed) > .topbar .account-button {',
    '  top: calc(var(--sat) + var(--space-2, 8px)) !important;',
    '  right: max(var(--space-4, 16px), var(--sar)) !important;',
    '}',
    ':not(.portrait-feed) > .topbar > .account-dot {',
    '  top: calc(var(--sat) + var(--space-2, 8px) - var(--size-ring, 2px)) !important;',
    '  right: calc(max(var(--space-4, 16px), var(--sar)) - var(--size-ring, 2px)) !important;',
    '}',
    '.forme {',
    '  --safe-b: max(var(--sab), var(--space-6, 24px)) !important;',
    '}',
    '.screen {',
    '  padding: max(var(--space-screen, 24px), var(--sat)) max(var(--space-screen, 24px), var(--sar)) max(var(--space-screen, 24px), var(--sab)) max(var(--space-screen, 24px), var(--sal)) !important;',
    '}',
    'html, body {',
    '  -webkit-tap-highlight-color: transparent;',
    '  -webkit-touch-callout: none;',
    '  overscroll-behavior-y: contain;',
    '  overflow-x: clip;',
    '}',
    '::-webkit-scrollbar {',
    '  width: 0px;',
    '  height: 0px;',
    '}'
  ].join('\n');
}

export function buildStandaloneInitScript(
  shellMode: BrowserShellMode,
  safeArea: SafeAreaInsets,
  touchCursorEnabled = false
): string {
  const isStandalone = shellMode === BrowserShellMode.PWA_STANDALONE;
  const swipeMode = touchCursorEnabled ? 'direct' : 'press';
  return [
    '(() => {',
    `  Object.defineProperty(window.navigator, 'standalone', { value: ${String(isStandalone)}, configurable: true });`,
    `  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5, configurable: true });`,
    `  window.__SIMULATOR_SWIPE_MODE = '${swipeMode}';`,
    '  if (document.documentElement) {',
    `    document.documentElement.dataset.simulatorShell = '${shellMode}';`,
    `    document.documentElement.dataset.swipeMode = '${swipeMode}';`,
    `    document.documentElement.style.setProperty('--sat', '${safeArea.top}px');`,
    `    document.documentElement.style.setProperty('--sar', '${safeArea.right}px');`,
    `    document.documentElement.style.setProperty('--sab', '${safeArea.bottom}px');`,
    `    document.documentElement.style.setProperty('--sal', '${safeArea.left}px');`,
    '  }',
    '  const oldOrb = document.getElementById("__sim-touch-orb");',
    '  if (oldOrb) oldOrb.remove();',
    '  try {',
    '    for (const sheet of Array.from(document.styleSheets)) {',
    '      let rules;',
    '      try { rules = sheet.cssRules; } catch { continue; }',
    '      if (!rules) continue;',
    '      for (let i = 0; i < rules.length; i++) {',
    '        const cssText = rules[i].cssText;',
    '        if (cssText && cssText.includes("env(safe-area-inset-")) {',
    '          const patched = cssText',
    '            .replace(/env\\(\\s*safe-area-inset-top\\s*(?:,[^)]*)?\\)/g, "var(--sat)")',
    '            .replace(/env\\(\\s*safe-area-inset-right\\s*(?:,[^)]*)?\\)/g, "var(--sar)")',
    '            .replace(/env\\(\\s*safe-area-inset-bottom\\s*(?:,[^)]*)?\\)/g, "var(--sab)")',
    '            .replace(/env\\(\\s*safe-area-inset-left\\s*(?:,[^)]*)?\\)/g, "var(--sal)");',
    '          if (patched !== cssText) {',
    '            try { sheet.deleteRule(i); sheet.insertRule(patched, i); } catch {}',
    '          }',
    '        }',
    '      }',
    '    }',
    '  } catch {}',
    '})();'
  ].join('\n');
}

export function buildEmulationProfile(input: EmulationProfileInput): EmulationProfile {
  const isPortrait = input.orientation === Orientation.PORTRAIT;
  const width = isPortrait ? input.preset.width : input.preset.height;
  const rawHeight = isPortrait ? input.preset.height : input.preset.width;
  const rawSafeArea = resolveSafeAreaInsets(input.preset, input.orientation);
  const chromeHeights = computeShellChromeHeights(input.shellMode, rawSafeArea);
  const viewportHeight = Math.max(
    240,
    rawHeight - chromeHeights.topBarHeight - chromeHeights.bottomBarHeight
  );
  const innerSafeArea: SafeAreaInsets =
    input.shellMode === BrowserShellMode.PWA_STANDALONE
      ? rawSafeArea
      : { top: 0, right: rawSafeArea.right, bottom: 0, left: rawSafeArea.left };

  return {
    userAgent: buildMobileUserAgent(
      input.shellMode,
      input.safariIosVersion,
      input.chromeIosVersion
    ),
    platform: 'iPhone',
    metrics: {
      width,
      height: viewportHeight,
      deviceScaleFactor: input.preset.deviceScaleFactor,
      mobile: true,
      screenOrientation: {
        type: isPortrait ? 'portraitPrimary' : 'landscapePrimary',
        angle: isPortrait ? 0 : 90
      }
    },
    touch: {
      enabled: true,
      maxTouchPoints: 5
    },
    safeAreaCss: buildSafeAreaCss(innerSafeArea, input.darkMode),
    standaloneInitScript: buildStandaloneInitScript(
      input.shellMode,
      innerSafeArea,
      Boolean(input.touchCursorEnabled)
    )
  };
}

export async function applyEmulationToTarget(
  target: EmulationTargetWebContents,
  input: EmulationProfileInput
): Promise<Result<EmulationProfile, EmulationFailureError>> {
  const profile = buildEmulationProfile(input);
  const effectiveZoom = 1.0;
  const innerSafeArea =
    input.shellMode === BrowserShellMode.PWA_STANDALONE
      ? resolveSafeAreaInsets(input.preset, input.orientation)
      : { top: 0, right: 0, bottom: 0, left: 0 };

  try {
    if (!target.debugger.isAttached()) {
      target.debugger.attach('1.3');
    }
    target.setUserAgent(profile.userAgent);
    target.setZoomFactor?.(effectiveZoom);

    await Promise.all([
      target.debugger.sendCommand('Emulation.setUserAgentOverride', {
        userAgent: profile.userAgent,
        platform: profile.platform
      }),
      target.debugger.sendCommand('Emulation.setTouchEmulationEnabled', {
        ...profile.touch
      }),
      target.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: input.darkMode ? 'dark' : 'light' },
          {
            name: 'display-mode',
            value: input.shellMode === BrowserShellMode.PWA_STANDALONE ? 'standalone' : 'browser'
          }
        ]
      }),
      target.debugger
        .sendCommand('Emulation.setSafeAreaInsetsOverride', {
          insets: {
            top: innerSafeArea.top,
            bottom: innerSafeArea.bottom,
            left: innerSafeArea.left,
            right: innerSafeArea.right,
            topMax: innerSafeArea.top,
            bottomMax: innerSafeArea.bottom,
            leftMax: innerSafeArea.left,
            rightMax: innerSafeArea.right
          }
        })
        .catch(() => undefined),
      target.insertCSS(profile.safeAreaCss),
      target.executeJavaScript(profile.standaloneInitScript)
    ]);

    logStructured('info', 'emulation.service', 'emulation_applied', {
      webContentsId: target.id,
      deviceId: input.preset.id,
      orientation: input.orientation,
      shellMode: input.shellMode,
      zoomFactor: effectiveZoom
    });

    return { ok: true, value: profile };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown CDP emulation error';
    logStructured('error', 'emulation.service', 'emulation_failed', {
      webContentsId: target.id,
      error: message
    });
    return {
      ok: false,
      error: {
        kind: 'EMULATION_FAILURE_ERROR',
        operation: 'applyEmulationToTarget',
        message,
        recoveryHint: 'Reload the webview or verify debugger attachment state'
      }
    };
  }
}
