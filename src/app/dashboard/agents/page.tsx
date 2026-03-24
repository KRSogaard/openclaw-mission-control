"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="mb-6 text-xl font-semibold">Agents</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <Skeleton className="h-5 w-32 bg-zinc-800" />
                <Skeleton className="h-4 w-20 bg-zinc-800" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full bg-zinc-800" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-zinc-500">No agents configured</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-semibold">Agents</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <Link key={agent.id} href={`/dashboard/${agent.id}`}>
            <Card className="bg-zinc-900 border-zinc-800 transition-colors hover:bg-zinc-800/80 cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-zinc-50">{agent.name}</CardTitle>
                  {agent.isDefault && (
                    <Badge variant="secondary" className="text-xs">
                      default
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  <Badge variant="outline" className="font-mono text-xs">
                    {agent.model}
                  </Badge>
                </CardDescription>
              </CardHeader>
               <CardContent className="space-y-2">
                 {agent.description && (
                   <p className="text-xs text-zinc-400">{agent.description}</p>
                 )}
                 {agent.channels.length > 0 && (
                   <div className="flex flex-wrap gap-1">
                     {agent.channels.map((ch, i) => (
                       <Badge
                         key={i}
                         variant="secondary"
                         className="text-[10px]"
                       >
                         {ch.platform}
                         {ch.target ? ` \u2192 ${ch.target}` : ""}
                       </Badge>
                     ))}
                   </div>
                 )}
               </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
