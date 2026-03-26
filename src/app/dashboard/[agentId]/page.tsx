"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import type { AgentView, AgentSummary, ModelInfo, ApiResponse } from "@/lib/types";
import { getAgentColor } from "@/lib/utils";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function AgentAccessCard({
  title,
  subtitle,
  current,
  allAgents,
  isSaving,
  supportsWildcard,
  onUpdate,
}: {
  title: string;
  subtitle: string;
  current: string[];
  allAgents: AgentSummary[];
  isSaving: boolean;
  supportsWildcard?: boolean;
  onUpdate: (value: string[]) => void;
}) {
  const isWildcard = current.length === 1 && current[0] === "*";
  const effectiveIds = isWildcard ? allAgents.map((a) => a.id) : current;
  const allSelected = isWildcard || (effectiveIds.length === allAgents.length && allAgents.length > 0);

  function handleToggle(id: string) {
    const next = effectiveIds.includes(id)
      ? effectiveIds.filter((x) => x !== id)
      : [...effectiveIds, id];
    onUpdate(next);
  }

  function handleSelectAll() {
    if (allSelected) {
      onUpdate([]);
    } else if (supportsWildcard) {
      onUpdate(["*"]);
    } else {
      onUpdate(allAgents.map((a) => a.id));
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground text-sm">{title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          {isSaving && <span className="text-xs text-muted-foreground">Saving...</span>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected || isWildcard}
              onChange={handleSelectAll}
              disabled={isSaving}
              className="rounded border-border bg-muted text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
            />
            <span className={`text-sm font-medium ${allSelected || isWildcard ? "text-emerald-400" : "text-muted-foreground"}`}>
              Select all
            </span>
            {isWildcard && supportsWildcard && (
              <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-700">wildcard</Badge>
            )}
          </label>
          {!isWildcard && (
            <>
              <div className="h-px bg-border" />
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {allAgents.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={effectiveIds.includes(a.id)}
                      onChange={() => handleToggle(a.id)}
                      disabled={isSaving}
                      className="rounded border-border bg-muted text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
                    />
                    <span className="text-sm text-muted-foreground">{a.name}</span>
                    <span className="text-xs text-muted-foreground/50 ml-auto">{a.id}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgentDashboardPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [agent, setAgent] = useState<AgentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [allAgents, setAllAgents] = useState<AgentSummary[]>([]);
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function refetchAgent() {
    const res = await fetch(`/api/agents/${agentId}`);
    const json = (await res.json()) as ApiResponse<AgentView>;
    if (json.data) {
      setAgent(json.data);
      setDescValue(json.data.description || "");
    }
  }

  useEffect(() => {
    async function load() {
      try {
        await refetchAgent();
      } catch {
        setError("Failed to load agent");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentId]);

  useEffect(() => {
    async function fetchSideData() {
      const [modelsRes, agentsRes] = await Promise.all([
        fetch("/api/models"),
        fetch("/api/agents"),
      ]);
      const modelsJson = (await modelsRes.json()) as ApiResponse<ModelInfo[]>;
      const agentsJson = (await agentsRes.json()) as ApiResponse<AgentSummary[]>;
      if (modelsJson.data) setModels(modelsJson.data);
      if (agentsJson.data) setAllAgents(agentsJson.data.filter((a) => a.id !== agentId));
    }
    fetchSideData().catch(() => {});
  }, [agentId]);

  useEffect(() => {
    if (isEditingDesc && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditingDesc]);

  async function handleSaveDescription() {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/agents/hierarchy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, description: descValue || null }),
      });
      if (res.ok) {
        setAgent((prev) => prev ? { ...prev, description: descValue || null } : prev);
        setIsEditingDesc(false);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleModelChange(newModel: string) {
    if (!agent || newModel === agent.model) return;
    setIsSavingModel(true);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: newModel }),
      });
      if (res.ok) {
        setAgent((prev) => prev ? { ...prev, model: newModel } : prev);
      }
    } finally {
      setIsSavingModel(false);
    }
  }

  async function handleRevokeSpawner(spawnerId: string, isWildcard: boolean) {
    setIsSavingAccess(true);
    try {
      let newList: string[];
      if (isWildcard) {
        newList = allAgents
          .filter((a) => a.id !== agentId && a.id !== spawnerId)
          .map((a) => a.id);
      } else {
        const spawnerRes = await fetch(`/api/agents/${spawnerId}`);
        const spawnerJson = (await spawnerRes.json()) as ApiResponse<AgentView>;
        const current = spawnerJson.data?.config.allowedSubagents ?? [];
        newList = current.filter((id) => id !== agentId && id !== "*");
      }
      await fetch(`/api/agents/${spawnerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedSubagents: newList }),
      });
      await refetchAgent();
    } finally {
      setIsSavingAccess(false);
    }
  }

  async function handleAccessUpdate(field: "allowedSubagents" | "agentToAgentPeers", value: string[]) {
    setIsSavingAccess(true);
    try {
      await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      await refetchAgent();
    } finally {
      setIsSavingAccess(false);
    }
  }

  async function handleDeleteAgent() {
    const confirmed = await confirm({
      title: `Delete ${agent?.name ?? agentId}?`,
      description: "This will remove the agent from OpenClaw, delete its hierarchy entry, and clean up all spawn list and communication references. The agent's workspace files will remain on disk. This cannot be undone.",
      confirmLabel: "Delete Agent",
      destructive: true,
      onConfirm: () => {},
    });
    if (!confirmed) return;

    const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
    const json = (await res.json()) as ApiResponse<{ ok: boolean }>;
    if (json.error) {
      setError(json.error.message);
      return;
    }
    router.push("/dashboard");
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 bg-muted rounded-xl" />
          <Skeleton className="h-32 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-red-400">{error ?? "Agent not found"}</p>
      </div>
    );
  }

  return (
    <>
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-foreground text-sm">Description</CardTitle>
              {!isEditingDesc && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingDesc(true)}
                  className="text-xs text-muted-foreground"
                >
                  {agent.description ? "Edit" : "Add"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isEditingDesc ? (
              <div className="space-y-2">
                <textarea
                  ref={textareaRef}
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) handleSaveDescription();
                    if (e.key === "Escape") {
                      setDescValue(agent.description || "");
                      setIsEditingDesc(false);
                    }
                  }}
                  rows={3}
                  className="w-full rounded-md bg-muted px-3 py-2 text-sm text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Who is this agent? What do they do?"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveDescription}
                    disabled={isSaving}
                    className="bg-sky-600 hover:bg-sky-700 text-white"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDescValue(agent.description || "");
                      setIsEditingDesc(false);
                    }}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : agent.description ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{agent.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground/50 italic">No description set</p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-sm">Channels</CardTitle>
            </CardHeader>
            <CardContent>
              {agent.channels.length > 0 ? (
                <div className="space-y-2">
                  {agent.channels.map((ch, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs">{ch.platform}</Badge>
                        {ch.kind === "channel" && ch.target && (
                          <span className="text-sm text-foreground">{ch.target}</span>
                        )}
                        {ch.kind === "dm" && (
                          <span className="text-sm text-muted-foreground">Direct messages</span>
                        )}
                        {ch.kind === "catch-all" && (
                          <span className="text-sm text-muted-foreground">All unmatched messages</span>
                        )}
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        {ch.kind === "channel" && (
                          <Badge
                            variant="outline"
                            className={`text-xs ${ch.requireMention ? "text-amber-400 border-amber-700" : "text-emerald-400 border-emerald-700"}`}
                          >
                            {ch.requireMention ? "mention required" : "auto-respond"}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground/50">@{ch.accountId}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">No channels bound</p>
              )}
            </CardContent>
          </Card>

          <AgentAccessCard
            title="Spawn Agents"
            subtitle="Agents this one can spawn for task delegation — one-shot sessions"
            current={agent.config.allowedSubagents}
            allAgents={allAgents}
            isSaving={isSavingAccess}
            supportsWildcard
            onUpdate={(value) => handleAccessUpdate("allowedSubagents", value)}
          />

          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-foreground text-sm">Communication</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {agent.config.agentToAgentPeers.length > 0
                      ? "This agent is in the communication pool"
                      : "This agent cannot message other agents"}
                  </p>
                </div>
                {isSavingAccess && <span className="text-xs text-muted-foreground">Saving...</span>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agent.config.agentToAgentPeers.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleAccessUpdate("agentToAgentPeers", ["*"]);
                      } else {
                        handleAccessUpdate("agentToAgentPeers", []);
                      }
                    }}
                    disabled={isSavingAccess}
                    className="rounded border-border bg-muted text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
                  />
                  <span className={`text-sm font-medium ${agent.config.agentToAgentPeers.length > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                    Enable agent-to-agent messaging
                  </span>
                </label>
                {agent.config.agentToAgentPeers.length > 0 && (
                  <>
                    <div className="h-px bg-border" />
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <p className="text-xs text-muted-foreground mb-1">Other agents in the pool:</p>
                      {agent.config.agentToAgentPeers.filter((id) => id !== "*").length > 0 ? (
                        agent.config.agentToAgentPeers.filter((id) => id !== "*").map((id) => {
                          const a = allAgents.find((x) => x.id === id);
                          const color = getAgentColor(id);
                          return (
                            <div key={id} className="flex items-center gap-2 rounded px-1 py-0.5">
                              <span className={`size-2 rounded-full shrink-0 ${color.dot}`} />
                              <span className="text-sm text-muted-foreground">{a?.name ?? id}</span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-muted-foreground/50 italic px-1">
                          All agents can communicate (wildcard)
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-foreground text-sm">Spawnable By</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Agents that can spawn this one for task delegation</p>
                </div>
                {isSavingAccess && <span className="text-xs text-muted-foreground">Saving...</span>}
              </div>
            </CardHeader>
            <CardContent>
              {agent.config.spawnableBy.length > 0 ? (
                <div className="space-y-1">
                  {agent.config.spawnableBy.map((entry) => {
                    const a = allAgents.find((x) => x.id === entry.agentId);
                    const color = getAgentColor(entry.agentId);
                    return (
                      <div key={entry.agentId} className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50">
                        <span className={`size-2 rounded-full shrink-0 ${color.dot}`} />
                        <span className="text-sm text-muted-foreground">{a?.name ?? entry.agentId}</span>
                        {entry.wildcard && (
                          <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-700">wildcard</Badge>
                        )}
                        <button
                          onClick={() => handleRevokeSpawner(entry.agentId, entry.wildcard)}
                          disabled={isSavingAccess}
                          className="ml-auto text-xs text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">No agents can currently spawn this one</p>
              )}
            </CardContent>
          </Card>

          {agent.config.mentionPatterns.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground text-sm">Mention Patterns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {agent.config.mentionPatterns.map((p) => (
                    <Badge key={p} variant="outline" className="font-mono text-xs">{p}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-sm">Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Model</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={agent.model}
                      onChange={(e) => handleModelChange(e.target.value)}
                      disabled={isSavingModel || models.length === 0}
                      className="rounded-md bg-muted border border-border px-2 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                    >
                      {models.length === 0 && (
                        <option value={agent.model}>{agent.model}</option>
                      )}
                      {models.map((m) => (
                        <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                          {m.provider}/{m.id}
                        </option>
                      ))}
                    </select>
                    {isSavingModel && <span className="text-xs text-muted-foreground">Saving...</span>}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Heartbeat</span>
                  <span className="text-foreground">{agent.config.heartbeat ?? "disabled"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hooks access</span>
                  <Badge variant={agent.config.hasHooksAccess ? "default" : "outline"} className="text-xs">
                    {agent.config.hasHooksAccess ? "yes" : "no"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Default agent</span>
                  <Badge variant={agent.isDefault ? "default" : "outline"} className="text-xs">
                    {agent.isDefault ? "yes" : "no"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {!agent.isDefault && (
          <Card className="bg-card border-red-900/50">
            <CardHeader>
              <CardTitle className="text-red-400 text-sm">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">Delete this agent</p>
                  <p className="text-xs text-muted-foreground">Removes from OpenClaw config, hierarchy, and all relationship references</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteAgent}
                  className="border-red-800 text-red-400 hover:bg-red-950 hover:text-red-300"
                >
                  Delete Agent
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      {ConfirmDialog}
    </>
  );
}
