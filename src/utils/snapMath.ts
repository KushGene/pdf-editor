import type { FormField } from "../types/FormField";

export const SNAP_THRESHOLD = 5;

export interface GuideLine {
  points: number[];
  orientation: "h" | "v";
}

interface SnapCandidate {
  dist: number;
  target: number;
  linePoints: number[];
}

export function calculateSnaps(
  field: FormField,
  newX: number,
  newY: number,
  pageFields: FormField[],
  width: number,
  height: number
): { snaps: { x: number; y: number }; lines: GuideLine[] } {
  const fieldLeft = newX;
  const fieldRight = newX + field.width;
  const fieldTop = newY;
  const fieldBottom = newY + field.height;

  let bestX: SnapCandidate | null = null;
  let bestY: SnapCandidate | null = null;

  for (const other of pageFields) {
    if (other.id === field.id) continue;

    const otherLeft = other.x;
    const otherRight = other.x + other.width;
    const otherTop = other.y;
    const otherBottom = other.y + other.height;

    const yCandidates: SnapCandidate[] = [
      { dist: Math.abs(fieldTop - otherTop), target: otherTop, linePoints: [0, otherTop, width, otherTop] },
      { dist: Math.abs(fieldTop - otherBottom), target: otherBottom, linePoints: [0, otherBottom, width, otherBottom] },
      { dist: Math.abs(fieldBottom - otherTop), target: otherTop - field.height, linePoints: [0, otherTop, width, otherTop] },
      { dist: Math.abs(fieldBottom - otherBottom), target: otherBottom - field.height, linePoints: [0, otherBottom, width, otherBottom] },
    ];

    for (const c of yCandidates) {
      if (c.dist <= SNAP_THRESHOLD && (!bestY || c.dist < bestY.dist)) {
        bestY = c;
      }
    }

    const xCandidates: SnapCandidate[] = [
      { dist: Math.abs(fieldLeft - otherLeft), target: otherLeft, linePoints: [otherLeft, 0, otherLeft, height] },
      { dist: Math.abs(fieldLeft - otherRight), target: otherRight, linePoints: [otherRight, 0, otherRight, height] },
      { dist: Math.abs(fieldRight - otherLeft), target: otherLeft - field.width, linePoints: [otherLeft, 0, otherLeft, height] },
      { dist: Math.abs(fieldRight - otherRight), target: otherRight - field.width, linePoints: [otherRight, 0, otherRight, height] },
    ];

    for (const c of xCandidates) {
      if (c.dist <= SNAP_THRESHOLD && (!bestX || c.dist < bestX.dist)) {
        bestX = c;
      }
    }
  }

  const snaps = { x: newX, y: newY };
  const lines: GuideLine[] = [];

  if (bestY) {
    snaps.y = bestY.target;
    lines.push({ points: bestY.linePoints, orientation: "h" });
  }
  if (bestX) {
    snaps.x = bestX.target;
    lines.push({ points: bestX.linePoints, orientation: "v" });
  }

  return { snaps, lines };
}
