import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useRef, useState } from "react";
import { requestFreeText } from "../../io/aiClient";
import type { AiChatMessage } from "../../schema/aiPrompt";
import { promptText } from "../../schema/promptTexts";
import { aiContextNow } from "../../state/aiContextNow";
import { activeAiProfileOrThrow } from "../../state/aiProviderConfigStore";
import { useBrainstormStore } from "../../state/brainstormStore";
import { useCardStore } from "../../state/cardStore";

const EMPTY: AiChatMessage[] = [];

/** Talk with the AI about the open card — ideas, weaknesses, questions. It never changes the card;
 * take over what you like by hand or copy it. One chat per card, kept until the program closes. */
export function BrainstormPanel() {
  const activeId = useCardStore((s) => s.activeId);
  const cardName = useCardStore((s) => s.card?.name ?? "");
  const messages = useBrainstormStore((s) => (activeId ? (s.chats[activeId] ?? EMPTY) : EMPTY));
  const setChat = useBrainstormStore((s) => s.setChat);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(history: AiChatMessage[]) {
    if (!activeId) return;
    const cardId = activeId;
    setBusy(true);
    setError(null);
    try {
      const profile = await activeAiProfileOrThrow();
      // The card as it is right now, so the advice follows your edits.
      const context = aiContextNow();
      const system = [
        promptText("brainstorm"),
        context ? `The character card as it is now (only the parts the user chose to share):\n\n${context}` : "The user hasn't shared any part of the card; ask about it if you need to.",
      ].join("\n\n");
      const reply = await requestFreeText(profile, [{ role: "system", content: system }, ...history]);
      setChat(cardId, [...history, { role: "assistant", content: reply.trim() }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || busy || !activeId) return;
    const history: AiChatMessage[] = [...messages, { role: "user", content: text }];
    setChat(activeId, history);
    setInput("");
    void send(history);
  }

  function handleRegenerate() {
    if (busy || !activeId) return;
    const lastUser = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUser < 0) return;
    const history = messages.slice(0, lastUser + 1);
    setChat(activeId, history);
    void send(history);
  }

  return (
    <div className="brainstorm-panel">
      <div className="brainstorm-head">
        <span className="field-hint">
          Think things through with the AI about {cardName || "this card"}. It never changes the card. What it knows is set in
          the Context tab.
        </span>
        <button
          type="button"
          className="secondary"
          disabled={busy || messages.length === 0}
          onClick={() => activeId && setChat(activeId, [])}
          title="Start a new conversation about this card"
        >
          Clear
        </button>
      </div>

      <div className="brainstorm-messages" ref={listRef}>
        {messages.length === 0 && (
          <p className="field-hint">
            For example: “What's missing to make her feel real?”, “Three ideas for a secret”, “Is the scenario too
            vague?”
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "brainstorm-message user" : "brainstorm-message assistant"}>
            <div className="brainstorm-text">{m.content}</div>
            {m.role === "assistant" && (
              <button
                type="button"
                className="link-button brainstorm-copy"
                onClick={() => void writeText(m.content).catch(() => setError("Could not copy to the clipboard."))}
              >
                Copy
              </button>
            )}
          </div>
        ))}
        {busy && <p className="field-hint">Thinking…</p>}
      </div>

      {error && <p className="field-error">{error}</p>}

      <div className="brainstorm-input">
        <textarea
          className="field-textarea"
          rows={3}
          placeholder="Ask or suggest something — Enter sends, Shift+Enter for a new line"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="brainstorm-actions">
          <button type="button" onClick={handleSend} disabled={busy || !input.trim()}>
            Send
          </button>
          <button
            type="button"
            className="secondary"
            onClick={handleRegenerate}
            disabled={busy || !messages.some((m) => m.role === "user")}
          >
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}
