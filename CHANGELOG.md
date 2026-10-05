# Changelog

All notable changes to this project are documented here. The project follows [Semantic Versioning](https://semver.org/): new features raise the minor version, fixes the patch version.

## [1.2.0] – 2026-10-05

### Added
- Native Windows build: a per-user installer (`…_x64-setup.exe`, no administrator rights needed). It uses Microsoft's WebView2, which ships with Windows 10 and 11. The installer is not code-signed, so Windows SmartScreen asks for confirmation on first run ("More info" → "Run anyway").
- Releases are now built automatically on GitHub for Linux and Windows.

## [1.1.1] – 2026-10-03

### Fixed
- Crash report when closing the editor on Linux after working with a card (WebKitWebProcess aborting with `free(): corrupted unsorted chunks`). A shutdown race between WebKitGTK's GPU painting threads and Mesa; the editor now has WebKit's Skia rasterize on the CPU, so those threads hold no GPU context. Nothing was lost in these crashes — they happened after the window had closed. Override with `WEBKIT_SKIA_ENABLE_CPU_RENDERING=0` if needed.

## [1.1.0] – 2026-10-03

### Added
- **Merge lorebook…**: add the entries of another lorebook to the open one — from a lorebook file (V2 or SillyTavern World Info, e.g. a Chub download) or from a character card's embedded lorebook. Exact duplicates are skipped, so merging the same file twice changes nothing. Available in the Lorebooks mode and in every card's Lorebook tab.

### Fixed
- Lorebook entries could silently overwrite each other when a card was imported into SillyTavern: ST files embedded entries under their id, and appended entries (merged, AI-suggested, Group lorebook) could end up with an id already in use. Cards are now saved with unique entry ids whenever a collision would occur; cards without collisions are saved exactly as loaded.

## [1.0.0] – 2026-10-03

First versioned release. Everything below was added after the initial public release (0.1.0).

### Lorebooks
- **Lorebooks mode**: edit standalone World Info files independently of any card, several at once as tabs. Saves in SillyTavern's World Info format, so files import straight into ST; SillyTavern exports and Chub downloads open directly.
- **AI for lorebook entries**: fill in empty entries from their name and keys, revise selected entries from an instruction, or create the basic entries for a whole topic.
- **Shared lorebooks**: "Sync to characters…" embeds a lorebook into several open cards and links them to it (`extensions.world`), so SillyTavern uses one shared World Info for all of them. Shows which cards are up to date or out of date. A card's own lorebook can be handed over to the Lorebooks mode.
- **Group lorebook**: one click gives every open character lorebook entries with a short profile of each *other* member (and each open persona) — SillyTavern group chats only send the replying character's card. Short cards are copied word for word, longer ones summarized by the AI; profiles are shown for review before anything is applied.
- **Key tester**: paste chat text and see which entries SillyTavern would insert and why (key, always active, or recursion), using SillyTavern's own matching rules.
- **Search** across entry labels, keys and content.
- Warning for keys used by more than one entry.

### Personas
- **Personas mode**: write SillyTavern user personas like characters — name, description, avatar — and save them as cards for SillyTavern's "Convert to Persona".
- AI assistant with a persona-specific prompt, optionally fitted to an open character's world and scenario.

### Prompt size
- **Context budget**: click the total token count to see what a card sends with every message vs. only at the start of a chat, always-active lorebook entries vs. the World Info limit, and the room left for chat history.
- **Condense / Condense all**: shorten fields with AI section by section without changing the character, compared side by side, with a total before/after. A backup of the whole card is written before applying.
- **Character's Note** (`extensions.depth_prompt`) editable in the Prompts tab, with depth and role.

### AI assistant
- **Edit Group**: adapt all open characters together to a new setting while keeping who they are.
- Content checklists for description and personality, linked by a causal chain (formative experience → belief → behaviour today); also applied to group generation.
- Optional per-profile temperature and max tokens.
- "Parallel requests" per profile: bulk operations run several requests at once (for cloud providers).
- Select all / none in the field picker.
- AI-written text uses metric units.

### Fixed
- Avatar image silently lost on save when a card was tracked as JSON.

## [0.1.0] – 2026-08-30

Initial public release: PNG/JSON character cards (spec V2 and V3), avatar cropping, lorebook editor, several characters as tabs, prompt presets, token counter, inline warnings, auto-backup, recent files, and the optional AI assistant (field refinement, lorebook suggestions, image prompts, consistency check, group generation).

[1.2.0]: https://github.com/DevCardmaker/SillyTavern-Charactercard-Editor-and-Maker/releases/tag/v1.2.0
[1.1.1]: https://github.com/DevCardmaker/SillyTavern-Charactercard-Editor-and-Maker/releases/tag/v1.1.1
[1.1.0]: https://github.com/DevCardmaker/SillyTavern-Charactercard-Editor-and-Maker/releases/tag/v1.1.0
[1.0.0]: https://github.com/DevCardmaker/SillyTavern-Charactercard-Editor-and-Maker/releases/tag/v1.0.0
