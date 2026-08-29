"use client";

import { useRef, useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 10;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - MARGIN_MM * 2;
const SECTION_GAP_MM = 4;

// 실제 화면 폭(특히 모바일)과 무관하게 항상 sm: 브레이크포인트가 적용된 넓은 레이아웃으로
// 캡처해서, PDF가 어느 기기에서 뽑든 동일하게 반응형 레이아웃(요약 카드 4열 등)으로 나오게 합니다.
const CAPTURE_WINDOW_WIDTH_PX = 820;

/** 캡처한 이미지를 한 페이지 안에 맞춥니다. 폭은 항상 페이지 폭에 맞추고, 내용이 길어 한
 *  페이지 높이를 넘으면 비율을 유지한 채 전체를 축소해서 페이지 안에 통째로 담습니다(중간이
 *  잘리는 대신 글씨가 작아짐). 축소된 경우 남는 폭만큼 가운데 정렬합니다. */
function drawFittedToPage(pdf: import("jspdf").jsPDF, canvas: HTMLCanvasElement) {
  let widthMm = CONTENT_WIDTH_MM;
  let heightMm = (canvas.height * CONTENT_WIDTH_MM) / canvas.width;

  if (heightMm > CONTENT_HEIGHT_MM) {
    const scale = CONTENT_HEIGHT_MM / heightMm;
    heightMm = CONTENT_HEIGHT_MM;
    widthMm = CONTENT_WIDTH_MM * scale;
  }

  const x = MARGIN_MM + (CONTENT_WIDTH_MM - widthMm) / 2;
  // PNG(무손실)로 넣으면 날짜가 많은 일정은 PDF가 수 MB까지 커져 /api/pdf-download 요청이
  // 서버리스 함수 페이로드 한도(413)에 걸렸다(실기기 확인). 캡처 내용은 흰 배경 위 텍스트/카드라
  // JPEG로 바꿔도 육안 차이는 거의 없이 용량만 크게 줄어든다. 품질을 0.85→0.72로 한 번 더
  // 낮춰, 모바일 네트워크에서 왕복 전송 중 끊길 위험을 줄인다(전송 용량이 작을수록 유리).
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.72), "JPEG", x, MARGIN_MM, widthMm, heightMm);
}

// PDF 제목의 폰트/크기. sm: 브레이크포인트가 적용된 text-3xl(1.875rem)에 맞춘 값이라
// CAPTURE_WINDOW_WIDTH_PX 강제 폭 조건과 짝을 이룬다.
const TITLE_FONT_SIZE_PX = 30;
// 제목이 페이지 맨 위에 너무 바짝 붙어 보인다는 피드백으로 위쪽 여백을 아래쪽보다 넉넉히 둔다.
const TITLE_TOP_PADDING_PX = 22;
const TITLE_BOTTOM_PADDING_PX = 14;
const TITLE_CANVAS_HEIGHT_PX = TITLE_TOP_PADDING_PX + TITLE_FONT_SIZE_PX + TITLE_BOTTOM_PADDING_PX;
// 한글·숫자·영문을 모두 포함하는 시스템 한글 폰트 순서(플랫폼마다 이름이 달라 여러 개
// 나열 — 각 OS에서 앞쪽에 있는 것부터 있는 걸 쓴다). 앱 전체에 쓰이는 Geist는 라틴
// 전용이라 이 폰트 목록에서 제외한다.
const TITLE_FONT_FAMILY = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Noto Sans CJK KR", sans-serif';

/**
 * PDF 1페이지 맨 위에만 들어가는 제목을 html2canvas를 거치지 않고 Canvas 2D의
 * fillText()로 직접 그립니다. html2canvas는 DOM을 자체 알고리즘으로 다시 그리는데,
 * 한글과 숫자/영문이 한 줄에 섞이면 베이스라인을 잘못 계산하거나(반 줄 밀림),
 * inline-block으로 스크립트별 span을 나눠도 폰트별 글자 높이 차이까지는 못 잡는 등
 * 시도할 때마다 다른 방식으로 깨졌다(전부 실기기 확인). fillText는 브라우저가 화면에
 * 글자를 그릴 때 쓰는 것과 동일한 텍스트 셰이핑 엔진을 그대로 쓰므로, 화면에 정상
 * 표시되는 다른 모든 텍스트와 마찬가지로 애초에 이런 문제가 생기지 않는다.
 */
function drawTitleCanvas(titleText: string): HTMLCanvasElement {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = CAPTURE_WINDOW_WIDTH_PX * scale;
  canvas.height = TITLE_CANVAS_HEIGHT_PX * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CAPTURE_WINDOW_WIDTH_PX, TITLE_CANVAS_HEIGHT_PX);
  ctx.fillStyle = "#0a0a0a"; // globals.css --foreground(라이트 모드) 근사값 — PDF는 항상 흰 배경이라 고정
  ctx.font = `700 ${TITLE_FONT_SIZE_PX}px ${TITLE_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(titleText, CAPTURE_WINDOW_WIDTH_PX / 2, TITLE_TOP_PADDING_PX);
  return canvas;
}

/** 캔버스 여러 장을 세로로 이어 붙여 한 페이지에 들어갈 하나의 이미지로 합칩니다. */
function stackCanvases(canvases: HTMLCanvasElement[]): HTMLCanvasElement {
  if (canvases.length === 1) return canvases[0];

  const gapPx = Math.round(SECTION_GAP_MM * (canvases[0].width / CONTENT_WIDTH_MM));
  const width = Math.max(...canvases.map((c) => c.width));
  const height = canvases.reduce((sum, c) => sum + c.height, 0) + gapPx * (canvases.length - 1);

  const composite = document.createElement("canvas");
  composite.width = width;
  composite.height = height;
  const ctx = composite.getContext("2d");
  if (!ctx) return canvases[0];
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  let y = 0;
  for (const c of canvases) {
    // 캡처된 블록마다 실제 폭이 다를 수 있어(제목은 강제 폭 820px, 카드들은 페이지 컨테이너
    // 폭), 항상 왼쪽으로 그리면 폭이 좁은 블록이 전체적으로 왼쪽에 쏠려 보입니다. 합성 캔버스
    // 폭 기준으로 가운데 정렬해서 그립니다.
    const x = (width - c.width) / 2;
    ctx.drawImage(c, x, y);
    y += c.height + gapPx;
  }
  return composite;
}

/** 서로 떨어져 있는 여러 블록(예: 요약 카드 + 알아두면 좋은 정보 + 일자별 순서도)을 각각
 *  따로 캡처한 뒤 세로로 이어 붙입니다. */
async function captureStacked(
  html2canvas: typeof import("html2canvas-pro").default,
  elements: HTMLElement[]
): Promise<HTMLCanvasElement> {
  // 다운로드가 PDF를 /api/pdf-download로 왕복 전송해야 해서(인앱 브라우저의 blob 다운로드
  // 제약 우회용, downloadViaServerRoundTrip() 참고), 모바일 네트워크에서는 전송 용량이
  // 클수록 중간에 끊길 위험이 커진다(실기기에서 "다운로드 중"이 뜨다 네트워크 오류로
  // 실패하는 것 확인). scale 2 → 1.5로 낮춰 픽셀 수 자체를 줄인다(화면/인쇄 모두 여전히
  // 충분히 선명한 해상도).
  const canvases = await Promise.all(
    elements.map((el) =>
      html2canvas(el, { scale: 1.5, backgroundColor: "#ffffff", windowWidth: CAPTURE_WINDOW_WIDTH_PX })
    )
  );
  return stackCanvases(canvases);
}

async function capturePageCanvases(targetId: string, titleText: string): Promise<HTMLCanvasElement[] | null> {
  const container = document.getElementById(targetId);
  if (!container) return null;

  // 1페이지: 제목 + 여행지 정보 + 알아두면 좋은 정보 + 일자별 순서도(모두
  // data-pdf-page="summary", 제목은 화면 밖 임시 요소). 2페이지부터: 하루 일정당 한 페이지.
  // 지도 카드처럼 위 셀렉터에 해당하지 않는 블록은 PDF에서 자연히 빠집니다.
  const summaryEls = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-page="summary"]'));
  const dayEls = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-day]"));
  const trailingEls = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-section]"));

  const { default: html2canvas } = await import("html2canvas-pro");

  // 일차 카드가 접혀 있어도(itinerary-days-list.tsx의 <details>) PDF에는 전체가 나와야 한다.
  // .pdf-capturing 클래스가 붙는 동안 CSS가 접힌 내용을 강제로 펼친다(globals.css). React
  // 상태를 건드리지 않아 화면 깜빡임이 없다.
  container.classList.add("pdf-capturing");

  try {
    const pageGroups: HTMLElement[][] = [summaryEls, ...dayEls.map((el) => [el])];
    if (pageGroups.length === 0) return null;
    // 안내 문구(data-pdf-section)는 그 자체로 새 페이지를 차지하면 마지막 한 줄 때문에 페이지가
    // 하나 더 늘어나므로, 마지막 페이지(보통 마지막 날짜)의 내용 아래에 이어 붙인다.
    pageGroups[pageGroups.length - 1].push(...trailingEls);

    const canvases: HTMLCanvasElement[] = [];
    for (let i = 0; i < pageGroups.length; i++) {
      const group = pageGroups[i];
      const captured = group.length > 0 ? [await captureStacked(html2canvas, group)] : [];
      // 1페이지 맨 위에만 제목을 붙인다(html2canvas가 아닌 fillText로 직접 그린 캔버스).
      canvases.push(i === 0 ? stackCanvases([drawTitleCanvas(titleText), ...captured]) : captured[0]);
    }
    return canvases;
  } finally {
    container.classList.remove("pdf-capturing");
  }
}

async function buildPdfBlob(canvases: HTMLCanvasElement[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  canvases.forEach((canvas, i) => {
    if (i > 0) pdf.addPage();
    drawFittedToPage(pdf, canvas);
  });
  return pdf.output("blob");
}

/** Blob을 base64 문자열로 바꾼다. 한 번에 스프레드하면 아주 큰 파일에서 인자 개수 한도에
 *  걸릴 수 있어 청크 단위로 처리한다. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * blob: URL을 <a download>로 저장하는 방식은 안드로이드 WebView 기반 인앱 브라우저
 * (카카오톡/네이버 앱 등)에서 조용히 실패한다 — 그 WebView들의 다운로드 매니저가 blob: URL을
 * 못 읽기 때문이다(실기기 확인됨). 대신 PDF를 /api/pdf-download로 그대로 왕복시켜 진짜
 * Content-Disposition 응답으로 돌려받으면 어떤 브라우저/WebView에서도 정상 처리된다.
 *
 * 처음엔 화면 이동을 막으려고 숨겨진 iframe을 제출 대상으로 썼는데, 카카오톡 인앱 브라우저는
 * 서브프레임으로의 다운로드 자체를 조용히 무시했다(실기기 확인). 최상위 프레임에서 제출해야
 * 하며, 대부분의 브라우저는 Content-Disposition: attachment 응답을 페이지 이동 없이 다운로드만
 * 가로채므로(표준 동작) 현재 페이지에 그대로 머문다.
 *
 * <input type="file">에 DataTransfer로 파일을 채워 넣는 방식은, 파일 크기와 무관하게(1박2일
 * 짧은 일정도 동일) 카카오톡에서 "네트워크 연결이 원활하지 않습니다"로 실패했다. base64
 * 텍스트를 평범한 hidden 필드로 바꿔도 여전히 같은 크기 무관 실패가 재현됐는데 — 원인은
 * 파일 형식이 아니라, 버튼 클릭과 이 제출 사이에 낀 비동기 PDF 생성 때문에 "진짜 사용자
 * 동작" 시점에서 너무 멀어져 카카오톡이 제출 자체를 막는 것으로 보인다. 그래서 이 함수는
 * fileBase64를 인자로 미리 받아 async 작업 없이 동기적으로만 동작한다 — 호출부(클릭
 * 핸들러)가 await 없이 바로 부를 수 있어야 클릭 시점에 최대한 가깝게 제출된다.
 */
function submitDownloadForm(fileBase64: string, fileName: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/pdf-download";
  form.style.display = "none";

  const dataInput = document.createElement("input");
  dataInput.type = "hidden";
  dataInput.name = "fileBase64";
  dataInput.value = fileBase64;
  form.appendChild(dataInput);

  const filenameInput = document.createElement("input");
  filenameInput.type = "hidden";
  filenameInput.name = "filename";
  filenameInput.value = fileName;
  form.appendChild(filenameInput);

  document.body.appendChild(form);
  form.submit();
  setTimeout(() => form.remove(), 5000);
}

export function ItineraryPdfButton({
  targetId,
  fileName,
  title,
}: {
  targetId: string;
  fileName: string;
  title: string;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState(false);
  // 모바일 브라우저(특히 iOS Safari)는 <iframe>에 blob: URL로 넣은 PDF를 렌더링하지
  // 못하는 경우가 많아, 미리보기는 캡처한 각 페이지 캔버스를 이미지로 직접 보여준다.
  // 실제 PDF 파일은 다운로드할 때만 만든다.
  const [previewPages, setPreviewPages] = useState<string[] | null>(null);
  // 다운로드 버튼 클릭과 실제 form.submit() 사이에 비동기 작업(PDF 생성)이 끼면, 클릭이라는
  // "진짜 사용자 동작" 시점에서 너무 멀어져 카카오톡 인앱 브라우저가 제출을 막는 것으로
  // 보인다(파일 입력이든 base64 텍스트든 방식과 무관하게 실기기에서 재현됨). 그래서 무거운
  // 작업(캡처+PDF 인코딩)은 미리보기를 여는 시점에 전부 끝내 두고, 다운로드 버튼은 클릭 즉시
  // (await 없이) form.submit()만 하도록 분리한다.
  const pdfBase64Ref = useRef<string | null>(null);

  async function handlePreview() {
    setIsGenerating(true);
    setError(false);
    try {
      const canvases = await capturePageCanvases(targetId, title);
      if (!canvases) {
        setError(true);
        return;
      }
      const blob = await buildPdfBlob(canvases);
      pdfBase64Ref.current = await blobToBase64(blob);
      setPreviewPages(canvases.map((canvas) => canvas.toDataURL("image/jpeg", 0.85)));
    } catch {
      setError(true);
    } finally {
      setIsGenerating(false);
    }
  }

  function closePreview() {
    pdfBase64Ref.current = null;
    setPreviewPages(null);
  }

  function handleDownload() {
    if (!pdfBase64Ref.current) return;
    setIsDownloading(true);
    try {
      submitDownloadForm(pdfBase64Ref.current, fileName);
    } catch {
      setError(true);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-destructive">PDF 생성에 실패했어요</span>}
        <Button variant="outline" size="sm" onClick={handlePreview} disabled={isGenerating}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          {isGenerating ? "PDF 생성 중..." : "PDF 미리보기"}
        </Button>
      </div>

      <Dialog open={previewPages !== null} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>PDF 미리보기</DialogTitle>
          </DialogHeader>
          {previewPages && (
            <div className="flex h-[70vh] flex-col gap-3 overflow-y-auto rounded-md border bg-muted/30 p-2">
              {previewPages.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`PDF ${i + 1}페이지`} className="w-full rounded-sm border bg-white" />
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closePreview}>
              닫기
            </Button>
            <Button onClick={handleDownload} disabled={isDownloading}>
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              다운로드
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
