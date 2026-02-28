/**
 * Runtime driver abstraction. Export manager with default drivers registered.
 */

import { DriverManager } from "./manager";
import { sandboxDriver } from "./drivers/sandbox";
import { noopDriver } from "./drivers/noop";

export const defaultDriverManager = new DriverManager();
defaultDriverManager.register(sandboxDriver);
defaultDriverManager.register(noopDriver);

export type { RuntimeDriver, PrepareContext, RunningHandle } from "./driver";
export type { SupportResult, DiagnosticReport, TeardownOutcome } from "./types";
export { DriverManager } from "./manager";
export { sandboxDriver, type SandboxRunningHandle } from "./drivers/sandbox";
export { noopDriver, UnsupportedRuntimeError } from "./drivers/noop";
