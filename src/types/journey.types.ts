import type { DeviceModelId } from './device.types';

export const MAX_VISITS = 12;
export const MAX_ACTIONS = 6;
export const DEFAULT_JOURNEY_MODEL = 'openai/gpt-4.1-mini';

export interface JourneyRequest {
  address: string;
  localEndpoint?: string;
  material?: string;
  installFirst?: boolean;
  planDevice?: boolean;
  shareScreen?: boolean;
  recordScreen?: boolean;
  goal: string;
  audiences: string[];
  iterations: number;
  model: string;
  apiKey: string;
}

export type ModelConnection = Pick<JourneyRequest, 'model' | 'apiKey' | 'localEndpoint'>;

export interface JourneyFrame {
  id: number;
  path: string;
  title: string;
  action: string;
  reason: string;
  elapsedMs?: number;
  observation?: {text:string; controls:string[]};
}

export interface JourneyInput {
  from: number;
  elapsedMs: number;
  kind: 'tap' | 'scroll' | 'wait' | 'navigate';
  label: string;
  to?: number;
}

export interface VisitRecording {
  frames: {at: number; jpeg: string}[];
  duration: number;
  clipped: boolean;
}

export interface JourneyVisit {
  startedAt?: number;
  inputs?: JourneyInput[];
  quote?: string;
  persona: string;
  source?: string;
  installation?: {name:string; path:string; manifest:boolean; manifestError?:string};
  frames: JourneyFrame[];
  outcome: 'exploring' | 'finished' | 'verified' | 'unconfirmed' | 'blocked' | 'limit' | 'stopped' | 'error';
  note: string;
}

export interface JourneyReport {
  id: string;
  origin: string;
  kind?: 'install' | 'audience';
  liveVisit?: number;
  liveDevice?:string;
  previewLanguage?:string;
  previewTimeZone?:string;
  orientation?:string;
  goal: string;
  model: string;
  iterations: number;
  device: string;
  status: 'running' | 'completed' | 'stopped' | 'error';
  message: string;
  visits: JourneyVisit[];
}

export interface StageCheckRequest {
  addresses: string[];
  devices: DeviceModelId[];
  browsers: ('ios-safari' | 'ios-chrome')[];
}

export interface JourneyStudioApi {
  initial: () => Promise<{address: string; device: string; environmentKey: boolean; report: JourneyReport | null}>;
  verifyModel: (connection: ModelConnection) => Promise<void>;
  start: (request: JourneyRequest) => Promise<void>;
  pickSource: (kind:'file'|'folder') => Promise<string|null>;
  check: (request:StageCheckRequest) => Promise<void>;
  stop: () => Promise<void>;
  image: (reportId: string, id: number) => Promise<string | null>;
  recording: (reportId: string, visit: number) => Promise<VisitRecording | null>;
  watch: (reportId:string,visit:number,onFrame:(jpeg:string)=>void,onError:()=>void) => () => void;
  save: () => Promise<boolean>;
  subscribe: (fn: (report: JourneyReport) => void) => () => void;
}
