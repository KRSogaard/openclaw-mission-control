"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Hierarchy", href: "/dashboard", matchPaths: ["/dashboard", "/dashboard/hierarchy"] },
  { label: "List", href: "/dashboard/agents", matchPaths: ["/dashboard/agents"] },
];

export function AgentsTabs() {
  const pathname = usePathname();

  return (
    <div className="flex shrink-0 gap-0 border-b border-border px-6">
      {TABS.map((tab) => {
        const isActive = tab.matchPaths.includes(pathname);
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
    </div>
  );
}
