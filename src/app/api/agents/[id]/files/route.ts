import type { NextRequest } from "next/server";
import { getAgent, listFiles } from "@/lib/openclaw";
import type { ApiResponse, FileEntry } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const filePath = request.nextUrl.searchParams.get("path") ?? ".";

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: `Agent "${id}" not found` } } satisfies ApiResponse<FileEntry[]>,
        { status: 404 }
      );
    }

    const entries = await listFiles(agent.workspacePath, filePath);
    return Response.json({ data: entries } satisfies ApiResponse<FileEntry[]>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message === "Path traversal detected") {
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Path traversal not allowed" } } satisfies ApiResponse<FileEntry[]>,
        { status: 403 }
      );
    }

    return Response.json(
      { error: { code: "FILES_ERROR", message } } satisfies ApiResponse<FileEntry[]>,
      { status: 500 }
    );
  }
}
