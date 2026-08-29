"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Region, TripTips } from "@/lib/types";

const STAGES = [
  "여행 조건을 확인하고 있어요",
  "목적지의 인기 코스를 분석하고 있어요",
  "유튜브 영상을 검색하고 있어요",
  "블로그 후기를 검색하고 있어요",
  "최적의 동선을 계산하고 있어요",
  "일정을 마무리하고 있어요",
];

const GENERIC_TIPS = [
  "같은 지역 안에서는 동선이 자연스럽게 이어지도록 순서를 짜고 있어요.",
  "최근 2년 내 올라온 영상·블로그만 골라 최신 정보를 반영해요.",
  "완성되면 항목을 눌러 펼쳐서 참고한 출처를 바로 확인할 수 있어요.",
  "완성된 일정은 대시보드에서 언제든 다시 볼 수 있어요.",
];

const STAGE_INTERVAL_MS = 2200;
const TIP_INTERVAL_MS = 4000;

/** 실시간으로 받아온 기후/준비물/최근 이슈를, 기존 rotating tip과 같은 한 줄짜리 문구들로 풀어냅니다. */
function buildTips(tripTips: TripTips | null): string[] {
  const fromTripTips: string[] = [];
  if (tripTips?.climate) fromTripTips.push(`이 시기 날씨: ${tripTips.climate}`);
  if (tripTips?.packingList.length) fromTripTips.push(`준비물로는 ${tripTips.packingList.join(", ")}을(를) 챙기면 좋아요.`);
  for (const issue of tripTips?.recentIssues ?? []) fromTripTips.push(`최근 이슈: ${issue}`);
  return [...fromTripTips, ...GENERIC_TIPS];
}

/** 일정 생성 서버 액션이 끝날 때까지, 실제 진행률 대신 단계별 상태를 연출해 지루함을 줄입니다. */
export function ItineraryLoading({
  destination,
  region,
  month,
}: {
  destination?: string;
  region?: Region;
  month?: number;
}) {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(6);
  const [tipIndex, setTipIndex] = useState(0);
  const [tripTips, setTripTips] = useState<TripTips | null>(null);

  useEffect(() => {
    const stageTimer = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, STAGE_INTERVAL_MS);
    const tipTimer = setInterval(() => {
      setTipIndex((i) => i + 1);
    }, TIP_INTERVAL_MS);
    const progressTimer = setInterval(() => {
      setProgress((p) => (p < 92 ? p + (92 - p) * 0.08 : p));
    }, 300);
    return () => {
      clearInterval(stageTimer);
      clearInterval(tipTimer);
      clearInterval(progressTimer);
    };
  }, []);

  useEffect(() => {
    if (!destination) return;
    const controller = new AbortController();
    fetch("/api/trip-tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, region, month }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TripTips | null) => {
        if (data) setTripTips(data);
      })
      .catch(() => {});
    return () => controller.abort();
    // destination/region/month는 폼 제출 시점의 값으로 고정되어 로딩 중 바뀌지 않으므로 최초 1회만 호출합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tips = buildTips(tripTips);
  const tip = tips[tipIndex % tips.length];

  return (
    <div className="space-y-6 py-2">
      <div>
        <p className="font-medium">
          {destination ? `${destination} 여행 일정을 만들고 있어요` : "여행 일정을 만들고 있어요"}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">보통 몇십 초 정도 걸려요. 잠시만 기다려 주세요.</p>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ul className="space-y-2.5">
        {STAGES.map((label, i) => {
          const state = i < stageIndex ? "done" : i === stageIndex ? "active" : "pending";
          return (
            <li key={label} className="flex items-center gap-2.5 text-sm">
              {state === "done" && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}
              {state === "active" && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </span>
              )}
              {state === "pending" && <span className="h-5 w-5 shrink-0 rounded-full border" aria-hidden />}
              <span className={cn(state === "pending" ? "text-muted-foreground" : "font-medium")}>{label}</span>
            </li>
          );
        })}
      </ul>

      <p key={tipIndex} className="animate-in fade-in rounded-lg bg-accent/40 px-3 py-2.5 text-xs text-muted-foreground">
        Tip. {tip}
      </p>
    </div>
  );
}
