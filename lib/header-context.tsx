"use client";

import { createContext, useContext, useState, useLayoutEffect, useCallback, type ReactNode } from "react";

export interface HeaderConfig {
  back?: { href: string };
  title?: string;
  right?: ReactNode;
  hideSettingsIcon?: boolean;
  hidden?: boolean;
}

interface HeaderContextValue {
  config: HeaderConfig;
  setConfig: (c: HeaderConfig) => void;
}

const HeaderContext = createContext<HeaderContextValue>({
  config: {},
  setConfig: () => {},
});

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<HeaderConfig>({});
  const setConfig = useCallback((c: HeaderConfig) => setConfigState(c), []);
  return (
    <HeaderContext.Provider value={{ config, setConfig }}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeaderConfig() {
  return useContext(HeaderContext);
}

/** Call from a page/component to configure the global header. Resets on unmount. */
export function useSetHeader(config: HeaderConfig, deps: unknown[] = []) {
  const { setConfig } = useHeaderConfig();
  // useLayoutEffect avoids a visible flash before the header updates
  useLayoutEffect(() => {
    setConfig(config);
    return () => setConfig({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
