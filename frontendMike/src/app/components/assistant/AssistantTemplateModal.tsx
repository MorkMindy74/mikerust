"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { FileType2, Search, X } from "lucide-react";
import { listDocxTemplates, type DocxTemplateSummary } from "@/app/lib/mikeApi";
import { DomainSelect } from "../shared/DomainControls";
import { DEFAULT_DOMAIN, type Domain } from "../shared/types";
import { useUserProfile } from "@/contexts/UserProfileContext";

/**
 * Modal picker for the DOCX template attached to a chat turn. Same
 * UX shape as `AssistantWorkflowModal` but minimal — templates are
 * fewer and the action is "select, apply, close". The detail
 * preview lives on the dedicated /docx-templates page.
 *
 * The list uses cross-domain matching server-side (see
 * `DocxTemplate::matches_domain`): a template like Parcella tagged
 * `finance` shows up here when the picker's domain filter is set to
 * `legal` because its `also_applicable_to` carries `legal`.
 */
export function AssistantTemplateModal({
    open,
    onClose,
    onSelect,
}: {
    open: boolean;
    onClose: () => void;
    onSelect: (template: { id: string; title: string }) => void;
}) {
    const t = useTranslations("DocxTemplates");
    const tDomains = useTranslations("Domains");
    const tCommon = useTranslations("Common");
    const { profile } = useUserProfile();

    const initialDomain =
        (profile?.defaultDomain as Domain | undefined) ?? DEFAULT_DOMAIN;
    const [domain, setDomain] = useState<Domain>(initialDomain);
    const [templates, setTemplates] = useState<DocxTemplateSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");

    // Reset picker state every time the modal opens — domain back to
    // user default, search cleared. Mirrors how AssistantWorkflowModal
    // handles re-open.
    useEffect(() => {
        if (!open) return;
        setSearch("");
        setDomain(initialDomain);
    }, [open, initialDomain]);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        listDocxTemplates({ domain })
            .then(setTemplates)
            .catch(() => setTemplates([]))
            .finally(() => setLoading(false));
    }, [open, domain]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return templates;
        return templates.filter((tmp) => {
            const name = (
                tmp.display_name?.it ??
                tmp.display_name?.en ??
                tmp.id
            ).toLowerCase();
            return name.includes(q) || tmp.id.toLowerCase().includes(q);
        });
    }, [templates, search]);

    const displayName = (tmp: DocxTemplateSummary) =>
        tmp.display_name?.it ?? tmp.display_name?.en ?? tmp.id;

    if (!open || typeof document === "undefined") return null;

    return createPortal(
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-2">
                    <h2 className="text-base font-medium">{t("pickTemplateTitle")}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={tCommon("close")}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-500"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="px-5 py-3 flex items-center gap-2 border-b border-gray-100">
                    <DomainSelect
                        value={domain}
                        onChange={(d) => setDomain(d)}
                        className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm hover:border-gray-400"
                    />
                    <div className="flex-1 relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t("searchPlaceholder")}
                            className="w-full h-9 rounded-md border border-gray-200 bg-white pl-8 pr-3 text-sm hover:border-gray-400 outline-none focus:border-gray-400 transition-colors"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-4 space-y-2">
                            {[0, 1, 2].map((i) => (
                                <div
                                    key={i}
                                    className="h-12 bg-gray-100 animate-pulse rounded"
                                />
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="px-5 py-8 text-sm text-gray-500 text-center">
                            {t("noTemplates")}
                        </p>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {filtered.map((tmp) => (
                                <li key={tmp.id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSelect({
                                                id: tmp.id,
                                                title: displayName(tmp),
                                            });
                                            onClose();
                                        }}
                                        className="w-full text-left px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                                    >
                                        <FileType2 className="h-4 w-4 text-gray-400 mt-1 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-gray-900">
                                                {displayName(tmp)}
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                                    {tDomains(
                                                        `values.${tmp.domain}` as never,
                                                    )}
                                                </span>
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                                    {t(
                                                        `automation${tmp.automation_level}` as never,
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
