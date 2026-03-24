"use client";

import { useEffect, useState, useCallback } from "react";
import type { GlobalTaskSettings, ApiResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsPage() {
  const [global, setGlobal] = useState<GlobalTaskSettings>({ timeoutMinutes: 30, maxRetries: 3, maxConcurrent: 1 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<GlobalTaskSettings | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const json = (await res.json()) as ApiResponse<GlobalTaskSettings>;
      if (json.data) {
        setGlobal(json.data);
        setEdit(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function save() {
    if (!edit) return;
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      });
      await fetchSettings();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48 bg-muted" />
        <Skeleton className="h-40 w-full bg-muted rounded-xl" />
      </div>
    );
  }

  const vals = edit ?? global;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h3 className="text-sm font-medium text-foreground">Settings</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Global defaults for task execution. Per-agent overrides are configured in each agent&apos;s Settings tab.
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm text-foreground">Task Defaults</CardTitle>
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
            <span className="text-xs text-muted-foreground">per agent</span>
          </div>
          {edit && (
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={save} disabled={saving} className="bg-sky-600 hover:bg-sky-700 text-white">
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
