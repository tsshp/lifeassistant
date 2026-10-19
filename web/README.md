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
- Search, unfulfilled filtering, and one-to-three-column item grid
- Receipt totals and pending receipt count
- JSON and photo persistence outside browser storage

## Deliberate Next Steps

- Add image capture/import improvements, crop/reorder flows, and receipt-photo display
- Add tags, stores, purchase metadata, receipt splits, archive flows, and richer backup/export controls
