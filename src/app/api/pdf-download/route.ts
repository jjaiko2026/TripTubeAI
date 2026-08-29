/**
 * 안드로이드 WebView 기반 인앱 브라우저(카카오톡/네이버 앱 등)는 blob: URL을 시스템 다운로드
 * 매니저로 넘기지 못해 클라이언트 anchor 다운로드가 조용히 실패한다. 클라이언트가 만든 PDF를
 * 그대로 업로드받아 Content-Disposition 헤더와 함께 실제 네트워크 응답으로 돌려주면, 진짜
 * HTTP 리소스가 되어 어떤 브라우저/WebView에서도 다운로드 매니저가 정상 처리한다.
 */
export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const filename = formData?.get("filename");
  if (!(file instanceof Blob) || typeof filename !== "string" || !filename) {
    return new Response("Bad Request", { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const encodedFilename = encodeURIComponent(filename);

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="itinerary.pdf"; filename*=UTF-8''${encodedFilename}`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
