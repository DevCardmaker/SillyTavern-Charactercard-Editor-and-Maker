import { useEffect, useRef, useState } from "react";
import { useTokenCounter } from "../../hooks/useTokenCount";
import { requestChatReply } from "../../io/aiClient";
import { DEFAULT_BUDGET_SETTINGS } from "../../schema/contextBudget";
import {
  buildTestChatPrompt,
  cleanReply,
  greetingsFor,
  memberName,
  nextSpeaker,
  startMessages,
  stopSequencesFor,
  type TestChatMember,
  type TestChatMessage,
  USER_FALLBACK_NAME,
} from "../../schema/testChat";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { usePersonaStore } from "../../state/personaStore";

interface Props {
  onClose: () => void;
}

const WIDTH_KEY = "test-chat-width";
const MIN_WIDTH = 280;
const DEFAULT_WIDTH = 400;

/** Never wider than leaves ~400px for the editor next to it. */
function clampWidth(width: number): number {
  return Math.round(Math.max(MIN_WIDTH, Math.min(width, window.innerWidth - 400)));
}

function loadWidth(): number {
  try {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    return stored > 0 ? clampWidth(stored) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

/** A throwaway chat next to the editor to try out how a character (or several, as a group) behaves.
 * Every reply is built from the cards' *current* state, unsaved edits included — change a field,
 * hit "Regenerate", see the difference. Nothing is stored: closing the sidebar ends the chat. */
export function TestChatPanel({ onClose }: Props) {
  const characters = useCardStore((s) => s.characters);
  const activeId = useCardStore((s) => s.activeId);
  const personas = usePersonaStore((s) => s.characters);
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);
  const count = useTokenCounter();

  const [participantIds, setParticipantIds] = useState<string[]>(() => (activeId ? [activeId] : []));
  const [personaId, setPersonaId] = useState("");
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [messages, setMessages] = useState<TestChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ activeLore: string[]; dropped: number } | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  /** Bumped on restart/unmount, so a reply that arrives for an old chat is dropped. */
  const generation = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(loadWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const members: TestChatMember[] = participantIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c) => c !== undefined)
    .map((c) => ({ id: c.id, card: c.card }));
  const isGroup = members.length > 1;
  const persona = personas.find((p) => p.id === personaId)?.card;
  const userName = persona?.name.trim() || USER_FALLBACK_NAME;
  const greetings = members.length === 1 ? greetingsFor(members[0].card) : [];
  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  useEffect(() => () => void generation.current++, []);

  // A fresh chat whenever who's in it, the greeting or the persona changes.
  const participantKey = participantIds.join(",");
  useEffect(() => {
    restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantKey, greetingIndex, personaId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, typing]);

  function restart() {
    generation.current++;
    setTyping(null);
    setError(null);
    setInfo(null);
    setMessages(startMessages(members, userName, greetingIndex));
  }

  function toggleParticipant(id: string) {
    setParticipantIds((prev) => {
      if (prev.includes(id)) return prev.length > 1 ? prev.filter((p) => p !== id) : prev;
      // Keep the tab order, so round robin follows the tabs.
      return characters.map((c) => c.id).filter((c) => c === id || prev.includes(c));
    });
    setGreetingIndex(0);
  }

  async function reply(speakerId: string, history: TestChatMessage[]) {
    if (!count) return;
    if (!activeProfile?.baseUrl || !activeProfile.model) {
      setError("No AI provider set up yet — configure one in the AI Assistant first.");
      return;
    }
    // Re-read the store: the reply should use the cards exactly as they are right now.
    const slots = useCardStore.getState().characters;
    const current = participantIds
      .map((id) => slots.find((s) => s.id === id))
      .filter((s) => s !== undefined)
      .map((s) => ({ id: s.id, card: s.card }));
    const speaker = current.find((m) => m.id === speakerId);
    if (!speaker) return;

    const speakerName = memberName(speaker.card);
    const otherNames = [userName, ...current.filter((m) => m.id !== speakerId).map((m) => memberName(m.card))];
    const prompt = buildTestChatPrompt({
      speakerId,
      members: current,
      userName,
      personaDescription: persona?.description ?? "",
      history,
      count,
    });

    const myGeneration = ++generation.current;
    setTyping(speakerName);
    setError(null);
    try {
      const raw = await requestChatReply(activeProfile, prompt.messages, {
        maxTokens: DEFAULT_BUDGET_SETTINGS.responseLength,
        stop: stopSequencesFor(otherNames),
      });
      if (myGeneration !== generation.current) return;
      const content = cleanReply(raw, speakerName, otherNames);
      if (!content) {
        setError(`${speakerName} gave an empty reply — try "Regenerate".`);
        return;
      }
      setMessages([...history, { id: crypto.randomUUID(), speakerId, name: speakerName, content }]);
      setInfo({ activeLore: prompt.activeLore, dropped: prompt.droppedMessages });
    } catch (err) {
      if (myGeneration === generation.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (myGeneration === generation.current) setTyping(null);
    }
  }

  /** Sends what's typed (if anything) and lets `speakerId` answer — round robin if not given. */
  function send(speakerId?: string) {
    if (typing || members.length === 0) return;
    const text = input.trim();
    const history = text
      ? [...messagesRef.current, { id: crypto.randomUUID(), speakerId: null, name: userName, content: text }]
      : messagesRef.current;
    setMessages(history);
    setInput("");
    const next = speakerId ?? nextSpeaker(members.map((m) => m.id), history);
    if (next) void reply(next, history);
  }

  function regenerate() {
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (typing || !last?.speakerId) return;
    const history = messagesRef.current.slice(0, -1);
    setMessages(history);
    void reply(last.speakerId, history);
  }

  function deleteLast() {
    if (typing) return;
    setMessages((prev) => prev.slice(0, -1));
  }

  const last = messages[messages.length - 1];

  // Dragging the left edge: pointer capture keeps the drag going even when the pointer leaves the
  // thin handle. Moving left makes the sidebar wider.
  function onResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width };
  }

  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setWidth(clampWidth(drag.current.startWidth + drag.current.startX - e.clientX));
  }

  function onResizeEnd() {
    if (!drag.current) return;
    drag.current = null;
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // Only a convenience — the default width is fine.
    }
  }

  return (
    <aside className="test-chat-panel" style={{ width }}>
      <div
        className="test-chat-resizer"
        title="Drag to resize"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
      />
      <div className="test-chat-header">
        <strong>Test chat</strong>
        <button type="button" className="secondary" title="Start over" onClick={restart}>
          Restart
        </button>
        <button type="button" className="secondary" title="Close — the chat is not saved" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="field-hint test-chat-note">
        Uses the cards as they are now, unsaved edits included. Close to {isGroup ? "SillyTavern's group chat (swap mode)" : "SillyTavern"}, but
        not identical. Nothing is saved.
      </p>

      {characters.length >= 2 && (
        <div className="test-chat-members">
          {characters.map((c) => (
            <label key={c.id} className="field-inline">
              <input type="checkbox" checked={participantIds.includes(c.id)} onChange={() => toggleParticipant(c.id)} />
              {memberName(c.card)}
            </label>
          ))}
        </div>
      )}

      <div className="test-chat-options">
        <label>
          You:{" "}
          <select className="field-input" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
            <option value="">{USER_FALLBACK_NAME} (no persona)</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.card.name || "New persona"}
              </option>
            ))}
          </select>
        </label>
        {greetings.length > 1 && (
          <label>
            Greeting:{" "}
            <select className="field-input" value={greetingIndex} onChange={(e) => setGreetingIndex(Number(e.target.value))}>
              {greetings.map((g, i) => (
                <option key={i} value={i}>
                  {i === 0 ? "First message" : `Alternate ${i}`}: {g.slice(0, 30)}
                  {g.length > 30 ? "…" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="test-chat-messages" ref={listRef}>
        {members.length === 0 && <p className="field-hint">Tick at least one character above.</p>}
        {members.length > 0 && messages.length === 0 && !typing && (
          <p className="field-hint">No greeting — write the first message.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.speakerId ? "test-chat-message" : "test-chat-message user"}>
            <div className="test-chat-name">{m.name}</div>
            <div className="test-chat-text">{m.content}</div>
          </div>
        ))}
        {typing && <p className="field-hint">{typing} is writing…</p>}
      </div>

      {error && <p className="field-error">{error}</p>}
      {info && (info.activeLore.length > 0 || info.dropped > 0) && (
        <p className="field-hint test-chat-note">
          {info.activeLore.length > 0 && <>Lorebook: {info.activeLore.join(", ")}. </>}
          {info.dropped > 0 && <>{info.dropped} older messages no longer fit the context.</>}
        </p>
      )}

      <div className="test-chat-actions">
        <button type="button" className="secondary" disabled={!!typing || !last?.speakerId} onClick={regenerate}>
          Regenerate
        </button>
        <button type="button" className="secondary" disabled={!!typing || !last} onClick={deleteLast}>
          Delete last
        </button>
      </div>

      <textarea
        className="field-textarea"
        rows={3}
        placeholder={`Message as ${userName} — Enter sends, Shift+Enter for a new line`}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="test-chat-actions">
        <button type="button" disabled={!!typing || members.length === 0 || !count} onClick={() => send()}>
          {isGroup ? "Send (next in turn)" : "Send"}
        </button>
        {isGroup &&
          members.map((m) => (
            <button
              key={m.id}
              type="button"
              className="secondary"
              disabled={!!typing || !count}
              title={`Send, and let ${memberName(m.card)} reply`}
              onClick={() => send(m.id)}
            >
              {memberName(m.card)}
            </button>
          ))}
      </div>
    </aside>
  );
}
