# Changelog

All notable changes to this project are documented here. The project follows [Semantic Versioning](https://semver.org/): new features raise the minor version, fixes the patch version.

## [1.5.0] – 2026-10-16

### Added
- **From Story…**: create character cards from a story — your fan fiction, a short story, an excerpt from a book (paste it or load a `.txt`/`.md` file). The story is read part by part, so it works with small local models too:
  - **People**: everyone in the story is listed with how often they appear; the main characters are preselected. Names the model gets wrong are checked against the text, and entries it didn't connect ("the sister" and "Grete") can be merged by hand. Mark the narrator of a first-person story.
  - **You in the story**: a new person meeting the characters for the first time, a new person who has always been part of it, someone taking the place of a story character, or one of the story's characters. The cards and their opening scenes are written for that — the character you play or replace becomes `{{user}}`.
  - **Cards**: notes are taken on each picked person from every part they appear in, and the card is written new from the notes — not copied from the story — as the person is at the end. The opening scene continues after the story's end.
  - **Lorebook**: places, groups and terms of the story's world, plus side characters without a card of their own — short entries with keys from the names the story uses, each checked and editable before adding. It opens in the Lorebooks mode and is shared by all new cards. Works without creating any cards, too.
  - **Persona**: in a story character's place, a persona fitted to the new cards and your wishes; playing a story character, that character as your persona. The opening scenes can be rewritten for it. It opens in the Personas mode.
  - The language of the cards is the story's (detected) or one you type; replies in another language are retried once and flagged.
- A hint on how to set up the new cards as a group chat in SillyTavern, in Create Group, Split Card and From Story.

## [1.4.0] – 2026-10-11

### Added
- **Translate…**: translate a card into any language the model knows — type the language yourself (Deutsch, 日本語, Norsk, …). Every text field, the alternate greetings, the Character's Note and optionally the lorebook are translated part by part, and every part is checked: macros like `{{char}}`/`{{user}}`, tags like `<START>`, all numbers and the length must survive, and a part that comes back unchanged counts as not translated. A part that fails is retried once, then keeps its original text and is listed. Names aren't translated but written in the new language's script where it differs (Дарья → Darja, 林小雨 → Lin Xiaoyu), with the same spelling everywhere — name field, text and lorebook keys. Lorebook keys are translated, except names. The result opens as a copy in a new tab.
- **Split Card…**: turn a group card — one card describing several characters — into one card per person. First the people are found in the card *and* its lorebook; you pick who to extract (or add a name), then each person is extracted on their own and can be redone on their own. Cards that come out much shorter than expected, or longer than the whole group card, are flagged. The group card stays unchanged; its lorebook and image can be copied to the new cards.
- **Merge into one card…**: combine several open characters into one group card that portrays all of them. Each person's text is copied into its own section (with `{{char}}` replaced by their name), optionally shortened to 75/60/50 % with the section-by-section condensing. Scenario and first message can be taken from one of the cards or written new for the group; lorebooks are merged and an image can be picked. The original cards stay unchanged.
- **Create Group… with reference cards**: tick open cards as references to build new characters on them — the family of a single character, the missing members of a set, or people the cards only mention. Facts from the references are kept, never contradicted. Optionally pick a persona the new characters can relate to (written as `{{user}}`), and optionally have the reference cards updated so they know the new characters: short additions only, shown for review, with a backup of each changed card first.
- **Editable prompts**: the instructions the AI gets come from a text file you can edit (`prompts.txt` in the app's settings folder) — "Create/Edit prompts file" and "Reload prompts" under "Provider & prompt settings" in every AI window. Each section can be changed or switched off; deleted sections fall back to the built-in text, so improvements in updates still arrive. "Show last prompt" shows what was actually sent.
- **Persona "Fit to characters"** now takes several characters at once, for a persona meant for a group chat, with a "Select all" button.

## [1.3.0] – 2026-10-06

### Added
- **Test chat**: a sidebar next to the editor to try out how a character behaves — or how several fit together as a group chat. Replies use the cards as they are right now, unsaved edits included, so you can change a field and regenerate. Lorebook entries (shown after each reply), a persona, the Character's Note and post-history instructions are applied roughly the way SillyTavern does; in a group, only the replying character's card is sent (SillyTavern's "swap" mode). Pick who replies next or let them take turns. The sidebar can be resized by dragging its left edge. Nothing is saved.
- **Consistency Check fixes**: each finding can get a suggested fix — small text edits across the affected cards, optionally guided by a hint which version is right ("Mother is 45"). Every quoted passage is checked against the card, and you review, edit or untick each change before it's applied. "Suggest fixes for all" handles every finding at once.

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
