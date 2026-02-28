/**
 * SandboxDriver: thin adapter around existing buildSandboxCommand + spawn.
 * No change to existing sandbox logic; behavior unchanged on Linux.
 */

import type { Subprocess } from "bun";
import { buildSandboxCommand, type SandboxOptions } from "../../sandbox";
import { checkSandboxAvailability } from "../../platform";
import type { RuntimeDriver } from "../driver";
import type { PrepareContext, RunningHandle } from "../driver";
import type { SupportResult, DiagnosticReport, TeardownOutcome } from "../types";

export interface SandboxRunningHandle extends RunningHandle {
  proc: Subprocess;
}

function getSandboxOpts(ctx: PrepareContext): SandboxOptions {
  const opts = ctx.sandboxOpts as SandboxOptions | undefined;
  if (!opts?.workspacePath || !opts.prefixPath || !opts.binDir || !opts.env) {
    throw new Error("SandboxDriver requires sandboxOpts with workspacePath, prefixPath, binDir, env");
  }
  return opts;
}

export const sandboxDriver: RuntimeDriver = {
  name() {
    return "sandbox";
  },

  async isSupported(): Promise<SupportResult> {
    const result = await checkSandboxAvailability();
    if (result.available) {
      return { supported: true, reasons: [], required: [] };
    }
    return {
      supported: false,
      reasons: [result.reason ?? "Sandbox not available"],
      required: ["bwrap (Linux) or sandbox-exec (macOS)"],
    };
  },

  async prepare(ctx: PrepareContext): Promise<PrepareContext> {
    return { ...ctx };
  },

  async start(prepared: PrepareContext): Promise<RunningHandle> {
    const opencode = prepared.opencode as string;
    const args = (prepared.args as string[]) ?? [];
    const opts = getSandboxOpts(prepared);

    const baseCommand = [opencode, ...args];
    const finalCommand = buildSandboxCommand(baseCommand, opts);

    const proc = Bun.spawn(finalCommand, {
      cwd: opts.workspacePath,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
      env: opts.env,
    });

    return { proc } as SandboxRunningHandle;
  },

  async teardown(running: RunningHandle, _outcome: TeardownOutcome): Promise<void> {
    const h = running as SandboxRunningHandle;
    if (h.proc && !h.proc.killed) {
      try {
        h.proc.kill();
      } catch {
        // ignore
      }
    }
  },

  diagnostics(ctx: PrepareContext, err: unknown): DiagnosticReport {
    const message = err instanceof Error ? err.message : String(err);
    return {
      driver_name: "sandbox",
      error_type: err instanceof Error ? err.constructor.name : "Error",
      error_message: message,
      context: { workspacePath: (ctx.sandboxOpts as SandboxOptions)?.workspacePath },
      hints: [
        "Ensure bwrap is installed on Linux: apt install bubblewrap (Debian/Ubuntu) or dnf install bubblewrap (Fedora).",
        "On macOS sandbox-exec is built-in; no extra install needed.",
      ],
    };
  },
};
