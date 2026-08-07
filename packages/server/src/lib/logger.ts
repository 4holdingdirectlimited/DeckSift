// Structured JSON-lines logger for ops. The server runs headless behind
// scripts/start-server.cmd, which appends stdout to server.log — plain
// multi-line console output (error objects, DB stacks) makes that file hard
// to grep or tail programmatically. Every entry here is one JSON line:
//
//   {"level":"error","ts":"2026-08-08T12:00:00.000Z","msg":"[server] ...","details":{...}}
//
// Level: info | warn | error. `details` is optional; errors serialize with
// name/message/stack when the thrown value is an Error.

type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, msg: string, details?: unknown): void {
  const entry: Record<string, unknown> = {
    level,
    ts: new Date().toISOString(),
    msg,
  };
  if (details !== undefined) entry.details = serialize(details);

  let line: string;
  try {
    line = JSON.stringify(entry);
  } catch {
    // Circular/BigInt details must never mask the original error inside the
    // error handlers — drop the details, keep level/ts/msg, log a marker.
    line = JSON.stringify({
      level,
      ts: entry.ts,
      msg: `${msg} (details omitted: unserializable)`,
    });
  }
  // Single console.write keeps multi-line error stacks inside one JSON
  // string (JSON.stringify already escapes newlines) so each log call is
  // exactly one physical line.
  process.stdout.write(`${line}\n`);
}

function serialize(details: unknown): unknown {
  if (details instanceof Error) {
    return {
      name: details.name,
      message: details.message,
      stack: details.stack,
    };
  }
  return details;
}

export const logger = {
  info(msg: string, details?: unknown): void {
    write("info", msg, details);
  },
  warn(msg: string, details?: unknown): void {
    write("warn", msg, details);
  },
  error(msg: string, details?: unknown): void {
    write("error", msg, details);
  },
};
