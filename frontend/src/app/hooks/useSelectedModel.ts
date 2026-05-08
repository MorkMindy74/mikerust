"use client";

import { useCallback } from "react";
import { useUserProfile, type LLMConfig } from "@/contexts/UserProfileContext";
import {
    DEFAULT_MODEL_ID,
    buildAvailableModelsFromConfig,
} from "../components/assistant/ModelToggle";

// Selected model is persisted in user_settings on the backend (via
// UserProfileContext.setSelectedModel) — not in localStorage — so the
// preference travels with the data folder. Fallback when nothing is
// stored: the default model id.
function pickInitial(llm: LLMConfig | undefined): string {
    if (!llm) return DEFAULT_MODEL_ID;
    const allowed = new Set(buildAvailableModelsFromConfig(llm).map((m) => m.id));
    if (llm.selectedModel && allowed.has(llm.selectedModel)) {
        return llm.selectedModel;
    }
    return allowed.size > 0 ? DEFAULT_MODEL_ID : (llm.selectedModel ?? DEFAULT_MODEL_ID);
}

export function useSelectedModel(): [string, (id: string) => void] {
    const { profile, setSelectedModel } = useUserProfile();
    const model = pickInitial(profile?.llm);

    const onChange = useCallback(
        (id: string) => {
            const next = id && id.trim() ? id : DEFAULT_MODEL_ID;
            void setSelectedModel(next);
        },
        [setSelectedModel],
    );

    return [model, onChange];
}
