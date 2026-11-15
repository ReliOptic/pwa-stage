import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  Columns2,
  CornerDownLeft,
  EyeOff,
  FolderClosed,
  Globe,
  Hand,
  Layers,
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
}

const SHELL_MODE_CYCLE: readonly { readonly mode: BrowserShellMode; readonly label: string }[] = [
  { mode: BrowserShellMode.PWA_STANDALONE, label: 'PWA' },
  { mode: BrowserShellMode.IOS_SAFARI, label: 'Safari' },
  { mode: BrowserShellMode.IOS_CHROME, label: 'Chrome' }
];

function nextShellMode(current: BrowserShellMode): BrowserShellMode {
  const idx = SHELL_MODE_CYCLE.findIndex((item) => item.mode === current);
  const nextIdx = (idx + 1) % SHELL_MODE_CYCLE.length;
  return SHELL_MODE_CYCLE[nextIdx]?.mode ?? BrowserShellMode.PWA_STANDALONE;
}

function shellModeShortLabel(current: BrowserShellMode): string {
  return SHELL_MODE_CYCLE.find((item) => item.mode === current)?.label ?? 'PWA';
}

function formatDeviceOptionLabel(preset: DevicePreset): string {
  return `${preset.name} · iOS 27.3`;
}

function TopControlRow(props: FloatingToolbarProps): React.ReactElement {
  const { state, presets, activePreset, onUpdateState } = props;
  const isDuoDevice =
    activePreset.formFactor === DeviceFormFactor.FOLDABLE_COVER ||
    activePreset.formFactor === DeviceFormFactor.FOLDABLE_DUAL;
  const isDuoFolded = state.selectedDeviceId === DeviceModelId.IPHONE_DUO_FOLDED;

  const stepScale = (delta: number): void => {
    onUpdateState({ scale: clampSimulatorScale(state.scale + delta) });
  };

  return (
    <div className="shadcn-row">
      <div className="shadcn-group">
        <div className="traffic-lights">
          <button
            type="button"
            className="traffic-dot traffic-close"
            title="상단바로 숨기기 (⌘⇧S)"
            onClick={props.onClose}
          >
            <X size={8} strokeWidth={3} />
          </button>
          <button
            type="button"
            className="traffic-dot traffic-min"
            title="Dock으로 최소화 (⌘M)"
            onClick={props.onMinimize}
          >
            <Minus size={8} strokeWidth={3} />
          </button>
        </div>

        <div className="shadcn-select-wrap shadcn-select-device-wrap">
          <Smartphone size={10.5} className="shadcn-select-icon" />
          <select
            className="shadcn-select shadcn-select-device"
            aria-label="Device Model"
            value={state.selectedDeviceId}
            onChange={(e): void =>
              onUpdateState({ selectedDeviceId: e.target.value as DeviceModelId })
            }
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {formatDeviceOptionLabel(p)}
              </option>
            ))}
          </select>
          <ChevronDown size={10} className="shadcn-select-chevron" />
        </div>

        <div
          className="swipe-mode-segmented"
          role="group"
          aria-label="화면 내 스와이프 방식"
          title="화면 내 스와이프 방식: 눌러서(클릭 드래그) vs 바로(무클릭 커서 이동/트랙패드)"
        >
          <button
            type="button"
            className={`swipe-seg-btn ${!state.touchCursorEnabled ? 'swipe-seg-active' : ''}`}
            title="눌러서 스와이프: 마우스를 클릭한 채 드래그하여 스와이프"
            onClick={(): void => onUpdateState({ touchCursorEnabled: false })}
          >
            <MousePointerClick size={9.5} />
            <span>눌러서</span>
          </button>
          <button
            type="button"
            className={`swipe-seg-btn ${state.touchCursorEnabled ? 'swipe-seg-active swipe-seg-direct' : ''}`}
            title="바로 스와이프: 클릭 없이 커서를 움직이거나 트랙패드 스크롤로 즉시 스와이프"
            onClick={(): void => onUpdateState({ touchCursorEnabled: true })}
          >
            {state.touchCursorEnabled ? <Sparkles size={9.5} /> : <Hand size={9.5} />}
            <span>바로</span>
          </button>
        </div>

        {isDuoDevice && (
          <button
            type="button"
            className="shadcn-btn shadcn-btn-primary"
            onClick={(): void =>
              onUpdateState({
                selectedDeviceId: isDuoFolded
                  ? DeviceModelId.IPHONE_DUO_UNFOLDED
                  : DeviceModelId.IPHONE_DUO_FOLDED,
                orientation: Orientation.PORTRAIT
              })
            }
          >
            {isDuoFolded ? <BookOpen size={10.5} /> : <FolderClosed size={10.5} />}
            <span>{isDuoFolded ? '펼치기' : '접기'}</span>
          </button>
        )}
      </div>

      <div className="shadcn-group">
        <button
          type="button"
          className={`pin-toggle-pill ${state.alwaysOnTop ? 'pin-toggle-on' : 'pin-toggle-off'}`}
          title={`항상 위에 고정 토글 (현재: ${state.alwaysOnTop ? '켜짐' : '꺼짐'}, 단축키 ⌘T)`}
          onClick={(): void => onUpdateState({ alwaysOnTop: !state.alwaysOnTop })}
        >
          {state.alwaysOnTop ? <Pin size={9.5} /> : <PinOff size={9.5} />}
          <span>{state.alwaysOnTop ? '고정 ON' : '고정'}</span>
        </button>

        <div className="scale-stepper" role="group" aria-label="Scale">
          <button
            type="button"
            className="scale-step-btn"
            title="축소 (⌘-)"
            onClick={(): void => stepScale(-0.05)}
          >
            <Minus size={9.5} />
          </button>
          <button
            type="button"
            className="scale-readout-btn"
            title="클릭하여 85% / 100% 전환 (모서리 드래그로 자유 조절 가능)"
            onClick={(): void =>
              onUpdateState({ scale: Math.abs(state.scale - 0.85) < 0.02 ? 1.0 : 0.85 })
            }
          >
            {`${Math.round(state.scale * 100)}%`}
          </button>
          <button
            type="button"
            className="scale-step-btn"
            title="확대 (⌘+)"
            onClick={(): void => stepScale(0.05)}
          >
            <Plus size={9.5} />
          </button>
        </div>

        <button
          type="button"
          className="shadcn-icon-btn"
          title="컨트롤 바 접기 (⌘B)"
          onClick={(): void => onUpdateState({ hudCollapsed: true })}
        >
          <EyeOff size={11} />
        </button>
      </div>
    </div>
  );
}

function UrlBarRow(props: FloatingToolbarProps): React.ReactElement {
  const { state, bookmarks, activePreset, onUpdateState } = props;
  const [urlDraft, setUrlDraft] = useState<string>(state.currentUrl);
  const isDuo = activePreset.formFactor === DeviceFormFactor.FOLDABLE_DUAL;
  const nextOrientation =
    state.orientation === Orientation.PORTRAIT ? Orientation.LANDSCAPE : Orientation.PORTRAIT;
  const nextDuoMode =
    state.duoDisplayMode === DuoDisplayMode.SINGLE_SPAN
      ? DuoDisplayMode.SPLIT_COMPARISON
      : DuoDisplayMode.SINGLE_SPAN;

  useEffect((): void => {
    setUrlDraft(state.currentUrl);
  }, [state.currentUrl]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const res = validateHttpUrl(urlDraft, 'currentUrl');
    if (res.ok) {
      setUrlDraft(res.value);
      onUpdateState({ currentUrl: res.value });
    }
  };

  return (
    <form className="shadcn-row" onSubmit={handleSubmit}>
      <button
        type="button"
        className="shadcn-btn shadcn-btn-outline"
        title="셸 모드 전환: PWA Standalone / iOS Safari / iOS Chrome"
        onClick={(): void => onUpdateState({ shellMode: nextShellMode(state.shellMode) })}
      >
        <Layers size={10} />
        <span>{shellModeShortLabel(state.shellMode)}</span>
      </button>

      <div className="shadcn-input-group">
        <Globe size={10} className="shadcn-input-icon" />
        <input
          type="text"
          className="shadcn-input"
          value={urlDraft}
          onChange={(e): void => setUrlDraft(e.target.value)}
          placeholder="URL 또는 :5173 입력..."
        />
        <button type="submit" className="shadcn-input-submit" title="이동 (Enter)">
          <CornerDownLeft size={9} />
        </button>
      </div>

      <div className="shadcn-group">
        <div className="shadcn-select-wrap">
          <select
            className="shadcn-select shadcn-select-compact"
            aria-label="Quick Target URL"
            value={bookmarks.some((b) => b.url === state.currentUrl) ? state.currentUrl : ''}
            onChange={(e): void => {
              const val = e.target.value;
              if (val) {
                setUrlDraft(val);
                onUpdateState({ currentUrl: val });
              }
            }}
          >
            <option value="" disabled>프리셋</option>
            {bookmarks.map((bm) => (
              <option key={bm.id} value={bm.url}>
                {bm.label}
              </option>
            ))}
          </select>
          <ChevronDown size={9.5} className="shadcn-select-chevron" />
        </div>

        {isDuo && (
          <button
            type="button"
            className={`shadcn-btn ${state.duoDisplayMode === DuoDisplayMode.SPLIT_COMPARISON ? 'shadcn-btn-primary' : 'shadcn-btn-outline'}`}
            onClick={(): void => onUpdateState({ duoDisplayMode: nextDuoMode })}
          >
            <Columns2 size={10} />
            <span>{state.duoDisplayMode === DuoDisplayMode.SINGLE_SPAN ? 'Span' : 'Split'}</span>
          </button>
        )}
        <button
          type="button"
          className="shadcn-icon-btn"
          title="화면 회전 (세로/가로)"
          onClick={(): void => onUpdateState({ orientation: nextOrientation })}
        >
          <RotateCw size={11} />
        </button>
        <button
          type="button"
          className="shadcn-icon-btn"
          title="다크/라이트 상태바 테마"
          onClick={(): void => onUpdateState({ darkMode: !state.darkMode })}
        >
          {state.darkMode ? <Moon size={11} /> : <Sun size={11} />}
        </button>
        <button
          type="button"
          className="shadcn-icon-btn"
          title="개발자 도구 열기 (DevTools)"
          onClick={props.onOpenDevTools}
        >
          <Terminal size={11} />
        </button>
      </div>
    </form>
  );
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
      <TopControlRow {...props} />
      <UrlBarRow {...props} />
    </header>
  );
}
