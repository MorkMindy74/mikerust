"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Eye, EyeOff, Server, Cpu, ShieldCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { apiBase } from "@/lib/apiBase";

// Per-provider settings shape used in the form.
//
// API keys are NEVER kept in form state — see `secretInputs` below. The
// state only knows whether a saved key exists on the backend (`*Saved`
// flags) so the UI can render "chiave salvata" without the key ever
// being visible to the page's React tree.
interface LLMSettings {
    openaiSaved: boolean;
    openaiModel: string;
    claudeSaved: boolean;
    claudeModel: string;
    geminiSaved: boolean;
    geminiModel: string;
    geminiRegion: string;
    localBaseUrl: string;
    localSaved: boolean;
    localModel: string;
    activeProvider: "openai" | "claude" | "gemini" | "local";
}

const DEFAULTS: LLMSettings = {
    openaiSaved: false,
    openaiModel: "gpt-4o",
    claudeSaved: false,
    claudeModel: "claude-opus-4-5",
    geminiSaved: false,
    geminiModel: "gemini-2.5-flash",
    geminiRegion: "global",
    localBaseUrl: "http://localhost:11434/v1",
    localSaved: false,
    localModel: "",
    activeProvider: "local",
};

// Catalogue shapes — mirror `src/presets/model.rs` over the wire.
interface CatalogueModel {
    id: string;
    display_name: string;
    family?: string;
    tier?: string;
    preview?: boolean;
    legacy?: boolean;
    supports_vision?: boolean;
    supports_tools?: boolean;
}
interface CatalogueRegion {
    id: string;
    display_name: string;
    is_default?: boolean;
}
interface CatalogueProvider {
    id: string;
    display_name: string;
    supports_regions: boolean;
    regions: CatalogueRegion[];
    models: CatalogueModel[];
}
interface ModelCatalogue {
    providers: CatalogueProvider[];
}

function getToken() {
    return typeof window !== "undefined"
        ? localStorage.getItem("mike_auth_token") ?? ""
        : "";
}

interface BackendLLMSettings {
    openai_api_key: string | null;
    openai_model: string | null;
    claude_api_key: string | null;
    main_model: string | null;
    title_model: string | null;
    tabular_model: string | null;
    gemini_api_key: string | null;
    gemini_region: string | null;
    gemini_model: string | null;
    local_base_url: string | null;
    local_api_key: string | null;
    local_model: string | null;
    active_provider: string | null;
}

function fromBackend(s: BackendLLMSettings): LLMSettings {
    const allowed: LLMSettings["activeProvider"][] = [
        "openai",
        "claude",
        "gemini",
        "local",
    ];
    const ap = (s.active_provider ?? "") as LLMSettings["activeProvider"];
    return {
        openaiSaved: !!s.openai_api_key,
        openaiModel: s.openai_model ?? DEFAULTS.openaiModel,
        claudeSaved: !!s.claude_api_key,
        claudeModel: s.main_model ?? DEFAULTS.claudeModel,
        geminiSaved: !!s.gemini_api_key,
        geminiModel: s.gemini_model ?? DEFAULTS.geminiModel,
        geminiRegion: s.gemini_region ?? DEFAULTS.geminiRegion,
        localBaseUrl: s.local_base_url ?? DEFAULTS.localBaseUrl,
        localSaved: !!s.local_api_key,
        localModel: s.local_model ?? "",
        activeProvider: allowed.includes(ap) ? ap : DEFAULTS.activeProvider,
    };
}

async function loadSettings(): Promise<LLMSettings> {
    if (typeof window === "undefined") return DEFAULTS;
    const token = getToken();
    if (!token) return DEFAULTS;
    try {
        const res = await fetch(`${apiBase()}/user/llm-settings`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return DEFAULTS;
        const json = (await res.json()) as BackendLLMSettings;
        return fromBackend(json);
    } catch {
        return DEFAULTS;
    }
}

async function loadCatalogue(): Promise<ModelCatalogue | null> {
    if (typeof window === "undefined") return null;
    const token = getToken();
    if (!token) return null;
    try {
        const res = await fetch(`${apiBase()}/models`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        return (await res.json()) as ModelCatalogue;
    } catch {
        return null;
    }
}

// Send a partial update. Backend uses COALESCE — fields we don't
// include keep their existing value. We only include API keys when the
// user has actually re-typed them (see callers); everything else is
// always sent because those fields are visible and editable.
async function saveSettings(body: Record<string, unknown>): Promise<string | null> {
    const token = getToken();
    if (!token) {
        if (typeof window !== "undefined") window.location.href = "/login";
        return "Not authenticated — redirecting to login…";
    }
    const res = await fetch(`${apiBase()}/user/llm-settings`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    if (res.status === 401 && typeof window !== "undefined") {
        localStorage.removeItem("mike_auth_token");
        localStorage.removeItem("mike_auth_user");
        window.location.href = "/login";
        return "Session expired — please sign in again.";
    }
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        return `HTTP ${res.status}: ${text || res.statusText}`;
    }
    return null;
}

type Provider = "openai" | "claude" | "gemini" | "local";

// Map our backend provider ids onto the catalogue provider ids.
// Backend uses the short keys (claude, gemini) while the catalogue
// uses the vendor names (anthropic, google) — keep both in sync here
// so a future rename only touches one map.
const CATALOGUE_PROVIDER_ID: Record<
    "openai" | "claude" | "gemini",
    string
> = {
    openai: "openai",
    claude: "anthropic",
    gemini: "google",
};

export default function ModelsAndApiKeysPage() {
    const [settings, setSettings] = useState<LLMSettings>(DEFAULTS);
    const [catalogue, setCatalogue] = useState<ModelCatalogue | null>(null);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const t = useTranslations("Models");
    const tCommon = useTranslations("Common");
    const { reloadProfile } = useUserProfile();

    // Plaintext API keys live OUTSIDE React state — see notes in the
    // original SecretField comment block.
    const openaiRef = useRef<HTMLInputElement>(null);
    const claudeRef = useRef<HTMLInputElement>(null);
    const geminiRef = useRef<HTMLInputElement>(null);
    const localRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([loadSettings(), loadCatalogue()]).then(([s, c]) => {
            if (cancelled) return;
            setSettings(s);
            setCatalogue(c);
            setLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const set = (patch: Partial<LLMSettings>) =>
        setSettings((prev) => ({ ...prev, ...patch }));

    // Lookup helpers — kept memoised because the catalogue can have a
    // few hundred entries (regions × models × providers).
    const providerById = useMemo(() => {
        const map = new Map<string, CatalogueProvider>();
        for (const p of catalogue?.providers ?? []) map.set(p.id, p);
        return map;
    }, [catalogue]);

    // Provider is "configured" when an API key is saved (for cloud
    // providers) OR when the local base URL is filled in (for the
    // local provider — the key is optional there). Used both to gate
    // the "active provider" toggle and to pre-empt confusion: clicking
    // "set as active" on a provider with no key would just mean the
    // chat picker silently uses the wrong endpoint.
    const isConfigured = (p: Provider): boolean => {
        switch (p) {
            case "openai":
                return settings.openaiSaved;
            case "claude":
                return settings.claudeSaved;
            case "gemini":
                return settings.geminiSaved;
            case "local":
                return !!settings.localBaseUrl;
        }
    };

    const handleSave = async () => {
        const body: Record<string, unknown> = {
            openai_model: settings.openaiModel || null,
            main_model: settings.claudeModel || null,
            gemini_model: settings.geminiModel || null,
            gemini_region:
                settings.geminiRegion && settings.geminiRegion !== "global"
                    ? settings.geminiRegion
                    : null,
            local_base_url: settings.localBaseUrl || null,
            local_model: settings.localModel || null,
            active_provider: settings.activeProvider,
        };

        const openaiTyped = openaiRef.current?.value ?? "";
        if (openaiTyped) body.openai_api_key = openaiTyped;
        const claudeTyped = claudeRef.current?.value ?? "";
        if (claudeTyped) body.claude_api_key = claudeTyped;
        const geminiTyped = geminiRef.current?.value ?? "";
        if (geminiTyped) body.gemini_api_key = geminiTyped;
        const localTyped = localRef.current?.value ?? "";
        if (localTyped) body.local_api_key = localTyped;

        const err = await saveSettings(body);
        if (err) {
            setSaveError(err);
            setSaved(false);
            return;
        }

        if (openaiRef.current) openaiRef.current.value = "";
        if (claudeRef.current) claudeRef.current.value = "";
        if (geminiRef.current) geminiRef.current.value = "";
        if (localRef.current) localRef.current.value = "";

        setSettings((prev) => ({
            ...prev,
            openaiSaved: prev.openaiSaved || !!openaiTyped,
            claudeSaved: prev.claudeSaved || !!claudeTyped,
            geminiSaved: prev.geminiSaved || !!geminiTyped,
            localSaved: prev.localSaved || !!localTyped,
        }));

        await reloadProfile();

        setSaveError(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const clearKey = async (provider: Provider) => {
        const field =
            provider === "openai"
                ? "openai_api_key"
                : provider === "claude"
                  ? "claude_api_key"
                  : provider === "gemini"
                    ? "gemini_api_key"
                    : "local_api_key";
        const err = await saveSettings({ [field]: "" });
        if (err) {
            setSaveError(err);
            return;
        }
        setSettings((prev) => {
            const next = {
                ...prev,
                ...(provider === "openai" && { openaiSaved: false }),
                ...(provider === "claude" && { claudeSaved: false }),
                ...(provider === "gemini" && { geminiSaved: false }),
                ...(provider === "local" && { localSaved: false }),
            };
            // If the active provider just lost its key, fall back to
            // "local" so the chat picker doesn't try to use a
            // now-credentialless cloud provider on the next turn.
            if (prev.activeProvider === provider && provider !== "local") {
                next.activeProvider = "local";
            }
            return next;
        });
        await reloadProfile();
    };

    const PROVIDERS: { id: Provider; label: string }[] = [
        { id: "openai", label: t("openai") },
        { id: "claude", label: t("anthropic") },
        { id: "gemini", label: t("gemini") },
        { id: "local", label: t("local") },
    ];

    if (!loaded) {
        return (
            <div className="text-sm text-gray-400">{tCommon("loading")}</div>
        );
    }

    return (
        <div className="space-y-8 max-w-xl">
            {/* Active provider — disabled buttons for providers without a saved key */}
            <section>
                <h2 className="text-2xl font-medium font-serif mb-4">{t("activeProvider")}</h2>
                <div className="grid grid-cols-2 gap-2">
                    {PROVIDERS.map((p) => {
                        const enabled = isConfigured(p.id);
                        const active = settings.activeProvider === p.id;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() =>
                                    enabled && set({ activeProvider: p.id })
                                }
                                disabled={!enabled}
                                aria-pressed={active}
                                title={enabled ? undefined : t("providerNotConfigured")}
                                className={`flex items-center justify-between gap-2 text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                                    active
                                        ? "border-black bg-black text-white"
                                        : enabled
                                            ? "border-gray-200 hover:border-gray-400 text-gray-700"
                                            : "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                                }`}
                            >
                                <span>{p.label}</span>
                                {!enabled && <Lock className="h-3.5 w-3.5 shrink-0" />}
                            </button>
                        );
                    })}
                </div>
                {!catalogue && (
                    <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        {t("noCatalogue")}
                    </p>
                )}
            </section>

            {/* OpenAI */}
            <section>
                <div className="flex items-center gap-2 mb-3">
                    <Cpu className="h-4 w-4 text-gray-500" />
                    <h2 className="text-lg font-medium">{t("openai")}</h2>
                </div>
                <div className="space-y-3">
                    <SecretField
                        label={t("apiKey")}
                        placeholder={t("apiKeyPlaceholder")}
                        inputRef={openaiRef}
                        keySaved={settings.openaiSaved}
                        onClear={() => clearKey("openai")}
                    />
                    <ModelSelect
                        provider={providerById.get(CATALOGUE_PROVIDER_ID.openai)}
                        value={settings.openaiModel}
                        onChange={(v) => set({ openaiModel: v })}
                    />
                </div>
            </section>

            {/* Claude */}
            <section>
                <div className="flex items-center gap-2 mb-3">
                    <Cpu className="h-4 w-4 text-gray-500" />
                    <h2 className="text-lg font-medium">{t("anthropic")}</h2>
                </div>
                <div className="space-y-3">
                    <SecretField
                        label={t("apiKey")}
                        placeholder="sk-ant-…"
                        inputRef={claudeRef}
                        keySaved={settings.claudeSaved}
                        onClear={() => clearKey("claude")}
                    />
                    <ModelSelect
                        provider={providerById.get(CATALOGUE_PROVIDER_ID.claude)}
                        value={settings.claudeModel}
                        onChange={(v) => set({ claudeModel: v })}
                    />
                </div>
            </section>

            {/* Gemini */}
            <section>
                <div className="flex items-center gap-2 mb-3">
                    <Cpu className="h-4 w-4 text-gray-500" />
                    <h2 className="text-lg font-medium">{t("gemini")}</h2>
                </div>
                <div className="space-y-3">
                    <SecretField
                        label={t("apiKey")}
                        placeholder="AI…"
                        inputRef={geminiRef}
                        keySaved={settings.geminiSaved}
                        onClear={() => clearKey("gemini")}
                    />
                    <ModelSelect
                        provider={providerById.get(CATALOGUE_PROVIDER_ID.gemini)}
                        value={settings.geminiModel}
                        onChange={(modelId) => {
                            // Preview models are global-only by spec: force
                            // the region back to "global" automatically when
                            // the user picks one.
                            const p = providerById.get(
                                CATALOGUE_PROVIDER_ID.gemini,
                            );
                            const m = p?.models.find((mm) => mm.id === modelId);
                            const patch: Partial<LLMSettings> = {
                                geminiModel: modelId,
                            };
                            if (m?.preview) patch.geminiRegion = "global";
                            set(patch);
                        }}
                    />
                    <RegionSelect
                        provider={providerById.get(CATALOGUE_PROVIDER_ID.gemini)}
                        value={settings.geminiRegion}
                        onChange={(v) => set({ geminiRegion: v })}
                        forcedToGlobal={isPreviewModel(
                            providerById.get(CATALOGUE_PROVIDER_ID.gemini),
                            settings.geminiModel,
                        )}
                    />
                </div>
            </section>

            {/* Local / OpenAI-compatible — no catalogue: the user types the model name */}
            <section>
                <div className="flex items-center gap-2 mb-1">
                    <Server className="h-4 w-4 text-gray-500" />
                    <h2 className="text-lg font-medium">{t("local")}</h2>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="text-sm text-gray-600 block mb-1">{t("baseUrl")}</label>
                        <Input
                            value={settings.localBaseUrl}
                            onChange={(e) => set({ localBaseUrl: e.target.value })}
                            placeholder={t("baseUrlPlaceholder")}
                        />
                    </div>
                    <SecretField
                        label={t("apiKey")}
                        placeholder="optional"
                        inputRef={localRef}
                        keySaved={settings.localSaved}
                        onClear={() => clearKey("local")}
                    />
                    <div>
                        <label className="text-sm text-gray-600 block mb-1">{t("model")}</label>
                        <Input
                            value={settings.localModel}
                            onChange={(e) => set({ localModel: e.target.value })}
                            placeholder={t("modelPlaceholder")}
                        />
                    </div>
                </div>
            </section>

            {/* Save */}
            <div className="space-y-2">
                <Button
                    onClick={handleSave}
                    className="bg-black hover:bg-gray-900 text-white min-w-[120px]"
                >
                    {saved ? <><Check className="h-4 w-4 mr-1" />{tCommon("save")}</> : tCommon("save")}
                </Button>
                {saveError && (
                    <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md border border-red-200">
                        {saveError}
                    </p>
                )}
            </div>
        </div>
    );
}

function isPreviewModel(
    provider: CatalogueProvider | undefined,
    modelId: string,
): boolean {
    if (!provider) return false;
    return !!provider.models.find((m) => m.id === modelId)?.preview;
}

interface ModelSelectProps {
    provider: CatalogueProvider | undefined;
    value: string;
    onChange: (v: string) => void;
}

// Renders a `<select>` of models for `provider`. If `value` is not in
// the catalogue (e.g. a leftover custom id from before the catalogue
// existed, or one removed in a config refresh) we prepend a synthetic
// "{value} — custom" option so the user doesn't silently lose their
// setting. Falls back to a free-form text input when the provider is
// missing from the catalogue entirely.
function ModelSelect({ provider, value, onChange }: ModelSelectProps) {
    const t = useTranslations("Models");
    if (!provider) {
        return (
            <div>
                <label className="text-sm text-gray-600 block mb-1">{t("model")}</label>
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={t("modelPlaceholder")}
                />
            </div>
        );
    }
    const inCatalogue = provider.models.some((m) => m.id === value);
    return (
        <div>
            <label className="text-sm text-gray-600 block mb-1">{t("model")}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm hover:border-gray-400 focus:outline-none transition-colors"
            >
                {!value && (
                    <option value="" disabled>
                        {t("modelSelectPlaceholder")}
                    </option>
                )}
                {!inCatalogue && value && (
                    <option value={value}>{`${value} — ${t("customModel")}`}</option>
                )}
                {provider.models.map((m) => {
                    const suffix = m.preview
                        ? ` (${t("modelPreview")})`
                        : m.legacy
                            ? ` (${t("modelLegacy")})`
                            : "";
                    return (
                        <option key={m.id} value={m.id}>
                            {m.display_name}
                            {suffix}
                        </option>
                    );
                })}
            </select>
        </div>
    );
}

interface RegionSelectProps {
    provider: CatalogueProvider | undefined;
    value: string;
    onChange: (v: string) => void;
    forcedToGlobal: boolean;
}

// Region dropdown — only renders when the catalogue says the provider
// supports regions. Disabled (and forced to "global") when the chosen
// model is a preview model, because preview deployments are global-only.
function RegionSelect({ provider, value, onChange, forcedToGlobal }: RegionSelectProps) {
    const t = useTranslations("Models");
    if (!provider || !provider.supports_regions) return null;
    const effective = forcedToGlobal ? "global" : value;
    return (
        <div>
            <label className="text-sm text-gray-600 block mb-1">
                {t("geminiRegion")}
            </label>
            <select
                value={effective}
                onChange={(e) => onChange(e.target.value)}
                disabled={forcedToGlobal}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm hover:border-gray-400 focus:outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
                {provider.regions.map((r) => (
                    <option key={r.id} value={r.id}>
                        {r.display_name}
                    </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
                {forcedToGlobal ? t("previewGlobalOnly") : t("geminiRegionHint")}
            </p>
        </div>
    );
}

interface SecretFieldProps {
    label: string;
    placeholder: string;
    inputRef: React.RefObject<HTMLInputElement | null>;
    keySaved: boolean;
    onClear: () => void;
}

// Uncontrolled input — the typed value lives in the DOM, NOT in React
// state. When `keySaved` is true a chip is shown above the input so the
// user knows a key is already stored on the backend without seeing it,
// and can leave the input empty to keep that key untouched.
function SecretField({ label, placeholder, inputRef, keySaved, onClear }: SecretFieldProps) {
    const [reveal, setReveal] = useState(false);
    const t = useTranslations("Models");
    const tCommon = useTranslations("Common");
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-600">{label}</label>
                {keySaved && (
                    <div className="flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-2 py-0.5 border border-green-200">
                            <ShieldCheck className="h-3 w-3" />
                            {t("apiKeyStored")}
                        </span>
                        <button
                            type="button"
                            onClick={onClear}
                            className="text-gray-400 hover:text-red-600 transition-colors"
                        >
                            {tCommon("delete")}
                        </button>
                    </div>
                )}
            </div>
            <div className="relative">
                <input
                    ref={inputRef}
                    type={reveal ? "text" : "password"}
                    defaultValue=""
                    placeholder={keySaved ? t("apiKeyKeepHint") : placeholder}
                    className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50 pr-10"
                    autoComplete="off"
                    spellCheck={false}
                />
                <button
                    type="button"
                    onClick={() => setReveal((r) => !r)}
                    className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
                    aria-label={reveal ? "Hide" : "Show"}
                >
                    {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            </div>
        </div>
    );
}
