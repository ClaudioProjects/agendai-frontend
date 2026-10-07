import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { AlarmDraft } from "./index";

type AiDraftContextValue = {
  drafts: AlarmDraft[];
  setDrafts: Dispatch<SetStateAction<AlarmDraft[]>>;
};

export const AiDraftContext = createContext<AiDraftContextValue | null>(null);

export function useAiDrafts() {
  const value = useContext(AiDraftContext);
  if (!value) throw new Error("useAiDrafts must be used inside AiDraftContext");
  return value;
}
