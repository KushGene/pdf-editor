import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Line, Transformer, Image as KonvaImage } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import Konva from "konva";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useWorkspace, RENDER_SCALE } from "../context/WorkspaceContext";
import type { FormField } from "../types/FormField";
import { calculateSnaps, type GuideLine } from "../utils/snapMath";

interface FieldOverlayProps {
  pageNumber: number;
  width: number;
  height: number;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function FieldOverlay({ pageNumber, width, height }: FieldOverlayProps) {
  const { formFields, selectedFieldId, setSelectedFieldId, setFormFields, activeTool, previewMode, scale, pushHistory } = useWorkspace();
  const [guidelines, setGuidelines] = useState<GuideLine[]>([]);
  const [altKeyHeld, setAltKeyHeld] = useState(false);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [imageVersion, setImageVersion] = useState(0);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const pageFields = useMemo(() => {
    return formFields.filter((f) => f.pageNumber === pageNumber);
  }, [formFields, pageNumber]);



  // Preload images for image stamps
  useEffect(() => {
    pageFields.forEach((field) => {
      if (field.type === "image" && field.imageSrc && !imageCache.current.has(field.id)) {
        const img = new window.Image();
        img.onload = () => {
          imageCache.current.set(field.id, img);
          setImageVersion((v) => v + 1);
        };
        img.src = field.imageSrc;
      }
    });
  }, [pageFields]);

  useEffect(() => {
    if (transformerRef.current) {
      if (activeTool === "select" && selectedFieldId && !previewMode) {
        const node = nodeRefs.current.get(selectedFieldId);
        if (node) {
          transformerRef.current.nodes([node]);
          transformerRef.current.getLayer()?.batchDraw();
        }
      } else {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    }
  }, [activeTool, selectedFieldId, pageFields, imageVersion, previewMode]);

  // ── Track ALT key for free-move (no snap, no resize handles) ─────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === "Alt") setAltKeyHeld(true); };
    const onUp   = (e: KeyboardEvent) => { if (e.key === "Alt") setAltKeyHeld(false); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup",   onUp);
    };
  }, []);

  // ── Canvas value overlay – drawn at RENDER_SCALE for pixel-perfect sharpness ──
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !width || !height) return;

    const rs = RENDER_SCALE;
    canvas.width = Math.round(width * rs);
    canvas.height = Math.round(height * rs);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const field of pageFields) {
      // ── Text value ──────────────────────────────────────────────────────────
      if (field.type === "text" && field.value) {
        const fontSize =
          (field.fontSize && field.fontSize > 0
            ? field.fontSize
            : Math.max(7, Math.min(field.height * 0.6, 13))) * rs;

        ctx.save();
        // Clip to field interior
        ctx.beginPath();
        ctx.rect(
          (field.x + 2) * rs,
          field.y * rs,
          (field.width - 4) * rs,
          field.height * rs
        );
        ctx.clip();

        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = "#111111";
        ctx.textBaseline = "middle";
        const midY = (field.y + field.height / 2) * rs;

        if (field.alignment === "center") {
          ctx.textAlign = "center";
          ctx.fillText(
            field.value,
            (field.x + field.width / 2) * rs,
            midY
          );
        } else if (field.alignment === "right") {
          ctx.textAlign = "right";
          ctx.fillText(
            field.value,
            (field.x + field.width - 3) * rs,
            midY
          );
        } else {
          ctx.textAlign = "left";
          ctx.fillText(field.value, (field.x + 3) * rs, midY);
        }
        ctx.restore();
      }

      // ── Checkbox X mark ─────────────────────────────────────────────────────
      if (
        field.type === "checkbox" &&
        (field.value === "Yes" || field.value === "true")
      ) {
        const inner = Math.min(field.width, field.height);
        const pad = inner * 0.2 * rs;
        const x1 = field.x * rs + pad;
        const y1 = field.y * rs + pad;
        const x2 = (field.x + field.width) * rs - pad;
        const y2 = (field.y + field.height) * rs - pad;
        const sw = Math.max(rs * 0.8, inner * 0.11 * rs);

        ctx.save();
        ctx.strokeStyle = "#1a56db";
        ctx.lineWidth = sw;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x2, y1);
        ctx.lineTo(x1, y2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [pageFields, width, height]);

  const handleFieldClick = useCallback(
    (fieldId: string) => {
      if (previewMode) return;
      setSelectedFieldId(fieldId);
    },
    [setSelectedFieldId, previewMode]
  );

  const handleDragMove = useCallback(
    (e: KonvaEventObject<DragEvent>, field: FormField) => {
      const node = e.target;
      const newX = node.x();
      const newY = node.y();

      // Alt held → free movement, no snapping
      if (e.evt?.altKey) {
        setGuidelines([]);
        return;
      }

      const { snaps, lines } = calculateSnaps(field, newX, newY, pageFields, width, height);

      if (Math.abs(snaps.x - newX) > 0.1) {
        node.x(snaps.x);
      }
      if (Math.abs(snaps.y - newY) > 0.1) {
        node.y(snaps.y);
      }

      setGuidelines(lines);
    },
    [pageFields, width, height]
  );

  const handleDragEnd = useCallback(
    (e: KonvaEventObject<DragEvent>, field: FormField) => {
      const node = e.target;
      const finalX = node.x();
      const finalY = node.y();

      pushHistory();
      setFormFields((prev) =>
        prev.map((f) =>
          f.id === field.id ? { ...f, x: finalX, y: finalY } : f
        )
      );
      setGuidelines([]);
    },
    [setFormFields, pushHistory]
  );

  const handleTransformEnd = useCallback(
    (e: KonvaEventObject<Event>, field: FormField) => {
      const node = e.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const newWidth  = node.width() * scaleX;
      const newHeight = node.height() * scaleY;
      const newX = node.x();
      const newY = node.y();

      node.scaleX(1);
      node.scaleY(1);

      pushHistory();
      setFormFields((prev) =>
        prev.map((f) =>
          f.id === field.id
            ? { ...f, x: newX, y: newY, width: newWidth, height: newHeight }
            : f
        )
      );
    },
    [setFormFields, pushHistory]
  );

  const handleStageClick = useCallback(
    async (e: KonvaEventObject<MouseEvent>) => {
      if (e.target !== e.target.getStage()) return;
      if (previewMode) return;

      if (activeTool === "pan") return;

      if (activeTool === "select") {
        setSelectedFieldId(null);
        return;
      }

      if (activeTool === "add_image") {
        const stage = e.target.getStage();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const selected = await open({
          multiple: false,
          filters: [
            { name: "Images", extensions: ["png", "jpg", "jpeg"] },
          ],
        });
        if (selected === null) return;

        const path = typeof selected === "string" ? selected : selected[0];
        const bytes = await readFile(path);
        const base64 = arrayBufferToBase64(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        );
        const mime = path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
        const imageSrc = `data:${mime};base64,${base64}`;

        const newField: FormField = {
          id: crypto.randomUUID(),
          pageNumber,
          name: "Image Stamp",
          type: "image",
          x: pointer.x,
          y: pointer.y,
          width: 100,
          height: 100,
          required: false,
          fontSize: 12,
          widgetIndex: 0,
          imageSrc,
        };

        pushHistory();
        setFormFields((prev) => [...prev, newField]);
        setSelectedFieldId(newField.id);
        return;
      }

      if (activeTool.startsWith("add_")) {
        const stage = e.target.getStage();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const defaults: Record<string, { width: number; height: number; name: string; type: FormField["type"] }> = {
          add_text: { width: 100, height: 20, name: "New Text Field", type: "text" },
          add_checkbox: { width: 20, height: 20, name: "New Checkbox", type: "checkbox" },
          add_dropdown: { width: 120, height: 24, name: "New Dropdown", type: "dropdown" },
          add_signature: { width: 150, height: 50, name: "New Signature", type: "signature" },
        };

        const def = defaults[activeTool];
        if (!def) return;

        const newField: FormField = {
          id: crypto.randomUUID(),
          pageNumber,
          name: def.name,
          type: def.type,
          x: pointer.x,
          y: pointer.y,
          width: def.width,
          height: def.height,
          required: false,
          fontSize: 12,
          widgetIndex: 0,
        };

        pushHistory();
        setFormFields((prev) => [...prev, newField]);
        setSelectedFieldId(newField.id);
      }
    },
    [activeTool, pageNumber, setFormFields, setSelectedFieldId, previewMode, pushHistory]
  );

  if (!width || !height) return null;

  const isPan = activeTool === "pan";
  const canInteract = activeTool !== "pan" && !previewMode;

  return (
    <>
      {/* ── Konva Stage: interactive editing layer (outlines, transformer, guidelines) ── */}
      <Stage
        width={width}
        height={height}
        pixelRatio={3}
        style={{ position: "absolute", top: 0, left: 0 }}
        onClick={handleStageClick}
        listening={!isPan && !previewMode}
      >
        <Layer>
          {pageFields.flatMap((field) => {
            const isSelected = field.id === selectedFieldId;
            const x = field.x;
            const y = field.y;
            const w = field.width;
            const h = field.height;

            const elements: React.ReactNode[] = [];

            if (!previewMode) {
              if (field.type === "image") {
                const img = imageCache.current.get(field.id);
                if (img) {
                  elements.push(
                    <KonvaImage
                      key={field.id}
                      id={field.id}
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      image={img}
                      draggable={canInteract}
                      listening={!isPan && !previewMode}
                      stroke={isSelected ? "rgba(59, 130, 246, 0.8)" : undefined}
                      strokeWidth={isSelected ? 2 : 0}
                      onClick={() => handleFieldClick(field.id)}
                      onTap={() => handleFieldClick(field.id)}
                      onDragMove={(e) => handleDragMove(e, field)}
                      onDragEnd={(e) => handleDragEnd(e, field)}
                      onTransformEnd={(e) => handleTransformEnd(e, field)}
                      ref={(node) => {
                        if (node) nodeRefs.current.set(field.id, node);
                        else nodeRefs.current.delete(field.id);
                      }}
                    />
                  );
                }
              } else {
                const sw = isSelected
                  ? Math.max(0.4, 1.5 / scale)
                  : Math.max(0.3, 0.8 / scale);
                elements.push(
                  <Rect
                    key={field.id}
                    id={field.id}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    draggable={canInteract}
                    listening={!isPan && !previewMode}
                    stroke={isSelected ? "rgba(59, 130, 246, 1)" : "rgba(59, 130, 246, 0.7)"}
                    strokeWidth={sw}
                    fill={isSelected ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.08)"}
                    onClick={() => handleFieldClick(field.id)}
                    onTap={() => handleFieldClick(field.id)}
                    onDragMove={(e) => handleDragMove(e, field)}
                    onDragEnd={(e) => handleDragEnd(e, field)}
                    onTransformEnd={(e) => handleTransformEnd(e, field)}
                    ref={(node) => {
                      if (node) nodeRefs.current.set(field.id, node);
                      else nodeRefs.current.delete(field.id);
                    }}
                  />
                );
              }
            }

            return elements;
          })}
          {!previewMode && (
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              resizeEnabled={canInteract && !altKeyHeld}
              anchorSize={Math.max(3, 7 / scale)}
              anchorFill="#ffffff"
              anchorStroke="#3b82f6"
              anchorStrokeWidth={Math.max(0.5, 1.2 / scale)}
              anchorCornerRadius={1}
              borderStroke="rgba(59, 130, 246, 0.9)"
              borderStrokeWidth={Math.max(0.4, 1.2 / scale)}
              borderDash={altKeyHeld ? [3 / scale, 3 / scale] : []}
            />
          )}
          {!previewMode && guidelines.map((g, i) => (
            <Line
              key={i}
              points={g.points}
              stroke="#ef4444"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
            />
          ))}
        </Layer>
      </Stage>

      {/*
        ── Canvas value overlay ─────────────────────────────────────────────────
        Physical pixel dimensions: width × RENDER_SCALE, displayed at CSS size.
        Identical to PdfPageCanvas – guarantees 3× resolution at any workspace
        zoom level. Text and X marks are drawn by the canvas 2D engine at full
        oversampled resolution.
      */}
      <canvas
        ref={overlayCanvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </>
  );
}
