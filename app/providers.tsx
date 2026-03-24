"use client";

import { SettingsProvider } from "@/lib/settings-context";
import { HeaderProvider } from "@/lib/header-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <HeaderProvider>
      <SettingsProvider>{children}</SettingsProvider>
    </HeaderProvider>
  );
}
