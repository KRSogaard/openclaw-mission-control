import { getGatewayStatus } from "@/lib/openclaw";
import type { ApiResponse, GatewayStatus } from "@/lib/types";

export async function GET(): Promise<Response> {
  try {
    const status = await getGatewayStatus();
    return Response.json({ data: status } satisfies ApiResponse<GatewayStatus>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "GATEWAY_ERROR", message } } satisfies ApiResponse<GatewayStatus>,
      { status: 500 }
    );
  }
}
