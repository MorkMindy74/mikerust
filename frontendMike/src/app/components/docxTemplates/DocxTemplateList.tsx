"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileType2, RefreshCw } from "lucide-react";
import {
    listDocxTemplates,
    describeDocxTemplate,
    type DocxTemplateSummary,
    type DocxTemplateSidecar,
} from "@/app/lib/mikeApi";
import { HeaderSearchBtn } from "../shared/HeaderSearchBtn";
import { DomainFilter } from "../shared/DomainControls";
import type { Domain } from "../shared/types";
import { DocxTemplateDetailModal } from "./DocxTemplateDetailModal";

/**
 * Browse the system DOCX templates loaded from
 * `config/docx-templates/`. Read-only for now — adding user templates
 * (via JSON upload or form) is a Phase-2 item.
 *
 * The page reuses `DomainFilter`. A template surfaces under the
 * selected domain when its primary `domain` matches OR when the
 * domain appears in `also_applicable_to` (the backend handles the
 * matching server-side, see `DocxTemplate::matches_domain`).
 */
export function DocxTemplateList() {
    const t = useTranslations("DocxTemplates");
    const tDomains = useTranslations("Domains");
    const router = useRouter();
    const [templates, setTemplates] = useState<DocxTemplateSummary[] | null>(null);
    const [domainFilter, setDomainFilter] = useState<Domain | undefined>(undefined);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Detail modal state — when a template is clicked we fetch the
    // full sidecar + the auto-generated prompt and show them in a
    // panel without leaving the list page (avoids URL-encoding the
    // `/` inside template ids).
    const [openTemplate, setOpenTemplate] = useState<DocxTemplateSidecar | null>(null);
    const [openPrompt, setOpenPrompt] = useState<string>("");
    const [openLoading, setOpenLoading] = useState(false);

    const load = async (domain: Domain | undefined) => {
        setLoading(true);
        setError(null);
        try {
            const items = await listDocxTemplates(
                domain ? { domain } : undefined,
            );
            setTemplates(items);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setTemplates([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load(domainFilter);
    }, [domainFilter]);

    const filtered = useMemo(() => {
        if (!templates) return [];
        const q = search.trim().toLowerCase();
        if (!q) return templates;
        return templates.filter((tmp) => {
            const display = (
                tmp.display_name?.it ??
                tmp.display_name?.en ??
                tmp.id
            ).toLowerCase();
            return (
                tmp.id.toLowerCase().includes(q) ||
                display.includes(q) ||
                tmp.category.toLowerCase().includes(q)
            );
        });
    }, [templates, search]);

    const openDetail = async (id: string) => {
        setOpenLoading(true);
        try {
            const data = await describeDocxTemplate(id, "it");
            setOpenTemplate(data.sidecar as DocxTemplateSidecar);
            setOpenPrompt(data.prompt_md);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setOpenLoading(false);
        }
    };

    const closeDetail = () => {
        setOpenTemplate(null);
        setOpenPrompt("");
    };

    const applyToChat = (id: string) => {
        // Bounce the user back to a fresh assistant chat with the
        // template id in a URL param. The composer will read it and
        // pre-load the chip.
        router.push(`/assistant?template=${encodeURIComponent(id)}`);
    };

    const displayName = (tmp: DocxTemplateSummary): string => {
        return tmp.display_name?.it ?? tmp.display_name?.en ?? tmp.id;
    };

    return (
        <div className="w-full max-w-6xl mx-auto px-6 py-8">
            <header className="mb-6">
                <h1 className="text-3xl font-medium font-serif mb-2">{t("title")}</h1>
                <p className="text-sm text-gray-600 max-w-3xl">{t("subtitle")}</p>
            </header>

            <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                    <DomainFilter
                        value={domainFilter}
                        onChange={setDomainFilter}
                        className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm hover:border-gray-400"
                    />
                    <HeaderSearchBtn
                        value={search}
                        onChange={setSearch}
                        placeholder={t("searchPlaceholder")}
                    />
                </div>
                <button
                    type="button"
                    onClick={() => void load(domainFilter)}
                    disabled={loading}
                    className="h-9 px-3 rounded-md hover:bg-gray-100 text-gray-600 disabled:opacity-50 inline-flex items-center gap-1.5 text-sm"
                >
                    <RefreshCw
                        className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                    />
                </button>
            </div>

            {error && (
                <p className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md border border-red-200">
                    {error}
                </p>
            )}

            {templates === null ? (
                <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-20 bg-gray-100 animate-pulse rounded-md"
                        />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <p className="text-sm text-gray-500 py-12 text-center">
                    {t("noTemplates")}
                </p>
            ) : (
                <ul className="space-y-2">
                    {filtered.map((tmp) => (
                        <li
                            key={tmp.id}
                            className="border border-gray-200 rounded-md hover:border-gray-400 transition-colors"
                        >
                            <button
                                type="button"
                                onClick={() => void openDetail(tmp.id)}
                                className="w-full text-left px-4 py-3 flex items-start gap-3"
                            >
                                <FileType2 className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <h3 className="text-base font-medium text-gray-900">
                                            {displayName(tmp)}
                                        </h3>
                                        <span className="text-xs text-gray-400 font-mono shrink-0">
                                            {tmp.id}
                                        </span>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                            {tDomains(`values.${tmp.domain}` as never)}
                                        </span>
                                        {(tmp.also_applicable_to ?? []).map((d) => (
                                            <span
                                                key={d}
                                                className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200"
                                                title={t("alsoApplicableTo")}
                                            >
                                                + {tDomains(`values.${d}` as never)}
                                            </span>
                                        ))}
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                            {t(`automation${tmp.automation_level}` as never)}
                                        </span>
                                        <span className="text-gray-400 ml-auto">
                                            {t("system")}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {(openTemplate || openLoading) && (
                <DocxTemplateDetailModal
                    template={openTemplate}
                    prompt={openPrompt}
                    loading={openLoading}
                    onClose={closeDetail}
                    onApplyToChat={(id) => {
                        closeDetail();
                        applyToChat(id);
                    }}
                />
            )}
        </div>
    );
}
