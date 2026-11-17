import { platformLabel, hostPlatform } from '../../utils/platform.util';
import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Camera,
  ChevronDown,
  ClipboardCheck,
  Columns2,
  CornerDownLeft,
  EyeOff,
  FolderClosed,
  Globe,
  House,
  Minus,
  Moon,
  MousePointerClick,
  Pin,
  PinOff,
  Plus,
  RotateCw,
  Smartphone,
  Sparkles,
  Sun,
  Terminal,
  X
} from 'lucide-react';
import { groupDevicePresets } from '../../config/device-presets.config';
import { validateHttpUrl } from '../../config/env.config';
import {
  DeviceFormFactor,
  DeviceModelId,
  DevicePreset,
  Orientation
} from '../../types/device.types';
import {
  BrowserShellMode,
  DuoDisplayMode,
  QuickUrlBookmark,
  SimulatorState
} from '../../types/simulator.types';
import { clampSimulatorScale } from '../../utils/viewport-math.util';
import { setFoldSlowFactor } from '../sim-events';

export interface FloatingToolbarProps {
  readonly state: SimulatorState;
  readonly presets: readonly DevicePreset[];
  readonly bookmarks: readonly QuickUrlBookmark[];
  readonly activePreset: DevicePreset;
  readonly targetWidthPx?: number;
  readonly onUpdateState: (patch: Partial<SimulatorState>) => void;
  readonly onReload: () => void;
  readonly onOpenDevTools: () => void;
  readonly onMinimize: () => void;
  readonly onClose: () => void;
  readonly onGoHome?: () => void;
  readonly onScreenshot?: () => void;
  readonly onToggleInspector?: () => void;
  readonly inspectorOpen?: boolean;
  readonly inspectorBadge?: number;
}

const SHELL_SEGMENTS: readonly {
  readonly mode: BrowserShellMode;
  readonly label: string;
  readonly hint: string;
}[] = [
  { mode: BrowserShellMode.IOS_SAFARI, label: 'Safari', hint: 'Safari on iOS (compact tab bar)' },
  { mode: BrowserShellMode.IOS_CHROME, label: 'Chrome', hint: 'Chrome for iOS (WebKit, top omnibox)' },
  {
    mode: BrowserShellMode.PWA_STANDALONE,
    label: 'Web App',
    hint: 'Home Screen web app (display: standalone, navigator.standalone = true)'
  }
];

function formatDeviceOptionLabel(preset: DevicePreset): string {
  const size = `${preset.width}×${preset.height}`;
  return preset.alsoCovers
    ? `${preset.name} · ${size}  (= ${preset.alsoCovers})`
    : `${preset.name} · ${size}`;
}

function isDuo(preset: DevicePreset): boolean {
  return (
    preset.formFactor === DeviceFormFactor.FOLDABLE_COVER ||
    preset.formFactor === DeviceFormFactor.FOLDABLE_DUAL
  );
}

/** Row 1 — the window: close/minimise, device, zoom, collapse. */
function WindowRow(props: FloatingToolbarProps): React.ReactElement {
  const { state, presets, onUpdateState } = props;
  const stepScale = (delta: number): void => {
    onUpdateState({ scale: clampSimulatorScale(state.scale + delta) });
  };
  return (
    <div className="tb-row">
      <div className={hostPlatform() === 'win32' ? 'traffic-lights windows-controls' : 'traffic-lights'}>
        <button
          type="button"
          className="traffic-dot traffic-close"
          title={platformLabel("Hide to Menu Bar (⇧⌘S)")}
          aria-label="Hide simulator"
          onClick={props.onClose}
        >
          <X size={8} strokeWidth={3} />
        </button>
        <button
          type="button"
          className="traffic-dot traffic-min"
          title={platformLabel("Minimize (⌘M)")}
          aria-label="Minimize simulator"
          onClick={props.onMinimize}
        >
          <Minus size={8} strokeWidth={3} />
        </button>
      </div>

      <div className="shadcn-select-wrap tb-device">
        <Smartphone size={10.5} className="shadcn-select-icon" />
        <select
          className="shadcn-select shadcn-select-device"
          aria-label="Device Model"
          title={`${props.activePreset.name} — ${props.activePreset.generation}`}
          value={state.selectedDeviceId}
          onChange={(e): void =>
            onUpdateState({ selectedDeviceId: e.target.value as DeviceModelId })
          }
        >
          {groupDevicePresets(presets).map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatDeviceOptionLabel(p)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown size={10} className="shadcn-select-chevron" />
      </div>

      <div className="scale-stepper" role="group" aria-label="Zoom">
        <button
          type="button"
          className="scale-step-btn"
          title={platformLabel("Zoom Out (⌘−)")}
          aria-label="Zoom out"
          onClick={(): void => stepScale(-0.05)}
        >
          <Minus size={9} />
        </button>
        <button
          type="button"
          className="scale-readout-btn"
          title={platformLabel("Toggle 85% / 100% (⌘0). Drag a corner to resize.")}
          onClick={(): void =>
            onUpdateState({ scale: Math.abs(state.scale - 0.85) < 0.02 ? 1.0 : 0.85 })
          }
        >
          {`${Math.round(state.scale * 100)}%`}
        </button>
        <button
          type="button"
          className="scale-step-btn"
          title={platformLabel("Zoom In (⌘+)")}
          aria-label="Zoom in"
          onClick={(): void => stepScale(0.05)}
        >
          <Plus size={9} />
        </button>
      </div>

      <button
        type="button"
        className={`shadcn-icon-btn ${state.alwaysOnTop ? 'tb-on' : ''}`}
        title={
          state.alwaysOnTop
            ? platformLabel("Floating on all Spaces & full-screen apps (⌘T to keep on this Space)")
            : platformLabel("On this Space only (⌘T to float on all Spaces)")
        }
        aria-pressed={state.alwaysOnTop}
        aria-label={platformLabel("Float on all Spaces")}
        onClick={(): void => onUpdateState({ alwaysOnTop: !state.alwaysOnTop })}
      >
        {state.alwaysOnTop ? <Pin size={11} /> : <PinOff size={11} />}
      </button>
      <button
        type="button"
        className="shadcn-icon-btn"
        title={platformLabel("Hide toolbar (⌘B)")}
        aria-label="Hide toolbar"
        onClick={(): void => onUpdateState({ hudCollapsed: true })}
      >
        <EyeOff size={10.5} />
      </button>
    </div>
  );
}

/** Row 2 — the browser: which iOS container, and what URL. */
function BrowserRow(props: FloatingToolbarProps): React.ReactElement {
  const { state, bookmarks, onUpdateState } = props;
  const [urlDraft, setUrlDraft] = useState<string>(state.currentUrl);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect((): void => {
    setUrlDraft(state.currentUrl);
  }, [state.currentUrl]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const res = validateHttpUrl(urlDraft, 'currentUrl');
    if (res.ok) {
      setUrlError(null);
      setUrlDraft(res.value);
      onUpdateState({ currentUrl: res.value });
    } else {
      setUrlError(res.error.message);
    }
  };

  return (
    <form className="tb-row" onSubmit={handleSubmit}>
      <div className="tb-seg" role="radiogroup" aria-label="Browser">
        {SHELL_SEGMENTS.map((seg) => (
          <button
            key={seg.mode}
            type="button"
            role="radio"
            aria-checked={state.shellMode === seg.mode}
            className={`tb-seg-btn ${state.shellMode === seg.mode ? 'seg-active' : ''}`}
            title={seg.hint}
            onClick={(): void => onUpdateState({ shellMode: seg.mode })}
          >
            {seg.label}
          </button>
        ))}
      </div>

      <div className={`shadcn-input-group ${urlError ? 'tb-input-error' : ''}`} title={urlError ?? undefined}>
        <Globe size={10} className="shadcn-input-icon" />
        <input
          type="text"
          className="shadcn-input"
          value={urlDraft}
          spellCheck={false}
          aria-label="Page URL"
          onChange={(e): void => setUrlDraft(e.target.value)}
          placeholder="URL, localhost:5173 or :3000"
        />
        <button type="submit" className="shadcn-input-submit" title="Go (Return)" aria-label="Go">
          <CornerDownLeft size={9} />
        </button>
      </div>

      <div className="shadcn-select-wrap tb-presets">
        <select
          className="shadcn-select shadcn-select-compact"
          aria-label="Saved URLs"
          title="Saved URLs"
          value={bookmarks.some((b) => b.url === state.currentUrl) ? state.currentUrl : ''}
          onChange={(e): void => {
            const val = e.target.value;
            if (val) {
              setUrlDraft(val);
              onUpdateState({ currentUrl: val });
            }
          }}
        >
          <option value="" disabled>
            ★
          </option>
          {bookmarks.map((bm) => (
            <option key={bm.id} value={bm.url}>
              {bm.label}
            </option>
          ))}
        </select>
        <ChevronDown size={9.5} className="shadcn-select-chevron" />
      </div>
    </form>
  );
}

function ActionButton(props: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly title: string;
  readonly onClick?: (e?: React.MouseEvent) => void;
  readonly active?: boolean;
  readonly badge?: number;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`tb-action ${props.active ? 'tb-on' : ''}`}
      title={props.title}
      aria-label={props.label}
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      {props.icon}
      <span>{props.label}</span>
      {props.badge ? <em className="tb-badge">{props.badge}</em> : null}
    </button>
  );
}

/** Row 3 — hardware & tools, named like Xcode's Simulator menus. */
function HardwareRow(props: FloatingToolbarProps): React.ReactElement {
  const { state, activePreset, onUpdateState } = props;
  const duo = isDuo(activePreset);
  const isDuoFolded = state.selectedDeviceId === DeviceModelId.IPHONE_DUO_FOLDED;
  const isDuoInner = activePreset.formFactor === DeviceFormFactor.FOLDABLE_DUAL;
  const nextOrientation =
    state.orientation === Orientation.PORTRAIT ? Orientation.LANDSCAPE : Orientation.PORTRAIT;

  return (
    <div className="tb-row tb-actions">
      <ActionButton icon={<House size={12} />} label="Home" title={platformLabel("Home (⇧⌘H)")} onClick={props.onGoHome} />
      <ActionButton
        icon={<RotateCw size={12} />}
        label="Rotate"
        title={platformLabel("Rotate (⌘← / ⌘→)")}
        onClick={(): void => onUpdateState({ orientation: nextOrientation })}
      />
      <ActionButton
        icon={state.darkMode ? <Moon size={12} /> : <Sun size={12} />}
        label={state.darkMode ? 'Dark' : 'Light'}
        title={platformLabel("Appearance: prefers-color-scheme (⇧⌘A)")}
        onClick={(): void => onUpdateState({ darkMode: !state.darkMode })}
      />
      <ActionButton
        icon={<Camera size={12} />}
        label="Shot"
        title={platformLabel("Save screenshot to Desktop (⌘S)")}
        onClick={props.onScreenshot}
      />
      <ActionButton
        icon={<ClipboardCheck size={12} />}
        label="Check"
        title="iOS web app checks: manifest, icons, viewport, status bar, service worker"
        onClick={props.onToggleInspector}
        active={props.inspectorOpen}
        badge={props.inspectorBadge}
      />
      <ActionButton
        icon={<Terminal size={12} />}
        label="Inspect"
        title="Open Web Inspector (DevTools) for the page"
        onClick={props.onOpenDevTools}
      />
      <span className="tb-spacer" />
      <div className="tb-seg tb-seg-small" role="radiogroup" aria-label="Input mode">
        <button
          type="button"
          role="radio"
          aria-label="Touch input"
          aria-checked={!state.touchCursorEnabled}
          className={`tb-seg-btn ${!state.touchCursorEnabled ? 'seg-active' : ''}`}
          title="Touch = click and drag (like a finger)"
          onClick={(): void => onUpdateState({ touchCursorEnabled: false })}
        >
          <MousePointerClick size={10} />
        </button>
        <button
          type="button"
          role="radio"
          aria-label="Mouse input"
          aria-checked={state.touchCursorEnabled}
          className={`tb-seg-btn ${state.touchCursorEnabled ? 'seg-active' : ''}`}
          title="Mouse = hover and select text; use wheel or trackpad to scroll"
          onClick={(): void => onUpdateState({ touchCursorEnabled: true })}
        >
          <Sparkles size={10} />
        </button>
      </div>
      {duo && (
        <ActionButton
          icon={isDuoFolded ? <BookOpen size={12} /> : <FolderClosed size={12} />}
          label={isDuoFolded ? 'Unfold' : 'Fold'}
          title={
            isDuoFolded
              ? 'Open the Duo to the inner display (Shift-click: slow motion)'
              : 'Close to the cover display (Shift-click: slow motion)'
          }
          onClick={(e): void => {
            setFoldSlowFactor(e?.shiftKey ? 8 : 1);
            onUpdateState({
              selectedDeviceId: isDuoFolded
                ? DeviceModelId.IPHONE_DUO_UNFOLDED
                : DeviceModelId.IPHONE_DUO_FOLDED,
              orientation: Orientation.PORTRAIT
            });
          }}
        />
      )}
      {isDuoInner && (
        <ActionButton
          icon={<Columns2 size={12} />}
          label={state.duoDisplayMode === DuoDisplayMode.SPLIT_COMPARISON ? 'Split' : 'Span'}
          title="Span one page across the inner display, or run two instances side by side"
          active={state.duoDisplayMode === DuoDisplayMode.SPLIT_COMPARISON}
          onClick={(): void =>
            onUpdateState({
              duoDisplayMode:
                state.duoDisplayMode === DuoDisplayMode.SINGLE_SPAN
                  ? DuoDisplayMode.SPLIT_COMPARISON
                  : DuoDisplayMode.SINGLE_SPAN,
              ...(state.duoDisplayMode === DuoDisplayMode.SINGLE_SPAN && state.secondaryUrl === 'http://localhost:5173/' ? { secondaryUrl: state.currentUrl } : {})
            })
          }
        />
      )}
    </div>
  );
}

function ComparisonUrlRow(props: FloatingToolbarProps): React.ReactElement {
  const [draft, setDraft] = useState(props.state.secondaryUrl);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(props.state.secondaryUrl), [props.state.secondaryUrl]);
  return <form className="tb-row tb-comparison" onSubmit={event => {
    event.preventDefault();
    const result = validateHttpUrl(draft, 'secondaryUrl');
    if (result.ok) { setError(null); props.onUpdateState({ secondaryUrl: result.value }); }
    else setError(result.error.message);
  }}>
    <label htmlFor="comparison-url">Compare</label>
    <div className={`shadcn-input-group ${error ? 'tb-input-error' : ''}`} title={error ?? 'Page on the left / upper display'}>
      <input id="comparison-url" className="shadcn-input" aria-label="Comparison URL" value={draft} spellCheck={false} onChange={event => setDraft(event.target.value)} />
      <button type="submit" className="shadcn-input-submit" aria-label="Go to comparison URL"><CornerDownLeft size={9} /></button>
    </div>
  </form>;
}

export function FloatingToolbar(props: FloatingToolbarProps): React.ReactElement | null {
  if (props.state.hudCollapsed) {
    return null;
  }
  return (
    <header
      className="shadcn-toolbar"
      style={props.targetWidthPx ? { width: `${props.targetWidthPx}px` } : undefined}
    >
      <WindowRow {...props} />
      <BrowserRow {...props} />
      <HardwareRow {...props} />
      {isDuo(props.activePreset) && props.state.duoDisplayMode === DuoDisplayMode.SPLIT_COMPARISON && <ComparisonUrlRow {...props} />}
    </header>
  );
}
