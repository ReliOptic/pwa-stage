export type LogLevel = 'info' | 'warn' | 'error';

export interface StructuredLogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly domain: string;
  readonly event: string;
  readonly context: Readonly<Record<string, unknown>>;
}

export function formatStructuredLog(
  level: LogLevel,
  domain: string,
  event: string,
  context: Readonly<Record<string, unknown>> = {}
): string {
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    domain,
    event,
    context
  };
  return JSON.stringify(entry);
}

export function logStructured(
  level: LogLevel,
  domain: string,
  event: string,
  context: Readonly<Record<string, unknown>> = {}
): StructuredLogEntry {
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    domain,
    event,
    context
  };
  const serialized = JSON.stringify(entry);

  if (typeof process !== 'undefined' && process.stdout && process.stderr) {
    if (level === 'error') {
      process.stderr.write(`${serialized}\n`);
    } else {
      process.stdout.write(`${serialized}\n`);
    }
  }

  return entry;
}
