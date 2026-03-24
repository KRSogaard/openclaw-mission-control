import type { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getAgent } from "@/lib/openclaw";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
};

const MAX_SIZE = 10 * 1024 * 1024;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const filePath = request.nextUrl.searchParams.get("path");

  if (!filePath) {
    return new Response("path is required", { status: 400 });
  }

  try {
    const agent = await getAgent(id);
    if (!agent) {
      return new Response("Agent not found", { status: 404 });
    }

    const resolved = path.resolve(agent.workspacePath, filePath);
    if (!resolved.startsWith(path.resolve(agent.workspacePath))) {
      return new Response("Forbidden", { status: 403 });
    }

    const stat = await fs.stat(resolved);
    if (stat.size > MAX_SIZE) {
      return new Response("File too large", { status: 413 });
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    const buffer = await fs.readFile(resolved);

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}
