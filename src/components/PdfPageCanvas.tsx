import React, { useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { RENDER_SCALE } from "../context/WorkspaceContext";

interface PdfPageCanvasProps {
  pdfDocument: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  onViewportCalculated?: (cssWidth: number, cssHeight: number) => void;
}

const PdfPageCanvas = React.memo(function PdfPageCanvas({
  pdfDocument,
  pageNumber,
  onViewportCalculated,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let renderTask: pdfjsLib.RenderTask | null = null;
    let cancelled = false;

    pdfDocument
      .getPage(pageNumber)
      .then(async (page) => {
        if (cancelled) {
          page.cleanup();
          return;
        }
        const cssViewport = page.getViewport({ scale: 1 });
        const renderViewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = canvasRef.current!;

        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;

        if (onViewportCalculated) {
          onViewportCalculated(cssViewport.width, cssViewport.height);
        }

        const ctx = canvas.getContext("2d")!;
        renderTask = page.render({
          canvas,
          canvasContext: ctx,
          viewport: renderViewport,
          annotationMode: 0,
        });
        await renderTask.promise;
      })
      .catch(() => {
        // Ignore cancellation errors
      });

    return () => {
      cancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDocument, pageNumber, onViewportCalculated]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "block",
        imageRendering: "crisp-edges",
      }}
    />
  );
});

export default PdfPageCanvas;
