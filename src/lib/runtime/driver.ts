/**
 * Runtime driver interface. Foundation for sandbox/runtime plugins.
 */

import type { SupportResult, DiagnosticReport, TeardownOutcome } from "./types";

export interface PrepareContext {
  [key: string]: unknown;
}

export interface RunningHandle {
  [key: string]: unknown;
}

export interface RuntimeDriver {
  name(): string;
  isSupported(): Promise<SupportResult>;
  prepare(ctx: PrepareContext): Promise<PrepareContext>;
  start(prepared: PrepareContext): Promise<RunningHandle>;
  teardown(running: RunningHandle, outcome: TeardownOutcome): Promise<void>;
  diagnostics(ctx: PrepareContext, err: unknown): DiagnosticReport;
}
