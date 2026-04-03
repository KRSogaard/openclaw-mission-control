"use client";

import { useState } from "react";
import { RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import type { ApiResponse } from "@/lib/types";
import { getAgentColor } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirmDialog, useSelectDialog } from "@/components/confirm-dialog";

type CheckStatus = "pass" | "warn" | "fail";
type AgentType = "full" | "subagent";

type DiagnosticCheck = {
  id: string;
  category: string;
  label: string;
  status: CheckStatus;
  message: string;
  agentId?: string;
  agentType?: AgentType;
};

type DiagnosticResult = {
  checks: DiagnosticCheck[];
  summary: { pass: number; warn: number; fail: number };
  timestamp: number;
};

const STATUS_ICON: Record<CheckStatus, string> = {
  pass: "\u2705",
  warn: "\u26a0\ufe0f",
  fail: "\u274c",
};

const STATUS_COLOR: Record<CheckStatus, string> = {
  pass: "text-emerald-500",
  warn: "text-amber-500",
  fail: "text-red-500",
};

const STATUS_BADGE: Record<CheckStatus, string> = {
  pass: "bg-emerald-900/50 text-emerald-400 border border-emerald-700/50",
  warn: "bg-amber-900/50 text-amber-400 border border-amber-700/50",
  fail: "bg-red-900/50 text-red-400 border border-red-700/50",
};

const FIXABLE_PREFIXES = ["bc-internal", "hooks-token-", "hooks-", "exec-default-policy", "exec-default-security", "exec-default-fallback", "exec-", "tools-exec-settings", "tools-bc-", "fallback-model-"];
function isFixable(checkId: string, status: CheckStatus): boolean {
  if (status === "pass") return false;
  return FIXABLE_PREFIXES.some((p) => checkId.startsWith(p));
}

function CheckRow({ check, fixing, onFix }: { check: DiagnosticCheck; fixing: string | null; onFix: (id: string) => void }) {
  return (
    <div className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-muted/30">
      <span className={`mt-0.5 text-sm ${STATUS_COLOR[check.status]}`}>
        {STATUS_ICON[check.status]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{check.label}</span>
          <div className="ml-auto flex items-center gap-2">
            {isFixable(check.id, check.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onFix(check.id)}
                disabled={fixing === check.id}
                className="h-6 px-2 text-xs text-sky-400 border-sky-700/50 hover:bg-sky-900/30 hover:text-sky-300"
              >
                {fixing === check.id ? "Fixing..." : "Fix"}
              </Button>
            )}
            <Badge className={`text-xs ${STATUS_BADGE[check.status]}`}>
              {check.status}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{check.message}</p>
      </div>
    </div>
  );
}

export default function DoctorPage() {
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixingAll, setFixingAll] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { select, SelectDialog } = useSelectDialog();

  async function runChecks() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/doctor");
      const json = (await res.json()) as ApiResponse<DiagnosticResult>;
      if (json.error) {
        setError(json.error.message);
        return;
      }
      setResult(json.data);
    } catch {
      setError("Failed to run diagnostics");
    } finally {
      setLoading(false);
    }
  }

  async function handleFix(checkId: string) {
    if (checkId.startsWith("fallback-model-")) {
      const agentId = checkId.replace("fallback-model-", "");
      handleFixFallbackModel(checkId, agentId);
      return;
    }
    setFixing(checkId);
    try {
      await fetch("/api/doctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fix", checkId }),
      });
      await runChecks();
    } finally {
      setFixing(null);
    }
  }

  async function handleFixFallbackModel(checkId: string, agentId: string) {
    type ModelInfo = { id: string; name: string; provider: string };
    type AgentInfo = { model: string };

    const [modelsRes, agentRes] = await Promise.all([
      fetch("/api/models").then((r) => r.json()) as Promise<{ data?: ModelInfo[] }>,
      fetch(`/api/agents/${agentId}`).then((r) => r.json()) as Promise<{ data?: AgentInfo }>,
    ]);

    const models = modelsRes.data ?? [];
    const currentModel = agentRes.data?.model ?? "";
    const options = models
      .filter((m) => m.id !== currentModel && `${m.provider}/${m.id}` !== currentModel)
      .map((m) => ({ value: m.id, label: `${m.name} (${m.provider})` }));

    if (options.length === 0) return;

    select({
      title: "Select fallback model",
      description: `Choose a fallback model for ${agentId}. Current primary: ${currentModel}`,
      options,
      confirmLabel: "Set fallback",
      onConfirm: async (modelId) => {
        setFixing(checkId);
        try {
          await fetch("/api/doctor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "fix", checkId, params: { modelId } }),
          });
          await runChecks();
        } finally {
          setFixing(null);
        }
      },
    });
  }

  async function handleFixAll() {
    setFixingAll(true);
    try {
      await fetch("/api/doctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fix-all" }),
      });
      await runChecks();
    } finally {
      setFixingAll(false);
    }
  }

  function handleRestart() {
    confirm({
      title: "Restart gateway",
      description: "Restart the OpenClaw gateway? Active sessions will be interrupted.",
      confirmLabel: "Restart",
      destructive: true,
      onConfirm: async () => {
        setRestarting(true);
        try {
          await fetch("/api/gateway/restart", { method: "POST" });
          setTimeout(runChecks, 5000);
        } finally {
          setRestarting(false);
        }
      },
    });
  }

  const categories = result
    ? [...new Set(result.checks.map((c) => c.category))]
    : [];

  const hasFixable = result
    ? result.checks.some((c) => isFixable(c.id, c.status))
    : false;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Sickbay</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ship diagnostics — comms, crew permissions, tool sync, and exec approvals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRestart}
            disabled={restarting}
          >
            <RotateCcw className={`size-4 ${restarting ? "animate-spin" : ""}`} />
            {restarting ? "Restarting..." : "Restart Gateway"}
          </Button>
          {hasFixable && (
            <Button
              variant="outline"
              onClick={handleFixAll}
              disabled={loading || fixingAll}
            >
              {fixingAll ? "Fixing..." : "Fix all"}
            </Button>
          )}
          <Button
            onClick={runChecks}
            disabled={loading}
            className="bg-sky-600 hover:bg-sky-700 text-white"
          >
            {loading ? "Scanning..." : result ? "Re-scan" : "Run diagnostics"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full bg-muted rounded-xl" />
          <Skeleton className="h-40 w-full bg-muted rounded-xl" />
          <Skeleton className="h-40 w-full bg-muted rounded-xl" />
        </div>
      )}

      {result && !loading && (
        <>
          {result.summary.fail > 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3">
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-red-500" />
              </span>
              <span className="text-sm font-semibold text-red-400 tracking-wide uppercase">Red Alert</span>
              <span className="text-xs text-red-400/70">{result.summary.fail} system{result.summary.fail > 1 ? "s" : ""} failing</span>
            </div>
          ) : result.summary.warn > 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3">
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-amber-500" />
              </span>
              <span className="text-sm font-semibold text-amber-400 tracking-wide uppercase">Yellow Alert</span>
              <span className="text-xs text-amber-400/70">{result.summary.warn} advisory{result.summary.warn > 1 ? " notices" : ""}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-3">
              <span className="inline-flex size-3 rounded-full bg-emerald-500" />
              <span className="text-sm font-semibold text-emerald-400 tracking-wide uppercase">All Systems Nominal</span>
            </div>
          )}

          <div className="flex gap-3">
            <Card className="flex-1 bg-card border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="size-10 rounded-lg bg-emerald-600/10 flex items-center justify-center">
                  <span className="text-lg">{STATUS_ICON.pass}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{result.summary.pass}</p>
                  <p className="text-xs text-muted-foreground">Passed</p>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 bg-card border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="size-10 rounded-lg bg-amber-600/10 flex items-center justify-center">
                  <span className="text-lg">{STATUS_ICON.warn}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{result.summary.warn}</p>
                  <p className="text-xs text-muted-foreground">Warnings</p>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 bg-card border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="size-10 rounded-lg bg-red-600/10 flex items-center justify-center">
                  <span className="text-lg">{STATUS_ICON.fail}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{result.summary.fail}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {categories.filter((c) => c !== "Agents").map((category) => (
            <Card key={category} className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-sm text-foreground">{category}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {result.checks.filter((c) => c.category === category).map((check) => (
                    <CheckRow key={check.id} check={check} fixing={fixing} onFix={handleFix} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {(() => {
            const agentChecks = result.checks.filter((c) => c.category === "Agents");
            if (agentChecks.length === 0) return null;
            const agentIds = [...new Set(agentChecks.map((c) => c.agentId!))];

            return (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-sm text-foreground">Agents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {agentIds.map((aid) => {
                    const checks = agentChecks.filter((c) => c.agentId === aid);
                    const expanded = expandedAgents.has(aid);
                    const worstStatus = checks.some((c) => c.status === "fail")
                      ? "fail"
                      : checks.some((c) => c.status === "warn")
                        ? "warn"
                        : "pass";
                    const color = getAgentColor(aid);
                    const agentType = checks[0]?.agentType;

                    return (
                      <div key={aid}>
                        <button
                          onClick={() => setExpandedAgents((prev) => {
                            const next = new Set(prev);
                            if (next.has(aid)) next.delete(aid); else next.add(aid);
                            return next;
                          })}
                          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 hover:bg-muted/30 text-left"
                        >
                          {expanded
                            ? <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                            : <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                          }
                          <span className={`size-2 rounded-full shrink-0 ${color.dot}`} />
                          <span className="text-sm font-medium text-foreground">{aid}</span>
                          {agentType === "subagent" && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">sub-agent</Badge>
                          )}
                          <div className="ml-auto flex items-center gap-1.5">
                            <span className={`text-xs ${STATUS_COLOR[worstStatus]}`}>{STATUS_ICON[worstStatus]}</span>
                            <span className="text-xs text-muted-foreground">
                              {checks.length} check{checks.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </button>
                        {expanded && (
                          <div className="ml-6 border-l border-border pl-3 space-y-1 mb-2">
                            {checks.map((check) => (
                              <CheckRow key={check.id} check={check} fixing={fixing} onFix={handleFix} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })()}

          <p className="text-xs text-muted-foreground/40">
            Last run: {new Date(result.timestamp).toLocaleString()}
          </p>
        </>
      )}

      {!result && !loading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">Click "Run diagnostics" to check your setup</p>
            <p className="text-xs text-muted-foreground/50">
              Checks gateway connectivity, hooks token, exec approvals, agent workspaces, and tool sync
            </p>
          </div>
        </div>
      )}
      {ConfirmDialog}
      {SelectDialog}
    </div>
  );
}
