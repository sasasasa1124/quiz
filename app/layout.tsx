import type { Metadata } from "next";
import { Inter, Lora, Cormorant_Garamond, JetBrains_Mono, Noto_Serif_JP } from "next/font/google";
import "./globals.css";
import PageTransition from "@/components/PageTransition";
import GlobalHeader from "@/components/GlobalHeader";
import Providers from "./providers";
import GithubFeedbackPopup from "@/components/GithubFeedbackPopup";


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
    <html lang="en">
      <body
        className={`${inter.variable} ${lora.variable} ${cormorant.variable} ${jetbrains.variable} ${notoSerifJp.variable} antialiased`}
      >
        <Providers>
          <GlobalHeader />
          <PageTransition>{children}</PageTransition>
          <GithubFeedbackPopup />
        </Providers>
      </body>
    </html>
  );
}
