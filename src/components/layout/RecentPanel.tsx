import { useEffect } from "react";
import { openCardAtPath, openCardGroup } from "../../io/fileIO";
import { groupKey, groupLabel, groupMemberNames } from "../../io/recentGroups";
import { useCardStore } from "../../state/cardStore";
import { useRecentCardsStore } from "../../state/recentCardsStore";
import { fileName, useRecentCardThumbnails } from "../editor/RecentCardsList";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The last opened or saved cards — always here, not only while no card is open. */
export function RecentCardsSection({ onError }: { onError: (message: string) => void }) {
  const { recent, thumbnails } = useRecentCardThumbnails();
  const openPaths = useCardStore((s) => s.characters.map((c) => c.currentFilePath).join("\n"));
  if (!recent || recent.length === 0) return null;
  const isOpen = new Set(openPaths.split("\n"));

  return (
    <section className="sidebar-section">
      <div className="sidebar-section-head">
        <span>Recent cards</span>
      </div>
      <ul className="card-list">
        {recent.map((path) => (
          <li key={path} className="card-list-item">
            <button
              type="button"
              className="card-list-select"
              title={isOpen.has(path) ? `${path}\n(already open — opens a second copy)` : path}
              onClick={() => openCardAtPath(path).catch((err) => onError(describeError(err)))}
            >
              {thumbnails[path] ? (
                <img className="card-list-thumb" src={thumbnails[path]} alt="" />
              ) : (
                <div className="card-list-thumb card-list-thumb-empty" />
              )}
              <span className="card-list-name">{fileName(path).replace(/\.(png|json)$/i, "")}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Cards that were opened from a folder or saved as a group, to reopen them all in one click. */
export function RecentGroupsSection({ onError }: { onError: (message: string) => void }) {
  const groups = useRecentCardsStore((s) => s.groups);
  const ensureGroupsLoaded = useRecentCardsStore((s) => s.ensureGroupsLoaded);
  const removeGroup = useRecentCardsStore((s) => s.removeGroup);

  useEffect(() => {
    void ensureGroupsLoaded();
  }, [ensureGroupsLoaded]);

  if (!groups || groups.length === 0) return null;

  async function handleOpen(paths: string[]) {
    const { failed } = await openCardGroup(paths);
    if (failed.length === paths.length) {
      await removeGroup(paths);
      onError("None of the group's cards could be opened any more — removed it from the list.");
    } else if (failed.length > 0) {
      onError(`Could not open: ${failed.join(", ")}`);
    }
  }

  return (
    <section className="sidebar-section">
      <div className="sidebar-section-head">
        <span>Recent groups</span>
      </div>
      <ul className="card-list">
        {groups.map((group) => {
          const members = groupMemberNames(group.paths);
          return (
            <li key={groupKey(group.paths)} className="card-list-item">
              <button
                type="button"
                className="card-list-select group-list-select"
                title={`Open all ${members.length} cards (cards already open are skipped):\n${members.join("\n")}`}
                onClick={() => handleOpen(group.paths).catch((err) => onError(describeError(err)))}
              >
                <span className="card-list-name">{groupLabel(group.paths)}</span>
                <span className="group-list-members">
                  {members.length} cards · {members.join(", ")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The "Recent" tab of the right sidebar: recent groups first, then single cards. */
export function RecentPanel({ onError }: { onError: (message: string) => void }) {
  const hasCards = useRecentCardsStore((s) => (s.recent?.length ?? 0) > 0);
  const hasGroups = useRecentCardsStore((s) => (s.groups?.length ?? 0) > 0);
  return (
    <div className="recent-panel">
      <RecentGroupsSection onError={onError} />
      <RecentCardsSection onError={onError} />
      {!hasCards && !hasGroups && <p className="field-hint">Nothing opened yet.</p>}
      <p className="field-hint">
        A group is recorded when you open a folder of cards or save the open cards together — “Open Folder…” and “Save Group…” in the File menu.
      </p>
    </div>
  );
}
