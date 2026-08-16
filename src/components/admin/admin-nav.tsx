"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/dashboard", label: "대시보드" },
  { href: "/admin/users", label: "사용자" },
  { href: "/admin/itineraries", label: "여행 일정" },
  { href: "/admin/analytics", label: "분석" },
  { href: "/admin/content/jobs", label: "콘텐츠 Job" },
  { href: "/admin/content/blog", label: "Blog" },
  { href: "/admin/content/youtube", label: "YouTube" },
  { href: "/admin/content/shorts", label: "Shorts" },
  { href: "/admin/settings", label: "설정" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            pathname.startsWith(item.href) && "bg-accent text-foreground font-medium",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
