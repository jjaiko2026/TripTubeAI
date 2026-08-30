"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 스크롤해서 화면에 들어오면 살짝 떠오르며 페이드인. hover 효과가 없는 터치 기기에서도
 * 카드에 생동감을 주는 용도. JS가 없거나(SSR·비활성) 사용자가 모션 최소화를 켰으면
 * 아무것도 안 하고 그대로 보여준다.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  /** 같은 화면에 여러 개를 순차로 띄우고 싶을 때만 사용. */
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // SSR·최초 클라이언트 렌더는 항상 "static"(그냥 보임) — 하이드레이션 불일치 방지.
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") return;

    setState("hidden");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setState("shown");
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={state === "hidden" && delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={cn(
        state !== "static" && "transition-all duration-500 ease-out",
        state === "hidden" && "translate-y-3 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
