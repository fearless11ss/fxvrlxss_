"use client";

import type { ModerationSystemConfig } from "@fxvrlxss/domain/moderation-system-config";
import { useActionState } from "react";

import { AutomodFields } from "../automod/automod-form";
import type { AutomodResourceOptions } from "../automod/data";
import { saveModerationDraft, type ModerationActionState } from "./actions";
import type { ModerationRoleOption } from "./data";
import { ModerationFields } from "./moderation-form";

const initialState: ModerationActionState = {};

export function ModerationSystemForm({
  config,
  resources,
  roles,
}: Readonly<{
  config: ModerationSystemConfig;
  resources: AutomodResourceOptions;
  roles: readonly ModerationRoleOption[];
}>) {
  const [state, action, pending] = useActionState(
    saveModerationDraft,
    initialState,
  );
  return (
    <form action={action} className="moderationSystemForm">
      <section className="sectionHeader moderationSystemDivider">
        <p className="sectionPath">Автоматические проверки</p>
        <h2>Флаги и реакции</h2>
      </section>
      <AutomodFields config={config.automod} resources={resources} />

      <section className="sectionHeader moderationSystemDivider">
        <p className="sectionPath">Общие правила</p>
        <h2>Дела, сотрудники и пороги</h2>
      </section>
      <ModerationFields config={config.manual} roles={roles} />

      <footer className="formFooter">
        <div aria-live="polite">
          {state.error ? (
            <span className="formError">{state.error}</span>
          ) : null}
          {state.message ? (
            <span className="formSuccess">{state.message}</span>
          ) : null}
        </div>
        <button disabled={pending} type="submit">
          {pending ? "Сохранение…" : "Сохранить общий черновик"}
        </button>
      </footer>
    </form>
  );
}
