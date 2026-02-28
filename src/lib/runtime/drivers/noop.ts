/**
 * NoOpDriver: no sandbox. Fails fast unless explicitly allowed (e.g. NIGHTSHIFT_ALLOW_UNSANDBOXED)
 * or sandbox was not requested (sandboxEnabled false).
 */

import type { RuntimeDriver } from "../driver";
import type { PrepareContext, RunningHandle } from "../driver";
import type { SupportResult, DiagnosticReport, TeardownOutcome } from "../types";

const ENV_ALLOW_UNSANDBOXED = "NIGHTSHIFT_ALLOW_UNSANDBOXED";

export class UnsupportedRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedRuntimeError";
  }
}

function allowUnsandboxed(prepared: PrepareContext): boolean {
  if (prepared.sandboxEnabled === false) return true;
  const allow = process.env[ENV_ALLOW_UNSANDBOXED];
  return allow === "1" || allow === "true";
}

export const noopDriver: RuntimeDriver = {
  name() {
    return "noop";
  },

  async isSupported(): Promise<SupportResult> {
    return { supported: true, reasons: [], required: [] };
  },

  async prepare(ctx: PrepareContext): Promise<PrepareContext> {
    return { ...ctx };
  },

  async start(prepared: PrepareContext): Promise<RunningHandle> {
    if (!allowUnsandboxed(prepared)) {
      throw new UnsupportedRuntimeError(
        "Sandbox is not available on this host. Set NIGHTSHIFT_ALLOW_UNSANDBOXED=1 to run without sandbox (not recommended).",
      );
    }
    const opencode = prepared.opencode as string;
    const args = (prepared.args as string[]) ?? [];
    const env = (prepared.env as Record<string, string>) ?? {};
    const workspacePath = (prepared.workspacePath as string) ?? process.cwd();

    const proc = Bun.spawn([opencode, ...args], {
      cwd: workspacePath,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
      env: { ...process.env, ...env },
    });
    return { proc };
  },

  async teardown(running: RunningHandle, _outcome: TeardownOutcome): Promise<void> {
    const proc = (running as { proc?: { killed?: boolean; kill?: () => void } }).proc;
    if (proc && !proc.killed) {
      try {
        proc.kill?.();
      } catch {
        // ignore
      }
    }
  },

  diagnostics(_ctx: PrepareContext, err: unknown): DiagnosticReport {
    const message = err instanceof Error ? err.message : String(err);
    const hints = [
      "Use macOS or Linux with bwrap (Linux) or sandbox-exec (macOS) for sandbox support.",
      "On Linux install bubblewrap: apt install bubblewrap (Debian/Ubuntu) or dnf install bubblewrap (Fedora).",
      "To run without sandbox set NIGHTSHIFT_ALLOW_UNSANDBOXED=1 (not recommended for untrusted workloads).",
    ];
    return {
      driver_name: "noop",
      error_type: err instanceof Error ? err.constructor.name : "Error",
      error_message: message,
      context: {},
      hints,
    };
  },
};
