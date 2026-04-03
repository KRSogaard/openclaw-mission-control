import type { NextRequest } from "next/server";
import { runDiagnostics, fixCheck, fixAll, isFixable } from "@/lib/doctor";
import type { DiagnosticResult, FixResult } from "@/lib/doctor";
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

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as { action: "fix" | "fix-all"; checkId?: string; params?: Record<string, string> };

    if (body.action === "fix" && body.checkId) {
      const result = await fixCheck(body.checkId, body.params);
      return Response.json({ data: result } satisfies ApiResponse<FixResult>);
    }

    if (body.action === "fix-all") {
      const diagnostics = await runDiagnostics();
      const fixable = diagnostics.checks.filter((c) => isFixable(c.id, c.status));
      const results = await fixAll(fixable);
      return Response.json({ data: results } satisfies ApiResponse<FixResult[]>);
    }

    return Response.json(
      { error: { code: "INVALID_ACTION", message: "action must be 'fix' or 'fix-all'" } },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "FIX_ERROR", message } },
      { status: 500 }
    );
  }
}
