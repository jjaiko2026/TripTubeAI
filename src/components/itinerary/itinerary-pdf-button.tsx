"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 10;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - MARGIN_MM * 2;
const SECTION_GAP_MM = 4;

async function generatePdfBlob(targetId: string): Promise<Blob | null> {
  const container = document.getElementById(targetId);
  if (!container) return null;

  // 카드(data-slot="card")와 안내 문구 같은 블록(data-pdf-section)을 각각 따로 캡처해서,
  // 페이지 경계에 걸치면 그 블록을 자르지 않고 통째로 다음 페이지로 넘깁니다.
  const sections = Array.from(
    container.querySelectorAll<HTMLElement>('[data-slot="card"], [data-pdf-section]')
  ).filter((el) => !el.closest("[data-pdf-exclude]"));
  if (sections.length === 0) return null;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let cursorY = MARGIN_MM;
  let pendingNewPage = false;

  for (const section of sections) {
    const canvas = await html2canvas(section, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const imgHeightMm = (canvas.height * CONTENT_WIDTH_MM) / canvas.width;

    if (pendingNewPage) {
      pdf.addPage();
      cursorY = MARGIN_MM;
      pendingNewPage = false;
    }

    if (imgHeightMm > CONTENT_HEIGHT_MM) {
      // 카드 하나가 한 페이지보다 길면(예: 일정이 아주 많은 날) 그 카드 안에서만 어쩔 수 없이 자릅니다.
      if (cursorY > MARGIN_MM) {
        pdf.addPage();
        cursorY = MARGIN_MM;
      }
      let remaining = imgHeightMm;
      let offset = 0;
      while (remaining > 0) {
        if (offset > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", MARGIN_MM, MARGIN_MM - offset, CONTENT_WIDTH_MM, imgHeightMm);
        remaining -= CONTENT_HEIGHT_MM;
        offset += CONTENT_HEIGHT_MM;
      }
      pendingNewPage = true;
      continue;
    }

    if (cursorY + imgHeightMm > PAGE_HEIGHT_MM - MARGIN_MM) {
      pdf.addPage();
      cursorY = MARGIN_MM;
    }
    pdf.addImage(imgData, "PNG", MARGIN_MM, cursorY, CONTENT_WIDTH_MM, imgHeightMm);
    cursorY += imgHeightMm + SECTION_GAP_MM;
  }

  return pdf.output("blob");
}

export function ItineraryPdfButton({ targetId, fileName }: { targetId: string; fileName: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  // 언마운트 시에도 마지막으로 만든 미리보기 URL을 정리합니다.
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  async function handlePreview() {
    setIsGenerating(true);
    setError(false);
    try {
      const blob = await generatePdfBlob(targetId);
      if (!blob) {
        setError(true);
        return;
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setError(true);
    } finally {
      setIsGenerating(false);
    }
  }

  function closePreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    setPreviewUrl(null);
  }

  function handleDownload() {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = fileName;
    a.click();
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

      <Dialog open={previewUrl !== null} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>PDF 미리보기</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <iframe src={previewUrl} title="일정 PDF 미리보기" className="h-[70vh] w-full rounded-md border" />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closePreview}>
              닫기
            </Button>
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4" /> 다운로드
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
