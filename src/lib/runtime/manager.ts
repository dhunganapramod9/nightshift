/**
 * DriverManager: selects runtime driver, enforces lifecycle, normalizes errors.
 */

import type { RuntimeDriver } from "./driver";
import type { PrepareContext, RunningHandle } from "./driver";
import type { DiagnosticReport, SupportResult, TeardownOutcome } from "./types";

const ENV_DRIVER = "NIGHTSHIFT_RUNTIME_DRIVER";

export class DriverManager {
  private drivers: Map<string, RuntimeDriver> = new Map();

  register(driver: RuntimeDriver): void {
    this.drivers.set(driver.name(), driver);
  }

  /** Select driver by name (config/env), or auto-select best supported. */
  async selectDriver(preferName?: string): Promise<RuntimeDriver> {
    const explicit = preferName ?? process.env[ENV_DRIVER];
    if (explicit) {
      const d = this.drivers.get(explicit);
      if (d) {
        if (explicit === "sandbox") {
          const result = await d.isSupported();
          if (!result.supported && this.drivers.has("noop")) return this.drivers.get("noop")!;
        }
        return d;
      }
    }

    let best: { driver: RuntimeDriver; result: SupportResult } | null = null;
    for (const driver of this.drivers.values()) {
      const result = await driver.isSupported();
      if (result.supported && (!best || driver.name() === "sandbox")) {
        best = { driver, result };
        if (driver.name() === "sandbox") break;
      }
    }
    if (best) return best.driver;
    return this.drivers.get("noop")!;
  }

  /**
   * Run lifecycle: prepare → start → (caller uses handle) → teardown in finally.
   * Guarantees teardown even when start fails. Normalizes errors to DiagnosticReport.
   */
  async run<T>(
    driver: RuntimeDriver,
    ctx: PrepareContext,
    useHandle: (handle: RunningHandle) => Promise<T>,
  ): Promise<T> {
    let prepared: PrepareContext | null = null;
    let running: RunningHandle | null = null;
    let outcome: TeardownOutcome = "failure";

    try {
      prepared = await driver.prepare(ctx);
      running = await driver.start(prepared);
      const result = await useHandle(running);
      outcome = "success";
      return result;
    } catch (err) {
      if (prepared) {
        const report = driver.diagnostics(prepared, err);
        console.error(`[runtime] ${report.driver_name}: ${report.error_message}`);
        if (report.hints.length) {
          report.hints.forEach((h) => console.error(`  hint: ${h}`));
        }
      }
      throw err;
    } finally {
      if (running) {
        try {
          await driver.teardown(running, outcome);
        } catch (teardownErr) {
          console.error("[runtime] teardown error:", teardownErr);
        }
      }
    }
  }

  /** Build DiagnosticReport from an error for API/logging. */
  normalizeError(driverName: string, err: unknown): DiagnosticReport {
    const message = err instanceof Error ? err.message : String(err);
    const errorType = err instanceof Error ? err.constructor.name : "Error";
    return {
      driver_name: driverName,
      error_type: errorType,
      error_message: message,
      context: {},
      hints: [],
    };
  }
}
