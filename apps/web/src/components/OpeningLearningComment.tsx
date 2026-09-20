import { useEffect, useState } from "react";

import type { OpeningLearningCommentResponse } from "../../../../packages/contracts/src/api";
import { patch } from "../api";

interface OpeningLearningCommentProps {
  repertoireId: string;
  moveId: string;
  comment: string | null;
  onSaved: (comment: string | null) => void;
  onEditingChange?: (editing: boolean) => void;
}

export function OpeningLearningComment({
  repertoireId,
  moveId,
  comment,
  onSaved,
  onEditingChange,
}: OpeningLearningCommentProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(comment ?? "");
    setEditing(false);
    setError("");
  }, [moveId, comment]);

  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await patch<OpeningLearningCommentResponse>(
        `/api/v1/openings/repertoires/${repertoireId}/moves/${moveId}/comment`,
        { comment: value },
      );
      onSaved(result.comment);
      setEditing(false);
      onEditingChange?.(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your learning comment");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="opening-learning-comment">
        <div>
          <strong>Your learning comment</strong>
          <p>{comment ?? "Add the wording, reminder or warning that will help you remember this move."}</p>
        </div>
        <button className="text-button" onClick={() => { setEditing(true); onEditingChange?.(true); }}>
          {comment ? "Edit comment" : "Add comment"}
        </button>
      </div>
    );
  }

  return (
    <div className="opening-learning-comment editing">
      <label>
        Your learning comment
        <textarea
          autoFocus
          maxLength={1000}
          rows={4}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="For example: If the bishop moves first, remember that the knight may block the c-pawn later."
        />
      </label>
      <small>This personal wording appears whenever this move is taught or reviewed. Leave it empty to remove it.</small>
      <div className="answer-actions">
        <button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save comment"}</button>
        <button className="secondary" disabled={saving} onClick={() => { setValue(comment ?? ""); setEditing(false); setError(""); onEditingChange?.(false); }}>Cancel</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
