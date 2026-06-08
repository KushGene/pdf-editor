export interface FormField {
  id: string;
  pageNumber: number;
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "list" | "signature" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  fontSize: number;
  alignment?: "left" | "center" | "right";
  options?: string[];
  tooltip?: string;
  value?: string;
  maxLength?: number;
  readOnly?: boolean;
  multiline?: boolean;
  imageSrc?: string;
  /** Index of the widget inside the AcroField (for multi-widget fields). */
  widgetIndex: number;
  /** Original value at PDF-load time. */
  origValue?: string;
  /** Original coordinates at PDF-load time. If undefined the field was user-added. */
  origX?: number;
  origY?: number;
  origWidth?: number;
  origHeight?: number;
  /** Original name at PDF-load time. Used to track which PDF field this editor field came from. */
  origName?: string;
}
