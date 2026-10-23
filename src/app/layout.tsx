import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/geist-mono/400.css";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Agendou — gestão para barbearias", template: "%s · Agendou" },
  description: "Tudo o que sua barbearia precisa para funcionar melhor: agenda, clientes, pagamentos e planos mensais em um só lugar.",
};

export const viewport: Viewport = { themeColor: "#07080a", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
