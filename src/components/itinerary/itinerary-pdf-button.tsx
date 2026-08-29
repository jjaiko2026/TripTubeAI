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
  // JPEG로 바꿔도 육안 차이는 거의 없이 용량만 크게 줄어든다.
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.85), "JPEG", x, MARGIN_MM, widthMm, heightMm);
}

/** PDF 1페이지 맨 위에만 들어가는 제목. 일정 화면(일정 만들기 결과 페이지)에는 노출하지
 *  않으므로 화면 DOM에 넣지 않고, 캡처 직전에만 화면 밖(위쪽 멀리)에 임시로 렌더링해
 *  html2canvas로 찍은 뒤 바로 제거합니다. */
function createOffscreenTitleElement(titleText: string): HTMLElement {
  const el = document.createElement("h2");
  el.textContent = titleText;
  el.setAttribute("aria-hidden", "true");
  el.style.position = "fixed";
  el.style.top = "-10000px";
  el.style.left = "0";
  el.style.width = `${CAPTURE_WINDOW_WIDTH_PX}px`;
  // 한글은 시스템 폰트로, 숫자/영문(Geist)은 다른 폰트로 렌더링돼 스크립트가 섞이면
  // html2canvas가 줄 안에서 세로 위치를 다르게 잡는 경우가 있다(실기기에서 숫자만 반 줄
  // 아래로 밀리고 위쪽이 잘리는 현상 확인). line-height/여백을 넉넉히 둬서 어떤 폰트로
  // 그려지든 잘리지 않게 여유 공간을 준다.
  el.style.lineHeight = "1.6";
  el.style.paddingTop = "0.4em";
  el.style.paddingBottom = "0.2em";
  el.className = "text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl";
  return el;
}

/** 서로 떨어져 있는 여러 블록(예: 요약 카드 + 알아두면 좋은 정보 + 일자별 순서도)을 각각
 *  따로 캡처한 뒤 세로로 이어 붙여, 한 페이지에 함께 들어갈 하나의 이미지로 합칩니다. */
async function captureStacked(
  html2canvas: typeof import("html2canvas-pro").default,
  elements: HTMLElement[]
): Promise<HTMLCanvasElement> {
  const canvases = await Promise.all(
    elements.map((el) =>
      html2canvas(el, { scale: 2, backgroundColor: "#ffffff", windowWidth: CAPTURE_WINDOW_WIDTH_PX })
    )
  );
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

  const titleEl = createOffscreenTitleElement(titleText);
  document.body.appendChild(titleEl);

  try {
    const pageGroups: HTMLElement[][] = [[titleEl, ...summaryEls], ...dayEls.map((el) => [el])];
    if (pageGroups.length === 0) return null;
    // 안내 문구(data-pdf-section)는 그 자체로 새 페이지를 차지하면 마지막 한 줄 때문에 페이지가
    // 하나 더 늘어나므로, 마지막 페이지(보통 마지막 날짜)의 내용 아래에 이어 붙인다.
    pageGroups[pageGroups.length - 1].push(...trailingEls);

    const canvases: HTMLCanvasElement[] = [];
    for (const group of pageGroups) {
      canvases.push(await captureStacked(html2canvas, group));
    }
    return canvases;
  } finally {
    titleEl.remove();
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
 * 짧은 일정도 동일) 카카오톡에서 "네트워크 연결이 원활하지 않습니다"로 실패했다 — 카카오톡
 * 인앱 브라우저가 파일 입력 기반 제출 자체를 막는 것으로 보인다. 대신 PDF를 base64 텍스트로
 * 바꿔 평범한 hidden 필드로 보낸다 — 파일 입력을 전혀 쓰지 않는 가장 기본적인 폼 제출이라
 * 막힐 이유가 없다.
 */
async function downloadViaServerRoundTrip(blob: Blob, fileName: string) {
  const fileBase64 = await blobToBase64(blob);

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
  const canvasesRef = useRef<HTMLCanvasElement[] | null>(null);

  async function handlePreview() {
    setIsGenerating(true);
    setError(false);
    try {
      const canvases = await capturePageCanvases(targetId, title);
      if (!canvases) {
        setError(true);
        return;
      }
      canvasesRef.current = canvases;
      setPreviewPages(canvases.map((canvas) => canvas.toDataURL("image/jpeg", 0.85)));
    } catch {
      setError(true);
    } finally {
      setIsGenerating(false);
    }
  }

  function closePreview() {
    canvasesRef.current = null;
    setPreviewPages(null);
  }

  async function handleDownload() {
    if (!canvasesRef.current) return;
    setIsDownloading(true);
    try {
      const blob = await buildPdfBlob(canvasesRef.current);
      await downloadViaServerRoundTrip(blob, fileName);
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
