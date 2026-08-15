"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

export function ItineraryPdfButton({ targetId, fileName }: { targetId: string; fileName: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick() {
    const element = document.getElementById(targetId);
    if (!element) return;

    setIsGenerating(true);
    setError(false);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: "#ffffff",
        ignoreElements: (el) => el.hasAttribute("data-pdf-exclude"),
      });
      const imgData = canvas.toDataURL("image/png");
      const imgHeightMm = (canvas.height * A4_WIDTH_MM) / canvas.width;

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let heightLeft = imgHeightMm;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, A4_WIDTH_MM, imgHeightMm);
      heightLeft -= A4_HEIGHT_MM;

      while (heightLeft > 0) {
        position = heightLeft - imgHeightMm;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, A4_WIDTH_MM, imgHeightMm);
        heightLeft -= A4_HEIGHT_MM;
      }

      pdf.save(fileName);
    } catch {
      setError(true);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">PDF 생성에 실패했어요</span>}
      <Button variant="outline" size="sm" onClick={handleClick} disabled={isGenerating}>
        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {isGenerating ? "PDF 생성 중..." : "PDF 다운로드"}
      </Button>
    </div>
  );
}
