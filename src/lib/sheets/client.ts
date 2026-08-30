// 다른 외부 API 연동(유튜브/네이버/Geocoding)과 마찬가지로 별도 SDK 없이 fetch로 직접
// REST 호출합니다 (googleapis 패키지는 무거워서 뺐습니다).
import { createSign } from "node:crypto";

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

interface SheetProperties {
  sheetId: number;
  title: string;
}

// 인증 방식은 2가지 중 설정된 것을 자동 선택한다:
//  1) 서비스 계정 (GOOGLE_SA_CLIENT_EMAIL + GOOGLE_SA_PRIVATE_KEY) — 권장. 토큰 만료·동의
//     화면·게시가 전혀 없다. 스프레드시트를 서비스 계정 이메일에 "편집자"로 공유하면 끝.
//  2) OAuth 리프레시 토큰 (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN) — 레거시 폴백.
//     OAuth 동의 화면이 "테스트" 상태면 리프레시 토큰이 7일마다 만료되므로 1)을 권장한다.
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** 서비스 계정 개인키로 JWT를 서명해 access token으로 교환한다(라이브러리 없이 직접). */
async function fetchServiceAccountToken(
  clientEmail: string,
  privateKeyPem: string
): Promise<{ token: string; expiresIn: number }> {
  // env 변수에 저장된 개인키는 줄바꿈이 \n 리터럴로 이스케이프된 경우가 많다.
  const privateKey = privateKeyPem.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SHEETS_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  const assertion = `${signingInput}.${signature.toString("base64url")}`;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google 서비스 계정 토큰 발급 실패 (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { token: json.access_token, expiresIn: json.expires_in };
}

/** OAuth 리프레시 토큰으로 access token을 갱신한다(레거시 경로). */
async function fetchOAuthToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google OAuth 토큰 갱신 실패 (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { token: json.access_token, expiresIn: json.expires_in };
}

async function getAccessToken(): Promise<string> {
  if (!SPREADSHEET_ID) {
    throw new Error("환경변수 GOOGLE_SHEETS_SPREADSHEET_ID가 설정되지 않았습니다.");
  }
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const saEmail = process.env.GOOGLE_SA_CLIENT_EMAIL;
  const saKey = process.env.GOOGLE_SA_PRIVATE_KEY;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  let result: { token: string; expiresIn: number };
  if (saEmail && saKey) {
    result = await fetchServiceAccountToken(saEmail, saKey);
  } else if (clientId && clientSecret && refreshToken) {
    result = await fetchOAuthToken(clientId, clientSecret, refreshToken);
  } else {
    throw new Error(
      "Google Sheets 인증 환경변수가 없습니다. 서비스 계정 방식(GOOGLE_SA_CLIENT_EMAIL / " +
        "GOOGLE_SA_PRIVATE_KEY) 또는 OAuth 방식(GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / " +
        "GOOGLE_OAUTH_REFRESH_TOKEN) 중 하나를 설정하세요. (공통: GOOGLE_SHEETS_SPREADSHEET_ID)"
    );
  }

  cachedAccessToken = { token: result.token, expiresAt: Date.now() + result.expiresIn * 1000 };
  return cachedAccessToken.token;
}

async function sheetsApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  const res = await fetch(`${SHEETS_API_BASE}/${SPREADSHEET_ID}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Google Sheets API 오류 (${res.status}): ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** 지정한 이름의 탭이 스프레드시트에 없으면 만들고, 그 탭의 sheetId(숫자)를 반환합니다. */
async function ensureSheetExists(sheetName: string): Promise<number> {
  const spreadsheet = await sheetsApiFetch<{ sheets?: { properties?: SheetProperties }[] }>(
    "?fields=sheets.properties"
  );
  const existing = spreadsheet.sheets?.find((s) => s.properties?.title === sheetName);
  if (existing?.properties?.sheetId != null) return existing.properties.sheetId;

  const created = await sheetsApiFetch<{ replies: { addSheet: { properties: SheetProperties } }[] }>(
    ":batchUpdate",
    { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }) }
  );
  return created.replies[0].addSheet.properties.sheetId;
}

/** sheetName 탭 전체를 rows(헤더 포함)로 덮어씁니다. */
export async function overwriteSheet(sheetName: string, rows: string[][]): Promise<void> {
  await ensureSheetExists(sheetName);
  const range = encodeURIComponent(sheetName);
  await sheetsApiFetch(`/values/${range}:clear`, { method: "POST", body: JSON.stringify({}) });
  await sheetsApiFetch(`/values/${range}!A1?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: rows }),
  });
}

/** sheetName 탭 전체 값을 2차원 문자열 배열로 읽어옵니다 (헤더 포함, 빈 셀은 ""). */
export async function readSheet(sheetName: string): Promise<string[][]> {
  await ensureSheetExists(sheetName);
  const res = await sheetsApiFetch<{ values?: string[][] }>(`/values/${encodeURIComponent(sheetName)}`);
  return res.values ?? [];
}

/**
 * 지정한 열(0-based, 헤더 제외한 rowCount행)에 드롭다운 선택지를 달아, 관리자가 오타 없이
 * 값을 고를 수 있게 합니다. 목록에 없는 값을 직접 입력해도 막지는 않습니다(strict: false)
 * — 실수로 잘못 입력해도 시트가 잠기지 않게 하기 위해서입니다.
 */
export async function setDropdownColumn(
  sheetName: string,
  columnIndex: number,
  options: string[],
  rowCount: number
): Promise<void> {
  if (rowCount <= 0) return;
  const sheetId = await ensureSheetExists(sheetName);

  await sheetsApiFetch(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: rowCount + 1,
              startColumnIndex: columnIndex,
              endColumnIndex: columnIndex + 1,
            },
            rule: {
              condition: { type: "ONE_OF_LIST", values: options.map((value) => ({ userEnteredValue: value })) },
              showCustomUi: true,
              strict: false,
            },
          },
        },
      ],
    }),
  });
}

/**
 * 헤더 행(0행) 특정 열들에 셀 메모(note)를 붙입니다. 헤더 텍스트 자체(=import가 컬럼을 찾는
 * 매칭 키)는 건드리지 않고, 마우스를 올리면 보이는 보조 설명만 추가하는 용도입니다
 * (KNOWLEDGE_REVIEW 시트의 review_note/admin_status 입력 혼동 방지 — PHASE 후속 UX 개선).
 */
export async function setHeaderNotes(sheetName: string, notesByColumnIndex: Record<number, string>): Promise<void> {
  const entries = Object.entries(notesByColumnIndex);
  if (entries.length === 0) return;
  const sheetId = await ensureSheetExists(sheetName);

  await sheetsApiFetch(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: entries.map(([columnIndex, note]) => ({
        updateCells: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: Number(columnIndex),
            endColumnIndex: Number(columnIndex) + 1,
          },
          rows: [{ values: [{ note }] }],
          fields: "note",
        },
      })),
    }),
  });
}
