/**
 * 안드로이드 WebView 기반 인앱 브라우저(카카오톡/네이버 앱 등)는 blob: URL을 시스템 다운로드
 * 매니저로 넘기지 못해 클라이언트 anchor 다운로드가 조용히 실패한다. 클라이언트가 만든 PDF를
 * 그대로 업로드받아 Content-Disposition 헤더와 함께 실제 네트워크 응답으로 돌려주면, 진짜
 * HTTP 리소스가 되어 어떤 브라우저/WebView에서도 다운로드 매니저가 정상 처리한다.
 *
 * PDF는 <input type="file">이 아니라 fileBase64 텍스트 필드로 받는다 — 카카오톡 인앱
 * 브라우저가 파일 입력 기반 폼 제출 자체를 막는 것으로 보여(실기기 확인, 파일 크기 무관하게
 * 실패), 파일 입력을 전혀 쓰지 않는 일반 hidden 필드로 우회했다.
 */
export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const fileBase64 = formData?.get("fileBase64");
  const filename = formData?.get("filename");
  if (typeof fileBase64 !== "string" || typeof filename !== "string" || !fileBase64 || !filename) {
    return new Response("Bad Request", { status: 400 });
  }

  const bytes = Buffer.from(fileBase64, "base64");
  const encodedFilename = encodeURIComponent(filename);

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="itinerary.pdf"; filename*=UTF-8''${encodedFilename}`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
