import type { NextRequest } from "next/server";
import { getAgent, readFile, writeFile, deleteFile } from "@/lib/openclaw";
import type { ApiResponse, FileContent } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const filePath = request.nextUrl.searchParams.get("path");

  if (!filePath) {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "path is required" } } satisfies ApiResponse<FileContent>,
      { status: 400 }
    );
  }

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: `Agent "${id}" not found` } } satisfies ApiResponse<FileContent>,
        { status: 404 }
      );
    }

    const content = await readFile(agent.workspacePath, filePath);
    return Response.json({ data: content } satisfies ApiResponse<FileContent>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message === "Path traversal detected") {
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Path traversal not allowed" } } satisfies ApiResponse<FileContent>,
        { status: 403 }
      );
    }

    if (message.includes("too large")) {
      return Response.json(
        { error: { code: "FILE_TOO_LARGE", message } } satisfies ApiResponse<FileContent>,
        { status: 413 }
      );
    }

    return Response.json(
      { error: { code: "FILE_ERROR", message } } satisfies ApiResponse<FileContent>,
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const filePath = request.nextUrl.searchParams.get("path");

  if (!filePath) {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "path is required" } },
      { status: 400 }
    );
  }

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: `Agent "${id}" not found` } },
        { status: 404 }
      );
    }

    const body = (await request.json()) as { content: string };
    await writeFile(agent.workspacePath, filePath, body.content);
    return Response.json({ data: { ok: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Path traversal detected") {
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Path traversal not allowed" } },
        { status: 403 }
      );
    }
    return Response.json(
      { error: { code: "FILE_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const filePath = request.nextUrl.searchParams.get("path");

  if (!filePath) {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "path is required" } },
      { status: 400 }
    );
  }

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: `Agent "${id}" not found` } },
        { status: 404 }
      );
    }

    await deleteFile(agent.workspacePath, filePath);
    return Response.json({ data: { ok: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Path traversal detected") {
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Path traversal not allowed" } },
        { status: 403 }
      );
    }
    return Response.json(
      { error: { code: "FILE_ERROR", message } },
      { status: 500 }
    );
  }
}
