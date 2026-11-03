import type { Metadata } from "next";
import RegisterSW from "@/components/RegisterSW";

export const metadata: Metadata = {
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Agendou",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegisterSW />
      {children}
    </>
  );
}
