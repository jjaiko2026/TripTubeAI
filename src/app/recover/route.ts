import { NextResponse, type NextRequest } from "next/server";
import { setOwnerIdCookie, verifyRecoveryToken } from "@/lib/owner";

/**
 * "다른 기기로 옮기기" 복구 링크의 도착지. createRecoveryLinkAction()이 만든 토큰을
 * 검증해 유효하면 이 기기의 owner_id 쿠키를 그 ownerId로 덮어쓰고 /plan/mine으로 보낸다
 * (쿠키를 들고 있는 동안만 소유라는 원래 설계와 동일하게, 이 기기의 이전 ownerId로 만든
 * 일정이 있었다면 이후 이 쿠키로는 더 이상 접근할 수 없다).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const ownerId = verifyRecoveryToken(token);

  const redirectUrl = new URL(ownerId ? "/plan/mine?recovered=done" : "/plan/mine?recovered=failed", req.url);
  if (ownerId) await setOwnerIdCookie(ownerId);

  return NextResponse.redirect(redirectUrl);
}
