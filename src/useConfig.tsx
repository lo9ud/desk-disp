import { createContext, useContext } from "react";
import { Config } from "./types";

const ConfigContext = createContext<Config | null>(null);

export const useConfig = () => useContext(ConfigContext);

export function ConfigProvider({
  config,
  children,
}: {
  config: Config;
  children: React.ReactNode;
}) {
  return <ConfigContext value={config}>{children}</ConfigContext>;
}
