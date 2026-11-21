import type { DebuggerCommandSender, EmulationProfile, RelatedTargetEvent } from '../types/emulation.types';
import { logStructured } from '../utils/logger.util';

type TargetKind = 'iframe' | 'worker' | 'service_worker' | 'shared_worker';
const autoAttach = {
  autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
  filter: [{type:'iframe'}, {type:'worker'}, {type:'service_worker'}, {type:'shared_worker'}, {exclude:true}]
};

interface ChildSession {
  kind: TargetKind;
  scriptId?: string;
  pending: Promise<void>;
  language?: string;
  timeZone?: string;
}

// Out-of-process frames and workers each have their own DevTools agent. Installing
// the profile on the webview alone leaves these contexts using the host desktop.
export function mobileChildTargets(connection: DebuggerCommandSender, initial: EmulationProfile) {
  const children = new Map<string, ChildSession>();
  let profile = initial;
  let enabled = false;
  const childSettings = (p:EmulationProfile) => JSON.stringify([
    p.userAgent,p.platform,p.previewLanguage,p.previewTimeZone,p.standalone,p.metrics.screenWidth,p.metrics.screenHeight,p.touch,p.mediaFeatures
  ]);

  async function configure(id: string, child: ChildSession, first: boolean, paused: boolean) {
    const current = profile;
    const send = (method: string, args: Record<string, unknown> = {}) => connection.sendCommand(method, args, id);
    const { metrics, userAgent, platform } = current;
    const ua = {userAgent, platform, ...(current.previewLanguage && {acceptLanguage:current.previewLanguage})};
    const identity = `(() => {
      const proto = Object.getPrototypeOf(navigator);
      const set = (object, key, value) => Object.defineProperty(object, key, {configurable:true, get:()=>value});
      delete proto.userAgentData;
      set(proto, 'platform', ${JSON.stringify(platform)});
      set(proto, 'userAgent', ${JSON.stringify(userAgent)});
      ${child.kind === 'iframe' ? `
        set(proto, 'vendor', 'Apple Computer, Inc.');
        set(proto, 'standalone', ${current.standalone});
        set(Screen.prototype, 'width', ${metrics.screenWidth}); set(Screen.prototype, 'availWidth', ${metrics.screenWidth});
        set(Screen.prototype, 'height', ${metrics.screenHeight}); set(Screen.prototype, 'availHeight', ${metrics.screenHeight});
        set(window, 'devicePixelRatio', ${metrics.deviceScaleFactor});
        set(screen.orientation, 'type', ${JSON.stringify(metrics.screenOrientation.angle ? 'landscape-primary' : 'portrait-primary')});
        set(screen.orientation, 'angle', ${metrics.screenOrientation.angle});` : ''}
    })()`;
    let resumed = false;
    try {
      if (child.kind === 'iframe') {
        if (child.language !== current.previewLanguage) {
          await send('Emulation.setLocaleOverride', {locale:current.previewLanguage || ''});
          child.language = current.previewLanguage;
        }
        if (child.timeZone !== current.previewTimeZone) {
          await send('Emulation.setTimezoneOverride', {timezoneId:current.previewTimeZone || ''});
          child.timeZone = current.previewTimeZone;
        }
      }
      // Service-worker startup only processes queued renderer commands once the
      // startup barrier is released. Queue the identity before releasing it.
      if (paused && child.kind === 'service_worker') {
        const applying = Promise.all([
          send('Runtime.evaluate', {expression:identity}),
          send('Emulation.setUserAgentOverride', ua),
          send('Runtime.runIfWaitingForDebugger')
        ]);
        resumed = true;
        await applying;
      } else {
        await send('Emulation.setUserAgentOverride', ua);
        if (child.kind === 'iframe') {
          await send('Emulation.setTouchEmulationEnabled', {...current.touch});
          await send('Emulation.setEmulatedMedia', {features:current.mediaFeatures});
          if (first) await send('Page.enable');
          if (child.scriptId) await send('Page.removeScriptToEvaluateOnNewDocument', {identifier:child.scriptId});
          const added = await send('Page.addScriptToEvaluateOnNewDocument', {source:identity,runImmediately:true}) as {identifier:string};
          child.scriptId = added.identifier;
        } else {
          await send('Runtime.evaluate', {expression:identity});
        }
      }
      if (first && child.kind !== 'service_worker') await send('Target.setAutoAttach', autoAttach);
    } finally {
      if (paused && !resumed) await send('Runtime.runIfWaitingForDebugger');
    }
  }

  function schedule(id: string, child: ChildSession, first = false, paused = false) {
    child.pending = child.pending.then(() => configure(id, child, first, paused)).catch((error: Error) => {
      if (children.has(id)) logStructured('warn','emulation.service','child_profile_failed',{kind:child.kind,message:error.message});
    });
    return child.pending;
  }

  const onMessage = (_event: unknown, method: string, params: RelatedTargetEvent) => {
    if (method === 'Target.detachedFromTarget') children.delete(params.sessionId);
    if (method !== 'Target.attachedToTarget') return;
    const kind = params.targetInfo?.type;
    if (kind !== 'iframe' && kind !== 'worker' && kind !== 'shared_worker' && kind !== 'service_worker') return;
    const child: ChildSession = {kind, pending:Promise.resolve()};
    children.set(params.sessionId, child);
    void schedule(params.sessionId, child, true, Boolean(params.waitingForDebugger));
  };
  connection.on('message', onMessage);
  return {
    async update(next: EmulationProfile) {
      const previous = profile;
      profile = next;
      if (!enabled) {
        await connection.sendCommand('Target.setAutoAttach', autoAttach);
        enabled = true;
      } else if (childSettings(previous) !== childSettings(next)) {
        const updates = Promise.all(Array.from(children, ([id, child]) => schedule(id, child)));
        // Switching browser shells navigates to a new document. The frames
        // being replaced must not block that navigation. New targets still
        // wait for their own mobile profile before any site script runs.
        if (previous.userAgent === next.userAgent && previous.standalone === next.standalone) await updates;
      }
    },
    dispose() {
      connection.removeListener('message', onMessage);
      children.clear();
    }
  };
}
