import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { confirmAction } from "../../io/confirmDiscard";
import { addFilesToLibrary, downloadToLibrary, type DownloadResult } from "../../io/downloader";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { exportLibraryGroupAsGroupx, importGroupxToLibrary, pickGroupxFile } from "../../io/groupxIO";
import { openCardAtPath } from "../../io/fileIO";
import { scanLibrary, type LibraryCard, type LibraryContent, type LibraryLorebook } from "../../io/library";
import { openLorebookPaths } from "../../io/lorebookIO";
import { deleteFile } from "../../io/rawFile";
import { parseUrlList } from "../../schema/library";
import { sameNameCharacters } from "../../schema/sillyTavern";
import { sendCardFileToSt, sendLorebookFileToSt } from "../../io/sillyTavernActions";
import { stListCharacters, stListWorlds } from "../../io/sillyTavernClient";
import { useSillyTavernStore } from "../../state/sillyTavernStore";
import { useSettingsDialogStore } from "../../state/settingsDialogStore";

interface Props {
  onError: (message: string) => void;
  onShowMode: (mode: "characters" | "lorebooks") => void;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function Thumb({ png }: { png: Uint8Array | null }) {
  const url = useMemo(() => (png ? URL.createObjectURL(new Blob([png], { type: "image/png" })) : null), [png]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url ? <img className="st-thumb" src={url} alt="" /> : <div className="st-thumb st-thumb-empty" />;
}

/** One entry the user can tick: a card or a lorebook, by its file path. */
type Item = { kind: "card"; card: LibraryCard } | { kind: "lorebook"; book: LibraryLorebook };

const itemPath = (item: Item) => (item.kind === "card" ? item.card.path : item.book.path);
const lorebookName = (book: LibraryLorebook) => book.fileName.replace(/\.json$/i, "");

/** The card library: a plain folder of card files, its subfolders as groups and a "Lorebooks"
 * folder — plus the downloader that fills it. Entries are ticked, then opened, sent or deleted
 * together. */
export function LibraryWorkspace({ onError, onShowMode }: Props) {
  const [content, setContent] = useState<LibraryContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [sendItems, setSendItems] = useState<Item[] | null>(null);
  const openSettings = useSettingsDialogStore((s) => s.open);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await scanLibrary();
      setContent(next);
      // Forget ticks on files that are gone.
      const present = new Set([
        ...next.cards.map((c) => c.path),
        ...next.groups.flatMap((g) => g.cards.map((c) => c.path)),
        ...next.lorebooks.map((l) => l.path),
      ]);
      setSelected((sel) => new Set([...sel].filter((p) => present.has(p))));
    } catch (err) {
      onError(describe(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const needle = search.trim().toLocaleLowerCase();
  const matches = (c: LibraryCard) =>
    !needle || c.name.toLocaleLowerCase().includes(needle) || c.tags.some((t) => t.toLocaleLowerCase().includes(needle));

  const topCards = content?.cards.filter(matches) ?? [];
  const groups = (content?.groups ?? []).map((g) => ({ ...g, shown: g.cards.filter(matches) }));
  const lorebooks = (content?.lorebooks ?? []).filter((l) => !needle || l.fileName.toLocaleLowerCase().includes(needle));
  const empty = content && content.cards.length === 0 && content.groups.length === 0 && content.lorebooks.length === 0;

  /** Everything shown right now (the search applies), in page order. */
  const visible: Item[] = [
    ...topCards.map((card) => ({ kind: "card" as const, card })),
    ...groups.flatMap((g) => g.shown.map((card) => ({ kind: "card" as const, card }))),
    ...lorebooks.map((book) => ({ kind: "lorebook" as const, book })),
  ];
  const chosen = visible.filter((item) => selected.has(itemPath(item)));
  const allVisibleTicked = visible.length > 0 && chosen.length === visible.length;

  function toggle(paths: string[], on: boolean) {
    setSelected((sel) => {
      const next = new Set(sel);
      for (const p of paths) {
        if (on) next.add(p);
        else next.delete(p);
      }
      return next;
    });
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    try {
      await action();
    } catch (err) {
      onError(describe(err));
    } finally {
      setBusy(null);
    }
  }

  async function openChosen() {
    const cards = chosen.flatMap((i) => (i.kind === "card" ? [i.card] : []));
    const books = chosen.flatMap((i) => (i.kind === "lorebook" ? [i.book] : []));
    const failed: string[] = [];
    for (const card of cards) {
      try {
        await openCardAtPath(card.path);
      } catch (err) {
        failed.push(`${card.fileName}: ${describe(err)}`);
      }
    }
    if (books.length > 0) failed.push(...(await openLorebookPaths(books.map((b) => b.path))));
    if (failed.length > 0) onError(failed.join(" — "));
    setSelected(new Set());
    onShowMode(cards.length > 0 ? "characters" : "lorebooks");
  }

  async function deleteChosen() {
    const cards = chosen.filter((i) => i.kind === "card").length;
    const books = chosen.length - cards;
    const what = [cards ? `${cards} card${cards === 1 ? "" : "s"}` : "", books ? `${books} lorebook${books === 1 ? "" : "s"}` : ""]
      .filter(Boolean)
      .join(" and ");
    if (!(await confirmAction(`Delete ${what} from the library? The files are removed for good.`, "Delete from library"))) return;
    for (const item of chosen) await deleteFile(itemPath(item));
    setSelected(new Set());
    await refresh();
  }

  function row(item: Item) {
    const path = itemPath(item);
    const ticked = selected.has(path);
    return (
      <li
        key={path}
        className={ticked ? "st-row library-row ticked" : "st-row library-row"}
        onClick={() => toggle([path], !ticked)}
      >
        <input
          type="checkbox"
          checked={ticked}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => toggle([path], e.target.checked)}
          aria-label="Select"
        />
        {item.kind === "card" ? <Thumb png={item.card.png} /> : <div className="st-thumb st-thumb-empty library-book-icon">📖</div>}
        <div className="st-row-text">
          <strong>{item.kind === "card" ? item.card.name : lorebookName(item.book)}</strong>
          <span className="field-hint">
            {item.kind === "card"
              ? `${item.card.fileName}${item.card.tags.length > 0 ? ` · ${item.card.tags.slice(0, 5).join(", ")}` : ""}`
              : "lorebook"}
          </span>
        </div>
      </li>
    );
  }

  function sectionHead(title: string, items: Item[], extra?: string, groupCards?: LibraryCard[]) {
    const paths = items.map(itemPath);
    const all = paths.length > 0 && paths.every((p) => selected.has(p));
    return (
      <div className="library-section-head">
        <input
          type="checkbox"
          checked={all}
          disabled={paths.length === 0}
          onChange={(e) => toggle(paths, e.target.checked)}
          aria-label={`Select all in ${title}`}
        />
        <h3>{title}</h3>
        {extra && <span className="field-hint">{extra}</span>}
        {groupCards && (
          <button
            type="button"
            className="secondary sidebar-small-button"
            disabled={groupCards.length === 0}
            title="Pack this group into one GroupX file to pass on"
            onClick={() => void run("Exporting…", async () => void (await exportLibraryGroupAsGroupx(title, groupCards)))}
          >
            Export GroupX…
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="st-workspace">
      <div className="toolbar st-toolbar">
        <button type="button" onClick={() => setDownloadOpen(true)}>
          Download…
        </button>
        <input className="field-input st-search" type="search" placeholder="Search name or tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button
          type="button"
          className="secondary"
          title="Add card (PNG/JSON) and lorebook files, e.g. downloaded in the browser — lorebooks go into “Lorebooks”"
          onClick={() =>
            void run("Adding…", async () => {
              const picked = await openFileDialog({
                multiple: true,
                filters: [{ name: "Character card or lorebook", extensions: ["png", "json"] }],
              });
              const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
              if (paths.length === 0) return;
              const { failed } = await addFilesToLibrary(paths, null);
              if (failed.length > 0) onError(`Not added: ${failed.join(" — ")}`);
              await refresh();
            })
          }
        >
          Add files…
        </button>
        <button
          type="button"
          className="secondary"
          title="Unpack a GroupX file into the library as a group"
          onClick={() =>
            void run("Importing…", async () => {
              const path = await pickGroupxFile();
              if (path) await importGroupxToLibrary(path);
              await refresh();
            })
          }
        >
          Import GroupX…
        </button>
        <button type="button" className="secondary" disabled={loading} onClick={() => void refresh()}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button
          type="button"
          className="secondary"
          title={content?.dir}
          disabled={!content}
          onClick={() => content && invoke("open_folder", { path: content.dir }).catch((err) => onError(describe(err)))}
        >
          Open folder
        </button>
        <button type="button" className="secondary" onClick={() => openSettings("library")}>
          Settings…
        </button>
      </div>

      <div className="toolbar library-selection-bar">
        <button
          type="button"
          className="secondary"
          disabled={visible.length === 0}
          onClick={() => toggle(visible.map(itemPath), !allVisibleTicked)}
          title={needle ? "Everything the search shows" : "Everything in the library"}
        >
          {allVisibleTicked ? "Select none" : "Select all"}
        </button>
        <span className="field-hint">{chosen.length} selected</span>
        <button type="button" disabled={chosen.length === 0 || !!busy} onClick={() => void run("Opening…", openChosen)}>
          Open
        </button>
        <button type="button" className="secondary" disabled={chosen.length === 0 || !!busy} onClick={() => setSendItems(chosen)}>
          To SillyTavern…
        </button>
        <button type="button" className="danger" disabled={chosen.length === 0 || !!busy} onClick={() => void run("Deleting…", deleteChosen)}>
          Delete
        </button>
        {busy && <span className="field-hint">{busy}</span>}
      </div>

      <div className="st-list-area">
        {empty && (
          <div className="library-empty">
            <p>The library is empty.</p>
            <p className="field-hint">
              Download cards with “Download…”, or put open cards here with File → Save to Library / Group → Save Group to Library.
              The library is a normal folder ({content?.dir}) — subfolders are groups, “Lorebooks” holds lorebooks.
            </p>
          </div>
        )}

        {topCards.length > 0 && (
          <section className="library-section">
            {sectionHead("Cards", topCards.map((card) => ({ kind: "card", card })))}
            <ul className="st-list">{topCards.map((card) => row({ kind: "card", card }))}</ul>
          </section>
        )}

        {groups
          .filter((g) => g.shown.length > 0 || !needle)
          .map((g) => (
            <section key={g.name} className="library-section">
              {sectionHead(g.name, g.shown.map((card) => ({ kind: "card", card })), `group · ${g.cards.length} cards`, g.cards)}
              <ul className="st-list">{g.shown.map((card) => row({ kind: "card", card }))}</ul>
            </section>
          ))}

        {lorebooks.length > 0 && (
          <section className="library-section">
            {sectionHead("Lorebooks", lorebooks.map((book) => ({ kind: "lorebook", book })))}
            <ul className="st-list">{lorebooks.map((book) => row({ kind: "lorebook", book }))}</ul>
          </section>
        )}
      </div>

      {downloadOpen && (
        <DownloadDialog
          groups={content?.groups.map((g) => g.name) ?? []}
          onClose={() => setDownloadOpen(false)}
          onDone={() => void refresh()}
          onShowMode={onShowMode}
        />
      )}
      {sendItems && <BulkSendDialog items={sendItems} onClose={() => setSendItems(null)} onDone={() => setSelected(new Set())} />}
    </div>
  );
}

interface SendRow {
  item: Item;
  name: string;
  /** Card: a character file to overwrite, or "" for new. Lorebook: "overwrite" or "" for new. */
  target: string;
  options: { value: string; label: string }[];
  state: "ready" | "sending" | "ok" | "error";
  message?: string;
}

/** Sends the ticked cards and lorebooks to SillyTavern, each to the target chosen for it. Cards
 * work like "Send to SillyTavern" (snapshot first, chats, star and current chat kept); a lorebook
 * becomes World Info, over one of the same name only if chosen. */
function BulkSendDialog({ items, onClose, onDone }: { items: Item[]; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<SendRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await useSillyTavernStore.getState().ensureConfig();
      if (!cfg.baseUrl.trim()) throw new Error("Set up SillyTavern under Settings → SillyTavern first.");
      const characters = await stListCharacters(cfg);
      const worlds = new Set(await stListWorlds(cfg));
      const next: SendRow[] = items.map((item) => {
        if (item.kind === "card") {
          const same = sameNameCharacters(characters, item.card.name);
          return {
            item,
            name: item.card.name,
            target: same.length === 1 ? same[0].avatar : "",
            options: [...same.map((c) => ({ value: c.avatar, label: `overwrite ${c.avatar}` })), { value: "", label: "add as new" }],
            state: "ready",
          };
        }
        const name = lorebookName(item.book);
        const exists = worlds.has(name);
        return {
          item,
          name,
          target: exists ? "overwrite" : "",
          options: exists
            ? [
                { value: "overwrite", label: `overwrite “${name}”` },
                { value: "", label: "add as a copy" },
              ]
            : [{ value: "", label: "add" }],
          state: "ready",
        };
      });
      if (!cancelled) setRows(next);
    })().catch((err) => {
      if (!cancelled) setError(describe(err));
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  async function sendAll() {
    if (!rows) return;
    setRunning(true);
    const cfg = await useSillyTavernStore.getState().ensureConfig();
    const worlds = new Set(await stListWorlds(cfg));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setRows((r) => r && r.map((x, j) => (j === i ? { ...x, state: "sending" } : x)));
      try {
        let message: string;
        if (row.item.kind === "card") {
          const file = await sendCardFileToSt(row.item.card.path, row.name, row.target || null);
          message = row.target ? `overwrote ${file}` : `added as ${file}`;
        } else {
          // A copy gets a free name: "Name (2)", "Name (3)" …
          let name = row.name;
          for (let n = 2; !row.target && worlds.has(name); n++) name = `${row.name} (${n})`;
          await sendLorebookFileToSt(row.item.book.path, name);
          worlds.add(name);
          message = row.target ? "overwrote the World Info" : `added as World Info “${name}”`;
        }
        setRows((r) => r && r.map((x, j) => (j === i ? { ...x, state: "ok", message } : x)));
      } catch (err) {
        setRows((r) => r && r.map((x, j) => (j === i ? { ...x, state: "error", message: describe(err) } : x)));
      }
    }
    setRunning(false);
    setFinished(true);
    onDone();
    void useSillyTavernStore.getState().refresh();
  }

  return (
    <div className="modal-overlay">
      <div className="modal download-dialog">
        <h3>Send {items.length} to SillyTavern</h3>
        {!rows && !error && <p className="field-hint">Looking at SillyTavern…</p>}
        {rows && (
          <ul className="download-rows">
            {rows.map((row, i) => (
              <li key={itemPath(row.item)} className={`download-row ${row.state === "ok" ? "ok" : row.state === "error" ? "error" : ""}`}>
                <span className="download-state">{row.state === "ok" ? "✓" : row.state === "error" ? "✗" : row.state === "sending" ? "…" : "·"}</span>
                <span className="download-text">
                  <strong>{row.name}</strong>
                  {row.item.kind === "lorebook" && <span className="field-hint"> (lorebook)</span>}{" "}
                  {row.state === "ready" ? (
                    <select
                      value={row.target}
                      disabled={running || row.options.length < 2}
                      onChange={(e) => setRows((r) => r && r.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}
                    >
                      {row.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={row.state === "error" ? "field-error" : "field-hint"}>— {row.message ?? "sending…"}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {rows && !finished && (
          <p className="field-hint">
            Overwriting keeps SillyTavern's previous version as a snapshot first; a character keeps its chats, star and current chat.
          </p>
        )}
        {finished && <p className="field-hint">If SillyTavern is open in a browser, reload it there to see the changes.</p>}
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={running}>
            {finished ? "Close" : "Cancel"}
          </button>
          {!finished && (
            <button type="button" onClick={() => void sendAll()} disabled={!rows || running}>
              {running ? "Sending…" : "Send"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface Row {
  url: string;
  state: "waiting" | "loading" | "ok" | "error";
  result?: DownloadResult;
  error?: string;
}

function DownloadDialog({
  groups,
  onClose,
  onDone,
  onShowMode,
}: {
  groups: string[];
  onClose: () => void;
  onDone: () => void;
  onShowMode: (mode: "characters" | "lorebooks") => void;
}) {
  const [text, setText] = useState("");
  const [group, setGroup] = useState("");
  const [openAfter, setOpenAfter] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [running, setRunning] = useState(false);

  async function start() {
    const urls = parseUrlList(text);
    if (urls.length === 0) return;
    const list: Row[] = urls.map((url) => ({ url, state: "waiting" }));
    setRows(list);
    setRunning(true);
    const opened: DownloadResult[] = [];
    // One after another: SillyTavern and the sites don't like a burst of requests.
    for (let i = 0; i < list.length; i++) {
      setRows((r) => r && r.map((row, j) => (j === i ? { ...row, state: "loading" } : row)));
      try {
        const result = await downloadToLibrary(list[i].url, group.trim() || null);
        opened.push(result);
        setRows((r) => r && r.map((row, j) => (j === i ? { ...row, state: "ok", result } : row)));
      } catch (err) {
        setRows((r) => r && r.map((row, j) => (j === i ? { ...row, state: "error", error: describe(err) } : row)));
      }
    }
    setRunning(false);
    onDone();
    if (openAfter && opened.length > 0) {
      const cards = opened.filter((r) => r.kind === "card");
      const books = opened.filter((r) => r.kind === "lorebook");
      for (const card of cards) await openCardAtPath(card.path).catch(() => undefined);
      if (books.length > 0) await openLorebookPaths(books.map((b) => b.path)).catch(() => undefined);
      onShowMode(cards.length > 0 ? "characters" : "lorebooks");
    }
  }

  const done = rows && !running;
  const okCount = rows?.filter((r) => r.state === "ok").length ?? 0;

  return (
    <div className="modal-overlay">
      <div className="modal download-dialog">
        <h3>Download into the library</h3>
        {!rows ? (
          <>
            <label className="field">
              <span className="field-label">Links, one per line</span>
              <textarea
                className="field-textarea"
                rows={8}
                autoFocus
                placeholder={"https://chub.ai/characters/…\nhttps://janitorai.com/characters/…\nhttps://example.org/card.png"}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <span className="field-hint">
                Chub, JanitorAI, JannyAI, Pygmalion, RisuRealm, Perchance and AICharacterCards are downloaded through SillyTavern;
                Botbooru, Character Tavern and WyvernChat pages and links pointing straight at a card PNG or JSON (e.g. CharaVault's
                download links) by the editor. Lorebooks go into the “Lorebooks” folder.
              </span>
            </label>
            <label className="field">
              <span className="field-label">Group (optional)</span>
              <input className="field-input" list="library-groups" placeholder="e.g. Familie Berg — leave empty for none" value={group} onChange={(e) => setGroup(e.target.value)} />
              <datalist id="library-groups">
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <span className="field-hint">The cards go into a subfolder of this name — the library shows it as a group.</span>
            </label>
            <label className="field-inline">
              <input type="checkbox" checked={openAfter} onChange={(e) => setOpenAfter(e.target.checked)} />
              Open them afterwards
            </label>
          </>
        ) : (
          <ul className="download-rows">
            {rows.map((row) => (
              <li key={row.url} className={`download-row ${row.state}`}>
                <span className="download-state">
                  {row.state === "ok" ? "✓" : row.state === "error" ? "✗" : row.state === "loading" ? "…" : "·"}
                </span>
                <span className="download-text">
                  {row.result ? (
                    <>
                      <strong>{row.result.name}</strong>
                      {row.result.kind === "lorebook" ? " (lorebook)" : ""}
                      {row.result.duplicate ? <span className="field-hint"> — already in the library, unchanged</span> : null}
                    </>
                  ) : (
                    <span className="download-url">{row.url}</span>
                  )}
                  {row.error && <span className="field-error"> — {row.error}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          {done && <span className="field-hint">{okCount} of {rows.length} downloaded.</span>}
          <button type="button" className="secondary" onClick={onClose} disabled={running}>
            {done ? "Close" : "Cancel"}
          </button>
          {!rows && (
            <button type="button" onClick={() => void start()} disabled={parseUrlList(text).length === 0}>
              Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
