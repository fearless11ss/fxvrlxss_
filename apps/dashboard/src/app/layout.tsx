import "@fontsource-variable/cormorant";
import "@fontsource-variable/manrope";
import "@fontsource/unifrakturcook/700.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description: "Приватная панель управления Discord-сервером fxvrlxss_",
  robots: { follow: false, index: false },
  title: "fxvrlxss_ control",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
