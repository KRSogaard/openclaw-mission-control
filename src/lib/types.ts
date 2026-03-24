export type ApiResponse<T> =
  | { data: T; error?: never }
  | { data?: never; error: ApiError };

export type ApiError = {
  code: string;
  message: string;
};

export type GatewayStatus = {
  online: boolean;
  version: string | null;
};

export type AgentChannel = {
  platform: string;
  kind: "channel" | "dm" | "catch-all";
  target?: string;
  accountId: string;
  requireMention: boolean;
};

export type AgentSummary = {
  id: string;
  name: string;
  model: string;
  isDefault: boolean;
  description: string | null;
  channels: AgentChannel[];
};

export type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
};

export type AgentConfig = {
  mentionPatterns: string[];
  allowedSubagents: string[];
  agentToAgentPeers: string[];
  hasHooksAccess: boolean;
  heartbeat: string | null;
};

export type AgentView = AgentSummary & {
  bootstrapFiles: string[];
  workspaceLabel: string;
  config: AgentConfig;
};

export type AgentHierarchyNode = {
  agent: AgentSummary;
  children: AgentHierarchyNode[];
};

export type HierarchyUpdate = {
  agentId: string;
  parentId: string | null;
  position: number;
};

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type AgentTask = {
  id: string;
  agentId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  response: string | null;
  statusMessage: string | null;
  retryCount: number;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
};

export type TaskEvent = {
  id: string;
  event: string;
  message: string | null;
  actor: string | null;
  timestamp: number;
};

export type AgentTaskSettings = {
  timeoutMinutes: number;
  maxRetries: number;
};

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  /** ISO 8601 */
  modified: string;
};

export type FileContent = {
  path: string;
  content: string;
  size: number;
  /** Best-guess language for syntax highlighting */
  language: string | null;
};
