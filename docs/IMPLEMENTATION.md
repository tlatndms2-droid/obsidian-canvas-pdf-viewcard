# Canvas PDF Viewcard 0.1.0

## Approved behavior

All Canvas PDF cards are enhanced automatically. The card defaults to a single
page with whole-page fit. A double click opens a reading modal at that page.
Modal navigation never changes the card page. Modal layout/fit/zoom preferences
are shared across popups; page is always initialized from the card.

The four layouts are single, continuous, paired pages (1–2, 3–4), and continuous
paired pages. Fit supports full page and full width; the modal also supports
manual zoom. Card state is keyed by Canvas path and node ID in plugin data.
Existing PDF subpaths initialize card state; changing the referenced PDF or
page subpath resets that state. Vault rename events migrate relevant keys.

## Architecture

- `main.ts`: guarded Canvas adapter, lifecycle, persistence, modal.
- `viewer.ts`: accessible controls, page layout, resize handling and rendering.
- `pdf-pool.ts`: reference-counted documents shared across cards/popups.
- `model.ts`: page/link normalization and fit/spread calculations.

The adapter hides and unloads only the native PDF embed in a Canvas node.
Disabling the plugin disposes custom views, calls the native node's
`unloadChild`, and asks Canvas to recreate the native embed. No node-data
mutation is used. There is no public external API.

Only visible or near-visible pages receive a raster canvas, with two render
jobs per viewer and a bounded backing pixel count. Disposed/evicted canvases
release their backing memory. The last document lease destroys the PDF.js
loading task/worker.

## Validation requirements

Use an isolated Obsidian Sandbox. Verify the UI against the card and popup
mockups, all layouts and fits, page controls, popup independence, duplicates,
new cards, wheel routing, native move/resize/edges, ordinary PDF tabs,
invalid-file retry, disable restoration, and persistence after full process
restart. Verify final public release asset hashes and BRAT activation.
