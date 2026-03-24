"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitBranch, Users } from "lucide-react";
import type { ApiResponse, GatewayStatus } from "@/lib/types";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_ITEMS = [
  {
    label: "Hierarchy",
    href: "/dashboard",
    icon: GitBranch,
    matchPaths: ["/dashboard", "/dashboard/hierarchy"],
  },
  {
    label: "Agents",
    href: "/dashboard/agents",
    icon: Users,
    matchPaths: ["/dashboard/agents"],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const pathname = usePathname();

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

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-3 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="8" cy="8" r="6" />
                <circle cx="8" cy="8" r="2" />
                <path d="M8 2v4M8 10v4M2 8h4M10 8h4" />
              </svg>
            </div>
            <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold tracking-tight">Mission Control</span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block size-1.5 rounded-full ${
                    status?.online ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                <span className="text-[10px] text-muted-foreground">
                  {status
                    ? status.online
                      ? `Online${status.version ? ` v${status.version}` : ""}`
                      : "Offline"
                    : "Checking\u2026"}
                </span>
              </div>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => {
                  const isActive = item.matchPaths.includes(pathname);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center justify-center group-data-[collapsible=icon]:justify-center">
            <ThemeToggle />
          </div>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link
              href="/dashboard"
              className="transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
            {pathname !== "/dashboard" &&
              pathname !== "/dashboard/hierarchy" && (
                <>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">
                    {pathname === "/dashboard/agents"
                      ? "Agents"
                      : pathname.split("/").pop()}
                  </span>
                </>
              )}
          </nav>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
