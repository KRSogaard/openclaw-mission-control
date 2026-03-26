import { exec } from "node:child_process";
import { promisify } from "node:util";
import { checkInAllRunning } from "@/lib/task-dispatcher";
import { reapplyExecApprovals } from "@/lib/doctor";

const execAsync = promisify(exec);

export async function POST(): Promise<Response> {
  try {
    const { stdout, stderr } = await execAsync("openclaw gateway restart", {
      timeout: 30_000,
    });

    setTimeout(() => {
      checkInAllRunning().catch(() => {});
      reapplyExecApprovals().catch(() => {});
    }, 5_000);

    return Response.json({
      data: {
        ok: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to restart gateway";
    return Response.json(
      { error: { code: "RESTART_ERROR", message } },
      { status: 500 }
    );
  }
}
