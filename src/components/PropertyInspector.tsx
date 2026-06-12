import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../context/WorkspaceContext";
import type { FormField } from "../types/FormField";

function Accordion({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: "1px solid #3e3e42",
        borderRadius: "4px",
        flexShrink: 0,
      }}
    >
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: "100%",
          padding: "0.5rem 0.75rem",
          backgroundColor: "#2d2d30",
          border: "none",
          color: "#cccccc",
          fontSize: "0.8rem",
          fontWeight: 600,
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderRadius: open ? "4px 4px 0 0" : "4px",
        }}
      >
        <span>{title}</span>
        <span
          style={{
            display: "inline-block",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        >
          ▶
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            borderRadius: "0 0 4px 4px",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function InputRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <label style={{ fontSize: "0.75rem", fontWeight: 500, color: "#cccccc" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={Math.round(value * 100) / 100}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        height: "28px",
        padding: "2px",
        backgroundColor: "#1e1e1e",
        border: "1px solid #3e3e42",
        borderRadius: "4px",
        cursor: "pointer",
      }}
    />
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer" }}
      onClick={() => onChange(!checked)}
    >
      <div
        style={{
          width: "18px",
          height: "18px",
          flexShrink: 0,
          border: `1.5px solid ${checked ? "#3b82f6" : "#555558"}`,
          borderRadius: "3px",
          backgroundColor: checked ? "#3b82f6" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background-color 0.1s, border-color 0.1s",
        }}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <polyline
              points="1.5,5.5 4.5,8.5 9.5,2.5"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <span style={{ fontSize: "0.8rem", color: "#cccccc", userSelect: "none" }}>
        {label}
      </span>
    </div>
  );
}

export default function PropertyInspector() {
  const { t } = useTranslation();
  const { selectedFieldId, formFields, setFormFields, setSignatureFieldId, pushHistory } = useWorkspace();
  const field = formFields.find((f) => f.id === selectedFieldId);
  const hasPushedHistory = useRef(false);

  // Reset history flag when a different field is selected
  useEffect(() => {
    hasPushedHistory.current = false;
  }, [selectedFieldId]);

  function updateFieldProps(partial: Partial<FormField>) {
    if (!field) return;
    if (!hasPushedHistory.current) {
      pushHistory();
      hasPushedHistory.current = true;
    }
    setFormFields((prev) =>
      prev.map((f) => {
        if (f.id !== field.id) return f;
        return { ...f, ...partial } as FormField;
      })
    );
  }

  function updateField<K extends keyof FormField>(
    key: K,
    value: FormField[K]
  ) {
    updateFieldProps({ [key]: value } as Partial<FormField>);
  }

  /**
   * Update value on *all* fields that came from the same PDF field
   * (PDF linked-field behaviour). Keyed by origName so the link survives
   * renaming one of the editor fields.
   */
  function updateSharedValue(value: string | undefined) {
    if (!field) return;
    if (!hasPushedHistory.current) {
      pushHistory();
      hasPushedHistory.current = true;
    }
    const key = field.origName ?? field.name;
    setFormFields((prev) =>
      prev.map((f) => {
        if ((f.origName ?? f.name) === key) {
          return { ...f, value } as FormField;
        }
        return f;
      })
    );
  }

  return (
    <aside
      style={{
        width: "300px",
        borderLeft: "1px solid #3e3e42",
        backgroundColor: "#252526",
        display: "flex",
        flexDirection: "column",
        padding: "1rem",
        gap: "0.75rem",
        flexShrink: 0,
        overflow: "auto",
      }}
    >
      <h2
        style={{
          fontSize: "0.875rem",
          fontWeight: 600,
          margin: 0,
          color: "#ffffff",
          borderBottom: "1px solid #3e3e42",
          paddingBottom: "0.5rem",
        }}
      >
        {t("properties")}
      </h2>

      {field ? (
        <>
          <Accordion title={t("general")}>
            <InputRow label={t("name")}>
              <input
                type="text"
                value={field.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </InputRow>
            <InputRow label={t("tooltip")}>
              <input
                type="text"
                value={field.tooltip ?? ""}
                onChange={(e) => updateField("tooltip", e.target.value)}
              />
            </InputRow>
          </Accordion>

          <Accordion title={t("valuesAndFormat")}>
            <InputRow label={t("type")}>
              <select
                value={field.type}
                onChange={(e) =>
                  updateField("type", e.target.value as FormField["type"])
                }
              >
                <option value="text">{t("text")}</option>
                <option value="checkbox">{t("checkbox")}</option>
                <option value="radio">Radio</option>
                <option value="dropdown">{t("dropdown")}</option>
                <option value="list">List</option>
                <option value="signature">{t("signature")}</option>
                <option value="image">{t("image")}</option>
              </select>
            </InputRow>

            {field.type !== "image" && field.type !== "checkbox" && (
              <InputRow label={t("value")}>
                <input
                  type="text"
                  value={field.value ?? ""}
                  onChange={(e) => updateSharedValue(e.target.value)}
                />
              </InputRow>
            )}

            {field.type === "checkbox" && (
              <CheckboxRow
                label={t("value")}
                checked={field.value === "Yes"}
                onChange={(v) => updateSharedValue(v ? "Yes" : undefined)}
              />
            )}

            {field.type === "text" && (
              <InputRow label={t("maxLength")}>
                <NumberInput
                  value={field.maxLength ?? 0}
                  onChange={(v) =>
                    updateField("maxLength", v > 0 ? v : undefined)
                  }
                  step={1}
                  min={0}
                />
              </InputRow>
            )}

            {(field.type === "dropdown" || field.type === "list" || field.type === "radio") && (
              <InputRow label={t("options")}>
                <input
                  type="text"
                  value={field.options?.join(", ") ?? ""}
                  onChange={(e) => {
                    const opts = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    updateField("options", opts.length > 0 ? opts : undefined);
                  }}
                  placeholder="Option A, Option B, Option C"
                />
              </InputRow>
            )}

            {field.type === "signature" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {field.imageSrc && (
                  <img
                    src={field.imageSrc}
                    alt=""
                    style={{
                      maxWidth: "100%",
                      maxHeight: "70px",
                      objectFit: "contain",
                      backgroundColor: "#ffffff",
                      borderRadius: "4px",
                    }}
                  />
                )}
                <button
                  style={{ height: "28px", fontSize: "0.78rem" }}
                  onClick={() => setSignatureFieldId(field.id)}
                >
                  {t("signCapture")}
                </button>
                {field.imageSrc && (
                  <button
                    style={{ height: "28px", fontSize: "0.78rem" }}
                    onClick={() => updateField("imageSrc", undefined)}
                  >
                    {t("signRemove")}
                  </button>
                )}
              </div>
            )}

            {field.type === "image" && field.imageSrc && (
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                <p style={{ margin: 0 }}>Image stamp</p>
              </div>
            )}
          </Accordion>

          <Accordion title={t("layoutAndPosition")}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {(
                [
                  ["x", t("x")],
                  ["y", t("y")],
                  ["width", t("width")],
                  ["height", t("height")],
                ] as ["x" | "y" | "width" | "height", string][]
              ).map(([key, label]) => (
                <InputRow key={key} label={label}>
                  <NumberInput
                    value={field[key] ?? 0}
                    onChange={(v) => updateField(key, v)}
                  />
                </InputRow>
              ))}
            </div>

            {field.type === "text" && (
              <InputRow label={t("alignment")}>
                <select
                  value={field.alignment ?? "left"}
                  onChange={(e) =>
                    updateField(
                      "alignment",
                      e.target.value as FormField["alignment"]
                    )
                  }
                >
                  <option value="left">{t("alignLeft")}</option>
                  <option value="center">{t("alignCenter")}</option>
                  <option value="right">{t("alignRight")}</option>
                </select>
              </InputRow>
            )}

            {(field.type === "text" || field.type === "dropdown" || field.type === "list") && (
              <InputRow label={t("fontSize")}>
                <NumberInput
                  value={field.fontSize}
                  onChange={(v) => updateField("fontSize", v)}
                  step={1}
                  min={1}
                  max={72}
                />
              </InputRow>
            )}
          </Accordion>

          {field.type !== "image" && field.type !== "signature" && (
            <Accordion title={t("appearance")}>
              {(field.type === "text" || field.type === "dropdown" || field.type === "list") && (
                <InputRow label={t("textColor")}>
                  <ColorInput
                    value={field.textColor ?? "#000000"}
                    onChange={(v) => updateField("textColor", v)}
                  />
                </InputRow>
              )}

              <CheckboxRow
                label={t("border")}
                checked={field.borderColor !== undefined}
                onChange={(v) =>
                  updateFieldProps(
                    v
                      ? { borderColor: "#000000", borderWidth: field.borderWidth ?? 1 }
                      : { borderColor: undefined }
                  )
                }
              />
              {field.borderColor !== undefined && (
                <>
                  <InputRow label={t("borderColor")}>
                    <ColorInput
                      value={field.borderColor}
                      onChange={(v) => updateField("borderColor", v)}
                    />
                  </InputRow>
                  <InputRow label={t("borderWidth")}>
                    <NumberInput
                      value={field.borderWidth ?? 1}
                      onChange={(v) => updateField("borderWidth", Math.max(0, v))}
                      step={0.5}
                      min={0}
                      max={12}
                    />
                  </InputRow>
                </>
              )}

              <CheckboxRow
                label={t("background")}
                checked={field.backgroundColor !== undefined}
                onChange={(v) =>
                  updateField("backgroundColor", v ? "#ffffff" : undefined)
                }
              />
              {field.backgroundColor !== undefined && (
                <InputRow label={t("backgroundColor")}>
                  <ColorInput
                    value={field.backgroundColor}
                    onChange={(v) => updateField("backgroundColor", v)}
                  />
                </InputRow>
              )}
            </Accordion>
          )}

          {field.type !== "image" && (
            <Accordion title={t("optionsFlags")}>
              <CheckboxRow
                label={t("required")}
                checked={field.required}
                onChange={(v) => updateField("required", v)}
              />
              <CheckboxRow
                label={t("readOnly")}
                checked={field.readOnly ?? false}
                onChange={(v) => updateField("readOnly", v)}
              />
              {field.type === "text" && (
                <CheckboxRow
                  label={t("multiline")}
                  checked={field.multiline ?? false}
                  onChange={(v) => updateField("multiline", v)}
                />
              )}
              {field.type === "text" && (field.maxLength ?? 0) > 0 && (
                <CheckboxRow
                  label={t("comb")}
                  checked={field.comb ?? false}
                  onChange={(v) => updateField("comb", v)}
                />
              )}
              {field.type === "dropdown" && (
                <>
                  <CheckboxRow
                    label={t("editableCombo")}
                    checked={field.editable ?? false}
                    onChange={(v) => updateField("editable", v)}
                  />
                  <CheckboxRow
                    label={t("sortOptions")}
                    checked={field.sorted ?? false}
                    onChange={(v) => updateField("sorted", v)}
                  />
                </>
              )}
              {field.type === "list" && (
                <>
                  <CheckboxRow
                    label={t("multiselect")}
                    checked={field.multiselect ?? false}
                    onChange={(v) => updateField("multiselect", v)}
                  />
                  <CheckboxRow
                    label={t("sortOptions")}
                    checked={field.sorted ?? false}
                    onChange={(v) => updateField("sorted", v)}
                  />
                </>
              )}
            </Accordion>
          )}

          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            <p style={{ margin: "0.15rem 0" }}>ID: {field.id.slice(0, 8)}…</p>
            <p style={{ margin: "0.15rem 0" }}>Page: {field.pageNumber}</p>
          </div>
        </>
      ) : (
        <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: 0 }}>
          {t("selectFieldHint")}
        </p>
      )}
    </aside>
  );
}
