import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useWorkspace } from "../context/WorkspaceContext";

const CANVAS_W = 560;
const CANVAS_H = 200;
/** Oversampling factor so the exported PNG stays sharp when scaled up. */
const DPR = 3;
const INK_COLOR = "#10104a";
const INK_WIDTH = 2.4;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Modal dialog to capture a handwritten signature (pointer/touch/pen) or load
 * a signature image. The result is stored as a transparent PNG image stamp on
 * the field; the PDF is never certified or locked.
 */
export default function SignatureDialog() {
  const { t } = useTranslation();
  const { signatureFieldId, setSignatureFieldId, formFields, setFormFields, pushHistory } =
    useWorkspace();
  const field = formFields.find((f) => f.id === signatureFieldId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // Fresh canvas every time the dialog opens
  useEffect(() => {
    if (!signatureFieldId) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }, [signatureFieldId]);

  if (!field) return null;

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = getPos(e);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !lastPoint.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.strokeStyle = INK_COLOR;
    ctx.lineWidth = INK_WIDTH * DPR;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    // Quadratic midpoint smoothing
    const mid = { x: (lastPoint.current.x + pos.x) / 2, y: (lastPoint.current.y + pos.y) / 2 };
    ctx.quadraticCurveTo(lastPoint.current.x, lastPoint.current.y, mid.x, mid.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPoint.current = pos;
    if (!hasInk) setHasInk(true);
  }

  function handlePointerUp() {
    drawing.current = false;
    lastPoint.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function applyImageSrc(imageSrc: string) {
    pushHistory();
    setFormFields((prev) =>
      prev.map((f) => (f.id === field!.id ? { ...f, imageSrc } : f))
    );
    setSignatureFieldId(null);
  }

  function applyDrawing() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !hasInk) return;

    // Crop to the inked bounding box
    const { data, width: cw, height: ch } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = cw, minY = ch, maxX = -1, maxY = -1;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (data[(y * cw + x) * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return;
    const pad = 4 * DPR;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(cw - 1, maxX + pad);
    maxY = Math.min(ch - 1, maxY + pad);
    let cropW = maxX - minX + 1;
    let cropH = maxY - minY + 1;

    // Pad the crop to the field's aspect ratio (centered) so the stamp is not
    // distorted when stretched into the field rectangle.
    const fieldAspect = field!.width / field!.height;
    let outW = cropW;
    let outH = cropH;
    if (cropW / cropH < fieldAspect) outW = Math.round(cropH * fieldAspect);
    else outH = Math.round(cropW / fieldAspect);

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const outCtx = out.getContext("2d");
    if (!outCtx) return;
    outCtx.drawImage(
      canvas,
      minX, minY, cropW, cropH,
      Math.round((outW - cropW) / 2), Math.round((outH - cropH) / 2), cropW, cropH
    );
    applyImageSrc(out.toDataURL("image/png"));
  }

  async function loadImageFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (selected === null) return;
    const path = typeof selected === "string" ? selected : selected[0];
    const bytes = await readFile(path);
    const mime = path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    applyImageSrc(`data:${mime};base64,${bytesToBase64(bytes)}`);
  }

  const buttonStyle: React.CSSProperties = {
    height: "30px",
    padding: "0 0.8rem",
    fontSize: "0.8rem",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={() => setSignatureFieldId(null)}
    >
      <div
        style={{
          backgroundColor: "#252526",
          border: "1px solid #3e3e42",
          borderRadius: "6px",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          width: `${CANVAS_W + 32}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "#ffffff" }}>
          {t("signTitle")} – {field.name}
        </h2>
        <canvas
          ref={canvasRef}
          width={CANVAS_W * DPR}
          height={CANVAS_H * DPR}
          style={{
            width: `${CANVAS_W}px`,
            height: `${CANVAS_H}px`,
            backgroundColor: "#ffffff",
            borderRadius: "4px",
            border: "1px dashed #555558",
            cursor: "crosshair",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <p style={{ margin: 0, fontSize: "0.72rem", color: "#8a8a8e" }}>{t("signHint")}</p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button style={buttonStyle} onClick={loadImageFile}>
            {t("signLoadImage")}
          </button>
          <button style={buttonStyle} onClick={clearCanvas} disabled={!hasInk}>
            {t("signClear")}
          </button>
          <div style={{ flex: 1 }} />
          <button style={buttonStyle} onClick={() => setSignatureFieldId(null)}>
            {t("signCancel")}
          </button>
          <button
            style={{
              ...buttonStyle,
              backgroundColor: hasInk ? "#3b82f6" : undefined,
              color: hasInk ? "#ffffff" : undefined,
            }}
            onClick={applyDrawing}
            disabled={!hasInk}
          >
            {t("signApply")}
          </button>
        </div>
      </div>
    </div>
  );
}
