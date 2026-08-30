import { useEffect, useState } from "react";
import { openCardAtPath } from "../../io/fileIO";
import { readBinary } from "../../io/rawFile";
import { useRecentCardsStore } from "../../state/recentCardsStore";

interface Props {
  onError: (message: string) => void;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function isPngPath(path: string): boolean {
  return /\.png$/i.test(path);
}

/** Shown in the empty state (no card loaded yet) — the last opened/saved cards as clickable
 * thumbnails. Only .png cards have an embedded avatar to show (a .json card's `avatarPng` is
 * always null, see loadCardFromPath) — those fall back to a plain document icon. Loading a
 * thumbnail also doubles as an existence check for every entry (json included): anything that
 * fails to read (moved/deleted since it was recorded) is dropped from the list once the whole
 * batch has been checked, rather than being pre-validated some other way. */
export function RecentCardsList({ onError }: Props) {
  const recent = useRecentCardsStore((s) => s.recent);
  const ensureLoaded = useRecentCardsStore((s) => s.ensureLoaded);
  const removeStale = useRecentCardsStore((s) => s.removeStale);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  useEffect(() => {
    if (!recent) return;
    let cancelled = false;
    const objectUrls: string[] = [];
    const stalePaths: string[] = [];

    Promise.all(
      recent.map((path) =>
        readBinary(path)
          .then((bytes) => {
            if (cancelled || !isPngPath(path)) return;
            const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
            objectUrls.push(url);
            setThumbnails((prev) => ({ ...prev, [path]: url }));
          })
          .catch(() => {
            stalePaths.push(path);
          }),
      ),
    ).then(() => {
      if (!cancelled && stalePaths.length > 0) removeStale(stalePaths);
    });

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [recent, removeStale]);

  if (!recent || recent.length === 0) return null;

  async function open(path: string) {
    try {
      await openCardAtPath(path);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="recent-cards">
      <p className="field-label">Recently opened</p>
      <ul>
        {recent.map((path) => (
          <li key={path}>
            <button type="button" className="recent-card-thumb" onClick={() => open(path)} title={path}>
              <span className="recent-card-thumb-image">
                {thumbnails[path] ? (
                  <img src={thumbnails[path]} alt="" />
                ) : (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
                    <path d="M15 2v5h5" />
                  </svg>
                )}
              </span>
              <span className="recent-card-thumb-name">{fileName(path)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
