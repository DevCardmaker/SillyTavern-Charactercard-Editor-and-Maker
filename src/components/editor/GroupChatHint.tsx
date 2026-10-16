/** Shown where several cards are created at once. SillyTavern can't import a group, and a group
 * file made here would point at card file names SillyTavern only assigns on import — so the
 * group itself is made in SillyTavern, in a few clicks. */
export function GroupChatHint() {
  return (
    <p className="field-hint">
      To chat with them together: import the cards into SillyTavern, then use the group button (“Create New Chat Group”) there and add them as
      members. “Swap character cards” (the default) keeps only the speaking character's card in the prompt — the most
      context-friendly choice.
    </p>
  );
}
