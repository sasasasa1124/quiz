"use client";

import { useHeaderConfig } from "@/lib/header-context";
import PageHeader from "./PageHeader";

export default function GlobalHeader() {
  const { config } = useHeaderConfig();
  if (config.hidden) return null;
  return (
    <PageHeader
      back={config.back}
      title={config.title}
      right={config.right}
      hideSettingsIcon={config.hideSettingsIcon}
    />
  );
}
