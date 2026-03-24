import type { Metadata } from "next";
import { Inter, Lora, Cormorant_Garamond, JetBrains_Mono, Noto_Serif_JP } from "next/font/google";
import "./globals.css";
import PageTransition from "@/components/PageTransition";
import Providers from "./providers";
import { ClerkProvider } from "@clerk/nextjs";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const notoSerifJp = Noto_Serif_JP({
  variable: "--font-noto-serif-jp",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Scholion",
  description: "Salesforce / MuleSoft certification exam practice",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider signInUrl="/login" signInFallbackRedirectUrl="/" afterSignOutUrl="/login">
      <html lang="en">
        <body
          className={`${inter.variable} ${lora.variable} ${cormorant.variable} ${jetbrains.variable} ${notoSerifJp.variable} antialiased`}
        >
          <Providers>
            <PageTransition>{children}</PageTransition>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
