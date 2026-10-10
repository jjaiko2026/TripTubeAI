"use client";

import { useState } from "react";
import { Check, Mail, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createRecoveryLinkAction } from "@/lib/actions";

const SHARE_TITLE = "TripTube AI 일정 가져오기";
const SHARE_TEXT = "이 링크를 열면 이 기기에서 만든 여행 일정을 그 기기에서도 보고 관리할 수 있어요.";

/**
 * "다른 기기로 옮기기". ShareItineraryButton(결과 페이지 공유)과 같은 패턴 —
 * 모바일은 OS 공유 시트(카카오톡 포함), 그 외엔 링크 복사. 이 링크는 공유 링크와 달리
 * 소유권 자체를 옮기므로("쿠키를 들고 있는 동안만 소유"), 받은 사람도 이 일정들을
 * 관리할 수 있다는 점을 버튼 옆에 짧게 안내한다.
 */
export function RecoveryLinkButton() {
  const [state, setState] = useState<"idle" | "loading" | "copied">("idle");
  const [mailtoHref, setMailtoHref] = useState<string | null>(null);

  async function handleClick() {
    setState("loading");
    try {
      const url = await createRecoveryLinkAction();
      setMailtoHref(
        `mailto:?subject=${encodeURIComponent(SHARE_TITLE)}&body=${encodeURIComponent(`${SHARE_TEXT}\n\n${url}`)}`
      );

      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url });
          setState("idle");
          return;
        } catch {
          // 공유 시트를 닫은 경우 등 — 복사로 폴백
        }
      }
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("idle");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={handleClick} variant="outline" size="sm" disabled={state === "loading"}>
        {state === "copied" ? (
          <>
            <Check className="h-4 w-4" /> 링크 복사됨
          </>
        ) : (
          <>
            <Smartphone className="h-4 w-4" /> 다른 기기로 옮기기
          </>
        )}
      </Button>
      {mailtoHref && (
        <a href={mailtoHref} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Mail className="h-3.5 w-3.5" /> 이메일로 보내기
        </a>
      )}
    </div>
  );
}
