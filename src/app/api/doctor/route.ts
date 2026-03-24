import { runDiagnostics } from "@/lib/doctor";
import type { DiagnosticResult } from "@/lib/doctor";
import type { ApiResponse } from "@/lib/types";

export async function GET(): Promise<Response> {
  try {
    const result = await runDiagnostics();
    return Response.json({ data: result } satisfies ApiResponse<DiagnosticResult>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "DOCTOR_ERROR", message } } satisfies ApiResponse<DiagnosticResult>,
      { status: 500 }
    );
  }
}
