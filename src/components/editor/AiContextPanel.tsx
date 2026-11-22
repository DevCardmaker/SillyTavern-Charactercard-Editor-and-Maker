import { useTokenCounter } from "../../hooks/useTokenCount";
import { AI_CONTEXT_PARTS, buildAiContext, contextPartText } from "../../schema/aiContext";
import { useAiContextStore } from "../../state/aiContextStore";
import { useCardStore } from "../../state/cardStore";
import { usePersonaStore } from "../../state/personaStore";

/** Which parts of the card the AI sees for quick actions and the brainstorm chat, with what each
 * part costs. The field being edited is always sent anyway. */
export function AiContextPanel() {
  const card = useCardStore((s) => s.card);
  const keys = useAiContextStore((s) => s.keys);
  const toggle = useAiContextStore((s) => s.toggle);
  const reset = useAiContextStore((s) => s.reset);
  const personaId = useAiContextStore((s) => s.personaId);
  const setPersonaId = useAiContextStore((s) => s.setPersonaId);
  const personas = usePersonaStore((s) => s.characters);
  const count = useTokenCounter();
  if (!card) return null;

  const personaCard = personas.find((p) => p.id === personaId)?.card ?? null;
  const persona = personaCard ? { name: personaCard.name, description: personaCard.description } : null;
  const total = count ? count(buildAiContext(card, keys, persona)) : null;

  return (
    <div className="ai-context-panel">
      <p className="field-hint">
        What the AI knows about the character for the quick actions above the text fields and for the brainstorm chat.
        Fewer parts leave more room and keep a small model on topic.
      </p>
      <ul className="ai-context-list">
        {AI_CONTEXT_PARTS.map((part) => {
          const text = contextPartText(card, part.key, persona);
          return (
            <li key={part.key}>
              <label className="field-inline">
                <input type="checkbox" checked={keys.includes(part.key)} onChange={() => toggle(part.key)} />
                {part.label}
              </label>
              <span className="field-hint ai-context-tokens">{text ? (count ? `${count(text)} token${count(text) === 1 ? "" : "s"}` : "") : "empty"}</span>
            </li>
          );
        })}
      </ul>
      {keys.includes("persona") && (
        <label className="field">
          <span className="field-label">Persona</span>
          <select value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
            <option value="">None</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.card.name || "Unnamed persona"}
              </option>
            ))}
          </select>
          {personas.length === 0 && <span className="field-hint">Open a persona in the Personas mode to choose it here.</span>}
        </label>
      )}
      <div className="ai-context-footer">
        <span>{total !== null ? <strong>{total} tokens</strong> : null} sent as background with each request</span>
        <button type="button" className="secondary" onClick={reset}>
          Defaults
        </button>
      </div>
    </div>
  );
}
