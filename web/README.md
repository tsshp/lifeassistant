# Riceball Web

Riceball is a static HTML/CSS/JavaScript PWA. It saves JSON and copied photos to a user-selected folder through the File System Access API, so browser storage is never the source of truth.

## Run locally

```bash
python3 -m http.server 4173 --directory web/public
```

Open `http://127.0.0.1:4173` and choose a folder named `Riceball`.

For GitHub Pages deployment and backup instructions, read [the project run guide](../docs/how-to-build-and-run.md).

## Current Scope

- Trips with a per-trip currency
- Wanted-item quantities with quick purchase steppers
- Trip search, item search, unfulfilled filtering, tag/store filters, recent filters, sorting, and one-to-three-column item grid
- Full item, purchase, receipt, store, tag, and purchase-type create/edit/archive/delete workflows
- Quick purchases, purchase history, receipt-to-purchase links, pending receipts, split summaries, and mismatch warnings
- Camera/multi-image capture, square photo normalization, draft review, photo reorder, and rotation
- JSON export/restore plus folder backup, with durable JSON and photo persistence outside browser storage
