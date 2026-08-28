// 유입 채널 추적 — 랜딩 URL의 utm_* 파라미터를 first-touch(첫 방문 기준)로 30일 쿠키에 저장하고,
// 일정 생성 시 그 값을 Vercel Analytics 이벤트에 실어 "채널별 유입 → 생성" 퍼널을 만든다.
// 클라이언트 전용(document.cookie). 서버에서 import되면 no-op.

const COOKIE = "ttai_attr";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

export type Attribution = { source?: string; medium?: string; campaign?: string };

function readCookie(): Attribution | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)ttai_attr=([^;]*)/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(m[1]));
    return parsed && typeof parsed === "object" ? (parsed as Attribution) : null;
  } catch {
    return null;
  }
}

/** 랜딩 시 1회 호출. 쿠키가 이미 있으면 유지(first-touch)해 퍼널 내내 최초 채널이 남게 한다. */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  if (readCookie()) return;
  const p = new URLSearchParams(window.location.search);
  const attr: Attribution = {};
  const src = p.get("utm_source") || p.get("ref");
  if (src) attr.source = src.slice(0, 60);
  if (p.get("utm_medium")) attr.medium = p.get("utm_medium")!.slice(0, 60);
  if (p.get("utm_campaign")) attr.campaign = p.get("utm_campaign")!.slice(0, 60);
  if (!attr.source && !attr.medium && !attr.campaign) return;
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(attr))}; path=/; max-age=${MAX_AGE_SEC}; samesite=lax`;
}

/** 이벤트 props용 — 항상 문자열만 반환(빈 값은 ""), utm이 없으면 source="direct". */
export function attributionProps(): { source: string; medium: string; campaign: string } {
  const a = readCookie();
  return {
    source: a?.source ?? "direct",
    medium: a?.medium ?? "",
    campaign: a?.campaign ?? "",
  };
}
