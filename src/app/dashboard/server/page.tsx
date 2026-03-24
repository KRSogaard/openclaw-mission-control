"use client";

import { useEffect, useState, useCallback } from "react";
import type { ApiResponse } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type DiskInfo = { mount: string; size: string; used: string; available: string; usePct: number };

type ServerStats = {
  hostname: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  loadAvg: number[];
  memTotal: number;
  memUsed: number;
  memFree: number;
  memPct: number;
  uptime: number;
  disks: DiskInfo[];
  nodeVersion: string;
  timestamp: number;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let val = bytes;
  let i = -1;
  do {
    val /= 1024;
    i++;
  } while (val >= 1024 && i < units.length - 1);
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2.5 w-full rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function pctColor(pct: number): string {
  if (pct < 60) return "bg-emerald-500";
  if (pct < 80) return "bg-amber-500";
  return "bg-red-500";
}

function pctTextColor(pct: number): string {
  if (pct < 60) return "text-emerald-500";
  if (pct < 80) return "text-amber-500";
  return "text-red-500";
}

export default function ServerPage() {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/server");
      const json = (await res.json()) as ApiResponse<ServerStats>;
      if (json.data) setStats(json.data);
    } catch {
      void 0;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48 bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 bg-muted rounded-xl" />
          <Skeleton className="h-28 bg-muted rounded-xl" />
          <Skeleton className="h-28 bg-muted rounded-xl" />
          <Skeleton className="h-28 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Failed to load server stats</p>
      </div>
    );
  }

  const cpuPct = Math.round((stats.loadAvg[0] / stats.cpuCores) * 100);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h3 className="text-sm font-medium text-foreground">Server</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {stats.hostname} &middot; {stats.platform} &middot; {stats.arch}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">CPU Load</span>
              <span className={`text-lg font-bold ${pctTextColor(cpuPct)}`}>{cpuPct}%</span>
            </div>
            <ProgressBar value={cpuPct} color={pctColor(cpuPct)} />
            <p className="text-xs text-muted-foreground">
              {stats.cpuCores} cores &middot; load {stats.loadAvg.map((l) => l.toFixed(2)).join(" / ")}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Memory</span>
              <span className={`text-lg font-bold ${pctTextColor(stats.memPct)}`}>{stats.memPct}%</span>
            </div>
            <ProgressBar value={stats.memPct} color={pctColor(stats.memPct)} />
            <p className="text-xs text-muted-foreground">
              {formatBytes(stats.memUsed)} / {formatBytes(stats.memTotal)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Uptime</span>
            </div>
            <p className="text-lg font-bold text-foreground">{formatUptime(stats.uptime)}</p>
            <p className="text-xs text-muted-foreground">
              Node {stats.nodeVersion}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">CPU</span>
            </div>
            <p className="text-sm font-medium text-foreground leading-snug">{stats.cpuModel}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm text-foreground">Disk Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.disks.map((disk) => (
              <div key={disk.mount} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground font-mono">{disk.mount}</span>
                  <span className={`text-sm font-bold ${pctTextColor(disk.usePct)}`}>{disk.usePct}%</span>
                </div>
                <ProgressBar value={disk.usePct} color={pctColor(disk.usePct)} />
                <p className="text-xs text-muted-foreground">
                  {disk.used} used / {disk.size} total &middot; {disk.available} free
                </p>
              </div>
            ))}
            {stats.disks.length === 0 && (
              <p className="text-xs text-muted-foreground">No disk data available</p>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground/40">
        Updates every 5s &middot; Last: {new Date(stats.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}
