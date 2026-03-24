"use client";

import { useEffect, useState, useCallback } from "react";
import type { AgentSummary, AgentTaskSettings, GlobalTaskSettings, ApiResponse } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type AgentWithSettings = {
  agent: AgentSummary;
  settings: AgentTaskSettings;
  hasOverride: boolean;
};

function SettingsRow({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
  isOverride,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  isOverride?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-muted-foreground w-40">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || min || 1)}
        min={min ?? 1}
        max={max}
        className="w-24 rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      {isOverride && <Badge variant="outline" className="text-xs">override</Badge>}
    </div>
  );
}

export default function SettingsPage() {
  const [global, setGlobal] = useState<GlobalTaskSettings>({ timeoutMinutes: 30, maxRetries: 3, maxConcurrent: 1 });
  const [agentSettings, setAgentSettings] = useState<AgentWithSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editGlobal, setEditGlobal] = useState<GlobalTaskSettings | null>(null);
  const [editAgent, setEditAgent] = useState<string | null>(null);
  const [editAgentValues, setEditAgentValues] = useState<AgentTaskSettings | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [globalRes, agentsRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/agents"),
      ]);
      const globalJson = (await globalRes.json()) as ApiResponse<GlobalTaskSettings>;
      const agentsJson = (await agentsRes.json()) as ApiResponse<AgentSummary[]>;

      if (globalJson.data) {
        setGlobal(globalJson.data);
        setEditGlobal(null);
      }

      if (agentsJson.data) {
        const withSettings = await Promise.all(
          agentsJson.data.map(async (agent) => {
            const res = await fetch(`/api/agents/${agent.id}/task-settings`);
            const json = (await res.json()) as ApiResponse<AgentTaskSettings>;
            return {
              agent,
              settings: json.data ?? { timeoutMinutes: 30, maxRetries: 3, maxConcurrent: 1 },
              hasOverride: false,
            };
          })
        );
        setAgentSettings(withSettings);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function saveGlobal() {
    if (!editGlobal) return;
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editGlobal),
      });
      await fetchAll();
    } finally {
      setSaving(false);
    }
  }

  async function saveAgentSettings(agentId: string) {
    if (!editAgentValues) return;
    setSaving(true);
    try {
      await fetch(`/api/agents/${agentId}/task-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editAgentValues),
      });
      setEditAgent(null);
      setEditAgentValues(null);
      await fetchAll();
    } finally {
      setSaving(false);
    }
  }

  async function clearAgentOverride(agentId: string) {
    setSaving(true);
    try {
      await fetch(`/api/agents/${agentId}/task-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeoutMinutes: null, maxRetries: null, maxConcurrent: null }),
      });
      await fetchAll();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48 bg-muted" />
        <Skeleton className="h-40 w-full bg-muted rounded-xl" />
        <Skeleton className="h-60 w-full bg-muted rounded-xl" />
      </div>
    );
  }

  const editing = editGlobal ?? global;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h3 className="text-sm font-medium text-foreground">Settings</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Global defaults and per-agent overrides for task execution
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm text-foreground">Global Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingsRow
            label="Timeout"
            value={editing.timeoutMinutes}
            onChange={(v) => setEditGlobal({ ...editing, timeoutMinutes: v })}
            min={1}
            suffix="minutes"
          />
          <SettingsRow
            label="Max retries"
            value={editing.maxRetries}
            onChange={(v) => setEditGlobal({ ...editing, maxRetries: v })}
            min={0}
            max={20}
          />
          <SettingsRow
            label="Max concurrent tasks"
            value={editing.maxConcurrent}
            onChange={(v) => setEditGlobal({ ...editing, maxConcurrent: v })}
            min={1}
            max={10}
          />
          {editGlobal && (
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={saveGlobal} disabled={saving} className="bg-sky-600 hover:bg-sky-700 text-white">
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditGlobal(null)}>Cancel</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm text-foreground">Per-Agent Overrides</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Set per-agent values to override the global defaults. Leave blank to use the global value.
          </p>
          <div className="space-y-3">
            {agentSettings.map(({ agent, settings }) => {
              const isEditing = editAgent === agent.id;
              const vals = isEditing && editAgentValues ? editAgentValues : settings;
              const matchesGlobal =
                settings.timeoutMinutes === global.timeoutMinutes &&
                settings.maxRetries === global.maxRetries &&
                settings.maxConcurrent === global.maxConcurrent;

              return (
                <div key={agent.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{agent.name}</span>
                    <span className="text-xs text-muted-foreground">{agent.id}</span>
                    {matchesGlobal ? (
                      <Badge variant="outline" className="text-xs ml-auto">using global</Badge>
                    ) : (
                      <Badge className="text-xs ml-auto bg-sky-900/50 text-sky-400 border border-sky-700/50">custom</Badge>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2 pl-2">
                      <SettingsRow
                        label="Timeout"
                        value={vals.timeoutMinutes}
                        onChange={(v) => setEditAgentValues({ ...vals, timeoutMinutes: v })}
                        min={1}
                        suffix="minutes"
                      />
                      <SettingsRow
                        label="Max retries"
                        value={vals.maxRetries}
                        onChange={(v) => setEditAgentValues({ ...vals, maxRetries: v })}
                        min={0}
                        max={20}
                      />
                      <SettingsRow
                        label="Max concurrent"
                        value={vals.maxConcurrent}
                        onChange={(v) => setEditAgentValues({ ...vals, maxConcurrent: v })}
                        min={1}
                        max={10}
                      />
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={() => saveAgentSettings(agent.id)} disabled={saving} className="bg-sky-600 hover:bg-sky-700 text-white">
                          {saving ? "Saving..." : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditAgent(null); setEditAgentValues(null); }}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pl-2">
                      <span>Timeout: {settings.timeoutMinutes}m</span>
                      <span>Retries: {settings.maxRetries}</span>
                      <span>Concurrent: {settings.maxConcurrent}</span>
                      <div className="ml-auto flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs"
                          onClick={() => { setEditAgent(agent.id); setEditAgentValues({ ...settings }); }}
                        >
                          Edit
                        </Button>
                        {!matchesGlobal && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs text-muted-foreground"
                            onClick={() => clearAgentOverride(agent.id)}
                            disabled={saving}
                          >
                            Reset to global
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
