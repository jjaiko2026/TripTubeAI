import dotenv from "dotenv";
import http from "node:http";

dotenv.config({ path: ".env.local" });

// 최초 1회 로컬에서 실행해 GOOGLE_OAUTH_REFRESH_TOKEN을 발급받는 스크립트입니다.
// 실행 전 .env.local에 GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET을 먼저 넣어두세요
// (Google Cloud Console에서 만든 "데스크톱 앱" 타입 OAuth 클라이언트의 값).
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

async function main() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("먼저 .env.local에 GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET을 넣어주세요.");
    process.exit(1);
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/spreadsheets");

  console.log("\n아래 URL을 브라우저에서 열어 로그인하고 동의해주세요:\n");
  console.log(authUrl.toString() + "\n");

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== "/oauth2callback") return;

      const authCode = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.end(error ? "인증 실패. 터미널을 확인하세요." : "인증 완료! 이 탭은 닫으셔도 됩니다.");
      server.close();

      if (error) reject(new Error(error));
      else if (authCode) resolve(authCode);
    });
    server.listen(PORT, () => console.log(`(${REDIRECT_URI} 에서 대기 중...)\n`));
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    console.error(`토큰 교환 실패 (${tokenRes.status}): ${await tokenRes.text()}`);
    process.exit(1);
  }

  const tokens = (await tokenRes.json()) as { refresh_token?: string };
  if (!tokens.refresh_token) {
    console.error(
      "refresh_token이 발급되지 않았어요. https://myaccount.google.com/permissions 에서 이 앱의 접근 권한을 " +
        "제거한 뒤 다시 실행해보세요 (재동의를 강제하기 위함)."
    );
    process.exit(1);
  }

  console.log("\n아래 값을 .env.local에 추가하세요:\n");
  console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
