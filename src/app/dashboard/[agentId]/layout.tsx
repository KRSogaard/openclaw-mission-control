"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AgentView, ApiResponse } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const pathname = usePathname();
  const [agent, setAgent] = useState<AgentView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAgent() {
      try {
        const res = await fetch(`/api/agents/${agentId}`);
        const json = (await res.json()) as ApiResponse<AgentView>;
        if (json.data) setAgent(json.data);
      } catch {
        return;
      } finally {
        setLoading(false);
      }
    }
    fetchAgent();
  }, [agentId]);

  const tabs = [
    { label: "Overview", href: `/dashboard/${agentId}` },
    { label: "Tasks", href: `/dashboard/${agentId}/tasks` },
    { label: "Files", href: `/dashboard/${agentId}/files` },
    { label: "Settings", href: `/dashboard/${agentId}/settings` },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col border-b border-border">
        <div className="flex items-center gap-4 px-6 py-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <svg
                className="size-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                />
              </svg>
              Back
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-5" />
          {loading ? (
            <Skeleton className="h-5 w-32 bg-muted" />
          ) : (
            <>
              <h2 className="text-sm font-medium text-muted-foreground">
                {agent?.name ?? agentId}
              </h2>
              {agent?.isDefault && (
                <Badge variant="secondary" className="text-xs">default</Badge>
              )}
              <Badge variant="outline" className="font-mono text-xs">
                {agent?.model ?? "..."}
              </Badge>
            </>
          )}
        </div>

        <nav className="flex gap-0 px-6">
          {tabs.map((tab) => {
            const isActive =
              tab.href === `/dashboard/${agentId}`
                ? pathname === tab.href
                : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={[
                  "border-b-2 px-4 py-2 text-sm transition-colors",
                  isActive
                    ? "border-sky-500 text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
