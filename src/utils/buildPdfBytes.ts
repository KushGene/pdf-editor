import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  TextAlignment,
  PDFArray,
  PDFRef,
} from "pdf-lib";
import type { PDFField } from "pdf-lib";
import type { FormField } from "../types/FormField";

function pdfFieldType(f: PDFField): string {
  if (f instanceof PDFTextField) return "text";
  if (f instanceof PDFCheckBox) return "checkbox";
  if (f instanceof PDFDropdown) return "dropdown";
  if (f instanceof PDFOptionList) return "list";
  if (f instanceof PDFRadioGroup) return "radio";
  return "other";
}

const alignMap: Record<string, TextAlignment> = {
  left: TextAlignment.Left,
  center: TextAlignment.Center,
  right: TextAlignment.Right,
};

function applyProperties(
  ef: FormField,
  f: PDFTextField | PDFCheckBox | PDFDropdown | PDFOptionList | PDFRadioGroup,
  pdfDoc: PDFDocument
) {
  if (f instanceof PDFTextField) {
    if (ef.fontSize > 0) f.setFontSize(ef.fontSize);
    if (ef.alignment) f.setAlignment(alignMap[ef.alignment] ?? TextAlignment.Left);
    if (ef.multiline) f.enableMultiline();
    if (ef.readOnly) f.enableReadOnly();
    if (ef.required) f.enableRequired();
    if (ef.maxLength && ef.maxLength > 0) f.setMaxLength(ef.maxLength);
    if (ef.value !== undefined) f.acroField.dict.set(PDFName.of("V"), PDFString.of(ef.value));
  } else if (f instanceof PDFCheckBox) {
    if (ef.readOnly) f.enableReadOnly();
    if (ef.required) f.enableRequired();
    if (ef.value === "Yes") f.check(); else f.uncheck();
  } else if (f instanceof PDFDropdown) {
    if (ef.options?.length) f.addOptions(ef.options);
    if (ef.readOnly) f.enableReadOnly();
    if (ef.required) f.enableRequired();
    if (ef.value !== undefined) f.acroField.dict.set(PDFName.of("V"), PDFString.of(ef.value));
  } else if (f instanceof PDFOptionList) {
    if (ef.options?.length) f.acroField.dict.set(PDFName.of("Opt"), pdfDoc.context.obj(ef.options.map((o) => PDFString.of(o))));
    if (ef.readOnly) f.enableReadOnly();
    if (ef.required) f.enableRequired();
    if (ef.value !== undefined) f.acroField.dict.set(PDFName.of("V"), PDFString.of(ef.value));
  } else if (f instanceof PDFRadioGroup) {
    if (ef.options?.length) f.acroField.dict.set(PDFName.of("Opt"), pdfDoc.context.obj(ef.options.map((o) => PDFString.of(o))));
    if (ef.readOnly) f.enableReadOnly();
    if (ef.required) f.enableRequired();
    if (ef.value) f.select(ef.value);
  }
  if (ef.tooltip) f.acroField.dict.set(PDFName.of("TU"), PDFString.of(ef.tooltip));
}

function removeFieldFromAcroFormOnly(pdfField: PDFField, pdfDoc: PDFDocument) {
  try {
    const acroForm = pdfDoc.catalog.getOrCreateAcroForm();
    const fieldsArr = acroForm.dict.lookupMaybe(PDFName.of("Fields"), PDFArray);
    if (fieldsArr) {
      const fieldRef = pdfDoc.context.getObjectRef(pdfField.acroField.dict);
      if (fieldRef) {
        const newFields = PDFArray.withContext(pdfDoc.context);
        for (let i = 0; i < fieldsArr.size(); i++) {
          const ref = fieldsArr.get(i);
          let isMatch = false;
          if (ref === fieldRef) isMatch = true;
          else if (ref instanceof PDFRef && fieldRef instanceof PDFRef) {
            if (ref.objectNumber === fieldRef.objectNumber && ref.generationNumber === fieldRef.generationNumber) isMatch = true;
          }
          if (!isMatch) newFields.push(ref);
        }
        if (newFields.size() === 0) acroForm.dict.delete(PDFName.of("Fields"));
        else acroForm.dict.set(PDFName.of("Fields"), newFields);
      }
    }
  } catch {}
}

function safelyRemoveField(pdfField: PDFField, pdfDoc: PDFDocument) {
  try {
    for (const widget of pdfField.acroField.getWidgets()) {
      try {
        const widgetRef = pdfDoc.context.getObjectRef(widget.dict);
        if (widgetRef) {
          const page = pdfDoc.findPageForAnnotationRef(widgetRef);
          if (page) {
            const annots = page.node.Annots();
            if (annots) {
              const newAnnots = PDFArray.withContext(pdfDoc.context);
              for (let i = 0; i < annots.size(); i++) {
                const ref = annots.get(i);
                let isMatch = false;
                if (ref === widgetRef) isMatch = true;
                else if (ref instanceof PDFRef && widgetRef instanceof PDFRef) {
                  if (ref.objectNumber === widgetRef.objectNumber && ref.generationNumber === widgetRef.generationNumber) isMatch = true;
                }
                if (!isMatch) newAnnots.push(ref);
              }
              if (newAnnots.size() === 0) page.node.delete(PDFName.of("Annots"));
              else page.node.set(PDFName.of("Annots"), newAnnots);
            }
          }
        }
      } catch {}
    }
    try {
      const acroForm = pdfDoc.catalog.getOrCreateAcroForm();
      const fieldsArr = acroForm.dict.lookupMaybe(PDFName.of("Fields"), PDFArray);
      if (fieldsArr) {
        const fieldRef = pdfDoc.context.getObjectRef(pdfField.acroField.dict);
        if (fieldRef) {
          const newFields = PDFArray.withContext(pdfDoc.context);
          for (let i = 0; i < fieldsArr.size(); i++) {
            const ref = fieldsArr.get(i);
            let isMatch = false;
            if (ref === fieldRef) isMatch = true;
            else if (ref instanceof PDFRef && fieldRef instanceof PDFRef) {
              if (ref.objectNumber === fieldRef.objectNumber && ref.generationNumber === fieldRef.generationNumber) isMatch = true;
            }
            if (!isMatch) newFields.push(ref);
          }
          if (newFields.size() === 0) acroForm.dict.delete(PDFName.of("Fields"));
          else acroForm.dict.set(PDFName.of("Fields"), newFields);
        }
      }
    } catch {}
    try { pdfField.acroField.dict.delete(PDFName.of("Kids")); } catch {}
  } catch {}
}

export async function buildPdfBytes(
  pdfBuffer: ArrayBuffer,
  formFields: FormField[],
  loadedFieldNames: Set<string>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBuffer.slice(0)));
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();

  const allFields = form.getFields();
  const pdfFieldByName = new Map(allFields.map((f) => [f.getName(), f]));
  const pdfFieldsByNameMulti = new Map<string, PDFField[]>();
  for (const f of allFields) {
    const list = pdfFieldsByNameMulti.get(f.getName()) ?? [];
    list.push(f);
    pdfFieldsByNameMulti.set(f.getName(), list);
  }
  const snapshot = [...allFields];

  const toRect = (ef: FormField) => {
    const page = pages[ef.pageNumber - 1];
    if (!page) return null;
    const { height: ph } = page.getSize();
    const y = ph - ef.y - ef.height;
    return { page, r: { x: ef.x, y, width: ef.width, height: ef.height }, raw: [ef.x, y, ef.x + ef.width, y + ef.height] as number[] };
  };

  const byOrigName = new Map<string, FormField[]>();
  const keptOrigNames = new Set<string>();

  for (const ef of formFields) {
    if (ef.origName) {
      const list = byOrigName.get(ef.origName) ?? [];
      list.push(ef);
      byOrigName.set(ef.origName, list);
    }
  }

  for (const [origName, editors] of byOrigName) {
    const pdfField = pdfFieldByName.get(origName);
    if (!pdfField) continue;
    const allKept = editors.every((ef) => ef.name === ef.origName && pdfFieldType(pdfField) === ef.type);
    if (allKept) keptOrigNames.add(origName);
  }

  const deletedOrigNames = new Set<string>();
  for (const pdfField of snapshot) {
    const name = pdfField.getName();
    if (!loadedFieldNames.has(name)) continue;
    if (!formFields.some((ef) => ef.origName === name)) deletedOrigNames.add(name);
  }

  const phase2SeenIndices = new Map<string, Set<number>>();
  const forcedPhase3Ids = new Set<string>();

  // PHASE 2 – update kept fields
  for (const ef of formFields) {
    if (ef.type === "image" || ef.type === "signature") continue;
    if (ef.origName === undefined) continue;
    if (!keptOrigNames.has(ef.origName)) continue;
    const pdfField = pdfFieldByName.get(ef.origName);
    if (!pdfField) continue;
    const info = toRect(ef);
    if (!info) continue;
    try {
      const widgets = pdfField.acroField.getWidgets();
      const seen = phase2SeenIndices.get(ef.origName) ?? new Set<number>();
      if (ef.widgetIndex >= widgets.length || seen.has(ef.widgetIndex)) {
        forcedPhase3Ids.add(ef.id);
        continue;
      }
      seen.add(ef.widgetIndex);
      phase2SeenIndices.set(ef.origName, seen);

      const moved = ef.x !== ef.origX || ef.y !== ef.origY || ef.width !== ef.origWidth || ef.height !== ef.origHeight;
      if (moved) {
        const targetWidget = widgets[ef.widgetIndex];
        if (targetWidget) targetWidget.dict.set(PDFName.of("Rect"), pdfDoc.context.obj(info.raw));
      }
      if (pdfField instanceof PDFTextField) {
        if (ef.value === undefined) { /* keep */ }
        else if (ef.value === "") {
          try { pdfField.setText(""); } catch {
            pdfField.acroField.dict.set(PDFName.of("V"), PDFString.of(""));
            pdfField.acroField.dict.delete(PDFName.of("DV"));
            for (const w of pdfField.acroField.getWidgets()) w.dict.delete(PDFName.of("AP"));
          }
        } else if (ef.value !== ef.origValue) {
          try { pdfField.setText(ef.value); } catch {
            pdfField.acroField.dict.set(PDFName.of("V"), PDFString.of(ef.value));
            for (const w of pdfField.acroField.getWidgets()) w.dict.delete(PDFName.of("AP"));
          }
        }
        ef.readOnly ? pdfField.enableReadOnly() : pdfField.disableReadOnly();
        ef.required ? pdfField.enableRequired() : pdfField.disableRequired();
        ef.multiline ? pdfField.enableMultiline() : pdfField.disableMultiline();
        if (ef.fontSize > 0) pdfField.setFontSize(ef.fontSize);
        if (ef.alignment) pdfField.setAlignment(alignMap[ef.alignment] ?? TextAlignment.Left);
        if (ef.maxLength && ef.maxLength > 0) pdfField.setMaxLength(ef.maxLength);
        if (ef.tooltip !== undefined) pdfField.acroField.dict.set(PDFName.of("TU"), PDFString.of(ef.tooltip));
      } else if (pdfField instanceof PDFCheckBox) {
        ef.value === "Yes" ? pdfField.check() : pdfField.uncheck();
        ef.readOnly ? pdfField.enableReadOnly() : pdfField.disableReadOnly();
        ef.required ? pdfField.enableRequired() : pdfField.disableRequired();
      } else if (pdfField instanceof PDFDropdown || pdfField instanceof PDFOptionList) {
        if (ef.options?.length) pdfField.acroField.dict.set(PDFName.of("Opt"), pdfDoc.context.obj(ef.options.map((o) => PDFString.of(o))));
        if (ef.fontSize > 0) pdfField.setFontSize(ef.fontSize);
        if (ef.value === "") { pdfField.acroField.dict.delete(PDFName.of("V")); pdfField.acroField.dict.delete(PDFName.of("DV")); }
        else if (ef.value) {
          try { if (pdfField instanceof PDFDropdown) pdfField.select(ef.value); else pdfField.acroField.dict.set(PDFName.of("V"), PDFString.of(ef.value)); } catch { pdfField.acroField.dict.set(PDFName.of("V"), PDFString.of(ef.value)); }
        }
        ef.readOnly ? pdfField.enableReadOnly() : pdfField.disableReadOnly();
        ef.required ? pdfField.enableRequired() : pdfField.disableRequired();
      } else if (pdfField instanceof PDFRadioGroup) {
        if (ef.options?.length) pdfField.acroField.dict.set(PDFName.of("Opt"), pdfDoc.context.obj(ef.options.map((o) => PDFString.of(o))));
        if (ef.value === "") pdfField.acroField.dict.delete(PDFName.of("V"));
        else if (ef.value) { try { pdfField.select(ef.value); } catch { pdfField.acroField.dict.set(PDFName.of("V"), PDFString.of(ef.value)); } }
        ef.readOnly ? pdfField.enableReadOnly() : pdfField.disableReadOnly();
        ef.required ? pdfField.enableRequired() : pdfField.disableRequired();
      }
    } catch { /* ignore */ }
  }

  // PHASE 3 – create / rename fields
  const byTargetName = new Map<string, FormField[]>();
  for (const ef of formFields) {
    if (ef.type === "image" || ef.type === "signature") continue;
    if (ef.origName !== undefined && keptOrigNames.has(ef.origName) && !forcedPhase3Ids.has(ef.id)) continue;
    const list = byTargetName.get(ef.name) ?? [];
    list.push(ef);
    byTargetName.set(ef.name, list);
  }

  const createdFields = new Map<string, PDFField>();
  const fieldsToRemove = new Set<PDFField>();

  for (const [targetName, editors] of byTargetName) {
    let targetField = createdFields.get(targetName);
    if (!targetField) {
      const maybe = pdfFieldByName.get(targetName);
      if (maybe && pdfFieldType(maybe) === editors[0].type) targetField = maybe;
    }
    if (!targetField) {
      const first = editors[0];
      try {
        if (first.type === "text") targetField = form.createTextField(targetName);
        else if (first.type === "checkbox") targetField = form.createCheckBox(targetName);
        else if (first.type === "dropdown") targetField = form.createDropdown(targetName);
        else if (first.type === "list") targetField = form.createOptionList(targetName);
        else if (first.type === "radio") targetField = form.createRadioGroup(targetName);
      } catch { /* ignore */ }
    }
    if (!targetField) continue;
    createdFields.set(targetName, targetField);

    for (const ef of editors) {
      const info = toRect(ef);
      if (!info) continue;

      if (ef.origName && ef.origName !== ef.name) {
        const sourceField = pdfFieldByName.get(ef.origName);
        if (sourceField && sourceField !== targetField) {
          const targetHasKids = targetField.acroField.dict.lookupMaybe(PDFName.of("Kids"), PDFArray) !== undefined;
          if (targetHasKids) {
            // Move widgets from sourceField to targetField's Kids array
            const widgets = sourceField.acroField.getWidgets();
            for (const widget of widgets) {
              const widgetRef = pdfDoc.context.getObjectRef(widget.dict);
              if (!widgetRef) continue;
              widget.dict.set(
                PDFName.of("Parent"),
                pdfDoc.context.getObjectRef(targetField.acroField.dict) ?? targetField.acroField.dict
              );
              widget.dict.delete(PDFName.of("T"));
              widget.dict.delete(PDFName.of("FT"));
              const kids = targetField.acroField.dict.lookupMaybe(PDFName.of("Kids"), PDFArray);
              if (kids) {
                kids.push(widgetRef);
              } else {
                targetField.acroField.dict.set(PDFName.of("Kids"), pdfDoc.context.obj([widgetRef]));
              }
              if (
                ef.x !== ef.origX ||
                ef.y !== ef.origY ||
                ef.width !== ef.origWidth ||
                ef.height !== ef.origHeight
              ) {
                widget.dict.set(PDFName.of("Rect"), pdfDoc.context.obj(info.raw));
              }
            }
            removeFieldFromAcroFormOnly(sourceField, pdfDoc);
          } else {
            // Simple rename for merged field/widgets: just change the T value
            sourceField.acroField.dict.set(PDFName.of("T"), PDFString.of(ef.name));
            if (
              ef.x !== ef.origX ||
              ef.y !== ef.origY ||
              ef.width !== ef.origWidth ||
              ef.height !== ef.origHeight
            ) {
              const widgets = sourceField.acroField.getWidgets();
              for (const widget of widgets) {
                widget.dict.set(PDFName.of("Rect"), pdfDoc.context.obj(info.raw));
              }
            }
            // Update multi-name map so applyProperties targets the renamed field too
            const oldList = pdfFieldsByNameMulti.get(ef.origName!);
            if (oldList) {
              const filtered = oldList.filter((f) => f !== sourceField);
              if (filtered.length > 0) pdfFieldsByNameMulti.set(ef.origName!, filtered);
              else pdfFieldsByNameMulti.delete(ef.origName!);
            }
            const newList = pdfFieldsByNameMulti.get(ef.name) ?? [];
            if (!newList.includes(sourceField)) {
              newList.push(sourceField);
              pdfFieldsByNameMulti.set(ef.name, newList);
            }
          }
          continue;
        }
      }

      try {
        if (targetField instanceof PDFTextField) targetField.addToPage(info.page, info.r);
        else if (targetField instanceof PDFCheckBox) targetField.addToPage(info.page, info.r);
        else if (targetField instanceof PDFDropdown) targetField.addToPage(info.page, info.r);
        else if (targetField instanceof PDFOptionList) targetField.addToPage(info.page, info.r);
        else if (targetField instanceof PDFRadioGroup) {
          const opt = ef.value ?? ef.options?.[0] ?? "";
          if (opt) targetField.addOptionToPage(opt, info.page, info.r);
        }
      } catch { /* ignore */ }
    }

    const last = editors[editors.length - 1];
    const allTargetFields = pdfFieldsByNameMulti.get(targetName) ?? [targetField];
    for (const field of allTargetFields) {
      if (field instanceof PDFTextField || field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) {
        applyProperties(last, field, pdfDoc);
      } else if (field instanceof PDFCheckBox) {
        const anyChecked = editors.some((ef) => ef.value === "Yes");
        const efWithValue = anyChecked ? { ...last, value: "Yes" as const } : { ...last, value: undefined as string | undefined };
        applyProperties(efWithValue, field, pdfDoc);
      }
    }
  }

  // PHASE 4 – remove emptied source fields AFTER addToPage
  for (const sourceField of fieldsToRemove) {
    safelyRemoveField(sourceField, pdfDoc);
  }
  // Also remove completely deleted fields
  for (const pdfField of snapshot) {
    if (deletedOrigNames.has(pdfField.getName())) {
      safelyRemoveField(pdfField, pdfDoc);
    }
  }
  // Remove old signature widgets that are being replaced by drawn images
  for (const ef of formFields) {
    if (ef.type !== "signature" || !ef.origName || !ef.imageSrc) continue;
    const sourceField = pdfFieldByName.get(ef.origName);
    if (sourceField) safelyRemoveField(sourceField, pdfDoc);
  }

  for (const field of formFields) {
    if ((field.type !== "image" && field.type !== "signature") || !field.imageSrc) continue;
    try {
      const page = pages[field.pageNumber - 1];
      if (!page) continue;
      const { height: ph } = page.getSize();
      const b64 = field.imageSrc.split(",")[1];
      if (!b64) continue;
      const imgBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const img = field.imageSrc.includes("image/png") ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
      page.drawImage(img, { x: field.x, y: ph - field.y - field.height, width: field.width, height: field.height });
    } catch { /* skip */ }
  }

  const acroForm = pdfDoc.catalog.getOrCreateAcroForm();
  acroForm.dict.set(PDFName.of("NeedAppearances"), pdfDoc.context.obj(true));

  return pdfDoc.save({ updateFieldAppearances: false });
}
