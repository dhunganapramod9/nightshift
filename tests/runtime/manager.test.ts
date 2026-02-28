import { test, expect } from "bun:test";
import { DriverManager } from "../../src/lib/runtime/manager";
import type { RuntimeDriver } from "../../src/lib/runtime/driver";
import type { PrepareContext, RunningHandle } from "../../src/lib/runtime/driver";
import type { SupportResult, DiagnosticReport, TeardownOutcome } from "../../src/lib/runtime/types";
import { noopDriver } from "../../src/lib/runtime/drivers/noop";

function createFakeDriver(name: string, supported: boolean, record: string[]): RuntimeDriver {
  return {
    name: () => name,
    isSupported: async (): Promise<SupportResult> =>
      supported ? { supported: true, reasons: [], required: [] } : { supported: false, reasons: ["fake"], required: [] },
    prepare: async (ctx: PrepareContext) => {
      record.push("prepare");
      return { ...ctx };
    },
    start: async (prepared: PrepareContext) => {
      record.push("start");
      return { prepared };
    },
    teardown: async (_running: RunningHandle, outcome: TeardownOutcome) => {
      record.push(`teardown:${outcome}`);
    },
    diagnostics: (): DiagnosticReport => ({
      driver_name: name,
      error_type: "Error",
      error_message: "fake",
      context: {},
      hints: [],
    }),
  };
}

test("selection prefers explicit config (preferName)", async () => {
  const record: string[] = [];
  const manager = new DriverManager();
  const sandbox = createFakeDriver("sandbox", true, record);
  const noop = createFakeDriver("noop", true, record);
  manager.register(sandbox);
  manager.register(noop);

  const selected = await manager.selectDriver("sandbox");
  expect(selected.name()).toBe("sandbox");

  const selectedNoop = await manager.selectDriver("noop");
  expect(selectedNoop.name()).toBe("noop");
});

test("fallback to noop when sandbox unsupported", async () => {
  const manager = new DriverManager();
  const sandbox = createFakeDriver("sandbox", false, []);
  manager.register(sandbox);
  manager.register(noopDriver);

  const selected = await manager.selectDriver("sandbox");
  expect(selected.name()).toBe("noop");
});

test("lifecycle calls in correct order", async () => {
  const record: string[] = [];
  const manager = new DriverManager();
  const driver = createFakeDriver("fake", true, record);
  manager.register(driver);

  await manager.run(driver, { foo: 1 }, async () => {
    record.push("useHandle");
    return 42;
  });

  expect(record).toEqual(["prepare", "start", "useHandle", "teardown:success"]);
  expect(record.indexOf("prepare")).toBeLessThan(record.indexOf("start"));
  expect(record.indexOf("start")).toBeLessThan(record.indexOf("useHandle"));
  expect(record.indexOf("teardown:success")).toBe(record.length - 1);
});

test("when start fails, error is thrown and no teardown (no handle)", async () => {
  const record: string[] = [];
  const manager = new DriverManager();
  const driver: RuntimeDriver = {
    name: () => "fail-start",
    isSupported: async () => ({ supported: true, reasons: [], required: [] }),
    prepare: async (ctx) => {
      record.push("prepare");
      return { ...ctx };
    },
    start: async () => {
      record.push("start");
      throw new Error("start failed");
    },
    teardown: async () => {
      record.push("teardown");
    },
    diagnostics: () => ({
      driver_name: "fail-start",
      error_type: "Error",
      error_message: "start failed",
      context: {},
      hints: [],
    }),
  };
  manager.register(driver);

  await expect(
    manager.run(driver, {}, async () => 0),
  ).rejects.toThrow("start failed");

  expect(record).toEqual(["prepare", "start"]);
  expect(record).not.toContain("teardown");
});

test("teardown runs even when useHandle throws", async () => {
  const record: string[] = [];
  const manager = new DriverManager();
  const driver = createFakeDriver("fake", true, record);
  manager.register(driver);

  await expect(
    manager.run(driver, {}, async () => {
      record.push("useHandle");
      throw new Error("useHandle failed");
    }),
  ).rejects.toThrow("useHandle failed");

  expect(record).toContain("teardown:failure");
});

test("diagnostics report shape is stable", () => {
  const report = noopDriver.diagnostics({}, new Error("test err"));
  expect(report).toHaveProperty("driver_name", "noop");
  expect(report).toHaveProperty("error_type");
  expect(report).toHaveProperty("error_message", "test err");
  expect(report).toHaveProperty("context");
  expect(Array.isArray(report.hints)).toBe(true);
  expect(report.hints.length).toBeGreaterThan(0);
});

test("normalizeError returns valid DiagnosticReport", () => {
  const manager = new DriverManager();
  const report = manager.normalizeError("test-driver", new Error("msg"));
  expect(report.driver_name).toBe("test-driver");
  expect(report.error_type).toBe("Error");
  expect(report.error_message).toBe("msg");
  expect(report.context).toEqual({});
  expect(report.hints).toEqual([]);
});
