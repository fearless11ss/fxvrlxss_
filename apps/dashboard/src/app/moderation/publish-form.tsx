"use client";

import { useActionState } from "react";

import { publishModerationDraft, type ModerationActionState } from "./actions";

const initialState: ModerationActionState = {};

export function PublishModerationForm({
  disabled,
  version,
}: Readonly<{ disabled: boolean; version: number }>) {
  const [state, action, pending] = useActionState(
    publishModerationDraft,
    initialState,
  );
  return (
    <form action={action} className="railPublishForm">
      <input name="version" type="hidden" value={version} />
      <div aria-live="polite">
        {state.error ? <span className="formError">{state.error}</span> : null}
        {state.message ? (
          <span className="formSuccess">{state.message}</span>
        ) : null}
      </div>
      <button disabled={disabled || pending} type="submit">
        {pending ? "Передача…" : "Опубликовать"}
      </button>
    </form>
  );
}
