import { useEffect, useMemo, useState } from "react";
import { stDeleteCharacter, stDeleteGroup, stDuplicateCharacter } from "../../io/sillyTavernClient";
import { openStCharacter, openStGroupMembers, openStPersona } from "../../io/sillyTavernActions";
import type { StCharacter, StGroup, StPersona } from "../../schema/sillyTavern";
import { useCardStore } from "../../state/cardStore";
import { usePersonaStore } from "../../state/personaStore";
import { useSettingsDialogStore } from "../../state/settingsDialogStore";
import { useSillyTavernStore } from "../../state/sillyTavernStore";
import { useStDialogStore } from "../../state/stDialogStore";

type Tab = "characters" | "groups" | "personas";

interface Props {
  onError: (message: string) => void;
  /** Switches to the mode where an opened character or persona is shown. */
  onShowMode: (mode: "characters" | "personas") => void;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function Thumb({ type, file }: { type: "avatar" | "persona"; file: string }) {
  const url = useSillyTavernStore((s) => s.thumbnails[`${type}:${file}`]);
  const load = useSillyTavernStore((s) => s.loadThumbnail);
  useEffect(() => {
    void load(type, file);
  }, [type, file, load]);
  return url ? <img className="st-thumb" src={url} alt="" /> : <div className="st-thumb st-thumb-empty" />;
}

/** What's in SillyTavern: characters, groups and personas — open them here, send open ones there,
 * copy and delete. */
export function SillyTavernWorkspace({ onError, onShowMode }: Props) {
  const config = useSillyTavernStore((s) => s.config);
  const ensureConfig = useSillyTavernStore((s) => s.ensureConfig);
  const characters = useSillyTavernStore((s) => s.characters);
  const groups = useSillyTavernStore((s) => s.groups);
  const personas = useSillyTavernStore((s) => s.personas);
  const loading = useSillyTavernStore((s) => s.loading);
  const error = useSillyTavernStore((s) => s.error);
  const refresh = useSillyTavernStore((s) => s.refresh);
  const openSettings = useSettingsDialogStore((s) => s.open);
  const openSend = useStDialogStore((s) => s.openSend);
  const openCreateGroup = useStDialogStore((s) => s.openCreateGroup);
  const activeCardId = useCardStore((s) => s.activeId);
  const activeCardName = useCardStore((s) => s.card?.name ?? "");
  const openCardCount = useCardStore((s) => s.characters.length);
  const activePersonaId = usePersonaStore((s) => s.activeId);
  const activePersonaName = usePersonaStore((s) => s.card?.name ?? "");
  const [tab, setTab] = useState<Tab>("characters");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ kind: "character"; item: StCharacter } | { kind: "group"; item: StGroup } | null>(null);
  const [deleteChats, setDeleteChats] = useState(false);

  useEffect(() => {
    void ensureConfig().then((c) => {
      if (c.baseUrl.trim() && !useSillyTavernStore.getState().characters) void refresh();
    });
  }, [ensureConfig, refresh]);

  const names = useMemo(() => new Map((characters ?? []).map((c) => [c.avatar, c.name])), [characters]);
  const needle = search.trim().toLocaleLowerCase();
  const shownCharacters = (characters ?? []).filter(
    (c) => !needle || c.name.toLocaleLowerCase().includes(needle) || c.tags.some((t) => t.toLocaleLowerCase().includes(needle)),
  );
  const shownGroups = (groups ?? []).filter((g) => !needle || g.name.toLocaleLowerCase().includes(needle));
  const shownPersonas = (personas ?? []).filter((p) => !needle || p.name.toLocaleLowerCase().includes(needle));

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

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    await run("Deleting…", async () => {
      const cfg = await ensureConfig();
      if (target.kind === "character") await stDeleteCharacter(cfg, target.item.avatar, deleteChats);
      else await stDeleteGroup(cfg, target.item.id);
      await refresh();
    });
  }

  if (config && !config.baseUrl.trim()) {
    return (
      <div className="empty-state">
        <p>Connect the editor to your SillyTavern to see its characters, groups and personas here.</p>
        <button type="button" onClick={() => openSettings("sillytavern")}>
          Set up SillyTavern…
        </button>
      </div>
    );
  }

  return (
    <div className="st-workspace">
      <div className="toolbar st-toolbar">
        <nav className="st-tabs">
          {(["characters", "groups", "personas"] as Tab[]).map((t) => (
            <button key={t} type="button" className={t === tab ? "tool-tab active" : "tool-tab"} onClick={() => setTab(t)}>
              {t === "characters" ? `Characters${characters ? ` (${characters.length})` : ""}` : t === "groups" ? `Groups${groups ? ` (${groups.length})` : ""}` : `Personas${personas ? ` (${personas.length})` : ""}`}
            </button>
          ))}
        </nav>
        <input className="field-input st-search" type="search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {tab === "characters" && (
          <button
            type="button"
            disabled={!activeCardId}
            title={activeCardId ? `Send “${activeCardName || "New card"}” to SillyTavern` : "No card open"}
            onClick={() => activeCardId && openSend("card", activeCardId)}
          >
            Send open card…
          </button>
        )}
        {tab === "groups" && (
          <button type="button" disabled={openCardCount < 2} title="Needs at least two open cards" onClick={openCreateGroup}>
            Group from open cards…
          </button>
        )}
        {tab === "personas" && (
          <button
            type="button"
            disabled={!activePersonaId}
            title={activePersonaId ? `Send “${activePersonaName || "New persona"}” to SillyTavern` : "No persona open in the Personas mode"}
            onClick={() => activePersonaId && openSend("persona", activePersonaId)}
          >
            Send open persona…
          </button>
        )}
        <button type="button" className="secondary" disabled={loading} onClick={() => void refresh()}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        {busy && <span className="field-hint">{busy}</span>}
      </div>

      {error && <p className="field-error st-error">{error}</p>}

      <div className="st-list-area">
        {tab === "characters" && (
          <ul className="st-list">
            {shownCharacters.map((c) => (
              <li key={c.avatar} className="st-row">
                <Thumb type="avatar" file={c.avatar} />
                <div className="st-row-text">
                  <strong>{c.name || c.avatar}</strong>
                  <span className="field-hint">
                    {c.avatar}
                    {c.lastChat ? ` · last chat ${new Date(c.lastChat).toLocaleDateString()}` : ""}
                    {c.tags.length > 0 ? ` · ${c.tags.slice(0, 4).join(", ")}` : ""}
                  </span>
                </div>
                <div className="st-row-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void run("Opening…", async () => {
                        await openStCharacter(c.avatar);
                        onShowMode("characters");
                      })
                    }
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    title="Make a copy in SillyTavern"
                    onClick={() =>
                      void run("Copying…", async () => {
                        await stDuplicateCharacter(await ensureConfig(), c.avatar);
                        await refresh();
                      })
                    }
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="danger"
                    title="Delete from SillyTavern"
                    onClick={() => {
                      setDeleteChats(false);
                      setDeleting({ kind: "character", item: c });
                    }}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
            {characters && shownCharacters.length === 0 && <p className="field-hint">No characters{needle ? " match" : ""}.</p>}
          </ul>
        )}

        {tab === "groups" && (
          <ul className="st-list">
            {shownGroups.map((g) => (
              <li key={g.id} className="st-row">
                <div className="st-row-text">
                  <strong>{g.name}</strong>
                  <span className="field-hint">
                    {g.members.map((m) => names.get(m) ?? m).join(", ") || "no members"} · {g.chatCount} chat{g.chatCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="st-row-actions">
                  <button
                    type="button"
                    disabled={g.members.length === 0}
                    title="Open every member as a card"
                    onClick={() =>
                      void run("Opening…", async () => {
                        const failed = await openStGroupMembers(g);
                        if (failed.length > 0) onError(`Could not open: ${failed.join(", ")}`);
                        onShowMode("characters");
                      })
                    }
                  >
                    Open members
                  </button>
                  <button type="button" className="danger" title="Delete the group from SillyTavern" onClick={() => setDeleting({ kind: "group", item: g })}>
                    ✕
                  </button>
                </div>
              </li>
            ))}
            {groups && shownGroups.length === 0 && <p className="field-hint">No groups{needle ? " match" : ""}.</p>}
          </ul>
        )}

        {tab === "personas" && (
          <ul className="st-list">
            {shownPersonas.map((p: StPersona) => (
              <li key={p.avatar} className="st-row">
                <Thumb type="persona" file={p.avatar} />
                <div className="st-row-text">
                  <strong>{p.name || p.avatar}</strong>
                  <span className="field-hint st-row-description">{p.description || "no description"}</span>
                </div>
                <div className="st-row-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void run("Opening…", async () => {
                        await openStPersona(p);
                        onShowMode("personas");
                      })
                    }
                  >
                    Open
                  </button>
                </div>
              </li>
            ))}
            {personas && shownPersonas.length === 0 && <p className="field-hint">No personas{needle ? " match" : ""}.</p>}
          </ul>
        )}
      </div>

      {deleting && (
        <div className="modal-overlay">
          <div className="modal st-dialog">
            <h3>Delete “{deleting.item.name}” from SillyTavern?</h3>
            {deleting.kind === "character" ? (
              <>
                <p>The character is removed from SillyTavern for good. Open it here first if you want to keep a copy.</p>
                <label className="field-inline">
                  <input type="checkbox" checked={deleteChats} onChange={(e) => setDeleteChats(e.target.checked)} />
                  Also delete its chats
                </label>
              </>
            ) : (
              <p>
                The group is removed — and SillyTavern deletes <strong>its {deleting.item.chatCount} group chat
                {deleting.item.chatCount === 1 ? "" : "s"}</strong> with it. The member characters stay.
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={() => void confirmDelete()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
