import { getModels } from "@/lib/openclaw";
import type { ModelInfo, ApiResponse } from "@/lib/types";

export async function GET(): Promise<Response> {
  try {
    const models = await getModels();
    return Response.json({ data: models } satisfies ApiResponse<ModelInfo[]>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "MODELS_ERROR", message } } satisfies ApiResponse<ModelInfo[]>,
      { status: 500 }
    );
  }
}
