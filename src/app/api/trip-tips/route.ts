import { NextResponse } from "next/server";
import { findDestination, genericDestination } from "@/lib/mock/destinations";
import { generateTripTips } from "@/lib/trip-tips";
import type { Region, TripTips } from "@/lib/types";

const EMPTY_TIPS: TripTips = { climate: "", packingList: [], recentIssues: [] };

/**
 * 일정 생성 로딩 화면에서 서버 액션(createItineraryAction)이 끝나기 전에 먼저 보여줄
 * 기후/준비물/최근 이슈 Tip을 가져옵니다. 로그인 여부와 무관하게(비회원도 일정을 만들 수
 * 있으므로) 목적지/지역/월만으로 조회합니다.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const destinationInput = typeof body?.destination === "string" ? body.destination.trim() : "";
  if (!destinationInput) {
    return NextResponse.json(EMPTY_TIPS);
  }

  const region: Region = body?.region === "해외" ? "해외" : "국내";
  const monthInput = Number(body?.month);
  const month = Number.isFinite(monthInput) ? Math.min(12, Math.max(1, monthInput)) : new Date().getMonth() + 1;

  const destination = findDestination(destinationInput) ?? genericDestination(destinationInput);
  const tips = await generateTripTips(destination.name, region, month);
  return NextResponse.json(tips);
}
