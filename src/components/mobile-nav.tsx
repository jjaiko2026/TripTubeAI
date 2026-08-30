"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * MOBILE NAVIGATION v1 — site-header.tsx의 데스크톱 nav(`hidden md:flex`)를 대신할
 * 모바일 전용 진입점. 별도 클라이언트 컴포넌트로 분리해, 원래 서버 컴포넌트인
 * SiteHeader 자체는 최소 수정(이 컴포넌트를 렌더링하는 한 줄)만 하면 되게 했다.
 * 로그인/로그아웃 로직은 site-header.tsx와 동일하게 Clerk의 Show/SignInButton/UserButton을
 * 그대로 재사용한다 — 새 인증 로직 없음.
 */
export function MobileNav({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">메뉴 열기</span>
          </Button>
        }
      />
      <SheetContent side="right" className="w-64">
        <SheetHeader>
          <SheetTitle>메뉴</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1">
          {links.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/75 hover:bg-accent hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t pt-4">
          <Show when="signed-in">
            <div className="flex items-center gap-2 px-1">
              <UserButton />
              <span className="text-sm text-muted-foreground">내 계정</span>
            </div>
          </Show>
          <Show when="signed-out">
            <SignInButton mode="redirect" forceRedirectUrl="/plan/new">
              <Button variant="outline">로그인</Button>
            </SignInButton>
            <SignInButton mode="redirect" forceRedirectUrl="/plan/new">
              <Button>
                <Sparkles className="h-4 w-4" /> 일정 만들기
              </Button>
            </SignInButton>
          </Show>
        </div>
      </SheetContent>
    </Sheet>
  );
}
