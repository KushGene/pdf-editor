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
  /** Text color as hex (#rrggbb). Undefined = keep whatever the PDF defines. */
  textColor?: string;
  /** Border color as hex (#rrggbb). Undefined = no border. */
  borderColor?: string;
  /** Border width in points. Only meaningful when borderColor is set. */
  borderWidth?: number;
  /** Background color as hex (#rrggbb). Undefined = transparent. */
  backgroundColor?: string;
  /** Comb flag for text fields (evenly spaced characters, requires maxLength). */
  comb?: boolean;
  /** Editable combo flag for dropdowns. */
  editable?: boolean;
  /** Sort options flag for dropdowns and option lists. */
  sorted?: boolean;
  /** Multiselect flag for option lists. */
  multiselect?: boolean;
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
