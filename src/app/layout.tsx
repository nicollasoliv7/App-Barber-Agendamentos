import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/geist-mono/400.css";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Agendou — agenda online para barbearias", template: "%s · Agendou" },
  description: "Agendamento online sem login, CRM de clientes e migração simples para barbearias.",
};

export const viewport: Viewport = { themeColor: "#07080a", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
