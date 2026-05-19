import type { Metadata } from "next";
import { IBM_Plex_Mono, VT323 } from "next/font/google";
import "./globals.css";
import { SettingsProvider } from "@/lib/settings";

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const vt323 = VT323({
  variable: "--font-vt323",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "BOLSA TERMINAL v1.0",
  description: "Paper trading terminal — 1980s Wall Street aesthetic",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexMono.variable} ${vt323.variable} h-full antialiased`}
    >
      <body className="crt-screen crt-flicker min-h-full">
        <SettingsProvider>
          <div className="crt-boot min-h-screen">{children}</div>
        </SettingsProvider>
      </body>
    </html>
  );
}
