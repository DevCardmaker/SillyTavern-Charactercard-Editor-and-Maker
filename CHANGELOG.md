# Changelog

All notable changes to this project are documented here. The project follows [Semantic Versioning](https://semver.org/): new features raise the minor version, fixes the patch version.

## [Unreleased]

### Added
- The **quick actions** above text fields also work for **lorebook entries** (with the entry's name and keys as background) and the **persona description**.
- The window title shows the app's **version**.
- The recent cards and recent groups lists keep **20** entries instead of 5, now that they have a tab of their own.

### Changed
- **Lorebooks, Personas and Presets in the new layout**: their open files are listed in the left sidebar like the open cards, and each mode has the same header as the characters — name and file, Save, its menus, the AI profile and Settings. The old rows of buttons and tabs are gone.
- **Sending to SillyTavern remembers its target across restarts**: a saved card or persona that came from SillyTavern (or was sent there) overwrites the same character next time, even after closing the editor. The links are kept in the app's own folder, not in the cards.

## [1.19.0] – 2026-11-22

### Added
- **Library**: a new page in the left sidebar for your card collection. It's a normal folder (by default in the app's data folder, changeable under Settings → Library & downloads): cards at the top, every subfolder shown as a **group** with "Open all", and lorebooks from the "Lorebooks" folder. Search by name or tag; tick cards and lorebooks (single ones, a whole group, or "Select all" for everything the search shows) and **open**, **delete** or **send** them **to SillyTavern** together; open the folder in the file manager.
- **To SillyTavern…** from the library lists every ticked entry with its target: a card overwrites the character with the same name or is added as new (like "Send to SillyTavern", without opening it first); a lorebook becomes SillyTavern World Info — over the one of the same name, or as a copy "Name (2)". Whatever is overwritten is kept as a snapshot first.
- **Download…** on the Library page: paste links, one per line. Chub, JanitorAI, Pygmalion, RisuRealm, Perchance and AICharacterCards are fetched through SillyTavern's own downloader (nothing is added to SillyTavern itself); **Botbooru** character and lorebook pages and direct links to a card PNG or JSON are fetched by the editor. A link to a web page of an unsupported site says so, instead of failing silently. Give the batch a **group** name to put the cards into that subfolder, and tick "Open them afterwards" to open them right away. Lorebooks go into the "Lorebooks" folder under their own name. A card that's already there unchanged is simply written again; a changed one is added as a second file ("Anna-2.png").
- **File → Save to Library…** and **Group → Save Group to Library…** put copies of the open card(s) into the library, a group into its own subfolder.
- **Proxy** under Settings → Library & downloads, for the editor's own internet requests (cloud AI providers and direct card links), e.g. a VPN container's HTTP proxy; addresses on this computer and the home network never go through it. Downloads through SillyTavern use SillyTavern's own proxy setting: the page shows a ready-made `requestProxy` block for its `config.yaml` (filled in with your proxy and your local model servers as exceptions) to copy, with a short explanation and a link to SillyTavern's documentation.

## [1.18.0] – 2026-11-22

### Added
- **SillyTavern connection.** Enter SillyTavern's address under Settings → SillyTavern (with a login for basicAuthMode if needed) and test it. A new **SillyTavern** page in the left sidebar lists its characters, groups and personas, with search and preview pictures.
- **Characters**: open any of them as a card here, copy or delete them in SillyTavern (chats are kept unless you tick "Also delete its chats").
- **Send to SillyTavern** (File menu, or on the SillyTavern page): over the character the card came from, over one with the same name, or as a new character. Overwriting works like SillyTavern's own "Replace / Update", so the chats stay; SillyTavern's previous version is kept as a snapshot of the card first ("before sillytavern" in the Snapshots tab). A card without a picture keeps SillyTavern's picture. SillyTavern resets the favourite star and forgets the current chat on every import (even its own "Replace / Update"); the editor puts both back, so overwriting changes only the card.
- **Groups**: open all members of a SillyTavern group, delete a group (the warning says that SillyTavern deletes its group chats too), and **Create Group in SillyTavern…** (Group menu) from the open cards, in an order you choose — the order of first messages in a group chat.
- **Snapshots of unsaved cards**: a card that was never saved (e.g. opened from SillyTavern) now lists its snapshots too — kept in the app's own folder under the card's name — and can save snapshots by name.
- **Personas**: open SillyTavern's personas in the Personas mode, and send personas there ("Send to SillyTavern…" in the Personas toolbar). SillyTavern can only save its settings as a whole, so a settings snapshot is made first.

## [1.17.0] – 2026-11-22

### Added
- **Quick actions above every card text field**: Enhance, Rephrase, Shorten, Lengthen, Fix and **Less AI slop**, plus Vivid, Emotion and a custom instruction under "More". They work on the selected part, or on the whole field when nothing is selected, and always show old and new side by side first: Accept, Reject or Retry. Accept can be undone with Ctrl+Z.
- **Your own quick actions**: "More → Manage my buttons…" adds buttons with an instruction of your own; they appear under "More" above every field.
- The code checks each answer before showing it: macros like {{char}} and {{user}} must survive (a character name the model wrote instead of {{char}} is turned back), Shorten must really shorten, Lengthen really lengthen, and the language must stay the same. Otherwise the AI gets one more try, and a remaining problem is shown above the preview.
- **Context** tab in the right sidebar: which parts of the card (and which persona) the AI sees as background for quick actions and brainstorming, with the tokens each part costs. Name, Description, Personality and Scenario by default.
- **Brainstorm** tab: talk with the AI about the open card — ideas, weaknesses, questions. It never changes the card. One conversation per card, kept until the program closes; nothing is saved.
- **Settings** menu in the header: AI providers, prompts and your own quick actions in one window. Every AI window now shows a single line with the profile in use and a "Change…" link instead of the old "Provider & prompt settings" block.
- **AI profile switcher** in the header (and at the top of the other modes): always shows which model answers, and switches in one click.
- **Delete snapshots**: a ✕ next to every entry in the Snapshots tab removes that backup file, after asking.
- New prompt sections for all of this in the prompts file (`inline_*`, `brainstorm`).

### Fixed
- An empty answer from the AI is now reported as an error instead of silently showing nothing — with a hint when a thinking model (such as DeepSeek V4) used up its token limit on hidden reasoning. Quick actions and the brainstorm chat use the provider profile's "Max tokens" for this reason.

## [1.16.0] – 2026-11-22

### Changed
- **New layout.** The row of 16 buttons and the character tabs are gone. The open cards are now listed in a **left sidebar**, which also switches between Characters, Lorebooks, Personas and Presets. The tools for the open card sit in a **right sidebar**, one tab each: Snapshots, Test chat, AI Assistant, Context budget, Key test and Recent. Both sidebars can be resized by dragging and hidden; their width is remembered.
- The header shows the open card with its picture and token count, "Save", and four menus: **File**, **Create**, **Group** and **Card**.
- The avatar moved into a tab of its own, so the text fields get the full width.
- Tools in the right sidebar keep running while you look at another tab, so a test chat or an AI request isn't lost. Tools that work on one card start over when you switch to another card, so nothing meant for one card lands in the next.

### Added
- **Recent cards** and **Recent groups** in a "Recent" tab of the right sidebar, always at hand instead of only while no card is open; the start screen shows the recent groups too. Opening a folder or "Save Group…" records the cards as one group; a click reopens all of them, skipping cards that are already open. These no longer push every single card into the recent cards.
- **Snapshots**: save the card as it is right now under a name, unsaved edits and picture included. Snapshots are listed with every save's backup and open in the familiar comparison.

## [1.15.0] – 2026-11-15

### Fixed
- **Generate image prompt…** for **Pony Diffusion**: local models like Cydonia wrote 60 and more tags, repeated some, dropped `score_9` and invented source tags. Now the full score prefix is always set, only real source tags stay, duplicates and rating words posing as tags (`safe_for_work`, `no_nudity`) are removed, and the list is cut after 35 content tags. The AI is also asked for about 20 to 30 visible things.

## [1.14.0] – 2026-11-14

### Added
- **Generate image prompt…**: 23 new **art styles**, grouped in the list: Photo (cinematic, studio portrait, polaroid, film noir, selfie, cosplay photo), Painting & drawing (watercolor, oil, gouache, pencil sketch, charcoal, ink/manga monochrome, ukiyo-e, Art Nouveau), Stylized (semi-realistic, retro 90s anime, chibi, visual novel sprite, western comic, 3D render, pixel art) and Mood (dark fantasy, cyberpunk). Each comes with its own negative prompt.
- For Anima, Pony and Stable Diffusion the style's Danbooru tags are set in code. Anima also gets a closing style sentence, because its quality tags otherwise drown out the medium (in testing, watercolor and chibi only came through this way).
- A hint when a photo style is picked for Anima, which draws photo looks poorly.

### Fixed
- **Generate image prompt…** now always asks for an English prompt. With a German card, prose models like Krea 2 sometimes got a German prompt, which they barely understand.
- A lead-in the AI copied from the style description ("Watercolor painting: …") no longer ends up as a tag.

## [1.13.0] – 2026-11-14

### Added
- **Generate image prompt…**: a **Framing** choice: portrait, upper body, cowboy shot (to mid-thigh) or full body, or left to your instruction. For Anima, Pony and Stable Diffusion the matching tag is set in code and conflicting ones are removed; full body also keeps cropped feet out through the negative prompt. The choice is remembered.

## [1.12.0] – 2026-11-14

### Added
- **Generate image prompt…**: a matching **negative prompt** with its own copy button. It is fixed per target model and art style (for example Anima's low score tags, or anime and drawing terms ruled out for a realistic photo), so it needs no extra AI call.
- **Generate image prompt…**: a **Rating** choice (let the AI decide, SFW, NSFW). For Anima and Pony the chosen rating tag is set in code after the answer, so the AI can no longer pick a different one; the negative prompt follows the choice too.
- **Generate image prompt…**: a suggested image size in 2:3, the shape of SillyTavern avatars (832 × 1216 for SDXL, Pony and Anima).

### Changed
- **Generate image prompt…** remembers the target model, art style and rating for next time.

## [1.11.0] – 2026-11-14

### Added
- **Generate image prompt…**: new model style **Anima**. The prompt comes as Danbooru tags in the order Anima expects (quality, period, rating, subject count, character, other tags), with spaces instead of underscores, plus an optional sentence for composition or lighting.

## [1.10.0] – 2026-11-04

### Added
- **Group greetings** in the Greetings tab: first messages that are only used when a new group chat starts, for SillyTavern's [Group Greetings](https://github.com/SillyTavern/Extension-GroupGreetings) extension, with its choice between a random one and picking one yourself. SillyTavern ignores them without the extension. They work in V2 and V3 cards, are translated with the card and appear in the version history.
- **Group Greeting…**: let the AI write one opening scene for a group chat. Tick who's there, set the order and say what happens. SillyTavern shows one first message per member, so each character gets their part as a group greeting, which you can edit before applying. The order goes into the Creator's Notes, because it's set in SillyTavern's member list.

### Changed
- **Test chat**: in a group, members now start with one of their group greetings. Without any, one is picked at random from the first message and the alternate greetings, as SillyTavern does; before, it was always the first message.

## [1.9.0] – 2026-11-03

### Added
- **AI Assistant**:
  - **Length**: pick Short, Medium or Long for the selected fields, or differently per field. These are rough sizes, not exact word counts. Left at "As you ask", nothing changes.
  - **Opening point of view**: first, second or third person for the first message and alternate greetings.
  - **Select empty**: ticks only the fields that are still empty, for completing an imported card.

### Changed
- When a reply was cut off at the token limit, the error now says so and points to "Max tokens", instead of only reporting invalid JSON. This needs a server that reports why the reply ended; otherwise the old message stays.

## [1.8.0] – 2026-11-03

### Added
- **Version history** ("History…", for characters and personas): compare the open card with its older versions, word by word for each field, greeting and lorebook entry, plus the image and other data like the Character's Note. Bring back a whole version or single sections; the last restore can be undone. It reads the copies in the `backups` folder, so versions you already have show up right away. The file only changes when you save.
- **A right-click menu for text**: cut, copy, paste and select all, the same on Windows and Linux.
- **A hint for overused names**: names AI models use very often, like Elara or Kael, get a note at the name field. It doesn't stop you from using them.

## [1.7.0] – 2026-11-03

### Added
- **Presets**: a new mode for SillyTavern Chat Completion presets. No AI or internet connection needed.
  - **Prompts**: switch them on and off, reorder them, edit name, role, text and position, add your own and delete them. Token counts per prompt and roughly for everything switched on.
  - **Nothing else changes**: regex scripts, settings and fields the editor doesn't know stay as they are in the file. Every save leaves a copy of the old file in a `backups` folder, and if another program such as SillyTavern changed the file in the meantime, you're asked first.
  - **A warning for prompts that never get sent**: your own prompts marked as system prompts look switched on, but SillyTavern ignores them. "Fix it" corrects that.

## [1.6.0] – 2026-11-02

### Added
- **From Image…**: create character cards from a picture that tells a story. It needs a model that can see images; if yours can't, describe the picture yourself or let a separate describing model (such as JoyCaption) do it, and write with your usual model.
  - **The picture**: first it's described plainly — the scene, the camera's point of view and everyone in it. Correct anything that's wrong; the facts you keep carry through to the cards and the opening scene.
  - **Story ideas**: three ideas for the situation, with an optional direction of your own and "3 new ideas" for more. The story stays editable.
  - **You in the situation**: say what or who you are there — someone new, someone the characters know, or one of the people in the picture.
  - **Cards**: tick who gets a card; relationships are read from poses and expressions. A picture without people gets an invented character or a narrator. Each card comes with an opening scene and uses the picture as its avatar, with optional cropping.

### Fixed
- AI features no longer fail when a model that doesn't enforce the reply format (DeepSeek, for example) answers with an unexpected word in a field that allows only certain values — the closest allowed value is used. This covers From Image, the From Story lorebook, Split Card, Consistency Check fixes and Create Group's updates to reference cards.
- Replies wrapped in a ```` ```json ```` block are now read correctly.

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
