# SillyTavern Card Editor

A desktop editor for [SillyTavern](https://github.com/SillyTavern/SillyTavern) character cards (spec V2 and V3), built with Tauri, React, and Rust. Edit cards embedded in PNG avatars or as standalone JSON, work on several characters at once, and optionally use an AI assistant to help write and check them.

> **Unofficial project.** Not affiliated with, endorsed by, or sponsored by SillyTavern or its developers. "SillyTavern" is used here only to describe compatibility with its character card format. See [Disclaimer](#disclaimer) below.

## Features

**Core editing**
- Open and save character cards as PNG (with the card embedded as a chunk) or standalone `.json`, spec V2 and V3
- Avatar image handling with cropping
- Lorebook (World Info) editor, with import/export as a standalone file
- Reusable prompt presets for System Prompt / Post-History Instructions
- Live token counter for the main text fields
- Inline warnings for common authoring mistakes (unbalanced `{{macro}}` braces, empty name, empty first message, a lorebook entry with no keys)
- Lenient recovery for cards that fail strict validation, backing up the original file first
- Auto-backup before every overwrite, drag-and-drop to open a file, a recent-files list with thumbnails, and keyboard shortcuts (Ctrl+N/O/S)

**Working with several characters at once**
- Multiple character tabs open simultaneously — build a whole group (a family, a class, an NPC roster) in one sitting
- A shared "group folder" for saving a session's cards together, plus one-click bulk save/open for a whole folder
- A per-tab autosave snapshot as a safety net while switching between many open characters

**AI assistant (optional, bring your own endpoint)**
Point the app at any OpenAI-compatible `/v1/chat/completions` endpoint — a local server (llama.cpp, LM Studio, text-generation-webui, ...) or a cloud provider you supply your own API key for. Every AI feature is opt-in; the editor works fully without configuring one.
- Iteratively refine individual card fields from a free-text instruction
- Propose new lorebook entries from a description
- Generate an avatar image-generation prompt, tuned to different image models (Stable Diffusion, Pony Diffusion, Qwen-Image, Z-Image, Krea 2/FLUX) and art styles
- Check every currently open character together for contradictions (ages, relationships, names, timeline)
- Generate a whole group of new, mutually consistent characters from a single prompt

## Getting started

Requires [Node.js](https://nodejs.org/) and the [Rust toolchain](https://www.rust-lang.org/tools/install) (see the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform).

```sh
npm install
npm run tauri dev    # run in development mode
npm test              # run the test suite
```

To build a distributable bundle:

```sh
npm run build:linux   # AppImage + rpm (the only bundle targets currently configured)
```

For other platforms, adjust the `bundle.targets` in `src-tauri/tauri.conf.json` and run `npm run tauri build`.

**Platform support:** currently built and tested on Linux only. No native Windows build yet (tracked as future work) — Windows users can run it today under [WSL](https://learn.microsoft.com/windows/wsl/install).

### Using the AI assistant

Open "AI Assistant…" (or any other AI-powered button) and set up a provider under its settings: a base URL, an optional API key, and a model name. This works with a local model server just as well as a cloud API — nothing is sent anywhere unless you configure a provider yourself.

## Disclaimer

This is an independent, unofficial tool and is **not affiliated with, endorsed by, or sponsored by** the SillyTavern project or its developers.

This software is provided "as is", without warranty of any kind — see [LICENSE](LICENSE). The author accepts no responsibility or liability for:
- how you use this software,
- the content of any character cards, lorebook entries, images, or other content you create, edit, or generate with it, or
- any consequences of sharing or distributing that content.

**AI features are optional and bring-your-own-endpoint.** If you configure an AI provider, any data you send through the assistant features goes directly to that endpoint and is subject to that provider's own terms of service and privacy policy — this project has no visibility into, or control over, what happens to it there.

**API keys and provider settings are currently stored locally in plain text** (not encrypted), in your OS's app config directory. Treat that file with the same care you'd give any other file containing credentials.

This tool performs **no content moderation or filtering** of any kind. You are solely responsible for ensuring your use of it, and any content you create with it, complies with the laws applicable to you.

## License

[MIT](LICENSE)
