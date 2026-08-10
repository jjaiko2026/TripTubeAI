import { cookies } from "next/headers";

export const SESSION_COOKIE = "ttai_session";

export interface SessionUser {
  name: string;
  email: string;
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf-8");
    const parsed = JSON.parse(json);
    if (!parsed?.name || !parsed?.email) return null;
    return parsed as SessionUser;
  } catch {
    return null;
  }
}
