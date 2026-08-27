import { createContext, useContext, useState } from 'react';
import { useAIChatInternal } from '../hooks/useAI';

// Holds the single chat conversation so the floating panel and the /ai-chat
// page show the same messages. panelOpen lives here too so the full page can
// hand the conversation back to the floating panel (minimize).
const AIContext = createContext(null);

export function AIProvider({ children }) {
  const chat = useAIChatInternal();
  const [panelOpen, setPanelOpen] = useState(false);
  return <AIContext.Provider value={{ ...chat, panelOpen, setPanelOpen }}>{children}</AIContext.Provider>;
}

export const useAIChat = () => useContext(AIContext);
