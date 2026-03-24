"use client";

import { useEffect, useState, useCallback, use } from "react";
import type { AgentTaskSettings, GlobalTaskSettings, ApiResponse } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentSettingsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [settings, setSettings] = useState<AgentTaskSettings | null>(null);
  const [global, setGlobal] = useState<GlobalTaskSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<AgentTaskSettings | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [settingsRes, globalRes] = await Promise.all([
        fetch(`/api/agents/${agentId}/task-settings`),
        fetch("/api/settings"),
      ]);
      const settingsJson = (await settingsRes.json()) as ApiResponse<AgentTaskSettings>;
      const globalJson = (await globalRes.json()) as ApiResponse<GlobalTaskSettings>;
      if (settingsJson.data) setSettings(settingsJson.data);
      if (globalJson.data) setGlobal(globalJson.data);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function save() {
    if (!edit) return;
    setSaving(true);
    try {
      await fetch(`/api/agents/${agentId}/task-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      });
      setEdit(null);
      await fetchAll();
    } finally {
      setSaving(false);
    }
  }

  async function resetToGlobal() {
    setSaving(true);
    try {
      await fetch(`/api/agents/${agentId}/task-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeoutMinutes: null, maxRetries: null, maxConcurrent: null }),
      });
      setEdit(null);
      await fetchAll();
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings || !global) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <Skeleton className="h-40 w-full bg-muted rounded-xl" />
      </div>
    );
  }

  const vals = edit ?? settings;
  const matchesGlobal =
    settings.timeoutMinutes === global.timeoutMinutes &&
    settings.maxRetries === global.maxRetries &&
    settings.maxConcurrent === global.maxConcurrent;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-foreground">Task Settings</CardTitle>
            {matchesGlobal ? (
              <Badge variant="outline" className="text-xs">using global defaults</Badge>
            ) : (
              <Badge className="text-xs bg-sky-900/50 text-sky-400 border border-sky-700/50">custom override</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground w-44">Timeout</label>
            <input
              type="number"
              value={vals.timeoutMinutes}
              onChange={(e) => setEdit({ ...vals, timeoutMinutes: parseInt(e.target.value) || 1 })}
              min={1}
              className="w-24 rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">minutes</span>
            {!matchesGlobal && settings.timeoutMinutes !== global.timeoutMinutes && (
              <span className="text-xs text-muted-foreground/50">global: {global.timeoutMinutes}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground w-44">Max retries</label>
            <input
              type="number"
              value={vals.maxRetries}
              onChange={(e) => setEdit({ ...vals, maxRetries: parseInt(e.target.value) || 0 })}
              min={0}
              max={20}
              className="w-24 rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {!matchesGlobal && settings.maxRetries !== global.maxRetries && (
              <span className="text-xs text-muted-foreground/50">global: {global.maxRetries}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground w-44">Max concurrent tasks</label>
            <input
              type="number"
              value={vals.maxConcurrent}
              onChange={(e) => setEdit({ ...vals, maxConcurrent: parseInt(e.target.value) || 1 })}
              min={1}
              max={10}
              className="w-24 rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {!matchesGlobal && settings.maxConcurrent !== global.maxConcurrent && (
              <span className="text-xs text-muted-foreground/50">global: {global.maxConcurrent}</span>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            {edit && (
              <>
                <Button size="sm" onClick={save} disabled={saving} className="bg-sky-600 hover:bg-sky-700 text-white">
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
              </>
            )}
            {!matchesGlobal && !edit && (
              <Button size="sm" variant="outline" onClick={resetToGlobal} disabled={saving}>
                Reset to global defaults
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {global && (
        <div className="text-xs text-muted-foreground/50">
          Global defaults: {global.timeoutMinutes}m timeout, {global.maxRetries} retries, {global.maxConcurrent} concurrent
        </div>
      )}
    </div>
  );
}
