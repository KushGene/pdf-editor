import { PDFName, PDFString, rgb } from "pdf-lib";
import type { Color, PDFWidgetAnnotation } from "pdf-lib";

/** Convert "#rrggbb" to PDF color components in the 0..1 range. */
export function hexToComponents(hex: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/** Convert "#rrggbb" to a pdf-lib Color (for addToPage options). */
export function hexToColor(hex: string): Color | undefined {
  const c = hexToComponents(hex);
  return c ? rgb(c[0], c[1], c[2]) : undefined;
}

/** Convert PDF color components (1 = gray, 3 = RGB, 4 = CMYK) to "#rrggbb". */
export function componentsToHex(components: number[] | undefined): string | undefined {
  if (!components || components.length === 0) return undefined;
  let r: number, g: number, b: number;
  if (components.length === 1) {
    r = g = b = components[0];
  } else if (components.length === 3) {
    [r, g, b] = components;
  } else if (components.length === 4) {
    const [c, m, y, k] = components;
    r = (1 - c) * (1 - k);
    g = (1 - m) * (1 - k);
    b = (1 - y) * (1 - k);
  } else {
    return undefined;
  }
  const toByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (
    "#" +
    [r, g, b].map((v) => toByte(v).toString(16).padStart(2, "0")).join("")
  );
}

/** Extract the font size from a default appearance string ("/Helv 12 Tf"). */
export function parseDaFontSize(da: string | undefined): number | undefined {
  if (!da) return undefined;
  const m = da.match(/\/[^\s/]+\s+(\d+(?:\.\d+)?)\s+Tf/);
  if (!m) return undefined;
  const size = parseFloat(m[1]);
  return size > 0 ? size : undefined;
}

/** Extract the font name from a default appearance string. */
export function parseDaFontName(da: string | undefined): string | undefined {
  if (!da) return undefined;
  const m = da.match(/\/([^\s/]+)\s+\d+(?:\.\d+)?\s+Tf/);
  return m ? m[1] : undefined;
}

/** Extract the text color from a default appearance string ("0 0 0.62 rg" or "0 g"). */
export function parseDaColor(da: string | undefined): string | undefined {
  if (!da) return undefined;
  const rgMatch = da.match(/(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+rg\b/);
  if (rgMatch) {
    return componentsToHex([parseFloat(rgMatch[1]), parseFloat(rgMatch[2]), parseFloat(rgMatch[3])]);
  }
  const kMatch = da.match(/(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+k\b/);
  if (kMatch) {
    return componentsToHex([1, 2, 3, 4].map((i) => parseFloat(kMatch[i])));
  }
  const gMatch = da.match(/(\d*\.?\d+)\s+g\b/);
  if (gMatch) return componentsToHex([parseFloat(gMatch[1])]);
  return undefined;
}

/** Compose a default appearance string from font name, size and text color. */
export function composeDa(fontName: string, fontSize: number, textColorHex: string | undefined): string {
  const c = textColorHex ? hexToComponents(textColorHex) : undefined;
  const colorOp = c
    ? `${c.map((v) => +v.toFixed(4)).join(" ")} rg`
    : "0 g";
  return `${colorOp} /${fontName} ${fontSize} Tf`;
}

export interface WidgetAppearance {
  borderColor?: string;
  borderWidth?: number;
  backgroundColor?: string;
}

/** Read border/background appearance from a widget's MK and BS dictionaries. */
export function readWidgetAppearance(widget: PDFWidgetAnnotation): WidgetAppearance {
  const result: WidgetAppearance = {};
  try {
    const mk = widget.getAppearanceCharacteristics();
    if (mk) {
      result.borderColor = componentsToHex(mk.getBorderColor());
      result.backgroundColor = componentsToHex(mk.getBackgroundColor());
    }
    const bs = widget.getBorderStyle();
    const width = bs?.getWidth();
    if (width !== undefined) result.borderWidth = width;
    // PDF spec: a border is painted with default width 1 when BC is set and no BS exists
    else if (result.borderColor) result.borderWidth = 1;
  } catch (err) {
    console.warn("readWidgetAppearance failed:", err);
  }
  return result;
}

/** Write border/background appearance to a widget's MK and BS dictionaries. */
export function writeWidgetAppearance(widget: PDFWidgetAnnotation, app: WidgetAppearance) {
  try {
    const mk = widget.getOrCreateAppearanceCharacteristics();
    const bc = app.borderColor ? hexToComponents(app.borderColor) : undefined;
    if (bc) mk.setBorderColor(bc);
    else mk.dict.delete(PDFName.of("BC"));
    const bg = app.backgroundColor ? hexToComponents(app.backgroundColor) : undefined;
    if (bg) mk.setBackgroundColor(bg);
    else mk.dict.delete(PDFName.of("BG"));
    const bs = widget.getOrCreateBorderStyle();
    bs.setWidth(app.borderColor ? app.borderWidth ?? 1 : 0);
  } catch (err) {
    console.warn("writeWidgetAppearance failed:", err);
  }
}

/** Set a widget-level default appearance string (overrides the field-level DA). */
export function setWidgetDa(widget: PDFWidgetAnnotation, da: string) {
  widget.dict.set(PDFName.of("DA"), PDFString.of(da));
}

/** Read the widget-level default appearance string, if any. */
export function getWidgetDa(widget: PDFWidgetAnnotation): string | undefined {
  try {
    return widget.getDefaultAppearance() ?? undefined;
  } catch {
    return undefined;
  }
}
