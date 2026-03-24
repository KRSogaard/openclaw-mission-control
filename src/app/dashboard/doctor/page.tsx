"use client";

import { useState } from "react";
import type { ApiResponse } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type CheckStatus = "pass" | "warn" | "fail";

type DiagnosticCheck = {
  id: string;
  category: string;
  label: string;
  status: CheckStatus;
  message: string;
  agentId?: string;
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
  pass: "bg-emerald-600",
  warn: "bg-amber-600",
  fail: "bg-red-600",
};

export default function DoctorPage() {
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const categories = result
    ? [...new Set(result.checks.map((c) => c.category))]
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">System Diagnostics</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Check gateway connectivity, agent permissions, tool sync, and exec approvals
          </p>
        </div>
        <Button
          onClick={runChecks}
          disabled={loading}
          className="bg-sky-600 hover:bg-sky-700 text-white"
        >
          {loading ? "Running..." : result ? "Re-run checks" : "Run diagnostics"}
        </Button>
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

          {categories.map((category) => {
            const checks = result.checks.filter((c) => c.category === category);
            return (
              <Card key={category} className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-sm text-foreground">{category}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {checks.map((check) => (
                      <div
                        key={check.id}
                        className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-muted/30"
                      >
                        <span className={`mt-0.5 text-sm ${STATUS_COLOR[check.status]}`}>
                          {STATUS_ICON[check.status]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {check.label}
                            </span>
                            {check.agentId && (
                              <Badge variant="outline" className="text-[10px]">
                                {check.agentId}
                              </Badge>
                            )}
                            <Badge className={`text-[10px] ml-auto ${STATUS_BADGE[check.status]}`}>
                              {check.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {check.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <p className="text-[10px] text-muted-foreground/40">
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
    </div>
  );
}
