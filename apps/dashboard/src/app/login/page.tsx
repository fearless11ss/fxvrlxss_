import { redirect } from "next/navigation";

import { getOwnerSession } from "../../lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getOwnerSession()) redirect("/");
  return (
    <main className="loginPage">
      <section className="loginBrand" aria-label="fxvrlxss control">
        <div className="loginSigil" aria-hidden="true" />
        <p>Закрытый контур</p>
        <h1>fxvrlxss_</h1>
        <span>Один владелец. Один сеанс управления.</span>
      </section>
      <section className="loginPanel">
        <div>
          <p className="sectionPath">Авторизация</p>
          <h2>Подтвердите доступ</h2>
          <p>Логин, пароль и код из приложения-аутентификатора.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
