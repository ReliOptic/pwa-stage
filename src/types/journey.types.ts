export const MAX_VISITS = 12;
export const MAX_ACTIONS = 6;
export const DEFAULT_JOURNEY_MODEL = 'openai/gpt-4.1-mini';

export interface JourneyRequest {
  address: string;
  goal: string;
  audiences: string[];
  iterations: number;
  model: string;
  apiKey: string;
}

export interface JourneyFrame {
  id: number;
  path: string;
  title: string;
  action: string;
  reason: string;
}

export interface JourneyVisit {
  persona: string;
  frames: JourneyFrame[];
  outcome: 'exploring' | 'finished' | 'blocked' | 'limit' | 'stopped' | 'error';
  note: string;
}

export interface JourneyReport {
  id: string;
  origin: string;
  goal: string;
  model: string;
  iterations: number;
  device: string;
  status: 'running' | 'completed' | 'stopped' | 'error';
  message: string;
  visits: JourneyVisit[];
}

export interface JourneyStudioApi {
  initial: () => Promise<{address: string; device: string; environmentKey: boolean; report: JourneyReport | null}>;
  start: (request: JourneyRequest) => Promise<void>;
  stop: () => Promise<void>;
  image: (reportId: string, id: number) => Promise<string | null>;
  save: () => Promise<boolean>;
  subscribe: (fn: (report: JourneyReport) => void) => () => void;
}
