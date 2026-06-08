# PDF Form Editor

A cross-platform desktop application for visually editing PDF forms and documents. Built with **Tauri v2**, **React 19**, **pdf-lib**, and **pdfjs-dist**.

## Features

- **Load & Render PDFs** — Open existing PDF files and render pages at any zoom level.
- **Visual Form Editing** — Drag, resize, and reposition AcroForm fields (text, checkbox, dropdown, radio, list) directly on the page.
- **Field Properties** — Edit field metadata in a side panel: name, font size, alignment, max length, read-only, required, tooltip, and options.
- **Add New Fields** — Insert text fields, checkboxes, dropdowns, radio groups, images, and signature placeholders.
- **Images & Signatures** — Embed PNG/JPG images and signature placeholders on any page.
- **Undo / Redo** — Full history stack for all editing operations.
- **Copy & Paste** — Duplicate fields with keyboard shortcuts.
- **Keyboard Navigation** — Move selected fields with arrow keys (1px / 10px with Shift).
- **Save** — Export modified PDFs with all form fields, properties, and images preserved.
- **Multi-language** — i18n-ready (currently German/English ready via i18next).

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 19 + TypeScript |
| Desktop Shell | Tauri 2 (Rust) |
| Build Tool | Vite 7 |
| PDF Rendering | pdfjs-dist 6.x |
| PDF Manipulation | pdf-lib 1.17.x |
| Canvas / Drag | Konva + react-konva |
| Styling | CSS (custom) |
| Icons | lucide-react |
| i18n | i18next + react-i18next |

## Project Structure

```
.
├── public/              # Static assets (CMaps, standard fonts)
├── src/
│   ├── components/      # React UI components (TopBar, CanvasWorkspace, FieldOverlay, etc.)
│   ├── context/         # React Context (WorkspaceContext – state & history)
│   ├── hooks/           # Custom hooks (useAcroFormExtractor)
│   ├── types/           # TypeScript types (FormField)
│   ├── utils/           # PDF builder (buildPdfBytes.ts)
│   ├── App.tsx          # Root component
│   └── main.tsx         # Entry point
├── src-tauri/
│   ├── src/             # Rust source (Tauri commands)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri CLI](https://tauri.app/start/prerequisites/)

### Install

```bash
npm install
```

### Development

```bash
npm run tauri dev
```

This starts the Vite dev server on `http://localhost:1420` and the Tauri desktop window.

### Build

```bash
npm run tauri build
```

The distributable app will be in `src-tauri/target/release/bundle/`.

## Key Components

- **`CanvasWorkspace`** — Renders PDF pages via pdfjs-dist and hosts the Konva overlay for interactive field manipulation.
- **`FieldOverlay`** — Konva-based layer for rendering, selecting, dragging, and resizing form fields.
- **`PropertyInspector`** — Side panel for editing field properties in real time.
- **`TopBar`** — File open/save, zoom controls, page navigation, and field insertion tools.
- **`useAcroFormExtractor`** — Parses loaded PDFs with pdf-lib to extract AcroForm fields into editor-friendly `FormField` objects.
- **`buildPdfBytes`** — Reconstructs the PDF from the editor state: updates existing fields, renames/moves widgets, creates new fields, removes deleted ones, and embeds images.

## License

MIT
