import { useEffect, useState } from "react";
import { requestConsistencyCheck } from "../../io/aiClient";
import type { AiConsistencyFinding } from "../../schema/aiConsistencyCheck";
import { buildConsistencyCheckSystemPrompt, buildConsistencyCheckUserTurn, summarizeCardForAi } from "../../schema/aiPrompt";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  onClose: () => void;
}

/** Read-only cross-character check, not an editing flow like the other AI panels — there's no
 * draft to apply, just findings to act on manually. Reads `characters` straight from the store
 * (same pattern as CharacterTabBar) since this inherently spans every open tab, not just the
 * active one. */
export function AiConsistencyCheckPanel({ onClose }: Props) {
  const characters = useCardStore((s) => s.characters);
  const setActiveCharacter = useCardStore((s) => s.setActiveCharacter);
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);

  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const [instruction, setInstruction] = useState("");
  const [findings, setFindings] = useState<AiConsistencyFinding[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const canCheck = providerReady && !isChecking;

  async function handleCheck() {
    if (!activeProfile || !canCheck) return;
    setIsChecking(true);
    setCheckError(null);
    try {
      const summaries = characters.map((c) => summarizeCardForAi(c.card));
      const result = await requestConsistencyCheck(activeProfile, [
        { role: "system", content: buildConsistencyCheckSystemPrompt() },
        buildConsistencyCheckUserTurn(summaries, instruction),
      ]);
      setFindings(result);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsChecking(false);
    }
  }

  function jumpTo(name: string) {
    const match = characters.find((c) => c.card.name === name);
    if (!match) return;
    setActiveCharacter(match.id);
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Consistency Check</h3>
        <p className="field-hint">
          Checks the {characters.length} currently open characters together for contradictions (age, relationships,
          names, timeline/location).
        </p>

        <AiProviderSettings />

        {findings !== null && (
          <div className="ai-assist-draft">
            {findings.length === 0 ? (
              <p className="ai-assist-draft-value">No contradictions found.</p>
            ) : (
              findings.map((finding, i) => (
                <div key={i} className="ai-consistency-finding">
                  <p className="ai-assist-draft-value">{finding.issue}</p>
                  <div className="ai-consistency-finding-chips">
                    {finding.characters.map((name) => {
                      const known = characters.some((c) => c.card.name === name);
                      return known ? (
                        <button
                          key={name}
                          type="button"
                          className="ai-consistency-chip"
                          onClick={() => jumpTo(name)}
                          title={`Jump to “${name}”`}
                        >
                          {name}
                        </button>
                      ) : (
                        <span key={name} className="ai-consistency-chip ai-consistency-chip-unknown">
                          {name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!providerReady && (
          <p className="field-hint">Please set a base URL and model in the provider settings.</p>
        )}
        {checkError && <p className="field-error">{checkError}</p>}

        <div className="ai-assist-input-row">
          <textarea
            className="field-textarea"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Optional: anything specific to watch for? e.g. “ages”"
            rows={2}
          />
          <button type="button" onClick={handleCheck} disabled={!canCheck}>
            {isChecking ? "Checking…" : findings === null ? "Check" : "Check again"}
          </button>
        </div>
        {isChecking && (
          <p className="field-hint">
            Waiting for a response — with a local model running partly on CPU this can take several minutes.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
