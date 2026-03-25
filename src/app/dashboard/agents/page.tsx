"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AgentSummary, ApiResponse } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentsTabs } from "@/components/agents-tabs";

export default function DashboardPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch("/api/agents");
        const json = (await res.json()) as ApiResponse<AgentSummary[]>;
        if (json.error) {
          setError(json.error.message);
          return;
        }
        const visible = json.data.filter(
          (a) => !a.id.startsWith("mc-gateway-")
        );
        setAgents(visible);
      } catch {
        setError("Failed to fetch agents");
      } finally {
        setLoading(false);
      }
    }
    fetchAgents();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AgentsTabs />
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <Skeleton className="h-5 w-32 bg-muted" />
                <Skeleton className="h-4 w-48 bg-muted" />
                <Skeleton className="h-4 w-24 bg-muted ml-auto" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-red-400">{error}</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-muted-foreground italic">No crew on deck</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/dashboard/${agent.id}`}
                className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="w-48 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{agent.name}</span>
                    {agent.isDefault && (
                      <Badge variant="secondary" className="text-xs">default</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{agent.id}</span>
                </div>
                <Badge variant="outline" className="shrink-0 font-mono text-xs">{agent.model}</Badge>
                <div className="flex-1 min-w-0 truncate text-xs text-muted-foreground">
                  {agent.description ?? ""}
                </div>
                <div className="shrink-0 flex flex-wrap gap-1 max-w-[300px] justify-end">
                  {agent.channels.map((ch, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {ch.platform}{ch.target ? ` \u2192 ${ch.target}` : ""}
                    </Badge>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
