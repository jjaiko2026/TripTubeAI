// 다른 외부 API 연동(유튜브/네이버/Geocoding)과 마찬가지로 별도 SDK 없이 fetch로 직접
// REST 호출합니다 (googleapis 패키지는 무거워서 뺐습니다).
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

interface SheetProperties {
  sheetId: number;
  title: string;
}

// 서비스 계정 키는 조직 정책(iam.disableServiceAccountKeyCreation)으로 막힌 계정이 많아,
// 대신 사용자 본인 계정으로 로그인하는 OAuth 리프레시 토큰 방식을 씁니다 (scripts/get-google-refresh-token.ts로
// 최초 1회 발급). 이 방식은 그 조직 정책과 무관합니다.
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken || !SPREADSHEET_ID) {
    throw new Error(
      "Google Sheets 연동에 필요한 환경변수(GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / " +
        "GOOGLE_OAUTH_REFRESH_TOKEN / GOOGLE_SHEETS_SPREADSHEET_ID)가 설정되지 않았습니다."
    );
  }

  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth 토큰 갱신 실패 (${res.status}): ${await res.text()}`);

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
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
