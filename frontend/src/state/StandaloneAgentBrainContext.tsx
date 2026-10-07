import React, { createContext, useContext } from "react";

/**
 * 开源版：AI 大脑（Agent Brain）已移除。
 * 保留 Context 骨架以便页面编译通过；useStandaloneAgentBrainOptional() 恒返回 null。
 */

type AgentBrainConfig = {
  ok: boolean;
  activated?: boolean;
  providerLabel?: string;
  agentName?: string;
} | null;

type StandaloneAgentBrainContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  openAgentBrain: () => void;
  config: AgentBrainConfig;
  configLoaded: boolean;
  refreshConfig: () => Promise<void>;
  onAgentActivated: (email: string, agentName: string, locale: string) => void;
  messagesVersion: number;
  bumpMessages: () => void;
};

const StandaloneAgentBrainContext = createContext<StandaloneAgentBrainContextValue | null>(null);

const noop = () => {};

export function StandaloneAgentBrainProvider(props: { children: React.ReactNode }) {
  return <>{props.children}</>;
}

export function useStandaloneAgentBrainOptional(): StandaloneAgentBrainContextValue | null {
  return null;
}

export function useStandaloneAgentBrain(): StandaloneAgentBrainContextValue {
  const ctx = useContext(StandaloneAgentBrainContext);
  if (!ctx) {
    return {
      open: false,
      setOpen: noop,
      toggle: noop,
      openAgentBrain: noop,
      config: null,
      configLoaded: true,
      refreshConfig: async () => {},
      onAgentActivated: noop,
      messagesVersion: 0,
      bumpMessages: noop
    };
  }
  return ctx;
}
