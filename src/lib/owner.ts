import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const OWNER_COOKIE = "owner_id";
const OWNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1년
const RECOVERY_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

function ownerCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: OWNER_COOKIE_MAX_AGE,
    path: "/",
  };
}

/**
 * 읽기 전용(Server Component)에서 쓴다. 쿠키가 있으면 그 값을 소유자 id로 쓰고, 없으면
 * (한 번도 방문하지 않았거나 쿠키를 지운 경우) 저장하지 않는 임시 id를 반환한다 — 어차피
 * 그 사람 소유 데이터가 없으므로 결과(빈 목록 등)는 실제 쿠키가 있을 때와 동일하다.
 * 쿠키를 실제로 발급해야 하면 Server Action에서 getOrCreateOwnerId()를 쓴다.
 */
export async function getOwnerId(): Promise<string> {
  const store = await cookies();
  return store.get(OWNER_COOKIE)?.value ?? crypto.randomUUID();
}

/**
 * 쓰기 가능한 컨텍스트(Server Action)에서 쓴다. 쿠키가 없으면 새로 발급해 심은 뒤 반환한다
 * — 사용자가 실제로 무언가를 저장하는 순간 소유권 쿠키가 보장된다.
 */
export async function getOrCreateOwnerId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(OWNER_COOKIE)?.value;
  if (existing) return existing;

  const ownerId = crypto.randomUUID();
  store.set(OWNER_COOKIE, ownerId, ownerCookieOptions());
  return ownerId;
}

/**
 * "다른 기기로 옮기기" 복구 링크에서만 쓴다. Route Handler(/recover)가 토큰을 검증한 뒤
 * 그 ownerId로 쿠키를 덮어써 복구를 완료한다(기존 쿠키가 있었다면 그 자리의 소유권은
 * 이 호출 이후 사라진다 — "쿠키를 들고 있는 동안만 소유"라는 원래 설계와 동일한 트레이드오프).
 */
export async function setOwnerIdCookie(ownerId: string): Promise<void> {
  const store = await cookies();
  store.set(OWNER_COOKIE, ownerId, ownerCookieOptions());
}

function recoverySecret(): string {
  const secret = process.env.OWNER_RECOVERY_SECRET;
  if (!secret) throw new Error("OWNER_RECOVERY_SECRET 환경변수가 설정되어 있지 않습니다.");
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", recoverySecret()).update(payload).digest("base64url");
}

/**
 * 소유권 쿠키(ownerId)를 다른 기기로 옮길 수 있는 서명된 링크용 토큰을 만든다. DB 테이블을
 * 새로 만들지 않고(소유자 쿠키 자체가 이미 DB 스키마 변경 없이 동작했던 것과 같은 이유) 서버
 * 비밀키로 서명한 자기완결형(stateless) 토큰에 만료시각만 담는다 — 링크가 새면 그 ownerId의
 * 일정을 누구나 가져갈 수 있으므로 기본 30일로 유효기간을 제한한다.
 */
export function createRecoveryToken(ownerId: string, ttlMs = RECOVERY_TOKEN_TTL_MS): string {
  const payload = base64url(JSON.stringify({ o: ownerId, e: Date.now() + ttlMs }));
  return `${payload}.${sign(payload)}`;
}

/** 서명·만료를 확인하고 유효하면 ownerId를, 아니면 null을 반환한다. */
export function verifyRecoveryToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const { o, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof o !== "string" || typeof e !== "number" || Date.now() > e) return null;
    return o;
  } catch {
    return null;
  }
}
