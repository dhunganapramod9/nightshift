/**
 * Runtime driver types. JSON-serializable where needed for API/diagnostics.
 */

export interface SupportResult {
  supported: boolean;
  reasons: string[];
  required: string[];
}

export interface DiagnosticReport {
  driver_name: string;
  error_type: string;
  error_message: string;
  context: Record<string, unknown>;
  hints: string[];
}

export type TeardownOutcome = "success" | "failure" | "cancelled";
