import { useEffect } from "react";
import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFSignature,
  TextAlignment,
  PDFName,
  PDFString,
  PDFArray,
  PDFRef,
} from "pdf-lib";
import type { FormField } from "../types/FormField";

export function useAcroFormExtractor(
  pdfBuffer: ArrayBuffer | null,
  setFormFields: (fields: FormField[]) => void,
  setLoadedFieldNames?: (names: Set<string>) => void
) {
  useEffect(() => {
    if (!pdfBuffer) {
      setFormFields([]);
      return;
    }

    let cancelled = false;

    // Copy buffer to avoid detachment issues during re-renders
    const bufferCopy = pdfBuffer.slice(0);

    PDFDocument.load(new Uint8Array(bufferCopy))
      .then((pdfDoc) => {
        if (cancelled) return;

        const form = pdfDoc.getForm();
        const fields = form.getFields();
        const extracted: FormField[] = [];
        const pages = pdfDoc.getPages();

        // Precompute all widget annotations on pages keyed by parent reference
        const allWidgetsByParent = new Map<string, { dict: any; page: any; ref: any }[]>();
        for (const page of pages) {
          try {
            const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
            if (!annots) continue;
            for (let i = 0; i < annots.size(); i++) {
              const ref = annots.get(i);
              let dict: any = ref;
              if (ref instanceof PDFRef) dict = pdfDoc.context.lookup(ref);
              if (!dict || !dict.lookup) continue;
              const subtype = dict.lookup(PDFName.of("Subtype"));
              if (subtype !== PDFName.of("Widget")) continue;
              const parent = dict.lookup(PDFName.of("Parent"));
              if (!parent) continue;
              let parentRef: any = parent;
              if (parent instanceof PDFRef) parentRef = parent;
              else parentRef = pdfDoc.context.getObjectRef(parent);
              if (parentRef instanceof PDFRef) {
                const key = `${parentRef.objectNumber} ${parentRef.generationNumber}`;
                const list = allWidgetsByParent.get(key) ?? [];
                list.push({ dict, page, ref });
                allWidgetsByParent.set(key, list);
              }
            }
          } catch {
            // ignore
          }
        }

        for (const field of fields) {
          let widgets;
          try {
            widgets = field.acroField.getWidgets();
          } catch {
            continue;
          }

          // Also add orphan widgets that reference this field but are not in Kids
          const fieldRef = pdfDoc.context.getObjectRef(field.acroField.dict);
          if (fieldRef instanceof PDFRef) {
            const key = `${fieldRef.objectNumber} ${fieldRef.generationNumber}`;
            const orphans = allWidgetsByParent.get(key) ?? [];
            for (const orphan of orphans) {
              const alreadyInWidgets = widgets.some((w: any) => {
                const wRef = pdfDoc.context.getObjectRef(w.dict);
                return (
                  wRef instanceof PDFRef &&
                  orphan.ref instanceof PDFRef &&
                  wRef.objectNumber === orphan.ref.objectNumber &&
                  wRef.generationNumber === orphan.ref.generationNumber
                );
              });
              if (!alreadyInWidgets) {
                widgets.push({
                  dict: orphan.dict,
                  getRectangle: () => {
                    const rectArr = orphan.dict.lookup(PDFName.of("Rect"), PDFArray);
                    const nums = rectArr.asArray();
                    const x = (nums[0] as any).value();
                    const y = (nums[1] as any).value();
                    const x2 = (nums[2] as any).value();
                    const y2 = (nums[3] as any).value();
                    return { x, y, width: x2 - x, height: y2 - y };
                  },
                  P: () => undefined,
                } as any);
              }
            }
          }

          for (let wi = 0; wi < widgets.length; wi++) {
            const widget = widgets[wi];
            // Defensive: skip malformed widgets
            if (!widget || !widget.dict) continue;

            let rect;
            let pageRef;
            try {
              rect = widget.getRectangle();
              pageRef = widget.P();
            } catch {
              continue;
            }

            let pageIndex = -1;

            if (pageRef) {
              for (let i = 0; i < pages.length; i++) {
                if (pages[i].ref === pageRef) {
                  pageIndex = i;
                  break;
                }
              }
            }

            if (pageIndex === -1) {
              try {
                const widgetRef = pdfDoc.context.getObjectRef(widget.dict);
                if (widgetRef) {
                  const page = pdfDoc.findPageForAnnotationRef(widgetRef);
                  if (page) {
                    pageIndex = pages.indexOf(page);
                  }
                }
              } catch {
                // ignore
              }
            }

            if (pageIndex === -1) continue;

            const page = pages[pageIndex];
            const pageSize = page.getSize();

            let type: FormField["type"];
            let options: string[] | undefined;
            let alignment: FormField["alignment"];

            let tooltip: string | undefined;
            let value: string | undefined;
            let maxLength: number | undefined;
            let readOnly: boolean | undefined;
            let multiline: boolean | undefined;
            let fontSize = 12;

            try {
              const tu = field.acroField.dict.lookupMaybe(PDFName.of("TU"), PDFString);
              if (tu) tooltip = tu.decodeText();
            } catch {
              // ignore
            }

            try {
              if (field instanceof PDFTextField) {
                value = field.getText() ?? undefined;
              } else if (field instanceof PDFCheckBox) {
                value = field.isChecked() ? "Yes" : undefined;
              } else if (field instanceof PDFDropdown) {
                const sel = field.getSelected();
                value = sel && sel.length > 0 ? sel[0] : undefined;
              } else {
                const v = field.acroField.dict.lookupMaybe(PDFName.of("V"), PDFString);
                if (v) value = v.decodeText();
              }
            } catch {
              // ignore
            }

            try {
              readOnly = field.isReadOnly();
            } catch {
              // ignore
            }

            if (field instanceof PDFTextField) {
              type = "text";
              try {
                const a = field.getAlignment();
                if (a === TextAlignment.Center) alignment = "center";
                else if (a === TextAlignment.Right) alignment = "right";
                else alignment = "left";
              } catch {
                alignment = "left";
              }
              try {
                maxLength = field.getMaxLength() ?? undefined;
              } catch {
                // ignore
              }
              try {
                multiline = field.isMultiline();
              } catch {
                // ignore
              }
              try {
                const da = field.acroField.getDefaultAppearance();
                if (da) {
                  const match = da.match(/\/[^\s]+\s+(\d+(?:\.\d+)?)\s*Tf/);
                  if (match) {
                    const fs = parseFloat(match[1]);
                    if (fs > 0) fontSize = fs;
                  }
                }
              } catch {
                // ignore
              }
            } else if (field instanceof PDFCheckBox) {
              type = "checkbox";
              try {
                value = field.isChecked() ? "Yes" : undefined;
              } catch {
                // ignore
              }
            } else if (field instanceof PDFRadioGroup) {
              type = "radio";
            } else if (field instanceof PDFDropdown) {
              type = "dropdown";
              try {
                options = field.getOptions();
              } catch {
                options = [];
              }
            } else if (field instanceof PDFOptionList) {
              type = "list";
              try {
                options = field.getOptions();
              } catch {
                options = [];
              }
            } else if (field instanceof PDFSignature) {
              type = "signature";
            } else {
              continue;
            }

            const editorY = pageSize.height - rect.y - rect.height;
            extracted.push({
              id: crypto.randomUUID(),
              pageNumber: pageIndex + 1,
              name: field.getName(),
              type,
              x: rect.x,
              y: editorY,
              width: rect.width,
              height: rect.height,
              required: field.isRequired(),
              fontSize,
              alignment,
              options,
              tooltip,
              value,
              maxLength,
              readOnly,
              multiline,
              widgetIndex: wi,
              origValue: value,
              origX: rect.x,
              origY: editorY,
              origWidth: rect.width,
              origHeight: rect.height,
              origName: field.getName(),
            });
          }
        }

        if (!cancelled) {
          setFormFields(extracted);
          setLoadedFieldNames?.(new Set(extracted.map((f) => f.name)));
        }
      })
      .catch((err) => {
        console.error("Failed to extract AcroForm fields:", err);
        if (!cancelled) {
          setFormFields([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pdfBuffer, setFormFields]);
}
