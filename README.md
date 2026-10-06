# SillyTavern Card Editor

A desktop editor for [SillyTavern](https://github.com/SillyTavern/SillyTavern) character cards (spec V2 and V3), built with Tauri, React, and Rust. Edit cards embedded in PNG avatars or as standalone JSON, work on several characters at once, and optionally use an AI assistant to help write and check them.

> **Unofficial project.** Not affiliated with, endorsed by, or sponsored by SillyTavern or its developers. "SillyTavern" is used here only to describe compatibility with its character card format. See [Disclaimer](#disclaimer) below.

## Features

**Core editing**
- Open and save character cards as PNG (with the card embedded as a chunk) or standalone `.json`, spec V2 and V3
- Avatar image handling with cropping
- Lorebook (World Info) editor, with import/export as a standalone file
- A separate **Lorebooks** mode for standalone World Info files, independent of any card: several open as tabs, saved in SillyTavern's World Info format (importable straight into ST), and SillyTavern exports / Chub downloads open directly
- **Shared lorebooks**: embed one lorebook into several cards and link them to it, with an up-to-date / out-of-date overview per card
- **Merge lorebooks**: add the entries of another lorebook file or of a card's lorebook to the open one, skipping exact duplicates
- A **key tester** that shows which lorebook entries SillyTavern would insert for a piece of chat text, and why — plus search across entries and a warning for keys shared between entries
- A **Personas** mode for SillyTavern user personas (name, description, avatar), saved as cards for SillyTavern's "Convert to Persona"
- A **context budget** view: what a card sends with every message, what only at the start of a chat, and how much room is left for the chat history
- The **Character's Note** (per-character Author's Note) with depth and role
- Reusable prompt presets for System Prompt / Post-History Instructions
- Live token counter for the main text fields
- Inline warnings for common authoring mistakes (unbalanced `{{macro}}` braces, empty name, empty first message, a lorebook entry with no keys)
- Lenient recovery for cards that fail strict validation, backing up the original file first
- Auto-backup before every overwrite, drag-and-drop to open a file, a recent-files list with thumbnails, and keyboard shortcuts (Ctrl+N/O/S)
- "Save as Copy…" to export the current card to another path/format without changing what "Save" points at

**Working with several characters at once**
- Multiple character tabs open simultaneously — build a whole group (a family, a class, an NPC roster) in one sitting
- A shared "group folder" for saving a session's cards together, plus one-click bulk save/open for a whole folder
- A per-tab autosave snapshot as a safety net while switching between many open characters
- **Group lorebook**: one click gives every open character lorebook entries describing the *other* members — SillyTavern group chats only send the replying character's own card

**AI assistant (optional, bring your own endpoint)**
Point the app at any OpenAI-compatible `/v1/chat/completions` endpoint — a local server (llama.cpp, LM Studio, text-generation-webui, ...) or a cloud provider you supply your own API key for. Every AI feature is opt-in; the editor works fully without configuring one.
- Multiple saved provider profiles (switch between a local model and one or more cloud APIs) with a one-click connection test
- Iteratively refine individual card fields from a free-text instruction
- Propose new lorebook entries from a description — including whole topics at once ("a family for this character", "a basic fantasy world"), kept brief and consistent with the entries already there
- Fill in empty lorebook entries from their name and keys, or revise selected entries from an instruction, with an old/new preview before applying
- Generate an avatar image-generation prompt, tuned to different image models (Stable Diffusion, Pony Diffusion, Qwen-Image, Z-Image, Krea 2/FLUX) and art styles
- **Test chat**: try out a character — or several as a group chat — in a sidebar next to the editor, using the cards as they are right now (unsaved edits included). Lorebook entries, persona and Character's Note are applied roughly the way SillyTavern does; nothing is saved
- Check every currently open character together for contradictions (ages, relationships, names, timeline) — and fix them right there: the AI suggests small text edits across the affected cards, checked against the cards and shown for review before anything is applied
- Generate a whole group of new, mutually consistent characters from a single prompt
- Edit a whole group at once, e.g. move every open character to a new setting while keeping who they are
- Condense long fields section by section to save prompt tokens without changing the character (one field or all at once, compared side by side, with a backup first)
- Write personas, optionally fitted to an open character's world
- Optional per-profile temperature, max tokens, and parallel requests for faster bulk operations with cloud providers
- AI-written text uses metric units

## Download

Ready-made builds are on the [Releases page](https://github.com/DevCardmaker/SillyTavern-Charactercard-Editor-and-Maker/releases/latest):

- **Windows 10/11:** `…_x64-setup.exe`, installs for the current user, no administrator rights needed. The installer is not code-signed, so Windows SmartScreen asks for confirmation the first time ("More info" → "Run anyway").
- **Linux:** `.AppImage` (runs on most distributions, make it executable first) or `.rpm` (Fedora, openSUSE and similar).

## Getting started

Requires [Node.js](https://nodejs.org/) and the [Rust toolchain](https://www.rust-lang.org/tools/install) (see the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform).

```sh
npm install
npm run tauri dev    # run in development mode
npm test              # run the test suite
```

To build a distributable bundle:

```sh
npm run build:linux   # on Linux: AppImage + rpm
npm run tauri build   # on Windows: NSIS installer (configured in src-tauri/tauri.windows.conf.json)
```

Release builds for both platforms are made by the GitHub Actions workflow in `.github/workflows/build.yml`: pushing a `vX.Y.Z` tag creates a draft release with the matching CHANGELOG section and all bundles attached.

### Using the AI assistant

Open "AI Assistant…" (or any other AI-powered button) and set up a provider under its settings: a base URL, an optional API key, and a model name. This works with a local model server just as well as a cloud API — nothing is sent anywhere unless you configure a provider yourself.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Disclaimer

This is an independent, unofficial tool and is **not affiliated with, endorsed by, or sponsored by** the SillyTavern project or its developers.

This software is provided "as is", without warranty of any kind — see [LICENSE](LICENSE). The author accepts no responsibility or liability for:
- how you use this software,
- any damage, data loss, or corruption of files it may cause, including to your character cards or your system (keep your own backups of anything you care about),
- the content of any character cards, lorebook entries, images, or other content you create, edit, or generate with it, or
- any consequences of sharing or distributing that content.

**AI features are optional and bring-your-own-endpoint.** If you configure an AI provider, any data you send through the assistant features goes directly to that endpoint and is subject to that provider's own terms of service and privacy policy — this project has no visibility into, or control over, what happens to it there.

**API keys and provider settings are currently stored locally in plain text** (not encrypted), in your OS's app config directory. Treat that file with the same care you'd give any other file containing credentials.

This tool performs **no content moderation or filtering** of any kind. You are solely responsible for ensuring your use of it, and any content you create with it, complies with the laws applicable to you.

## License

[MIT](LICENSE)
