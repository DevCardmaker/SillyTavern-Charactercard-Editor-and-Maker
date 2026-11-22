import { useEffect, useState } from "react";
import {
  createStGroupFromCards,
  planCardSend,
  planPersonaSend,
  sendCardToSt,
  sendPersonaToSt,
  type CardSendPlan,
  type PersonaSendPlan,
} from "../../io/sillyTavernActions";
import { useCardStore } from "../../state/cardStore";
import { useSillyTavernStore } from "../../state/sillyTavernStore";
import { useStDialogStore } from "../../state/stDialogStore";

const RELOAD_HINT = "If SillyTavern is open in a browser, reload it there to see the change.";

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Both SillyTavern dialogs, mounted once in App. */
export function StDialogs() {
  const send = useStDialogStore((s) => s.send);
  const createGroup = useStDialogStore((s) => s.createGroup);
  if (send) return <SendDialog kind={send.kind} slotId={send.slotId} />;
  if (createGroup) return <CreateGroupDialog />;
  return null;
}

type Plan = CardSendPlan | PersonaSendPlan;

/** Send one open card or persona: over the one it came from, over one with the same name, or new. */
function SendDialog({ kind, slotId }: { kind: "card" | "persona"; slotId: string }) {
  const close = useStDialogStore((s) => s.close);
  const refresh = useSillyTavernStore((s) => s.refresh);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (kind === "card" ? planCardSend(slotId) : planPersonaSend(slotId))
      .then((p) => {
        if (cancelled) return;
        setPlan(p);
        // The one it came from first; then a single same-name match; otherwise new.
        setTarget(p.linked?.avatar ?? (p.sameName.length === 1 ? p.sameName[0].avatar : ""));
      })
      .catch((err) => {
        if (!cancelled) setError(describe(err));
      });
    return () => {
      cancelled = true;
    };
  }, [kind, slotId]);

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      const file = kind === "card" ? await sendCardToSt(slotId, target || null) : await sendPersonaToSt(slotId, target || null);
      await refresh();
      setDone(
        kind === "card"
          ? `Sent as ${file}.${target ? " SillyTavern's previous version is kept as a snapshot of this card (“before sillytavern”)." : ""} ${RELOAD_HINT}`
          : `Sent as ${file}. A snapshot of SillyTavern's settings was made first (User Settings → Settings Snapshots). ${RELOAD_HINT}`,
      );
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  const what = kind === "card" ? "character" : "persona";
  const options = plan ? [...(plan.linked ? [plan.linked] : []), ...plan.sameName] : [];

  return (
    <div className="modal-overlay">
      <div className="modal st-dialog">
        <h3>Send {plan?.name ? `“${plan.name}”` : `this ${what}`} to SillyTavern</h3>
        {!plan && !error && <p className="field-hint">Looking at SillyTavern…</p>}
        {plan && !done && (
          <div className="st-target-list">
            {options.map((o) => (
              <label key={o.avatar} className="field-inline">
                <input type="radio" name="st-target" checked={target === o.avatar} onChange={() => setTarget(o.avatar)} />
                Overwrite “{o.name}”{" "}
                <span className="field-hint">
                  ({o.avatar}
                  {o === plan.linked ? ", opened from there" : ", same name"})
                </span>
              </label>
            ))}
            <label className="field-inline">
              <input type="radio" name="st-target" checked={target === ""} onChange={() => setTarget("")} />
              Add as a new {what}
            </label>
            {kind === "card" && target && (
              <p className="field-hint">
                Chats stay — they belong to the character's file. SillyTavern's current version is kept as a snapshot of this
                card first.
              </p>
            )}
            {kind === "persona" && (
              <p className="field-hint">
                SillyTavern can only save its settings as a whole, so a settings snapshot is made first. Don't change settings in
                an open SillyTavern tab before reloading it, or it saves its older copy over this.
              </p>
            )}
          </div>
        )}
        {done && <p className="st-done">✓ {done}</p>}
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button type="button" onClick={() => void handleSend()} disabled={!plan || busy}>
              {busy ? "Sending…" : target ? "Overwrite" : "Add"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A SillyTavern group from the open cards, in the chosen order — the order of first messages in a
 * group chat. Every card is sent first, to the target picked for it. */
function CreateGroupDialog() {
  const close = useStDialogStore((s) => s.close);
  const refresh = useSillyTavernStore((s) => s.refresh);
  const characters = useCardStore((s) => s.characters);
  const [plans, setPlans] = useState<CardSendPlan[] | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>(() => characters.map((c) => c.id));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all(characters.map((c) => planCardSend(c.id)))
      .then((found) => {
        if (cancelled) return;
        setPlans(found);
        setTargets(
          Object.fromEntries(found.map((p) => [p.slotId, p.linked?.avatar ?? (p.sameName.length === 1 ? p.sameName[0].avatar : "")])),
        );
      })
      .catch((err) => {
        if (!cancelled) setError(describe(err));
      });
    return () => {
      cancelled = true;
    };
    // The open cards when the dialog opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function move(index: number, delta: number) {
    setOrder((o) => {
      const target = index + delta;
      if (target < 0 || target >= o.length) return o;
      const next = [...o];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      await createStGroupFromCards(
        name,
        order.map((slotId) => ({ slotId, replace: targets[slotId] || null })),
      );
      await refresh();
      setDone(true);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal st-dialog">
        <h3>Create a group in SillyTavern</h3>
        {characters.length < 2 && <p className="field-hint">Open at least two cards first.</p>}
        {!plans && !error && characters.length >= 2 && <p className="field-hint">Looking at SillyTavern…</p>}
        {plans && !done && (
          <>
            <label className="field">
              <span className="field-label">Group name</span>
              <input
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Familie Berg"
                autoFocus
              />
            </label>
            <p className="field-hint">In this order the members greet in a new group chat. Each card is sent first:</p>
            <ol className="st-group-members">
              {order.map((slotId, index) => {
                const plan = plans.find((p) => p.slotId === slotId);
                if (!plan) return null;
                const options = [...(plan.linked ? [plan.linked] : []), ...plan.sameName];
                return (
                  <li key={slotId}>
                    <span className="st-member-name">{plan.name || "Unnamed card"}</span>
                    <select value={targets[slotId] ?? ""} onChange={(e) => setTargets((t) => ({ ...t, [slotId]: e.target.value }))}>
                      {options.map((o) => (
                        <option key={o.avatar} value={o.avatar}>
                          overwrite {o.avatar}
                        </option>
                      ))}
                      <option value="">add as new</option>
                    </select>
                    <button type="button" className="secondary" disabled={index === 0} onClick={() => move(index, -1)}>
                      ↑
                    </button>
                    <button type="button" className="secondary" disabled={index === order.length - 1} onClick={() => move(index, 1)}>
                      ↓
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
        {done && <p className="st-done">✓ Group created. {RELOAD_HINT}</p>}
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!plans || busy || characters.length < 2 || !name.trim()}
            >
              {busy ? "Sending…" : "Create group"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
