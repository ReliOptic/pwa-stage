import { platformLabel, hostPlatform } from '../../utils/platform.util';
import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Camera,
  ChevronDown,
  ClipboardCheck,
  Columns2,
  CornerDownLeft,
  FolderClosed,
  SlidersHorizontal,
  PanelTopClose,
  GripHorizontal,
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
import { requestDuoFoldToggle, useDuoFoldTarget } from '../sim-events';

export interface FloatingToolbarProps {
  readonly state: SimulatorState;
  readonly presets: readonly DevicePreset[];
  readonly bookmarks: readonly QuickUrlBookmark[];
  readonly activePreset: DevicePreset;
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
function WindowIdentity(props: FloatingToolbarProps): React.ReactElement {
  const { state, presets, onUpdateState } = props;

  return (
    <>
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

      <div className="tool-device-picker"><Smartphone size={17} /><span>{props.activePreset.name}</span><ChevronDown size={12} />
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
      </div>

    </>
  );
}

function DisplayScale(props: FloatingToolbarProps): React.ReactElement {
  const { state } = props;
  return (
      <div className="scale-stepper" role="group" aria-label="Zoom">
        <button
          type="button"
          className="scale-step-btn"
          title={platformLabel("Zoom Out (⌘−)")}
          aria-label="Zoom out"
          onClick={(): void => props.onUpdateState({scale: clampSimulatorScale(state.scale - 0.05)})}
        >
          <Minus size={9} />
        </button>
        <button
          type="button"
          className="scale-readout-btn"
          title={platformLabel("Toggle 85% / 100% (⌘0). Drag a corner to resize.")}
          onClick={(): void =>
            props.onUpdateState({ scale: Math.abs(state.scale - 0.85) < 0.02 ? 1.0 : 0.85 })
          }
        >
          {`${Math.round(state.scale * 100)}%`}
        </button>
        <button
          type="button"
          className="scale-step-btn"
          title={platformLabel("Zoom In (⌘+)")}
          aria-label="Zoom in"
          onClick={(): void => props.onUpdateState({scale: clampSimulatorScale(state.scale + 0.05)})}
        >
          <Plus size={9} />
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
    <form className="tool-location" onSubmit={handleSubmit}>
      <div className="tool-browser-picker">
        <span>{SHELL_SEGMENTS.find(segment => segment.mode === state.shellMode)?.label}</span><ChevronDown size={10} />
        <select aria-label="Browser" value={state.shellMode}
          onChange={event => onUpdateState({shellMode: event.target.value as BrowserShellMode})}>
          {SHELL_SEGMENTS.map(segment => <option key={segment.mode} value={segment.mode}>{segment.label}</option>)}
        </select>
      </div>
      <div className={`shadcn-input-group ${urlError ? 'tb-input-error' : ''}`} title={urlError ?? undefined}>
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
  const foldTarget = useDuoFoldTarget();
  const isDuoFolded = foldTarget !== null ? foldTarget === 0 : state.selectedDeviceId === DeviceModelId.IPHONE_DUO_FOLDED;
  const isDuoInner = activePreset.formFactor === DeviceFormFactor.FOLDABLE_DUAL;
  const nextOrientation =
    state.orientation === Orientation.PORTRAIT ? Orientation.LANDSCAPE : Orientation.PORTRAIT;

  return (
    <div className="tb-row tb-actions">
      <ActionButton
        icon={<RotateCw size={12} />}
        label="Rotate"
        title={platformLabel("Rotate (⌘← / ⌘→)")}
        onClick={(): void => onUpdateState({ orientation: nextOrientation })}
      />
      <ActionButton
        icon={state.darkMode ? <Moon size={12} /> : <Sun size={12} />}
        label="Dark appearance"
        active={state.darkMode}
        title={platformLabel("Appearance: prefers-color-scheme (⇧⌘A)")}
        onClick={(): void => onUpdateState({ darkMode: !state.darkMode })}
      />
      <ActionButton
        icon={<Camera size={12} />}
        label="Screenshot"
        title={platformLabel("Save screenshot to Desktop (⌘S)")}
        onClick={props.onScreenshot}
      />
      <ActionButton
        icon={<ClipboardCheck size={12} />}
        label="PWA checks"
        title="iOS web app checks: manifest, icons, viewport, status bar, service worker"
        onClick={props.onToggleInspector}
        active={props.inspectorOpen}
        badge={props.inspectorBadge}
      />
      <ActionButton
        icon={<Terminal size={12} />}
        label="Web Inspector"
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
          Touch
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
          Mouse
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
            requestDuoFoldToggle(e?.shiftKey);
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { state, onUpdateState } = props;
  useEffect(() => {
    if (!toolsOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setToolsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setToolsOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', escape);
    };
  }, [toolsOpen]);
  useEffect(() => { if (state.hudCollapsed) setToolsOpen(false); }, [state.hudCollapsed]);
  const pin = <button type="button" className="tool-icon" title={platformLabel("Pin to current desktop (⌘T)")}
    aria-label="Pin to current desktop" aria-pressed={state.alwaysOnTop}
    onClick={() => onUpdateState({alwaysOnTop: !state.alwaysOnTop})}>
    {state.alwaysOnTop ? <Pin size={15}/> : <PinOff size={15}/>}</button>;
  if (state.hudCollapsed) return (
    <header className="preview-handle" aria-label="Preview controls">
      <GripHorizontal size={14} className="preview-grip" aria-hidden="true" />
      <button type="button" className="handle-expand" title={platformLabel("Show Toolbar (⌘B)")}
        onClick={() => onUpdateState({hudCollapsed:false})}>{props.activePreset.name}<ChevronDown size={12}/></button>
      {pin}
      <button type="button" className="tool-icon" title="Switch touch or mouse input" aria-label="Switch touch or mouse input"
        onClick={() => onUpdateState({touchCursorEnabled:!state.touchCursorEnabled})}>
        {state.touchCursorEnabled ? <Sparkles size={14}/> : <MousePointerClick size={14}/>}</button>
    </header>
  );
  return (
    <header ref={header} className="preview-toolbar" aria-label="Simulator toolbar">
      <WindowIdentity {...props}/>
      <BrowserRow {...props}/>
      <div className="tool-shortcuts">
        <button type="button" className="tool-icon" aria-label="Home" title={platformLabel("Home (⇧⌘H)")} onClick={props.onGoHome}><House size={16}/></button>
        <button ref={trigger} type="button" className="tool-icon" aria-label="Device controls" title="Device controls"
          aria-controls="device-controls" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>
          <SlidersHorizontal size={16}/></button>
        <button type="button" className="tool-icon" aria-label="Hide toolbar" title={platformLabel("Hide toolbar (⌘B)")}
          onClick={() => onUpdateState({hudCollapsed:true})}><PanelTopClose size={16}/></button>
      </div>
      {toolsOpen && <section id="device-controls" className="device-controls" role="dialog" aria-label="Device controls">
        <div className="device-control-heading"><strong>Device controls</strong>{pin}<DisplayScale {...props}/></div>
        <HardwareRow {...props}/>
        {isDuo(props.activePreset) && state.duoDisplayMode === DuoDisplayMode.SPLIT_COMPARISON && <ComparisonUrlRow {...props}/>}
      </section>}
    </header>
  );
}
