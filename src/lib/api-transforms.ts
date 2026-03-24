import type { AgentSummary, AgentView, AgentChannel } from "./types";
import { getAgents, getAgent } from "./openclaw";

type InternalAgentLike = Awaited<ReturnType<typeof getAgents>>[number];
type InternalAgentDetailLike = NonNullable<Awaited<ReturnType<typeof getAgent>>>;

export function formatModelName(raw: string): string {
  return raw;
}

function toChannels(
  routing: InternalAgentLike["routing"]
): AgentChannel[] {
  return routing.map((r) => ({
    platform: r.channel,
    kind: r.peerKind,
    target: r.peer,
    accountId: r.accountId,
    requireMention: r.requireMention,
  }));
}

export function toAgentSummary(
  internal: InternalAgentLike,
  description?: string | null
): AgentSummary {
  return {
    id: internal.id,
    name: internal.name,
    model: formatModelName(internal.model),
    isDefault: internal.isDefault,
    description: description ?? null,
    channels: toChannels(internal.routing),
  };
}

export function toAgentView(
  internal: InternalAgentDetailLike,
  description?: string | null
): AgentView {
  return {
    ...toAgentSummary(internal, description),
    bootstrapFiles: internal.bootstrapFiles,
    workspaceLabel: internal.workspace,
    config: internal.config,
  };
}
