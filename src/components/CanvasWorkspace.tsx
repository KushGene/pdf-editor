import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import "pdfjs-dist/legacy/web/pdf_viewer.css";
import "../utils/pdfjsConfig";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";
import { useAcroFormExtractor } from "../hooks/useAcroFormExtractor";
import PdfPageCanvas from "./PdfPageCanvas";
import FieldOverlay from "./FieldOverlay";

const OVERSCROLL = 200; // px – how much of the doc must stay visible at each edge

interface PageContainerProps {
  pdfDocument: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
}

function PageContainer({ pdfDocument, pageNumber }: PageContainerProps) {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState(false);
  const { deletePage } = useWorkspace();
  const { t } = useTranslation();

  const handleViewportCalculated = useCallback((w: number, h: number) => {
    setViewportSize({ width: w, height: h });
  }, []);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: viewportSize.width > 0 ? `${viewportSize.width}px` : undefined,
        height: viewportSize.height > 0 ? `${viewportSize.height}px` : undefined,
        flexShrink: 0,
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        backgroundColor: "#ffffff",
      }}
    >
      <PdfPageCanvas
        pdfDocument={pdfDocument}
        pageNumber={pageNumber}
        onViewportCalculated={handleViewportCalculated}
      />
      {viewportSize.width > 0 && viewportSize.height > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        >
          <FieldOverlay
            pageNumber={pageNumber}
            width={viewportSize.width}
            height={viewportSize.height}
          />
        </div>
      )}
      {hovered && (
        <button
          onClick={() => deletePage(pageNumber)}
          title={`${t("deletePage")} ${pageNumber}`}
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 24,
            height: 24,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(239, 68, 68, 0.9)",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            zIndex: 10,
            opacity: 0.9,
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export default function CanvasWorkspace() {
  const { t } = useTranslation();
  const {
    pdfBuffer,
    setFormFields,
    setLoadedFieldNames,
    setScale,
    scale,
    activeTool,
    panOffset,
    setPanOffset,
    previewMode,
    deletedPages,
  } = useWorkspace();

  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs so event handlers always see the latest values without re-registering
  const containerSizeRef = useRef({ width: 0, height: 0 });
  const docSizeRef = useRef({ width: 0, height: 0 }); // at scale=1, incl. padding
  const scaleRef = useRef(scale);
  const panOffsetRef = useRef(panOffset);
  const initializedRef = useRef(false);

  // Keep refs in sync with state/context
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);

  useAcroFormExtractor(pdfBuffer, setFormFields, setLoadedFieldNames);

  // ─── Load PDF ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfBuffer) {
      setPdfDocument(null);
      setPageCount(0);
      docSizeRef.current = { width: 0, height: 0 };
      initializedRef.current = false;
      return;
    }

    initializedRef.current = false;
    let cancelled = false;

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer.slice(0)),
      cMapUrl: "/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/standard_fonts/",
      enableXfa: true,
      stopAtErrors: false,
    });

    loadingTask.promise.then((doc) => {
      if (cancelled) return;
      console.log("[pdf] document loaded, pages:", doc.numPages);
      setPdfDocument(doc);
    }).catch((err) => {
      if (cancelled) return; // destroyed by cleanup – expected
      console.error("[pdf] failed to load document:", err);
    });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [pdfBuffer]);

  // ─── Recalculate visible pages and document size ─────────────────────────────
  useEffect(() => {
    if (!pdfDocument) {
      setPageCount(0);
      docSizeRef.current = { width: 0, height: 0 };
      return;
    }

    let cancelled = false;
    const allPages = Array.from({ length: pdfDocument.numPages }, (_, i) => i + 1);
    const visiblePages = allPages.filter((p) => !deletedPages.includes(p));

    Promise.all(
      visiblePages.map((pn) =>
        pdfDocument.getPage(pn).then((p) => p.getViewport({ scale: 1 }))
      )
    ).then((viewports) => {
      if (cancelled) return;
      const maxW = Math.max(...viewports.map((v) => v.width), 0);
      const totalH =
        visiblePages.length === 0
          ? 0
          : viewports.reduce((s, v) => s + v.height, 0) +
            (visiblePages.length - 1) * 32 +
            64;

      docSizeRef.current = { width: maxW + 64, height: totalH };
      setPageCount(visiblePages.length);
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDocument, deletedPages]);

  // ─── ResizeObserver – measure container, centre on first load ────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      containerSizeRef.current = { width, height };

      // Centre once both container and doc are known
      if (!initializedRef.current && docSizeRef.current.width > 0 && width > 0) {
        // docSizeRef.width = maxPageWidth + 64 (32px padding each side)
        const docW = docSizeRef.current.width;
        const pageW = docW - 64; // real max page width (strip padding)
        const fitScale = Math.min(1.0, (width - 64) / pageW);
        // centre the fit-content div in the viewport
        const cx = Math.max(0, (width - docW * fitScale) / 2);
        setScale(fitScale);
        setPanOffset({ x: cx, y: 48 });
        scaleRef.current = fitScale;
        panOffsetRef.current = { x: cx, y: 48 };
        initializedRef.current = true;
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [setScale, setPanOffset]);

  // Trigger centering when docSize becomes available after container is already mounted
  useEffect(() => {
    if (
      initializedRef.current ||
      docSizeRef.current.width === 0 ||
      containerSizeRef.current.width === 0
    ) return;

    const { width } = containerSizeRef.current;
    const docW = docSizeRef.current.width;
    const pageW = docW - 64;
    const fitScale = Math.min(1.0, (width - 64) / pageW);
    const cx = Math.max(0, (width - docW * fitScale) / 2);

    setScale(fitScale);
    setPanOffset({ x: cx, y: 48 });
    scaleRef.current = fitScale;
    panOffsetRef.current = { x: cx, y: 48 };
    initializedRef.current = true;
  }, [pageCount, setScale, setPanOffset]);

  // ─── Clamp helper (uses refs – safe inside event handlers) ───────────────────
  const clamp = useCallback((newX: number, newY: number) => {
    const { width: cw, height: ch } = containerSizeRef.current;
    const { width: dw, height: dh } = docSizeRef.current;
    const s = scaleRef.current;
    // Content div has padding: 32px on every side.
    // Keep at least OVERSCROLL px of actual page visible on each side.
    const PAD = 32;
    const minX = OVERSCROLL - (dw - PAD) * s; // right page edge visible
    const maxX = cw - OVERSCROLL - PAD * s;   // left page edge visible
    const minY = OVERSCROLL - (dh - PAD) * s;
    const maxY = ch - OVERSCROLL - PAD * s;

    return {
      x: Math.max(minX, Math.min(maxX, newX)),
      y: Math.max(minY, Math.min(maxY, newY)),
    };
  }, []);

  // ─── Wheel: Ctrl = zoom, plain = pan ─────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom toward cursor
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const prevScale = scaleRef.current;
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        const nextScale = Math.max(0.1, Math.min(5, prevScale + delta));

        // Adjust panOffset so the point under the cursor stays fixed
        const ratio = nextScale / prevScale;
        const newX = mouseX - ratio * (mouseX - panOffsetRef.current.x);
        const newY = mouseY - ratio * (mouseY - panOffsetRef.current.y);
        // Update scaleRef BEFORE clamp so clamp uses the new scale
        scaleRef.current = nextScale;
        const clamped = clamp(newX, newY);

        setScale(nextScale);
        setPanOffset(clamped);
        panOffsetRef.current = clamped;
      } else {
        const dx = e.shiftKey ? -e.deltaY : -e.deltaX;
        const dy = e.shiftKey ? 0 : -e.deltaY;
        const prev = panOffsetRef.current;
        const clamped = clamp(prev.x + dx, prev.y + dy);
        setPanOffset(clamped);
        panOffsetRef.current = clamped;
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clamp, setScale, setPanOffset]);

  // ─── Drag pan (hand tool) ────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el || activeTool !== "pan" || previewMode) return;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.style.cursor = "grabbing";
      e.preventDefault();
    };

    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const prev = panOffsetRef.current;
      const clamped = clamp(prev.x + dx, prev.y + dy);
      setPanOffset(clamped);
      panOffsetRef.current = clamped;
    };

    const onUp = () => {
      dragging = false;
      el.style.cursor = "grab";
    };

    el.style.cursor = "grab";
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      el.style.cursor = "";
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [activeTool, previewMode, clamp, setPanOffset]);

  const pageElements = useMemo(() => {
    if (!pdfDocument) return null;
    const allPages = Array.from({ length: pdfDocument.numPages }, (_, i) => i + 1);
    const visiblePages = allPages.filter((p) => !deletedPages.includes(p));
    return visiblePages.map((pn) => (
      <PageContainer key={pn} pdfDocument={pdfDocument} pageNumber={pn} />
    ));
  }, [pdfDocument, deletedPages]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        backgroundColor: "#1e1e1e",
      }}
    >
      {pdfBuffer && pdfDocument ? (
        <div
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
            transformOrigin: "0 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",  // centres narrower pages within fit-content width
            gap: "32px",
            padding: "32px",
            width: "fit-content",  // exact content width – no 100%-width double-centering
            willChange: "transform",
          }}
        >
          {pageElements}
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#6b7280",
            fontSize: "0.875rem",
          }}
        >
          {t("noPdfLoaded")}
        </div>
      )}
    </div>
  );
}
