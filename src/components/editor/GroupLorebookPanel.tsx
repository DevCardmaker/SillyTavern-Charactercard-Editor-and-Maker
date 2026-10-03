import { useEffect, useRef, useState } from "react";
import { requestLorebookEntries } from "../../io/aiClient";
import { concurrencyFor, mapConcurrent } from "../../io/concurrency";
import { buildMemberEntrySystemPrompt, buildMemberEntryUserTurn } from "../../schema/aiPrompt";
import { groupLorebookFor, memberKeys, type MemberProfile, resolveCharMacro, verbatimProfile } from "../../schema/memberEntries";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { usePersonaStore } from "../../state/personaStore";

interface Props {
  onClose: () => void;
}

/** One click: writes a short profile of every open character (and open persona) right away, then
 * lets the user review and edit them — the local model reliably leaks secrets (e.g. an affair the
 * others mustn't know about) and guesses relationships wrong, despite being told not to. Only
 * "Apply" gives each open character's own lorebook an entry for every *other* member; the cards
 * then just become unsaved, like after any other group edit. */
export function GroupLorebookPanel({ onClose }: Props) {
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);
  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;
  const [progress, setProgress] = useState<string | null>("Loading AI settings…");
  const [profiles, setProfiles] = useState<MemberProfile[] | null>(null);
  const [verbatimNames, setVerbatimNames] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  useEffect(() => {
    if (started.current || !configFile) return;
    started.current = true;
    if (!activeProfile?.baseUrl || !activeProfile.model) {
      setProgress(null);
      setError("No AI provider set up yet — configure one in the AI Assistant first.");
      return;
    }
    void run(activeProfile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configFile]);

  async function run(profile: NonNullable<typeof activeProfile>) {
    const characters = useCardStore.getState().characters.filter((c) => c.card.name.trim());
    const copied = new Set<string>();
    const personas = usePersonaStore.getState().characters.filter((p) => p.card.name.trim());
    const members = [...characters.map((c) => c.card), ...personas.map((p) => p.card)];
    const names = members.map((m) => m.name);

    try {
      let written = 0;
      const toWrite = members.filter((m) => !verbatimProfile(m)).length;
      const profiles: MemberProfile[] = await mapConcurrent(members, concurrencyFor(profile), async (member) => {
        const verbatim = verbatimProfile(member);
        if (verbatim) {
          copied.add(member.name);
          return { name: member.name, keys: memberKeys(member.name, []), content: verbatim };
        }
        setProgress(`Writing profiles: ${written} of ${toWrite} done…`);
        const [entry] = await requestLorebookEntries(profile, [
          { role: "system", content: buildMemberEntrySystemPrompt() },
          buildMemberEntryUserTurn(
            member,
            names.filter((n) => n !== member.name),
          ),
        ]);
        if (!entry?.content.trim()) throw new Error(`The AI returned no profile for ${member.name}.`);
        written++;
        setProgress(`Writing profiles: ${written} of ${toWrite} done…`);
        return {
          name: member.name,
          keys: memberKeys(member.name, entry.keys),
          content: resolveCharMacro(entry.content.trim(), member.name),
        };
      });
      setVerbatimNames(copied);
      setProfiles(profiles);
    } catch (err) {
      setError(`${err instanceof Error ? err.message : String(err)} — no card was changed.`);
    } finally {
      setProgress(null);
    }
  }

  function handleApply() {
    if (!profiles) return;
    const cleaned = profiles.filter((p) => p.content.trim()).map((p) => ({ ...p, content: p.content.trim() }));
    // Re-read the store: each card gets the patch against its latest state.
    const { updateSlotCard } = useCardStore.getState();
    const slots = useCardStore.getState().characters.filter((c) => c.card.name.trim());
    for (const slot of slots) updateSlotCard(slot.id, { character_book: groupLorebookFor(slot.card, cleaned) });
    setProfiles(null);
    setDone(slots.length);
  }

  function editProfile(index: number, content: string) {
    setProfiles((prev) => prev && prev.map((p, i) => (i === index ? { ...p, content } : p)));
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Group lorebook</h3>
        <p className="field-hint">
          Every open character gets lorebook entries with a short profile of each other member (and each open
          persona) — not of themselves. SillyTavern group chats only send the replying character's own card, so this
          is how they know each other. Short cards are copied word for word; longer ones are summarized by the AI.
        </p>
        {progress && (
          <>
            <p>{progress}</p>
            <p className="field-hint">With a local model this takes a little while per member.</p>
          </>
        )}
        {error && <p className="field-error">{error}</p>}
        {profiles && (
          <>
            <p>
              Check the profiles before they go into the cards: <strong>remove anything the others mustn't know</strong>{" "}
              (secrets, affairs, hidden feelings) and fix wrong relationships — the AI gets these wrong at times. Empty a
              profile to leave that member out.
            </p>
            {profiles.map((p, i) => (
              <label key={p.name} className="field">
                <span className="field-label">
                  {p.name} · keys: {p.keys.join(", ")}
                  {verbatimNames.has(p.name) && " · copied from the card"}
                </span>
                <textarea
                  className="field-textarea"
                  rows={4}
                  value={p.content}
                  onChange={(e) => editProfile(i, e.target.value)}
                />
              </label>
            ))}
          </>
        )}
        {done !== null && (
          <p>
            Done: {done} cards now have an entry for each other member. They're marked as unsaved — save them (e.g.
            “Save Group…”).
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className={profiles ? "secondary" : undefined} onClick={onClose} disabled={!!progress}>
            {profiles ? "Discard" : "Close"}
          </button>
          {profiles && (
            <button type="button" onClick={handleApply} disabled={profiles.every((p) => !p.content.trim())}>
              Apply to {useCardStore.getState().characters.filter((c) => c.card.name.trim()).length} cards
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
