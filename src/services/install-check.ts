import { randomUUID } from 'node:crypto';
import { getDevicePresetById } from '../config/device-presets.config';
import type { SimulatorEnvConfig } from '../config/env.config';
import type { JourneyFrame, JourneyReport, JourneyVisit, StageCheckRequest } from '../types/journey.types';
import { BrowserShellMode, type SimulatorState } from '../types/simulator.types';
import { StageSession } from './stage-session';

export function createInstallReport(request: StageCheckRequest, state: SimulatorState): JourneyReport {
  return {
    id: randomUUID(), kind: 'install', origin: new URL(request.addresses[0]).origin,
    goal: 'Install and reopen from the Home Screen', model: 'Built-in installation check',
    iterations: request.addresses.length * request.devices.length * request.browsers.length,
    device: request.devices.map(id => getDevicePresetById(id).name).join(', '),
    orientation: state.orientation, previewLanguage: state.previewLanguage, previewTimeZone: state.previewTimeZone,
    status: 'running', message: 'Opening simulator', visits: []
  };
}

export function appendJourneyFrame(images: Map<number,string>, visit: JourneyVisit, action: string, title: string,
  path: string, image: string, reason = '', observation?: JourneyFrame['observation']): void {
  const id = images.size;
  images.set(id, image);
  const elapsedMs = visit.startedAt === undefined ? undefined : Math.max(0, Date.now() - visit.startedAt);
  visit.frames.push({id, path, title, action, reason, elapsedMs, observation});
}

export async function runInstallChecks(request: StageCheckRequest, report: JourneyReport, state: SimulatorState,
  env: SimulatorEnvConfig, images: Map<number,string>, signal: AbortSignal, publish = () => {}): Promise<void> {
  for (const address of request.addresses) for (const id of request.devices) for (const browser of request.browsers) {
    signal.throwIfAborted();
    const preset = getDevicePresetById(id);
    const url = new URL(address);
    const visit: JourneyVisit = {
      persona: preset.name + ' · ' + (browser === 'ios-safari' ? 'Safari' : 'Chrome'),
      source: url.origin + url.pathname, frames: [], startedAt: Date.now(), outcome: 'exploring', note: ''
    };
    report.visits.push(visit);
    report.message = 'Checking ' + url.host + ' · ' + visit.persona;
    publish();
    const stage = new StageSession(address, preset, browser as BrowserShellMode, state, env, signal);
    try {
      visit.installation = await stage.install((action, title, address, image) => {
        appendJourneyFrame(images, visit, action, title, new URL(address).pathname, image);
        publish();
      });
      visit.outcome = 'verified';
      const installation = visit.installation;
      visit.note = installation.manifestError ? 'Website shortcut reopened. Manifest read failed: ' + installation.manifestError :
        installation.manifest ? 'Manifest read. The installed icon reopened in standalone mode.' :
          'No readable manifest. The website shortcut reopened in standalone mode.';
    } catch (error) {
      signal.throwIfAborted();
      visit.outcome = 'blocked';
      visit.note = error instanceof Error ? error.message : 'Installation check failed.';
    } finally {
      stage.close();
      publish();
    }
  }
}
