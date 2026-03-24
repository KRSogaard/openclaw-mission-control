"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ApiResponse, GatewayStatus } from "@/lib/types";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<GatewayStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch("/api/status");
        const json = (await res.json()) as ApiResponse<GatewayStatus>;
        if (!cancelled && json.data) {
          setStatus(json.data);
        }
      } catch {
        if (!cancelled) {
          setStatus({ online: false, version: null });
        }
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const pathname = usePathname();

  return (
    <div className="dark flex min-h-screen flex-col bg-zinc-950 text-zinc-50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 px-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight hover:text-zinc-200 transition-colors">
            Mission Control
          </Link>
          {status?.version && (
            <span className="text-xs text-zinc-500">v{status.version}</span>
          )}
          <nav className="flex items-center gap-1 border-l border-zinc-800 pl-4">
            <Link
              href="/dashboard"
              className={[
                "rounded-md px-2.5 py-1 text-sm transition-colors",
                pathname === "/dashboard" || pathname === "/dashboard/hierarchy"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
            >
              Hierarchy
            </Link>
            <Link
              href="/dashboard/agents"
              className={[
                "rounded-md px-2.5 py-1 text-sm transition-colors",
                pathname === "/dashboard/agents"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
            >
              Agents
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span
            className={`inline-block size-2 rounded-full ${
              status?.online ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          {status ? (status.online ? "Online" : "Offline") : "Checking\u2026"}
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
