import { useEffect, useMemo, useState } from "react";
import { useTokenCounter } from "../../hooks/useTokenCount";
import {
  type AiProviderConfig,
  requestFieldPatch,
  requestStoryLore,
  requestStoryLoreEntry,
  requestStoryNotes,
  requestStoryPeople,
} from "../../io/aiClient";
import { concurrencyFor, mapConcurrent } from "../../io/concurrency";
import { pickStoryFile } from "../../io/storyFile";
import {
  buildStoryCardSystemPrompt,
  buildStoryCardUserTurn,
  buildStoryLoreEntrySystemPrompt,
  buildStoryLoreEntryUserTurn,
  buildStoryLoreSystemPrompt,
  buildStoryNotesSystemPrompt,
  buildStoryNotesUserTurn,
  buildStoryPeopleSystemPrompt,
  buildStoryPeopleUserTurn,
  buildStoryPersonaPlaysMessages,
  buildStoryPersonaSelfMessages,
  buildStorySceneSystemPrompt,
  buildStorySceneUserTurn,
  isReplacedName,
  storyLanguageRetryHint,
  storyUserRoleText,
} from "../../schema/aiPrompt";
import { sharedBookPatch } from "../../schema/sharedLorebook";
import {
  buildStoryLorebook,
  defaultLorebookName,
  isCommonWord,
  LORE_KIND_LABELS,
  type LoreKind,
  loreExcerpts,
  loreKeys,
  mergeStoryLore,
  type StoryLoreItem,
} from "../../schema/storyLore";
import {
  cleanPartPeople,
  countMentions,
  detectStoryLanguage,
  endingNotes,
  mergePersonInto,
  mergeStoryPeople,
  nameToUser,
  notesAbout,
  paragraphsMentioning,
  partsWith,
  personWords,
  type StoryPerson,
  type StoryUserRole,
  storyParagraphs,
  storyParts,
  userStoryPerson,
  wrongLanguage,
} from "../../schema/storyToCards";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { useLorebookStore } from "../../state/lorebookStore";
import { usePersonaStore } from "../../state/personaStore";
import { AiProviderSettings } from "./AiProviderSettings";
import { GroupChatHint } from "./GroupChatHint";

interface Props {
  onClose: () => void;
  /** Switches to the Lorebooks mode — after adding only a lorebook, so the user sees it. */
  onShowLorebooks?: () => void;
}

interface Candidate extends StoryPerson {
  picked: boolean;
}

type StoryCard = {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
};

interface Result {
  status: "working" | "ready" | "error";
  progress?: string;
  /** Kept so "Rewrite" can write the card again without reading the story again. */
  notes?: string[][];
  card?: StoryCard;
  error?: string;
  /** Parts whose notes failed twice and were left out. */
  skipped?: number;
  /** Whether "Add as tabs" includes this card. */
  add: boolean;
  /** The card (or its scene) came back in another language than asked for, twice. */
  languageWarning?: boolean;
}

interface LoreCandidate extends StoryLoreItem {
  picked: boolean;
}

/** A lorebook entry to write: a place, group or term, or a side character without a card. */
interface LoreTarget {
  key: string;
  name: string;
  aliases: string[];
  kind: LoreKind;
}

interface LoreResult {
  status: "working" | "ready" | "error";
  content?: string;
  keys?: string[];
  error?: string;
  add: boolean;
}

interface PersonaDraft {
  status: "working" | "ready" | "error";
  progress?: string;
  name: string;
  description: string;
  error?: string;
  /** Whether "Add" includes the persona. */
  add: boolean;
}

/** Side characters are preselected for an entry from this many paragraphs on — like places and terms. */
const LORE_MIN_MENTIONS = 3;

type RoleChoice = "joins" | "always" | "replaces" | "plays";

const ROLE_LABELS: Record<RoleChoice, string> = {
  joins: "A new person who meets them for the first time",
  always: "A new person who has been part of the story all along",
  replaces: "A new person who takes the place of someone from the story",
  plays: "One of the story's characters",
};

/** One request, retried once — a long run shouldn't stop at a single bad reply. */
async function withRetry<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch {
    return request();
  }
}

/** Creates character cards from a story — fan fiction, a short story, an excerpt — in passes (see
 * storyToCards.ts): find the people part by part, the user picks who gets a card and who they
 * play themselves, then for each person notes from the parts they appear in, the card from the
 * notes, and an opening scene after the story's end. Each card is added as its own tab. */
export function StoryToCardsPanel({ onClose, onShowLorebooks }: Props) {
  const newCard = useCardStore((s) => s.newCard);
  const updateCard = useCardStore((s) => s.updateCard);
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);
  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;
  const count = useTokenCounter();

  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [extraName, setExtraName] = useState("");
  const [roleChoice, setRoleChoice] = useState<RoleChoice>("joins");
  const [rolePerson, setRolePerson] = useState("");
  const [aboutUser, setAboutUser] = useState("");
  const [note, setNote] = useState("");
  /** Language of the cards — the story's, detected by the code, until the user types another. */
  const [language, setLanguage] = useState("");
  const [languageEdited, setLanguageEdited] = useState(false);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [isFinding, setIsFinding] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loreItems, setLoreItems] = useState<LoreCandidate[] | null>(null);
  /** Side characters the user ticked or unticked for an entry; the rest follow LORE_MIN_MENTIONS. */
  const [sidePicks, setSidePicks] = useState<Record<string, boolean>>({});
  const [loreResults, setLoreResults] = useState<Record<string, LoreResult>>({});
  const [lorebookName, setLorebookName] = useState("");
  const [lorebookNameEdited, setLorebookNameEdited] = useState(false);
  const [isFindingLore, setIsFindingLore] = useState(false);
  const [isWritingLore, setIsWritingLore] = useState(false);
  const [persona, setPersona] = useState<PersonaDraft | null>(null);
  const [personaWish, setPersonaWish] = useState("");
  /** Cards the persona is fitted to (by name); the rest follow "all ready cards". */
  const [personaCardPicks, setPersonaCardPicks] = useState<Record<string, boolean>>({});
  const [isWritingPersona, setIsWritingPersona] = useState(false);
  /** Notes on the character the user plays, kept for "Rewrite" of their persona. */
  const [playedNotes, setPlayedNotes] = useState<{ name: string; notes: string[][] } | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const paragraphs = useMemo(() => (count && text.trim() ? storyParagraphs(text, count) : []), [text, count]);
  const parts = useMemo(() => (count ? storyParts(paragraphs, count) : []), [paragraphs, count]);
  const tokens = useMemo(() => (count && text ? count(text) : 0), [text, count]);
  const detectedLanguage = useMemo(() => detectStoryLanguage(text), [text]);
  useEffect(() => {
    if (!languageEdited) setLanguage(detectedLanguage ?? "");
  }, [detectedLanguage, languageEdited]);
  const writeLanguage = language.trim() || "the language of the story";

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const busy = isFinding || isWriting || isFindingLore || isWritingLore || isWritingPersona;

  const role: StoryUserRole | null =
    roleChoice === "plays"
      ? rolePerson
        ? { kind: "plays", person: rolePerson }
        : null
      : roleChoice === "replaces"
        ? rolePerson
          ? { kind: "new", mode: "replaces", about: aboutUser, person: rolePerson }
          : null
        : { kind: "new", mode: roleChoice, about: aboutUser };
  const userPerson = role ? userStoryPerson(role) : null;
  const picked = candidates?.filter((c) => c.picked && c.name !== userPerson) ?? [];
  const requestCount = picked.reduce(
    (sum, p) => sum + (results[p.name]?.notes ? 0 : partsWith(parts, paragraphs, p, others(p)).length) + 2,
    0,
  );

  function others(person: StoryPerson): StoryPerson[] {
    return (candidates ?? []).filter((c) => c !== person && c.name !== person.name);
  }

  /** People without a card of their own (and not {{user}}) — candidates for a lorebook entry. */
  const sideCharacters = (candidates ?? []).filter((c) => !c.picked && c.name !== userPerson);
  const sidePicked = (c: Candidate) => sidePicks[c.name] ?? c.mentions >= LORE_MIN_MENTIONS;
  const loreTargets: LoreTarget[] = [
    ...(loreItems ?? []).filter((t) => t.picked).map((t) => ({ key: `${t.kind}:${t.name}`, name: t.name, aliases: t.aliases, kind: t.kind })),
    ...sideCharacters.filter(sidePicked).map((c) => ({ key: `person:${c.name}`, name: c.name, aliases: c.aliases, kind: "person" as const })),
  ];
  const readyLore = loreTargets.filter((t) => loreResults[t.key]?.status === "ready" && loreResults[t.key].add);

  const mainCharacter = picked[0]?.name ?? candidates?.[0]?.name ?? null;
  useEffect(() => {
    if (!lorebookNameEdited) setLorebookName(defaultLorebookName(fileName, mainCharacter));
  }, [fileName, mainCharacter, lorebookNameEdited]);

  /** Everything named in the story — for telling one name's paragraphs from another's. */
  function namedOthers(name: string): { name: string; aliases: string[] }[] {
    return [...(candidates ?? []), ...(loreItems ?? [])].filter((o) => o.name !== name);
  }

  async function findLore() {
    if (!activeProfile || parts.length === 0) return;
    setIsFindingLore(true);
    setError(null);
    setLoreResults({});
    try {
      const lists = await mapConcurrent(parts, concurrencyFor(activeProfile), async (part, i) => {
        setProgress(`Reading part ${i + 1} of ${parts.length} for places and terms…`);
        try {
          const found = await withRetry(() =>
            requestStoryLore(activeProfile, [
              { role: "system", content: buildStoryLoreSystemPrompt() },
              buildStoryPeopleUserTurn(part.text),
            ]),
          );
          return cleanPartPeople(found, part.text);
        } catch {
          return [];
        }
      });
      const items = mergeStoryLore(lists, paragraphs, candidates ?? []);
      // Preselected: what the story mentions a few times — the user drops what's common knowledge.
      setLoreItems(items.map((t) => ({ ...t, picked: t.mentions >= LORE_MIN_MENTIONS && !isCommonWord(t) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFindingLore(false);
      setProgress(null);
    }
  }

  function patchLore(key: string, patch: Partial<LoreResult>) {
    setLoreResults((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { status: "working", add: true }), ...patch } }));
  }

  async function writeLoreEntry(config: AiProviderConfig, target: LoreTarget) {
    patchLore(target.key, { status: "working", error: undefined });
    try {
      const mentioned = paragraphsMentioning(paragraphs, target, namedOthers(target.name));
      if (mentioned.length === 0) throw new Error("The story doesn't mention it by this name.");
      const passages = count ? loreExcerpts(paragraphs, mentioned, count) : [];
      const ask = (hint: string) =>
        withRetry(() =>
          requestStoryLoreEntry(config, [
            { role: "system", content: buildStoryLoreEntrySystemPrompt(target.name, LORE_KIND_LABELS[target.kind], writeLanguage) },
            buildStoryLoreEntryUserTurn(target, passages, writeLanguage, hint),
          ]),
        );
      let content = await ask("");
      if (wrongLanguage(content, writeLanguage)) content = await ask(storyLanguageRetryHint(writeLanguage));
      const played = (candidates ?? []).find((c) => c.name === userPerson);
      patchLore(target.key, {
        status: "ready",
        add: true,
        content: played ? nameToUser(content, played, others(played)) : content,
        keys: loreKeys(target),
      });
    } catch (err) {
      patchLore(target.key, { status: "error", add: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function writeLore(targets: LoreTarget[]) {
    if (!activeProfile || targets.length === 0) return;
    setIsWritingLore(true);
    setError(null);
    try {
      await mapConcurrent(targets, concurrencyFor(activeProfile), (t) => writeLoreEntry(activeProfile, t));
    } finally {
      setIsWritingLore(false);
    }
  }

  async function findPeople() {
    if (!activeProfile || parts.length === 0) return;
    setIsFinding(true);
    setError(null);
    setResults({});
    setSidePicks({});
    try {
      const lists = await mapConcurrent(parts, concurrencyFor(activeProfile), async (part, i) => {
        setProgress(`Reading part ${i + 1} of ${parts.length}…`);
        try {
          const found = await withRetry(() =>
            requestStoryPeople(activeProfile, [
              { role: "system", content: buildStoryPeopleSystemPrompt() },
              buildStoryPeopleUserTurn(part.text),
            ]),
          );
          return cleanPartPeople(found, part.text);
        } catch {
          return []; // One unreadable part shouldn't lose the rest — its people are usually in others too.
        }
      });
      const people = mergeStoryPeople(lists, paragraphs);
      // Preselected: the main characters — the three mentioned most, if they're mentioned a few times.
      setCandidates(people.map((p, i) => ({ ...p, picked: i < 3 && p.mentions >= 3 })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFinding(false);
      setProgress(null);
    }
  }

  function updateCandidates(update: (list: Candidate[]) => Candidate[]) {
    setCandidates((prev) => {
      if (!prev) return prev;
      const next = update(prev.map((c) => ({ ...c })));
      countMentions(next, paragraphs);
      return next;
    });
  }

  /** The user says the person at `index` is the same as `targetName` — one entry from now on. */
  function mergeCandidate(index: number, targetName: string) {
    const from = candidates?.[index];
    if (!from || from.name === targetName) return;
    updateCandidates((list) =>
      list
        .filter((_, j) => j !== index)
        .map((c) => (c.name === targetName ? { ...mergePersonInto(c, from), picked: c.picked || from.picked } : c)),
    );
    if (rolePerson === from.name) setRolePerson(targetName);
    // Their notes came from fewer paragraphs.
    setResults((prev) => {
      const next = { ...prev };
      delete next[from.name];
      delete next[targetName];
      return next;
    });
  }

  function addExtraName() {
    const name = extraName.trim();
    if (!name || candidates?.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    updateCandidates((list) => [...list, { name, aliases: [], roles: ["added by you"], mentions: 0, narrator: false, picked: true }]);
    setExtraName("");
  }

  function patchResult(name: string, patch: Partial<Result>) {
    setResults((prev) => ({ ...prev, [name]: { ...(prev[name] ?? { status: "working", add: true }), ...patch } }));
  }

  /** The other people as the card pass sees them — the one {{user}} plays shown as {{user}}. */
  function othersForCard(person: StoryPerson): { name: string; role: string }[] {
    return others(person)
      .filter((p) => p.mentions >= 2 || p.name === userPerson)
      .slice(0, 15)
      .map((p) => ({
        name: p.name === userPerson ? `{{user}} (in the story: ${p.name})` : p.name,
        role: p.roles[0] ?? "",
      }));
  }

  /** Notes on a person from every part they appear in (pass 2 of the cards). */
  async function collectNotes(
    config: AiProviderConfig,
    person: StoryPerson,
    onProgress: (text: string) => void,
  ): Promise<{ notes: string[][]; skipped: number }> {
    const notes: string[][] = [];
    let skipped = 0;
    const theirParts = partsWith(parts, paragraphs, person, others(person));
    for (const [i, part] of theirParts.entries()) {
      onProgress(`Reading part ${i + 1} of ${theirParts.length}…`);
      try {
        const found = await withRetry(() =>
          requestStoryNotes(config, [
            { role: "system", content: buildStoryNotesSystemPrompt(person.name, person.aliases, writeLanguage) },
            buildStoryNotesUserTurn(part.text, writeLanguage),
          ]),
        );
        notes.push(notesAbout(found, person, others(person)));
      } catch {
        skipped++;
      }
    }
    return { notes: notes.filter((n) => n.length > 0), skipped };
  }

  async function makeCard(config: AiProviderConfig, person: Candidate, reuseNotes: boolean) {
    if (!role) return;
    const roleText = storyUserRoleText(role);
    const knowsUser = !(role.kind === "new" && role.mode === "joins");
    patchResult(person.name, { status: "working", error: undefined });
    try {
      let notes = reuseNotes ? results[person.name]?.notes : undefined;
      let skipped = reuseNotes ? (results[person.name]?.skipped ?? 0) : 0;
      if (!notes) {
        ({ notes, skipped } = await collectNotes(config, person, (progress) => patchResult(person.name, { progress })));
        patchResult(person.name, { notes, skipped });
      }
      if (notes.length === 0) throw new Error("No notes came back — the story may not say enough about them.");

      // A reply in the wrong language (the story's, mostly) is written once more with the
      // language said again; if it's still wrong, the card says so.
      const inLanguage = async (ask: (hint: string) => Promise<Record<string, unknown>>, fields: string[]) => {
        const first = await withRetry(() => ask(""));
        const isWrong = (r: Record<string, unknown>) => wrongLanguage(fields.map((f) => String(r[f] ?? "")).join("\n"), writeLanguage);
        if (!isWrong(first)) return { reply: first, wrong: false };
        const second = await withRetry(() => ask(storyLanguageRetryHint(writeLanguage)));
        return { reply: second, wrong: isWrong(second) };
      };

      patchResult(person.name, { progress: "Writing the card…" });
      const cardReply = await inLanguage(
        (hint) =>
          requestFieldPatch(config, ["description", "personality"], [
            { role: "system", content: buildStoryCardSystemPrompt(person.name, roleText, knowsUser, writeLanguage) },
            buildStoryCardUserTurn(notes, othersForCard(person), writeLanguage, hint),
          ]),
        ["description", "personality"],
      );
      const description = String(cardReply.reply.description ?? "");
      const personality = String(cardReply.reply.personality ?? "");

      patchResult(person.name, { progress: "Writing the opening scene…" });
      const sceneReply = await inLanguage(
        (hint) =>
          requestFieldPatch(config, ["scenario", "first_mes"], [
            { role: "system", content: buildStorySceneSystemPrompt(person.name, roleText, writeLanguage) },
            buildStorySceneUserTurn({ description, personality }, endingNotes(notes), note, writeLanguage, hint),
          ]),
        ["scenario", "first_mes"],
      );
      const scene = sceneReply.reply;
      // The character {{user}} plays is written {{user}} — by the code, the model kept the name.
      const played = (candidates ?? []).find((c) => c.name === userPerson);
      const toUser = (t: string) => (played ? nameToUser(t, played, others(played)) : t);
      patchResult(person.name, {
        status: "ready",
        progress: undefined,
        add: true,
        languageWarning: cardReply.wrong || sceneReply.wrong,
        card: {
          name: person.name,
          description: toUser(description),
          personality: toUser(personality),
          scenario: toUser(String(scene.scenario ?? "")),
          first_mes: toUser(String(scene.first_mes ?? "")),
        },
      });
    } catch (err) {
      patchResult(person.name, {
        status: "error",
        progress: undefined,
        add: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function makePicked() {
    if (!activeProfile || picked.length === 0) return;
    setIsWriting(true);
    setError(null);
    try {
      await mapConcurrent(picked, concurrencyFor(activeProfile), (person) => makeCard(activeProfile, person, true));
    } finally {
      setIsWriting(false);
    }
  }

  async function redo(person: Candidate) {
    if (!activeProfile) return;
    setIsWriting(true);
    try {
      await makeCard(activeProfile, person, true);
    } finally {
      setIsWriting(false);
    }
  }

  const ready = picked.filter((c) => results[c.name]?.status === "ready" && results[c.name].add);

  function handleApply() {
    // The lorebook is shared: open in the Lorebooks mode and linked to every new card, so
    // SillyTavern makes one World Info of it on the first card's import (see sharedBookPatch).
    const book =
      readyLore.length > 0
        ? buildStoryLorebook(
            lorebookName,
            readyLore.map((t) => ({ name: t.name, keys: loreResults[t.key].keys ?? [], content: loreResults[t.key].content ?? "" })),
          )
        : null;
    if (book && book.entries.length > 0) useLorebookStore.getState().addUnsaved(book);
    if (persona?.status === "ready" && persona.add && persona.name.trim()) {
      const personas = usePersonaStore.getState();
      personas.newCard();
      personas.updateCard({ name: persona.name.trim(), description: persona.description.trim() });
    }
    for (const person of ready) {
      const card = results[person.name].card;
      if (!card) continue;
      newCard();
      updateCard(card);
      const added = useCardStore.getState().card;
      if (book && book.entries.length > 0 && added) updateCard(sharedBookPatch(added, book));
    }
    onClose();
    if (ready.length === 0 && book) onShowLorebooks?.();
  }

  async function loadFile() {
    try {
      const file = await pickStoryFile();
      if (!file) return;
      setText(file.text);
      setFileName(file.fileName);
      setCandidates(null);
      setResults({});
      setLoreItems(null);
      setLoreResults({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function renderResult(person: Candidate) {
    const r = results[person.name];
    if (!r) return null;
    if (r.status === "working") return <p className="field-hint">{r.progress ?? "Waiting…"}</p>;
    return (
      <div className="consistency-fix">
        {r.error && <p className="field-error">{r.error}</p>}
        {r.languageWarning && (
          <p className="field-hint">
            The model wrote this card (partly) in another language than “{language}”, also on a second try. Rewrite, or
            try another model — small local models tend to follow the story's language.
          </p>
        )}
        {!!r.skipped && (
          <p className="field-hint">{r.skipped} part(s) of the story couldn't be read and were left out.</p>
        )}
        {r.card && (
          <label className="ai-lorebook-draft-entry">
            <input type="checkbox" checked={r.add} onChange={(e) => patchResult(person.name, { add: e.target.checked })} />
            <div>
              <span className="ai-assist-draft-label">Description</span>
              <p className="ai-assist-draft-value">{r.card.description}</p>
              <span className="ai-assist-draft-label">First message</span>
              <p className="ai-assist-draft-value">{r.card.first_mes}</p>
            </div>
          </label>
        )}
        <div className="consistency-fix-row">
          <button
            type="button"
            className="secondary"
            disabled={busy || !providerReady || !role}
            onClick={() => void redo(person)}
            title="Write the card and the opening scene again from the same notes"
          >
            Rewrite
          </button>
        </div>
      </div>
    );
  }

  const roleNeedsPerson = roleChoice === "plays" || roleChoice === "replaces";

  const readyCards = picked.filter((c) => results[c.name]?.status === "ready" && results[c.name].card);
  const personaCards = readyCards.filter((c) => personaCardPicks[c.name] ?? true);
  // A persona helps where the characters already know {{user}} as someone with a history: in a
  // story character's place, or as that character. Someone new is met for the first time.
  const personaMode = role?.kind === "plays" ? "plays" : role?.kind === "new" && role.mode === "replaces" ? "replaces" : null;
  const personaReady = persona?.status === "ready" && persona.add && !!persona.name.trim();
  // Another role or character: the persona was written for the old one.
  useEffect(() => {
    setPersona(null);
  }, [userPerson, personaMode]);

  async function writePersona() {
    if (!activeProfile || !role || !personaMode) return;
    const person = (candidates ?? []).find((c) => c.name === userPerson);
    if (!person) return;
    setIsWritingPersona(true);
    setPersona({ status: "working", name: "", description: "", add: true });
    try {
      if (personaMode === "replaces") {
        const characters = personaCards.map((c) => ({ name: c.name, description: results[c.name].card!.description }));
        const askSelf = (extraWish: string) =>
          withRetry(() =>
            requestFieldPatch(
              activeProfile,
              ["name", "description"],
              buildStoryPersonaSelfMessages(person.name, characters, [personaWish.trim(), extraWish].filter(Boolean).join(". "), writeLanguage),
            ),
          );
        const ownWords = personWords(person, others(person));
        const problem = (r: Record<string, unknown>) =>
          isReplacedName(String(r.name ?? ""), ownWords)
            ? `The name must not be ${person.name} — choose another first name`
            : wrongLanguage(String(r.description ?? ""), writeLanguage)
              ? storyLanguageRetryHint(writeLanguage)
              : "";
        let self = await askSelf("");
        if (problem(self)) self = await askSelf(problem(self));
        if (isReplacedName(String(self.name ?? ""), ownWords)) {
          throw new Error(`The model keeps writing ${person.name} — give your persona a name in the wishes above.`);
        }
        setPersona({ status: "ready", add: true, name: String(self.name ?? "").trim(), description: String(self.description ?? "").trim() });
        return;
      }
      let notes = playedNotes?.name === person.name ? playedNotes.notes : null;
      if (!notes) {
        ({ notes } = await collectNotes(activeProfile, person, (progress) =>
          setPersona((p) => (p ? { ...p, progress } : p)),
        ));
        setPlayedNotes({ name: person.name, notes });
      }
      if (notes.length === 0) throw new Error("No notes came back — the story may not say enough about them.");
      setPersona((p) => (p ? { ...p, progress: "Writing the persona…" } : p));
      const reply = await withRetry(() =>
        requestFieldPatch(activeProfile, ["name", "description"], buildStoryPersonaPlaysMessages(person.name, notes, personaWish, writeLanguage)),
      );
      // Playing a story character, the persona is that character — by their story name.
      setPersona({ status: "ready", add: true, name: person.name, description: String(reply.description ?? "").trim() });
    } catch (err) {
      setPersona({ status: "error", name: "", description: "", add: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsWritingPersona(false);
    }
  }

  /** Writes the opening scenes of the ready cards again, now knowing the persona — so the first
   * message can show how the character sees {{user}}. */
  async function rewriteOpeningsForPersona() {
    if (!activeProfile || !role || !persona || persona.status !== "ready") return;
    const roleText = storyUserRoleText(role);
    const played = (candidates ?? []).find((c) => c.name === userPerson);
    // The persona's own name becomes {{user}} too: the card should work with any persona.
    const personaPerson = { name: persona.name, aliases: [], roles: [], mentions: 0, narrator: false };
    const toUser = (t: string) =>
      nameToUser(played ? nameToUser(t, played, others(played)) : t, personaPerson, candidates ?? []);
    const personaInfo = { name: persona.name, description: persona.description };
    setIsWritingPersona(true);
    try {
      await mapConcurrent(readyCards, concurrencyFor(activeProfile), async (person) => {
        const r = results[person.name];
        if (!r.card || !r.notes) return;
        patchResult(person.name, { status: "working", progress: "Rewriting the opening for your persona…" });
        try {
          const scene = await withRetry(() =>
            requestFieldPatch(activeProfile, ["scenario", "first_mes"], [
              { role: "system", content: buildStorySceneSystemPrompt(person.name, roleText, writeLanguage, true) },
              buildStorySceneUserTurn(
                { description: r.card!.description, personality: r.card!.personality },
                endingNotes(r.notes!),
                note,
                writeLanguage,
                "",
                personaInfo,
              ),
            ]),
          );
          patchResult(person.name, {
            status: "ready",
            progress: undefined,
            card: { ...r.card!, scenario: toUser(String(scene.scenario ?? "")), first_mes: toUser(String(scene.first_mes ?? "")) },
          });
        } catch (err) {
          // The card stays as it was — only the new opening failed.
          patchResult(person.name, { status: "ready", progress: undefined, error: err instanceof Error ? err.message : String(err) });
        }
      });
    } finally {
      setIsWritingPersona(false);
    }
  }

  function renderPersonaSection() {
    if (!personaMode || !userPerson) return null;
    const canWrite = personaMode === "plays" || personaCards.length > 0;
    return (
      <div className="field">
        <span className="field-label">Your persona</span>
        <p className="field-hint">
          {personaMode === "replaces"
            ? `A persona for you in ${userPerson}'s place — fitted to the cards below and your role. Write the cards first.`
            : `${userPerson} as your persona, from what the story tells about them.`}{" "}
          It opens in the Personas mode; in SillyTavern, use “Convert to Persona” on it.
        </p>
        {personaMode === "replaces" && readyCards.length > 0 && (
          <div className="consistency-fix-row">
            {readyCards.map((c) => (
              <label key={c.name} className="field-inline">
                <input
                  type="checkbox"
                  checked={personaCardPicks[c.name] ?? true}
                  disabled={busy}
                  onChange={() => setPersonaCardPicks((prev) => ({ ...prev, [c.name]: !(prev[c.name] ?? true) }))}
                />
                {c.name}
              </label>
            ))}
          </div>
        )}
        <textarea
          className="field-textarea"
          rows={2}
          value={personaWish}
          disabled={busy}
          placeholder="Optional wishes — name, looks, character, e.g. “Clara, early twenties, red hair, quick-tempered”"
          onChange={(e) => setPersonaWish(e.target.value)}
        />
        {persona?.status === "working" && <p className="field-hint">{persona.progress ?? "Writing the persona…"}</p>}
        {persona?.error && <p className="field-error">{persona.error}</p>}
        {persona?.status === "ready" && (
          <label className="ai-lorebook-draft-entry">
            <input type="checkbox" checked={persona.add} onChange={(e) => setPersona({ ...persona, add: e.target.checked })} />
            <div>
              <input
                className="field-input"
                value={persona.name}
                disabled={busy}
                onChange={(e) => setPersona({ ...persona, name: e.target.value })}
              />
              <textarea
                className="field-textarea"
                rows={5}
                value={persona.description}
                disabled={busy}
                onChange={(e) => setPersona({ ...persona, description: e.target.value })}
              />
            </div>
          </label>
        )}
        <div className="consistency-fix-row">
          <button type="button" className="secondary" disabled={!providerReady || !canWrite || busy} onClick={() => void writePersona()}>
            {persona ? "Rewrite persona" : "Create persona"}
          </button>
          {persona?.status === "ready" && readyCards.length > 0 && (
            <button
              type="button"
              className="secondary"
              disabled={!providerReady || busy}
              onClick={() => void rewriteOpeningsForPersona()}
              title="Writes the opening scenes of the cards again, so the characters notice your persona's looks and manner"
            >
              Rewrite openings for persona
            </button>
          )}
        </div>
      </div>
    );
  }

  const applyParts = [
    ready.length > 0 ? `${ready.length} card${ready.length === 1 ? "" : "s"}` : "",
    readyLore.length > 0 ? `lorebook (${readyLore.length} entr${readyLore.length === 1 ? "y" : "ies"})` : "",
    personaReady ? "persona" : "",
  ].filter(Boolean);
  const applyLabel = `Add ${applyParts.join(" + ")}`.trim();

  function renderLoreResult(target: LoreTarget) {
    const r = loreResults[target.key];
    if (!r) return null;
    if (r.status === "working") return <p className="field-hint">Writing the entry…</p>;
    return (
      <div className="consistency-fix">
        {r.error && <p className="field-error">{r.error}</p>}
        {r.content !== undefined && (
          <label className="ai-lorebook-draft-entry">
            <input type="checkbox" checked={r.add} onChange={(e) => patchLore(target.key, { add: e.target.checked })} />
            <div>
              <input
                className="field-input"
                value={(r.keys ?? []).join(", ")}
                disabled={busy}
                title="Keys, separated by commas"
                onChange={(e) => patchLore(target.key, { keys: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
              />
              <textarea
                className="field-textarea"
                rows={3}
                value={r.content}
                disabled={busy}
                onChange={(e) => patchLore(target.key, { content: e.target.value })}
              />
            </div>
          </label>
        )}
        <div className="consistency-fix-row">
          <button
            type="button"
            className="secondary"
            disabled={busy || !providerReady}
            onClick={() => void writeLore([target])}
            title="Write this entry again"
          >
            Rewrite
          </button>
        </div>
      </div>
    );
  }

  function renderLoreSection() {
    const toWrite = loreTargets.filter((t) => loreResults[t.key]?.status !== "ready");
    return (
      <div className="field">
        <span className="field-label">Lorebook</span>
        <p className="field-hint">
          Entries for the story's world and its side characters, shared by all cards from this story (it opens in the
          Lorebooks mode). Preselected is what the story mentions often — untick what the AI knows anyway (“London”) or
          doesn't need. You can check and edit every entry before adding it.
        </p>
        <label className="field">
          <span className="field-label">Name</span>
          <input
            className="field-input"
            value={lorebookName}
            disabled={busy}
            onChange={(e) => {
              setLorebookName(e.target.value);
              setLorebookNameEdited(true);
            }}
          />
        </label>
        <div className="ai-assist-draft">
          {loreItems?.length === 0 && <p className="ai-assist-draft-value">No places or terms found.</p>}
          {!loreItems && <p className="field-hint">“Find places & terms” adds the story's places, groups and terms here.</p>}
          {loreItems?.map((item, i) => {
            const target = loreTargets.find((t) => t.key === `${item.kind}:${item.name}`);
            return (
              <div key={`${item.kind}:${item.name}`} className="ai-consistency-finding">
                <label className="field-inline">
                  <input
                    type="checkbox"
                    checked={item.picked}
                    disabled={busy}
                    onChange={() => setLoreItems((list) => list?.map((t, j) => (j === i ? { ...t, picked: !t.picked } : t)) ?? null)}
                  />
                  <strong>{item.name}</strong>
                  {` — ${LORE_KIND_LABELS[item.kind]}${item.about[0] ? `: ${item.about[0]}` : ""}`}
                  <span className="field-hint">
                    {" "}
                    ({item.mentions} paragraph{item.mentions === 1 ? "" : "s"}
                    {item.aliases.length > 0 && `, also “${item.aliases.slice(0, 3).join("”, “")}”`})
                  </span>
                </label>
                {target && renderLoreResult(target)}
              </div>
            );
          })}
          {candidates ? (
            sideCharacters.map((person) => {
              const target = loreTargets.find((t) => t.key === `person:${person.name}`);
              return (
                <div key={`person:${person.name}`} className="ai-consistency-finding">
                  <label className="field-inline">
                    <input
                      type="checkbox"
                      checked={sidePicked(person)}
                      disabled={busy}
                      onChange={() => setSidePicks((prev) => ({ ...prev, [person.name]: !sidePicked(person) }))}
                    />
                    <strong>{person.name}</strong>
                    {` — side character${person.roles[0] ? `: ${person.roles[0]}` : ""}`}
                    <span className="field-hint"> ({person.mentions} paragraph{person.mentions === 1 ? "" : "s"})</span>
                  </label>
                  {target && renderLoreResult(target)}
                </div>
              );
            })
          ) : (
            <p className="field-hint">“Find people” adds side characters without a card of their own here.</p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" disabled={!providerReady || toWrite.length === 0 || busy} onClick={() => void writeLore(toWrite)}>
            {isWritingLore ? "Writing entries…" : `Write ${toWrite.length} lorebook entr${toWrite.length === 1 ? "y" : "ies"}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Cards from a Story</h3>
        <p className="field-hint">
          Creates character cards from a story — your fan fiction, a short story, an excerpt from a book. The AI reads it
          part by part, you pick the characters and your own place in the story, and each card is written new (not copied
          from the text) with an opening scene that continues after the story's end. Each card opens in its own tab.
        </p>

        <AiProviderSettings />

        <label className="field">
          <span className="field-label">
            Story{fileName ? ` — ${fileName}` : ""}
            {tokens > 0 && ` (${tokens.toLocaleString()} tokens, ${parts.length} part${parts.length === 1 ? "" : "s"})`}
          </span>
          <textarea
            className="field-textarea"
            rows={6}
            value={text}
            disabled={busy}
            placeholder="Paste the story here, or load a .txt/.md file"
            onChange={(e) => {
              setText(e.target.value);
              setFileName(null);
              setCandidates(null);
              setResults({});
              setLoreItems(null);
              setLoreResults({});
            }}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => void loadFile()}>
            Load .txt/.md…
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!providerReady || !count || parts.length === 0 || busy}
            onClick={() => void findPeople()}
          >
            {isFinding ? "Finding people…" : candidates ? "Find people again" : "Find people"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!providerReady || !count || parts.length === 0 || busy}
            onClick={() => void findLore()}
            title="For a lorebook: places, groups and terms of the story's world"
          >
            {isFindingLore ? "Finding places & terms…" : loreItems ? "Find places & terms again" : "Find places & terms"}
          </button>
        </div>

        {candidates && (
          <>
            <div className="ai-assist-draft">
              {candidates.length === 0 && <p className="ai-assist-draft-value">No people found — add names below.</p>}
              {candidates.map((person, i) => (
                <div key={person.name} className="ai-consistency-finding">
                  <label className="field-inline">
                    <input
                      type="checkbox"
                      checked={person.picked && person.name !== userPerson}
                      disabled={busy || person.name === userPerson}
                      onChange={() => updateCandidates((list) => list.map((c, j) => (j === i ? { ...c, picked: !c.picked } : c)))}
                    />
                    <strong>{person.name}</strong>
                    {person.roles[0] ? ` — ${person.roles[0]}` : ""}
                    <span className="field-hint">
                      {" "}
                      ({person.name === userPerson ? "played by you" : `${person.mentions} paragraph${person.mentions === 1 ? "" : "s"}`}
                      {person.aliases.length > 0 && `, also “${person.aliases.slice(0, 3).join("”, “")}”`})
                    </span>
                  </label>
                  <label className="field-inline field-hint">
                    <input
                      type="checkbox"
                      checked={person.narrator}
                      disabled={busy}
                      onChange={() => {
                        updateCandidates((list) => list.map((c, j) => ({ ...c, narrator: j === i ? !c.narrator : false })));
                        setResults({}); // Their notes came from other parts of the story.
                      }}
                    />
                    tells the story (“I”) — then the whole story is read for them
                  </label>
                  {candidates.length > 1 && (
                    <label className="field-inline field-hint">
                      same person as
                      <select
                        className="field-input"
                        value=""
                        disabled={busy}
                        title="The story calls one person by different names the AI didn't connect (“the sister” and “Grete”) — merge them, so all their paragraphs count"
                        onChange={(e) => e.target.value && mergeCandidate(i, e.target.value)}
                      >
                        <option value="">—</option>
                        {candidates
                          .filter((c) => c.name !== person.name)
                          .map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {person.picked && person.name !== userPerson && renderResult(person)}
                </div>
              ))}
              <div className="consistency-fix-row">
                <input
                  className="field-input"
                  value={extraName}
                  placeholder="Someone missing? Add a name as the story writes it"
                  onChange={(e) => setExtraName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addExtraName();
                  }}
                />
                <button type="button" className="secondary" disabled={!extraName.trim() || busy} onClick={addExtraName}>
                  Add
                </button>
              </div>
            </div>

            <label className="field">
              <span className="field-label">You in the story</span>
              <select
                className="field-input"
                value={roleChoice}
                disabled={busy}
                onChange={(e) => setRoleChoice(e.target.value as RoleChoice)}
              >
                {(Object.keys(ROLE_LABELS) as RoleChoice[]).map((k) => (
                  <option key={k} value={k}>
                    {ROLE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            {roleNeedsPerson && (
              <label className="field">
                <span className="field-label">{roleChoice === "plays" ? "You play" : "You take the place of"}</span>
                <select className="field-input" value={rolePerson} disabled={busy} onChange={(e) => setRolePerson(e.target.value)}>
                  <option value="">— pick a character —</option>
                  {candidates.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {roleChoice !== "plays" && (
              <label className="field">
                <span className="field-label">About you (optional)</span>
                <textarea
                  className="field-textarea"
                  rows={2}
                  value={aboutUser}
                  disabled={busy}
                  placeholder={
                    roleChoice === "always"
                      ? "Who you are and how you fit in, e.g. “Holmes's young assistant, has lived at Baker Street for two years”"
                      : "Who you are, e.g. “a travelling bard, curious and a bit reckless”"
                  }
                  onChange={(e) => setAboutUser(e.target.value)}
                />
              </label>
            )}
            <input
              className="field-input"
              value={note}
              disabled={busy}
              placeholder="Optional note for the opening scene, e.g. “a year later, in Paris”"
              onChange={(e) => setNote(e.target.value)}
            />
          </>
        )}

        {(candidates || loreItems) && (
          <label className="field">
            <span className="field-label">Write the cards and lorebook in</span>
            <input
              className="field-input"
              value={language}
              disabled={busy}
              placeholder="The story's language — or type one, e.g. English"
              onChange={(e) => {
                setLanguage(e.target.value);
                setLanguageEdited(true);
                setResults({}); // Notes are written in this language too.
                setLoreResults({});
              }}
            />
          </label>
        )}

        {!providerReady && <p className="field-hint">Please set a base URL and model in the provider settings.</p>}
        {error && <p className="field-error">{error}</p>}
        {progress && <p className="field-hint">{progress}</p>}

        {candidates && (
          <div className="modal-actions">
            <button
              type="button"
              disabled={!providerReady || picked.length === 0 || !role || busy}
              onClick={() => void makePicked()}
            >
              {isWriting ? "Writing…" : `Create ${picked.length} card${picked.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
        {candidates && picked.length > 0 && !busy && (
          <p className="field-hint">
            About {requestCount} requests — with a local model, roughly 10–30 seconds each.
          </p>
        )}

        {candidates && renderPersonaSection()}

        {(loreItems || sideCharacters.length > 0) && renderLoreSection()}

        <GroupChatHint />

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Discard
          </button>
          <button type="button" onClick={handleApply} disabled={applyParts.length === 0 || busy}>
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
