import WebSocket from "ws";

const OPENCLAW_URL = process.env.OPENCLAW_URL ?? "http://localhost:18789";
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN ?? "";

function getWsUrl(): string {
  const url = new URL(OPENCLAW_URL);
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${url.host}/ws`;
}

type WsMessage =
  | { type: "event"; event: string; payload: Record<string, unknown> }
  | { type: "res"; id: string; ok: true; payload: Record<string, unknown> }
  | { type: "res"; id: string; ok: false; error: { code: string; message: string } };

type PendingRequest = {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let sharedClient: OpenClawWsClient | null = null;

export function getWsClient(): OpenClawWsClient {
  if (!sharedClient) {
    sharedClient = new OpenClawWsClient();
  }
  return sharedClient;
}

export class OpenClawWsClient {
  private ws: WebSocket | null = null;
  private reqId = 0;
  private pending = new Map<string, PendingRequest>();
  private connectPromise: Promise<void> | null = null;
  private authenticated = false;

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.doConnect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = getWsUrl();
      this.authenticated = false;

      const originUrl = new URL(OPENCLAW_URL);
      const origin = `${originUrl.protocol}//127.0.0.1:${originUrl.port}`;
      this.ws = new WebSocket(wsUrl, {
        headers: { origin },
      });

      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error("WebSocket connection timeout"));
      }, 10_000);

      this.ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString()) as WsMessage;

        if (msg.type === "event" && msg.event === "connect.challenge") {
          this.sendRaw({
            type: "req",
            id: String(++this.reqId),
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: "openclaw-control-ui",
                version: "0.1.0",
                platform: "linux",
                mode: "cli",
              },
              role: "operator",
              scopes: ["operator.admin"],
              caps: [],
              commands: [],
              permissions: {},
              auth: { token: OPENCLAW_TOKEN },
              locale: "en-US",
              userAgent: "revoco-bridge-command/0.1.0",
            },
          });
          return;
        }

        if (
          msg.type === "res" &&
          msg.ok &&
          (msg.payload as Record<string, unknown>).type === "hello-ok"
        ) {
          this.authenticated = true;
          clearTimeout(timeout);
          resolve();
          return;
        }

        if (
          msg.type === "res" &&
          !msg.ok &&
          !this.authenticated
        ) {
          clearTimeout(timeout);
          reject(new Error(`Auth failed: ${msg.error.message}`));
          return;
        }

        if (msg.type === "res") {
          const pending = this.pending.get(msg.id);
          if (!pending) return;
          this.pending.delete(msg.id);
          clearTimeout(pending.timer);
          if (msg.ok) {
            pending.resolve(msg.payload);
          } else {
            pending.reject(new Error(msg.error.message));
          }
        }
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.ws.on("close", () => {
        this.authenticated = false;
        this.ws = null;
        for (const [, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error("WebSocket closed"));
        }
        this.pending.clear();
      });
    });
  }

  async rpc(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 10_000
  ): Promise<Record<string, unknown>> {
    await this.connect();

    const id = String(++this.reqId);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.sendRaw({ type: "req", id, method, params });
    });
  }

  private sendRaw(msg: Record<string, unknown>): void {
    this.ws?.send(JSON.stringify(msg));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.authenticated = false;
  }
}
