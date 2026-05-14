"use client";

import { useTranslations } from "next-intl";
import { X, ExternalLink } from "lucide-react";
import type { DocxTemplateSidecar } from "@/app/lib/mikeApi";

/**
 * Read-only detail panel for a DOCX template — opened from the
 * `DocxTemplateList` page when the user clicks a row. Shows the
 * layout summary, the section skeleton, and the auto-generated
 * authoring prompt that the LLM consumes via
 * `describe_docx_template`.
 *
 * No edit affordances: this is the system-template surface. User
 * templates with custom layout will land in Phase 2.
 */
export function DocxTemplateDetailModal({
    template,
    prompt,
    loading,
    onClose,
    onApplyToChat,
}: {
    template: DocxTemplateSidecar | null;
    prompt: string;
    loading: boolean;
    onClose: () => void;
    onApplyToChat: (id: string) => void;
}) {
    const t = useTranslations("DocxTemplates");
    const tDomains = useTranslations("Domains");

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-stretch justify-end"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div
                className="w-full max-w-2xl bg-white h-full flex flex-col shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        {loading || !template ? (
                            <div className="h-6 w-48 bg-gray-200 animate-pulse rounded" />
                        ) : (
                            <>
                                <h2 className="text-xl font-medium font-serif">
                                    {template.display_name?.it ??
                                        template.display_name?.en ??
                                        template.id}
                                </h2>
                                <p className="text-xs text-gray-400 font-mono mt-1">
                                    {template.id}
                                </p>
                            </>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-500"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                    {loading || !template ? (
                        <div className="space-y-3">
                            {[0, 1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="h-6 bg-gray-100 animate-pulse rounded"
                                />
                            ))}
                        </div>
                    ) : (
                        <>
                            {/* Metadata badges */}
                            <section>
                                <div className="flex flex-wrap gap-1.5 text-xs">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                        {tDomains(`values.${template.domain}` as never)}
                                    </span>
                                    {(template.also_applicable_to ?? []).map((d) => (
                                        <span
                                            key={d}
                                            className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200"
                                        >
                                            + {tDomains(`values.${d}` as never)}
                                        </span>
                                    ))}
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                        {t(`automation${template.automation_level}` as never)}
                                    </span>
                                </div>
                                {template.source_reference && (
                                    <p className="mt-2 text-xs text-gray-500">
                                        <span className="font-medium">{t("sourceReference")}:</span>{" "}
                                        <code className="font-mono">{template.source_reference}</code>
                                    </p>
                                )}
                            </section>

                            {/* Layout summary */}
                            <section>
                                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                                    {t("paper")} · {t("typography")} · {t("margins")}
                                </h3>
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700">
                                    <dt className="text-gray-500">{t("paper")}</dt>
                                    <dd>
                                        {template.paper.size}{" "}
                                        {template.paper.orientation}
                                        {template.paper.format !== "standard" && (
                                            <span className="ml-1 text-xs text-amber-700">
                                                ({template.paper.format})
                                            </span>
                                        )}
                                    </dd>
                                    <dt className="text-gray-500">{t("typography")}</dt>
                                    <dd>
                                        {template.typography.body_font}{" "}
                                        {template.typography.body_size_pt}pt,{" "}
                                        {template.typography.line_spacing}×{" "}
                                        ({template.typography.alignment})
                                    </dd>
                                    <dt className="text-gray-500">{t("margins")}</dt>
                                    <dd>
                                        T {template.margins_cm.top} · R{" "}
                                        {template.margins_cm.right} · B{" "}
                                        {template.margins_cm.bottom} · L{" "}
                                        {template.margins_cm.left} cm
                                    </dd>
                                </dl>
                            </section>

                            {/* Required metadata */}
                            {template.required_metadata.length > 0 && (
                                <section>
                                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                                        {t("requiredMetadata")}
                                    </h3>
                                    <ul className="space-y-1 text-sm">
                                        {template.required_metadata.map((field) => (
                                            <li key={field} className="flex gap-2">
                                                <code className="font-mono text-gray-800 shrink-0">
                                                    [{field}]
                                                </code>
                                                {template.field_prompts?.[field] && (
                                                    <span className="text-gray-500">
                                                        — {template.field_prompts[field]}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            {/* Section skeleton */}
                            {template.section_skeleton &&
                                template.section_skeleton.length > 0 && (
                                    <section>
                                        <h3 className="text-sm font-semibold text-gray-700 mb-2">
                                            {t("sectionSkeleton")}
                                        </h3>
                                        <ol className="space-y-1.5 text-sm">
                                            {template.section_skeleton.map((sec, idx) => (
                                                <li key={`${sec.id}-${idx}`} className="flex gap-2">
                                                    <span className="text-gray-400 shrink-0">
                                                        {idx + 1}.
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {sec.title ? (
                                                                <span className="font-medium text-gray-800">
                                                                    {sec.title}
                                                                </span>
                                                            ) : sec.render ? (
                                                                <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                                                                    {sec.render}
                                                                </code>
                                                            ) : (
                                                                <code className="text-xs font-mono text-gray-500">
                                                                    {sec.id}
                                                                </code>
                                                            )}
                                                            {sec.repeating && (
                                                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                                                    {t("repeatingBlock")}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {sec.guidance && (
                                                            <p className="text-xs text-gray-500 mt-0.5">
                                                                {sec.guidance}
                                                            </p>
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ol>
                                    </section>
                                )}

                            {/* Auto-generated prompt preview */}
                            <section>
                                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                                    {t("promptPreview")}
                                </h3>
                                <pre className="text-xs bg-gray-50 border border-gray-200 rounded-md p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed text-gray-700 max-h-80">
                                    {prompt}
                                </pre>
                            </section>
                        </>
                    )}
                </div>

                {/* Footer actions */}
                <footer className="px-6 py-3 border-t border-gray-200 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 px-4 rounded-md text-sm text-gray-700 hover:bg-gray-100"
                    >
                        <X className="h-4 w-4 inline mr-1.5" />
                    </button>
                    {template && (
                        <button
                            type="button"
                            onClick={() => onApplyToChat(template.id)}
                            className="h-9 px-4 rounded-md text-sm font-medium bg-black hover:bg-gray-900 text-white inline-flex items-center gap-1.5"
                        >
                            <ExternalLink className="h-4 w-4" />
                            {t("openInChat")}
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
}
