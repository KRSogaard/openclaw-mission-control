"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AgentsTabs } from "@/components/agents-tabs";
import type { AgentSummary, ApiResponse } from "@/lib/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="bg-card border-border">
                <CardHeader>
                  <Skeleton className="h-5 w-32 bg-muted" />
                  <Skeleton className="h-4 w-20 bg-muted" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-red-400">{error}</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">No agents configured</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <Link key={agent.id} href={`/dashboard/${agent.id}`}>
                <Card className="bg-card border-border transition-colors hover:bg-muted cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-foreground">{agent.name}</CardTitle>
                      {agent.isDefault && (
                        <Badge variant="secondary" className="text-xs">default</Badge>
                      )}
                    </div>
                    <CardDescription>
                      <Badge variant="outline" className="font-mono text-xs">{agent.model}</Badge>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {agent.description && (
                      <p className="text-xs text-muted-foreground">{agent.description}</p>
                    )}
                    {agent.channels.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {agent.channels.map((ch, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {ch.platform}{ch.target ? ` \u2192 ${ch.target}` : ""}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
