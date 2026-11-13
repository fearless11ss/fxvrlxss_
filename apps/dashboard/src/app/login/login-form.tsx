"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return (
    <form action={action} className="loginForm">
      <label>
        <span>Логин</span>
        <input autoComplete="username" name="username" required />
      </label>
      <label>
        <span>Пароль</span>
        <input
          autoComplete="current-password"
          name="password"
          required
          type="password"
        />
      </label>
      <label>
        <span>Одноразовый код</span>
        <input
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          name="token"
          pattern="[0-9]{6}"
          required
        />
      </label>
      {state.error ? (
        <p aria-live="polite" className="formError">
          {state.error}
        </p>
      ) : null}
      <button disabled={pending} type="submit">
        {pending ? "Проверка…" : "Войти"}
      </button>
    </form>
  );
}
