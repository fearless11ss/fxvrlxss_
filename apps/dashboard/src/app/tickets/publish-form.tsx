"use client";

import { useActionState } from "react";

import { publishTicketDraft, type PublishTicketState } from "./actions";

const initialState: PublishTicketState = {};

export function PublishTicketForm({
  disabled,
  version,
}: Readonly<{ disabled: boolean; version: number }>) {
  const [state, action, pending] = useActionState(
    publishTicketDraft,
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
