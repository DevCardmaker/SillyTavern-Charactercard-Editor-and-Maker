import { AiAssistPanel } from "../editor/AiAssistPanel";
import { AiContextPanel } from "../editor/AiContextPanel";
import { BrainstormPanel } from "../editor/BrainstormPanel";
import { ContextBudgetPanel } from "../editor/ContextBudgetPanel";
import { LorebookKeyTestPanel } from "../editor/LorebookKeyTestPanel";
import { SnapshotsPanel } from "../editor/SnapshotsPanel";
import { TestChatPanel } from "../editor/TestChatPanel";
import { useCardStore } from "../../state/cardStore";
import { RecentPanel } from "./RecentPanel";

export type ToolId = "snapshots" | "chat" | "assist" | "brainstorm" | "context" | "budget" | "keytest" | "recent";

export const TOOLS: { id: ToolId; label: string; title: string }[] = [
  { id: "snapshots", label: "Snapshots", title: "Older versions of this card and snapshots saved by name" },
  { id: "chat", label: "Test chat", title: "Try out the open character(s) in a chat — nothing is saved" },
  { id: "assist", label: "AI Assistant", title: "Write or refine fields of this card with the AI" },
  { id: "brainstorm", label: "Brainstorm", title: "Talk with the AI about this card — it never changes the card" },
  { id: "context", label: "Context", title: "Which parts of the card the AI sees for quick actions and brainstorming" },
  { id: "budget", label: "Budget", title: "How much of the model's context this card takes up" },
  { id: "keytest", label: "Key test", title: "Which lorebook entries SillyTavern would insert for a piece of chat text" },
  { id: "recent", label: "Recent", title: "Recently opened cards and groups" },
];

interface Props {
  active: ToolId;
  /** Tools opened so far. They stay mounted while another tab is shown, so a running chat or AI
   * request isn't lost by looking at something else. */
  opened: ToolId[];
  onSelect: (tool: ToolId) => void;
  /** A tool's own Close button: forgets its state. */
  onCloseTool: (tool: ToolId) => void;
  onHide: () => void;
  onError: (message: string) => void;
}

/** Right column: tools for the open card, one tab each. The panels are the same components that used
 * to open as dialogs; inside `.side-panel-body` the CSS lays their dialog frame out inline. */
export function RightSidebar({ active, opened, onSelect, onCloseTool, onHide, onError }: Props) {
  const card = useCardStore((s) => s.card);
  const activeId = useCardStore((s) => s.activeId);
  const filePath = useCardStore((s) => s.currentFilePath);
  const updateCard = useCardStore((s) => s.updateCard);
  if (!card) return null;

  function panel(tool: ToolId) {
    if (!card) return null;
    const close = () => onCloseTool(tool);
    switch (tool) {
      case "snapshots":
        return <SnapshotsPanel />;
      case "brainstorm":
        return <BrainstormPanel />;
      case "context":
        return <AiContextPanel />;
      case "recent":
        return <RecentPanel onError={onError} />;
      case "chat":
        return <TestChatPanel onClose={close} />;
      // The card tools start over for another card, so nothing meant for one card lands in the next.
      case "assist":
        return <AiAssistPanel key={activeId} card={card} onChange={updateCard} onClose={close} />;
      case "budget":
        return <ContextBudgetPanel key={activeId} card={card} filePath={filePath} onChange={updateCard} onClose={close} />;
      case "keytest":
        return card.character_book && card.character_book.entries.length > 0 ? (
          <LorebookKeyTestPanel key={activeId} book={card.character_book} onClose={close} />
        ) : (
          <p className="field-hint">This card has no lorebook entries to test.</p>
        );
    }
  }

  return (
    <>
      <div className="sidebar-head">
        <nav className="tool-tabs">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={tool.id === active ? "tool-tab active" : "tool-tab"}
              title={tool.title}
              onClick={() => onSelect(tool.id)}
            >
              {tool.label}
            </button>
          ))}
        </nav>
        <button type="button" className="secondary sidebar-small-button sidebar-hide" title="Hide the sidebar" onClick={onHide}>
          ›
        </button>
      </div>
      {opened.map((tool) => (
        <div key={tool} className="side-panel-body" hidden={tool !== active}>
          {panel(tool)}
        </div>
      ))}
    </>
  );
}
