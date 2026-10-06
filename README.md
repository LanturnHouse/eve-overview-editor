# EVE Overview Editor

**English** · [한국어](README.ko.md)

A local web app for editing EVE Online overview settings (the YAML files in `Documents\EVE\Overview\`) in your browser.
It runs on a tiny dependency-free Node.js server bound to `127.0.0.1` only, and sends nothing to the internet.

## Run

Double-click `start.bat` (or run `node server.mjs` and open http://localhost:5173). Node.js 18+ is required.

## Workflow

1. In the game, **export** your overview settings → a YAML file is saved to `Documents\EVE\Overview`.
2. In the editor, pick the file → edit → **Save** (the previous version is backed up to `backups/` before it is overwritten).
3. In the game, **import** the overview settings.

## Features

- **Presets** – tick groups in a searchable category tree, hide / always-show state filters, merge / subtract between presets, duplicate / rename (tab references update automatically)
- **Overview tabs** – a tab-name editor where what you type is shown with its styling (plus a tag field for the raw markup), a simple toolbar (colors, size, bold / italic / underline), an EVE-verified special-character picker, preset / bracket assignment, per-tab columns
- **Flag & background colors** – drag to set state priority, colors, blinking; the preview lists every state
- **Columns** – visibility and order
- **Ship labels** – label pieces, order, the same styled editor + toolbar per piece, live preview on region backgrounds (Wormhole, Caldari, Amarr, Minmatar, Gallente), and a color scheme helper: pick a main color and get matching sub colors that stay readable on all five backgrounds
- **Files & advanced** – change summary, cleanup tools, backup restore and deletion, raw YAML editing
- Undo / redo (Ctrl+Z / Ctrl+Y), save (Ctrl+S), drag & drop a YAML file onto the window
- **Multilingual UI** – English · 한국어 · 日本語 · Русский · 中文. It follows your browser language by default; change it with the language selector in the top bar.

## Notes

- Group / category names come from ESI (en, ko, ja, ru, zh) and are bundled in `public/data/groups.json`. Refresh with `node tools/build-data.mjs`.
- Check conversion accuracy with `node tools/roundtrip.mjs <file>` – it reads and rewrites a file and tells you whether the result is identical to the original.
- State ID names follow the public data of [kormat/eve-overview-tool](https://github.com/kormat/eve-overview-tool) and [Z-S Overview Customizer](https://github.com/Arziel1992/Z-S-Overview-Customizer). Colors shown for named colors are approximations of the in-game ones.
- Japanese, Russian and Chinese state / column names are translations and may differ from the official in-game terms. Pull requests are welcome.

## CCP notice

This is an unofficial, free, non-commercial fan tool. This material is used with limited permission of CCP Games hf. No official affiliation or endorsement by CCP Games hf is stated or implied.

© 2014 CCP hf. All rights reserved. "EVE", "EVE Online", "CCP", and all related logos and images are trademarks or registered trademarks of CCP hf.

- The background images in `public/img/regions/` are EVE Online imagery owned by CCP hf. They are **not** covered by this repository's MIT license (source code only), and are used only for a free, non-commercial purpose (the ship-label readability preview) under CCP's content policy. They will be removed on CCP's request.
- The code is MIT licensed. [js-yaml](https://github.com/nodeca/js-yaml) (MIT) is bundled in `public/vendor/`.
