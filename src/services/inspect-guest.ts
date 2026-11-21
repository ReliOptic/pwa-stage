import type { WebContents } from 'electron';
import type { PageInspectionReport } from '../types/ipc-coordinator.types';
import type { Result } from '../types/simulator.types';
import { evaluatePwaChecks, PAGE_INSPECTION_EXPRESSION, resolveHomeScreenIdentity, sanitizePageInspection } from './page-inspector';

export async function inspectGuestPage(guest: WebContents): Promise<Result<PageInspectionReport>> {
  try {
    if (!guest.debugger.isAttached()) {
      guest.debugger.attach('1.3');
    }
    const res = (await guest.debugger.sendCommand('Runtime.evaluate', {
      expression: PAGE_INSPECTION_EXPRESSION,
      awaitPromise: true,
      returnByValue: true,
      timeout: 8000
    })) as { result?: { value?: unknown } };
    const inspection = sanitizePageInspection(res.result?.value);
    if (!inspection) {
      return { ok: false, error: { kind: 'EMULATION_FAILURE_ERROR', operation: 'inspect', message: 'Page returned no inspectable data', recoveryHint: 'Wait for the page to finish loading' } };
    }
    return {
      ok: true,
      value: {
        inspection,
        checks: evaluatePwaChecks(inspection),
        identity: resolveHomeScreenIdentity(inspection)
      }
    };
  } catch (err) {
    return { ok: false, error: { kind: 'EMULATION_FAILURE_ERROR', operation: 'inspect', message: err instanceof Error ? err.message : 'inspect failed', recoveryHint: 'Reload the page' } };
  }
}
