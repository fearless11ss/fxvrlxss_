"use client";

import { useActionState } from "react";

import { publishAutomodDraft, type PublishAutomodState } from "./actions";

const initialState: PublishAutomodState = {};

export function PublishAutomodForm({
  disabled,
  version,
}: Readonly<{ disabled: boolean; version: number }>) {
  const [state, action, pending] = useActionState(
    publishAutomodDraft,
    initialState,
  );
  return (
    <form action={action} className="publishForm">
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
