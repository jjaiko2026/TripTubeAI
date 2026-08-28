"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { track } from "@vercel/analytics";
import { Button } from "@/components/ui/button";

/**
 * 결과 페이지 공유 버튼. 모바일은 OS 공유 시트(navigator.share), 그 외엔 링크 복사.
 * 결과 페이지는 원래 소유자 무관 공개 조회라(공유 링크 지원), 받은 사람도 바로 볼 수 있다.
 */
export function ShareItineraryButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    // ?fallback=1 등 1회성 쿼리는 떼고 공유
    const url = `${window.location.origin}${window.location.pathname}`;
    track("itinerary_shared");

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // 사용자가 공유 시트를 닫은 경우 등 — 복사로 폴백
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 접근 불가 환경 — 무시
    }
  }

  return (
    <Button onClick={handleShare} variant="outline" size="sm">
      {copied ? (
        <>
          <Check className="h-4 w-4" /> 링크 복사됨
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" /> 공유
        </>
      )}
    </Button>
  );
}
