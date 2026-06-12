import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFHexString,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  TextAlignment,
  PDFArray,
  PDFDict,
  PDFRef,
} from "pdf-lib";
import type { PDFField, PDFWidgetAnnotation } from "pdf-lib";
import type { FormField } from "../types/FormField";
import {
  composeDa,
  getWidgetDa,
  hexToColor,
  parseDaColor,
  parseDaFontName,
  parseDaFontSize,
  setWidgetDa,
  writeWidgetAppearance,
} from "./fieldAppearance";

export interface BuildPdfOptions {
  /** Render all fields into static page content and remove the form. */
  flatten?: boolean;
}

function warn(message: string, err?: unknown) {
  console.warn(`buildPdfBytes: ${message}`, err ?? "");
}

function pdfFieldType(f: PDFField): string {
  if (f instanceof PDFTextField) return "text";
  if (f instanceof PDFCheckBox) return "checkbox";
  if (f instanceof PDFDropdown) return "dropdown";
  if (f instanceof PDFOptionList) return "list";
  if (f instanceof PDFRadioGroup) return "radio";
  return "other";
}

function refsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof PDFRef && b instanceof PDFRef) {
    return a.objectNumber === b.objectNumber && a.generationNumber === b.generationNumber;
  }
  return false;
}

/**
 * Remove every occurrence of targetRef from the PDFArray stored under
 * dict[key]. Mutates the array in place: pdf-lib caches normalized array
 * instances (e.g. page Annots), so replacing the array with a new one leaves
 * pdf-lib operating on a stale copy.
 */
function removeRefFromArray(dict: PDFDict, key: string, targetRef: unknown) {
  const arr = dict.lookupMaybe(PDFName.of(key), PDFArray);
  if (!arr) return;
  for (let i = arr.size() - 1; i >= 0; i--) {
    if (refsEqual(arr.get(i), targetRef)) arr.remove(i);
  }
}

function removeFieldFromAcroFormOnly(pdfField: PDFField, pdfDoc: PDFDocument) {
  try {
    const acroForm = pdfDoc.catalog.getOrCreateAcroForm();
    const fieldRef = pdfDoc.context.getObjectRef(pdfField.acroField.dict);
    if (fieldRef) removeRefFromArray(acroForm.dict, "Fields", fieldRef);
  } catch (err) {
    warn(`could not detach field "${pdfField.getName()}" from AcroForm`, err);
  }
}

function safelyRemoveField(pdfField: PDFField, pdfDoc: PDFDocument) {
  try {
    for (const widget of pdfField.acroField.getWidgets()) {
      try {
        const widgetRef = pdfDoc.context.getObjectRef(widget.dict);
        if (!widgetRef) continue;
        const page = pdfDoc.findPageForAnnotationRef(widgetRef);
        if (page) removeRefFromArray(page.node, "Annots", widgetRef);
      } catch (err) {
        warn(`could not remove a widget of "${pdfField.getName()}" from its page`, err);
      }
    }
    removeFieldFromAcroFormOnly(pdfField, pdfDoc);
    try {
      pdfField.acroField.dict.delete(PDFName.of("Kids"));
    } catch (err) {
      warn(`could not delete Kids of "${pdfField.getName()}"`, err);
    }
  } catch (err) {
    warn(`could not remove field "${pdfField.getName()}"`, err);
  }
}

type VariableTextField = PDFTextField | PDFDropdown | PDFOptionList;

/**
 * Rewrite the default appearance (font, size, text color) of a variable-text
 * field. Widget-level DA entries take precedence over the field DA in viewers,
 * so existing widget DAs are kept in sync.
 */
function applyTextDa(field: VariableTextField, ef: FormField, pdfDoc: PDFDocument) {
  try {
    const widgets = field.acroField.getWidgets();
    let acroFormDa: string | undefined;
    try {
      acroFormDa = pdfDoc.catalog
        .getOrCreateAcroForm()
        .dict.lookupMaybe(PDFName.of("DA"), PDFString, PDFHexString)
        ?.decodeText();
    } catch {
      acroFormDa = undefined;
    }
    const baseDa =
      field.acroField.getDefaultAppearance() ??
      widgets.map(getWidgetDa).find(Boolean) ??
      acroFormDa;
    let fontName = parseDaFontName(baseDa);
    if (!fontName) {
      try {
        fontName = pdfDoc.getForm().getDefaultFont().name;
      } catch {
        fontName = "Helv";
      }
    }
    const fontSize = ef.fontSize > 0 ? ef.fontSize : parseDaFontSize(baseDa) ?? 12;
    const da = composeDa(fontName, fontSize, ef.textColor ?? parseDaColor(baseDa));
    field.acroField.setDefaultAppearance(da);
    for (const w of widgets) {
      if (getWidgetDa(w) !== undefined) setWidgetDa(w, da);
    }
  } catch (err) {
    warn(`could not update default appearance of "${ef.name}"`, err);
  }
}

function setTextValue(field: PDFTextField, value: string) {
  try {
    field.setText(value);
  } catch (err) {
    warn(`setText failed for "${field.getName()}", writing /V directly`, err);
    field.acroField.dict.set(PDFName.of("V"), PDFHexString.fromText(value));
    if (value === "") field.acroField.dict.delete(PDFName.of("DV"));
    for (const w of field.acroField.getWidgets()) w.dict.delete(PDFName.of("AP"));
  }
}

const alignMap: Record<string, TextAlignment> = {
  left: TextAlignment.Left,
  center: TextAlignment.Center,
  right: TextAlignment.Right,
};

function optionsArray(pdfDoc: PDFDocument, options: string[]) {
  return pdfDoc.context.obj(options.map((o) => PDFHexString.fromText(o)));
}

function applyProperties(
  ef: FormField,
  f: PDFTextField | PDFCheckBox | PDFDropdown | PDFOptionList | PDFRadioGroup,
  pdfDoc: PDFDocument
) {
  if (f instanceof PDFTextField) {
    applyTextDa(f, ef, pdfDoc);
    if (ef.alignment) f.setAlignment(alignMap[ef.alignment] ?? TextAlignment.Left);
    ef.multiline ? f.enableMultiline() : f.disableMultiline();
    ef.readOnly ? f.enableReadOnly() : f.disableReadOnly();
    ef.required ? f.enableRequired() : f.disableRequired();
    if (ef.maxLength && ef.maxLength > 0) {
      f.setMaxLength(ef.maxLength);
      ef.comb ? f.enableCombing() : f.disableCombing();
    } else {
      try {
        f.removeMaxLength();
      } catch (err) {
        warn(`could not remove maxLength of "${ef.name}"`, err);
      }
      f.disableCombing();
    }
    if (ef.value !== undefined) setTextValue(f, ef.value);
  } else if (f instanceof PDFCheckBox) {
    ef.readOnly ? f.enableReadOnly() : f.disableReadOnly();
    ef.required ? f.enableRequired() : f.disableRequired();
    try {
      if (ef.value === "Yes") f.check();
      else f.uncheck();
    } catch (err) {
      warn(`could not toggle checkbox "${ef.name}"`, err);
    }
  } else if (f instanceof PDFDropdown) {
    if (ef.options?.length) f.acroField.dict.set(PDFName.of("Opt"), optionsArray(pdfDoc, ef.options));
    applyTextDa(f, ef, pdfDoc);
    ef.editable ? f.enableEditing() : f.disableEditing();
    ef.sorted ? f.enableSorting() : f.disableSorting();
    ef.readOnly ? f.enableReadOnly() : f.disableReadOnly();
    ef.required ? f.enableRequired() : f.disableRequired();
    if (ef.value === "") {
      f.acroField.dict.delete(PDFName.of("V"));
      f.acroField.dict.delete(PDFName.of("DV"));
    } else if (ef.value !== undefined) {
      try {
        f.select(ef.value);
      } catch {
        f.acroField.dict.set(PDFName.of("V"), PDFHexString.fromText(ef.value));
      }
    }
  } else if (f instanceof PDFOptionList) {
    if (ef.options?.length) f.acroField.dict.set(PDFName.of("Opt"), optionsArray(pdfDoc, ef.options));
    applyTextDa(f, ef, pdfDoc);
    ef.multiselect ? f.enableMultiselect() : f.disableMultiselect();
    ef.sorted ? f.enableSorting() : f.disableSorting();
    ef.readOnly ? f.enableReadOnly() : f.disableReadOnly();
    ef.required ? f.enableRequired() : f.disableRequired();
    if (ef.value === "") {
      f.acroField.dict.delete(PDFName.of("V"));
      f.acroField.dict.delete(PDFName.of("DV"));
    } else if (ef.value !== undefined) {
      try {
        f.select(ef.value);
      } catch {
        f.acroField.dict.set(PDFName.of("V"), PDFHexString.fromText(ef.value));
      }
    }
  } else if (f instanceof PDFRadioGroup) {
    if (ef.options?.length) f.acroField.dict.set(PDFName.of("Opt"), optionsArray(pdfDoc, ef.options));
    ef.readOnly ? f.enableReadOnly() : f.disableReadOnly();
    ef.required ? f.enableRequired() : f.disableRequired();
    if (ef.value === "") {
      f.acroField.dict.delete(PDFName.of("V"));
    } else if (ef.value) {
      try {
        f.select(ef.value);
      } catch {
        // /V of a radio group is a name object identifying the on-state
        f.acroField.dict.set(PDFName.of("V"), PDFName.of(ef.value));
      }
    }
  }
  if (ef.tooltip !== undefined) {
    if (ef.tooltip === "") f.acroField.dict.delete(PDFName.of("TU"));
    else f.acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText(ef.tooltip));
  }
}

export async function buildPdfBytes(
  pdfBuffer: ArrayBuffer,
  formFields: FormField[],
  loadedFieldNames: Set<string>,
  options: BuildPdfOptions = {}
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
    return {
      page,
      r: { x: ef.x, y, width: ef.width, height: ef.height },
      raw: [ef.x, y, ef.x + ef.width, y + ef.height] as number[],
    };
  };

  const hasMoved = (ef: FormField) =>
    ef.x !== ef.origX || ef.y !== ef.origY || ef.width !== ef.origWidth || ef.height !== ef.origHeight;

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

  // PHASE 2 – update kept fields in place
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

      const targetWidget: PDFWidgetAnnotation | undefined = widgets[ef.widgetIndex];
      if (hasMoved(ef) && targetWidget) {
        targetWidget.dict.set(PDFName.of("Rect"), pdfDoc.context.obj(info.raw));
      }
      if (targetWidget) writeWidgetAppearance(targetWidget, ef);

      if (pdfField instanceof PDFTextField) {
        if (ef.value !== undefined && (ef.value === "" || ef.value !== ef.origValue)) {
          setTextValue(pdfField, ef.value);
        }
        ef.readOnly ? pdfField.enableReadOnly() : pdfField.disableReadOnly();
        ef.required ? pdfField.enableRequired() : pdfField.disableRequired();
        ef.multiline ? pdfField.enableMultiline() : pdfField.disableMultiline();
        applyTextDa(pdfField, ef, pdfDoc);
        if (ef.alignment) pdfField.setAlignment(alignMap[ef.alignment] ?? TextAlignment.Left);
        if (ef.maxLength && ef.maxLength > 0) {
          pdfField.setMaxLength(ef.maxLength);
          ef.comb ? pdfField.enableCombing() : pdfField.disableCombing();
        } else {
          try {
            pdfField.removeMaxLength();
          } catch (err) {
            warn(`could not remove maxLength of "${ef.name}"`, err);
          }
          pdfField.disableCombing();
        }
        if (ef.tooltip !== undefined) {
          if (ef.tooltip === "") pdfField.acroField.dict.delete(PDFName.of("TU"));
          else pdfField.acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText(ef.tooltip));
        }
      } else if (pdfField instanceof PDFCheckBox) {
        try {
          ef.value === "Yes" ? pdfField.check() : pdfField.uncheck();
        } catch (err) {
          warn(`could not toggle checkbox "${ef.name}"`, err);
        }
        ef.readOnly ? pdfField.enableReadOnly() : pdfField.disableReadOnly();
        ef.required ? pdfField.enableRequired() : pdfField.disableRequired();
      } else if (pdfField instanceof PDFDropdown || pdfField instanceof PDFOptionList) {
        if (ef.options?.length) {
          pdfField.acroField.dict.set(PDFName.of("Opt"), optionsArray(pdfDoc, ef.options));
        }
        applyTextDa(pdfField, ef, pdfDoc);
        if (pdfField instanceof PDFDropdown) {
          ef.editable ? pdfField.enableEditing() : pdfField.disableEditing();
          ef.sorted ? pdfField.enableSorting() : pdfField.disableSorting();
        } else {
          ef.multiselect ? pdfField.enableMultiselect() : pdfField.disableMultiselect();
          ef.sorted ? pdfField.enableSorting() : pdfField.disableSorting();
        }
        if (ef.value === "") {
          pdfField.acroField.dict.delete(PDFName.of("V"));
          pdfField.acroField.dict.delete(PDFName.of("DV"));
        } else if (ef.value) {
          try {
            pdfField.select(ef.value);
          } catch {
            pdfField.acroField.dict.set(PDFName.of("V"), PDFHexString.fromText(ef.value));
          }
        }
        ef.readOnly ? pdfField.enableReadOnly() : pdfField.disableReadOnly();
        ef.required ? pdfField.enableRequired() : pdfField.disableRequired();
      } else if (pdfField instanceof PDFRadioGroup) {
        if (ef.options?.length) {
          pdfField.acroField.dict.set(PDFName.of("Opt"), optionsArray(pdfDoc, ef.options));
        }
        if (ef.value === "") {
          pdfField.acroField.dict.delete(PDFName.of("V"));
        } else if (ef.value) {
          try {
            pdfField.select(ef.value);
          } catch {
            pdfField.acroField.dict.set(PDFName.of("V"), PDFName.of(ef.value));
          }
        }
        ef.readOnly ? pdfField.enableReadOnly() : pdfField.disableReadOnly();
        ef.required ? pdfField.enableRequired() : pdfField.disableRequired();
      }
    } catch (err) {
      warn(`could not update field "${ef.name}"`, err);
    }
  }

  // PHASE 3 – create, rename or re-type fields
  const byTargetName = new Map<string, FormField[]>();
  for (const ef of formFields) {
    if (ef.type === "image" || ef.type === "signature") continue;
    if (ef.origName !== undefined && keptOrigNames.has(ef.origName) && !forcedPhase3Ids.has(ef.id)) continue;
    const list = byTargetName.get(ef.name) ?? [];
    list.push(ef);
    byTargetName.set(ef.name, list);
  }

  const createdFields = new Map<string, PDFField>();

  for (const [targetName, editors] of byTargetName) {
    let targetField = createdFields.get(targetName);
    if (!targetField) {
      const maybe = pdfFieldByName.get(targetName);
      if (maybe && pdfFieldType(maybe) === editors[0].type) targetField = maybe;
    }

    // Create the target field lazily: a pure rename must not leave an empty
    // duplicate field behind in the AcroForm.
    const ensureTargetField = (): PDFField | undefined => {
      if (targetField) return targetField;
      const collision = pdfFieldByName.get(targetName);
      if (collision && editors.some((e) => e.origName === targetName)) {
        // The user changed the type of this field: replace it entirely.
        safelyRemoveField(collision, pdfDoc);
        pdfFieldByName.delete(targetName);
        pdfFieldsByNameMulti.delete(targetName);
      }
      const first = editors[0];
      try {
        if (first.type === "text") targetField = form.createTextField(targetName);
        else if (first.type === "checkbox") targetField = form.createCheckBox(targetName);
        else if (first.type === "dropdown") targetField = form.createDropdown(targetName);
        else if (first.type === "list") targetField = form.createOptionList(targetName);
        else if (first.type === "radio") targetField = form.createRadioGroup(targetName);
      } catch (err) {
        warn(`could not create field "${targetName}"`, err);
      }
      if (targetField) createdFields.set(targetName, targetField);
      return targetField;
    };

    for (const ef of editors) {
      const info = toRect(ef);
      if (!info) continue;

      // Field kept its name and type but was forced into phase 3 (e.g. a
      // sibling widget was renamed): update the existing widget in place
      // instead of stacking a duplicate widget on top of it.
      if (ef.origName === ef.name) {
        const existing = pdfFieldByName.get(ef.origName);
        if (existing && pdfFieldType(existing) === ef.type) {
          const widgets = existing.acroField.getWidgets();
          const widget = widgets[ef.widgetIndex];
          if (widget) {
            if (hasMoved(ef)) widget.dict.set(PDFName.of("Rect"), pdfDoc.context.obj(info.raw));
            writeWidgetAppearance(widget, ef);
          } else {
            warn(`widget ${ef.widgetIndex} of "${ef.name}" not found; geometry not updated`);
          }
          targetField = existing;
          createdFields.set(targetName, existing);
          continue;
        }
      }

      if (ef.origName && ef.origName !== ef.name) {
        const sourceField = pdfFieldByName.get(ef.origName);
        if (sourceField && sourceField !== targetField) {
          const targetHasKids =
            targetField?.acroField.dict.lookupMaybe(PDFName.of("Kids"), PDFArray) !== undefined;
          if (targetField && targetHasKids) {
            // Move widgets from sourceField into targetField's Kids array
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
              if (kids) kids.push(widgetRef);
              else targetField.acroField.dict.set(PDFName.of("Kids"), pdfDoc.context.obj([widgetRef]));
              if (hasMoved(ef)) widget.dict.set(PDFName.of("Rect"), pdfDoc.context.obj(info.raw));
              writeWidgetAppearance(widget, ef);
            }
            removeFieldFromAcroFormOnly(sourceField, pdfDoc);
          } else {
            // Simple rename for merged field/widgets: just change the T value
            sourceField.acroField.dict.set(PDFName.of("T"), PDFHexString.fromText(ef.name));
            const widgets = sourceField.acroField.getWidgets();
            for (const widget of widgets) {
              if (hasMoved(ef)) widget.dict.set(PDFName.of("Rect"), pdfDoc.context.obj(info.raw));
              writeWidgetAppearance(widget, ef);
            }
            if (!targetField) {
              targetField = sourceField;
              createdFields.set(targetName, sourceField);
            }
            // Update multi-name map so applyProperties targets the renamed field too
            const oldList = pdfFieldsByNameMulti.get(ef.origName);
            if (oldList) {
              const filtered = oldList.filter((f) => f !== sourceField);
              if (filtered.length > 0) pdfFieldsByNameMulti.set(ef.origName, filtered);
              else pdfFieldsByNameMulti.delete(ef.origName);
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

      // Brand-new widget: add it with explicit appearance options. Without
      // them pdf-lib silently applies a black 1pt border and a white
      // background to every widget it creates.
      const tf = ensureTargetField();
      if (!tf) continue;
      const appearance = {
        ...info.r,
        textColor: ef.textColor ? hexToColor(ef.textColor) : undefined,
        backgroundColor: ef.backgroundColor ? hexToColor(ef.backgroundColor) : undefined,
        borderColor: ef.borderColor ? hexToColor(ef.borderColor) : undefined,
        borderWidth: ef.borderColor ? ef.borderWidth ?? 1 : 0,
      };
      try {
        if (tf instanceof PDFTextField) tf.addToPage(info.page, appearance);
        else if (tf instanceof PDFCheckBox) tf.addToPage(info.page, appearance);
        else if (tf instanceof PDFDropdown) tf.addToPage(info.page, appearance);
        else if (tf instanceof PDFOptionList) tf.addToPage(info.page, appearance);
        else if (tf instanceof PDFRadioGroup) {
          const opt = ef.value ?? ef.options?.[0] ?? "";
          if (opt) tf.addOptionToPage(opt, info.page, appearance);
        }
      } catch (err) {
        warn(`could not add widget for "${targetName}" to page`, err);
      }
    }

    if (!targetField) continue;
    const last = editors[editors.length - 1];
    const allTargetFields = pdfFieldsByNameMulti.get(targetName) ?? [targetField];
    if (!allTargetFields.includes(targetField)) allTargetFields.push(targetField);
    for (const field of allTargetFields) {
      try {
        if (
          field instanceof PDFTextField ||
          field instanceof PDFDropdown ||
          field instanceof PDFOptionList ||
          field instanceof PDFRadioGroup
        ) {
          applyProperties(last, field, pdfDoc);
        } else if (field instanceof PDFCheckBox) {
          const anyChecked = editors.some((ef) => ef.value === "Yes");
          const efWithValue = anyChecked
            ? { ...last, value: "Yes" as const }
            : { ...last, value: undefined as string | undefined };
          applyProperties(efWithValue, field, pdfDoc);
        }
      } catch (err) {
        warn(`could not apply properties to "${targetName}"`, err);
      }
    }
  }

  // PHASE 4 – remove completely deleted fields
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
      const img = field.imageSrc.includes("image/png")
        ? await pdfDoc.embedPng(imgBytes)
        : await pdfDoc.embedJpg(imgBytes);
      page.drawImage(img, {
        x: field.x,
        y: ph - field.y - field.height,
        width: field.width,
        height: field.height,
      });
    } catch (err) {
      warn(`could not draw image "${field.name}"`, err);
    }
  }

  const acroForm = pdfDoc.catalog.getOrCreateAcroForm();

  if (options.flatten) {
    // Flattening draws the field appearances into the static page content, so
    // the appearances must be generated by pdf-lib instead of the viewer.
    acroForm.dict.delete(PDFName.of("NeedAppearances"));
    form.flatten();
    // Safety net: sweep out annotation refs that no longer resolve after
    // flattening (mutating in place, see removeRefFromArray).
    for (const page of pages) {
      const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
      if (!annots) continue;
      for (let i = annots.size() - 1; i >= 0; i--) {
        const ref = annots.get(i);
        const dict = ref instanceof PDFRef ? pdfDoc.context.lookup(ref) : ref;
        if (!(dict instanceof PDFDict)) annots.remove(i);
      }
    }
    return pdfDoc.save();
  }

  acroForm.dict.set(PDFName.of("NeedAppearances"), pdfDoc.context.obj(true));
  return pdfDoc.save({ updateFieldAppearances: false });
}
