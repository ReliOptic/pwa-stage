import { app, screen } from 'electron';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadSimulatorEnvConfig } from './config/env.config';
import { createInstallReport, runInstallChecks } from './services/install-check';
import { reportHtml } from './services/journey-report';
import { createDefaultSimulatorState } from './services/storage';
import type { JourneyReport, JourneyVisit, StageCheckRequest } from './types/journey.types';

interface CheckOptions {
  request: StageCheckRequest;
  language: string;
  timeZone: string;
  output: string;
  profile: string;
}

function checkFailure(visit: JourneyVisit): string | null {
  if (visit.outcome !== 'verified') return visit.note || 'Home Screen launch could not be verified.';
  if (!visit.installation?.manifest) return visit.note || 'No readable manifest.';
  const failures = visit.installation.checks?.filter(check => check.level === 'fail') ?? [];
  return failures.length ? failures.map(check => check.title + ' · ' + check.detail).join('\n') : null;
}

async function save(output: string, report: JourneyReport, images: Map<number,string>, passed: boolean) {
  const directory = path.join(output,report.id);
  const temporary = await mkdtemp(path.join(output,'.pending-'));
  try {
    const html = reportHtml(report,images,new Map());
    const visits = report.visits.map(visit => ({...visit, passed:checkFailure(visit) === null}));
    const json = JSON.stringify({schemaVersion:1, engine:'Chromium ' + process.versions.chrome, passed, ...report, visits},null,2) + '\n';
    await writeFile(path.join(temporary,'report.html'),html);
    await writeFile(path.join(temporary,'report.json'),json);
    await rename(temporary,directory);
    return directory;
  } finally {
    await rm(temporary,{force:true,recursive:true});
  }
}

async function main(): Promise<number> {
  const options: CheckOptions = JSON.parse(process.env.PWA_STAGE_CHECK || '{}');
  delete process.env.PWA_STAGE_CHECK;
  app.setPath('userData',options.profile);
  app.setPath('sessionData',options.profile);
  // A hidden Stage window is closed between browser runs.
  app.on('window-all-closed',()=>{});
  const controller = new AbortController();
  process.once('SIGINT',()=>controller.abort());
  process.once('SIGTERM',()=>controller.abort());
  const config = loadSimulatorEnvConfig({});
  if (!config.ok) throw Error(config.error.message);
  await mkdir(options.output,{recursive:true});
  await app.whenReady();
  const display = screen.getPrimaryDisplay().size;
  if (display.width <= 1 || display.height <= 1) throw Error('Electron could not create a display for device captures.');
  // Each run opens the supplied URL, even when a dev server uses the desktop start page's address.
  const env = {...config.value, quickBookmarks:[]};
  const state = {...createDefaultSimulatorState(env), previewLanguage:options.language, previewTimeZone:options.timeZone};
  const report = createInstallReport(options.request,state);
  console.log('Checking ' + report.origin + ' · ' + report.device);
  const images = new Map<number,string>();
  await runInstallChecks(options.request,report,state,env,images,controller.signal);
  let failures = 0;
  for (const visit of report.visits) {
    const failure = checkFailure(visit);
    if (failure !== null) failures++;
    console.log((failure === null ? 'PASS ' : 'FAIL ') + visit.persona + ' · ' + (failure ?? visit.installation?.path));
  }
  report.status = 'completed';
  report.message = (report.iterations - failures) + ' of ' + report.iterations + ' PWA checks passed';
  const directory = await save(options.output,report,images,failures===0);
  console.log(path.join(directory,'report.html'));
  console.log(path.join(directory,'report.json'));
  return failures === 0 ? 0 : 1;
}
main().then(code=>app.exit(code)).catch(error=>{console.error(error.message);app.exit(2);});
