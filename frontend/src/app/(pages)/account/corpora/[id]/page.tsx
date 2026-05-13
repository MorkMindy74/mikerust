"use client";

// Generic corpus settings page. Renders ANY corpus the backend
// registered via /corpora/:id, regardless of strategy. Today this is
// what wires up declaratively-configured corpora (CNIL, future
// Légifrance / BOE / Retsinformation) without one-off per-corpus
// React components.
//
// Builtin corpora (EUR-Lex, Italian Legal) still have their dedicated
// hand-written pages at /account/eurlex and /account/italia-legale.
// They'll migrate here when we unify the routes — the parent layout
// already deep-links through /corpora/:id metadata, so the migration
// is just "delete the bespoke page, update CORPUS_ROUTE_BY_ID".

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

function getToken() {
    return typeof window !== "undefined"
        ? localStorage.getItem("mike_auth_token") ?? ""
        : "";
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
            ...(init.headers ?? {}),
        },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

interface CorpusCapabilities {
    search: boolean;
    fetch: boolean;
    documents: boolean;
    documents_delete: boolean;
    documents_resync: boolean;
    embed_progress: boolean;
    bulk_import: boolean;
    user_config: boolean;
}

interface CorpusSource {
    id: string;
    display_name: string;
    subtitle?: string | null;
    description?: string | null;
    available: boolean;
    default_enabled: boolean;
    status_label?: string | null;
}

interface CorpusItem {
    id: string;
    display_name: string;
    description?: string | null;
    homepage?: string | null;
    languages: string[];
    default_language: string;
    supports_language_fallback: boolean;
    fallback_language?: string | null;
    identifier_label: string;
    identifier_example?: string | null;
    enabled_by_default: boolean;
    runnable: boolean;
    capabilities: CorpusCapabilities;
    sources: CorpusSource[];
}

interface SearchHit {
    identifier: string;
    title: string;
    date?: string | null;
    url?: string | null;
    languages_available: string[];
}

interface IndexedDoc {
    id: string;
    filename: string;
    corpus_identifier: string | null;
    corpus_language: string | null;
    fetched_with_fallback: boolean;
    size_bytes: number;
    created_at: string;
    status: string;
}

export default function GenericCorpusPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const tCommon = useTranslations("Common");

    const [corpus, setCorpus] = useState<CorpusItem | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [language, setLanguage] = useState<string>("");
    const [searching, setSearching] = useState(false);
    const [hits, setHits] = useState<SearchHit[] | null>(null);
    const [syncing, setSyncing] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [indexedDocs, setIndexedDocs] = useState<IndexedDoc[]>([]);

    useEffect(() => {
        let cancelled = false;
        api<CorpusItem>(`/corpora/${id}`)
            .then((c) => {
                if (cancelled) return;
                setCorpus(c);
                setLanguage(c.default_language);
            })
            .catch((e) => {
                if (!cancelled) setLoadError(String(e));
            });
        return () => {
            cancelled = true;
        };
    }, [id]);

    const refreshIndexed = async () => {
        if (!corpus?.capabilities.documents) return;
        try {
            const resp = await api<{ documents: IndexedDoc[] }>(
                `/corpora/${id}/documents`,
            );
            setIndexedDocs(resp.documents);
        } catch (e) {
            console.warn("[corpora] indexed list failed:", e);
        }
    };

    useEffect(() => {
        if (corpus?.capabilities.documents) {
            void refreshIndexed();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [corpus?.id]);

    const runSearch = async () => {
        setError(null);
        setHits(null);
        const q = query.trim();
        if (!q) return;
        setSearching(true);
        try {
            const resp = await api<{ hits: SearchHit[] }>(
                `/corpora/${id}/search`,
                {
                    method: "POST",
                    body: JSON.stringify({ query: q, language }),
                },
            );
            setHits(resp.hits);
        } catch (e) {
            setError(String(e));
        } finally {
            setSearching(false);
        }
    };

    const syncHit = async (hit: SearchHit) => {
        setError(null);
        setSyncing(hit.identifier);
        try {
            await api<{ id: string }>(`/corpora/${id}/fetch`, {
                method: "POST",
                body: JSON.stringify({
                    identifier: hit.identifier,
                    language,
                }),
            });
            await refreshIndexed();
        } catch (e) {
            setError(String(e));
        } finally {
            setSyncing(null);
        }
    };

    if (loadError) {
        return (
            <div className="text-sm text-red-600">
                {tCommon("error")}: {loadError}
            </div>
        );
    }
    if (!corpus) {
        return (
            <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" /> {tCommon("loading")}…
            </div>
        );
    }

    const sourcesAvailable = corpus.sources.filter((s) => s.available);
    const sourcesComingSoon = corpus.sources.filter((s) => !s.available);

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h2 className="text-2xl font-medium font-serif mb-2">
                    {corpus.display_name}
                </h2>
                {corpus.description && (
                    <p className="text-sm text-gray-500 leading-relaxed">
                        {corpus.description}
                    </p>
                )}
            </div>

            {/* Connector status + available/coming-soon sources */}
            {corpus.sources.length > 0 && (
                <section className="border border-gray-200 rounded-lg p-4 space-y-3">
                    {sourcesAvailable.length > 0 && (
                        <>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                Disponibili ora
                            </div>
                            {sourcesAvailable.map((s) => (
                                <label
                                    key={s.id}
                                    className="flex items-start gap-2 text-sm cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        defaultChecked={s.default_enabled}
                                        className="mt-0.5"
                                    />
                                    <span>
                                        {s.display_name}
                                        {s.subtitle && (
                                            <span className="ml-1 text-gray-400 text-xs">
                                                {s.subtitle}
                                            </span>
                                        )}
                                    </span>
                                </label>
                            ))}
                        </>
                    )}
                    {sourcesComingSoon.length > 0 && (
                        <>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 pt-2">
                                In preparazione
                            </div>
                            {sourcesComingSoon.map((s) => (
                                <div key={s.id} className="flex items-start gap-2 text-sm opacity-60">
                                    <input
                                        type="checkbox"
                                        disabled
                                        className="mt-0.5"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div>
                                            {s.display_name}
                                            {s.subtitle && (
                                                <span className="ml-1 text-gray-400 text-xs">
                                                    {s.subtitle}
                                                </span>
                                            )}
                                            {s.status_label && (
                                                <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
                                                    {s.status_label}
                                                </span>
                                            )}
                                        </div>
                                        {s.description && (
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {s.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </section>
            )}

            {/* Search box (only when capabilities.search) */}
            {corpus.capabilities.search && (
                <section className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">
                            {corpus.identifier_label}
                            {corpus.identifier_example && (
                                <span className="ml-2 text-gray-400">
                                    es. {corpus.identifier_example}
                                </span>
                            )}
                        </label>
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !searching && query.trim()) {
                                    e.preventDefault();
                                    void runSearch();
                                }
                            }}
                            placeholder={corpus.identifier_example ?? ""}
                        />
                    </div>
                    {corpus.languages.length > 1 && (
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">
                                Lingua
                            </label>
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="w-full md:w-48 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                            >
                                {corpus.languages.map((l) => (
                                    <option key={l} value={l}>
                                        {l.toUpperCase()}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="flex justify-end">
                        <Button
                            onClick={runSearch}
                            disabled={searching || !query.trim()}
                            className="bg-black text-white hover:bg-gray-900"
                        >
                            {searching ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                                <Search className="h-3.5 w-3.5 mr-1" />
                            )}
                            Cerca
                        </Button>
                    </div>
                </section>
            )}

            {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {/* Search results */}
            {hits !== null && hits.length > 0 && (
                <section>
                    <h3 className="text-sm font-medium mb-2">
                        Risultati ({hits.length})
                    </h3>
                    <ul className="space-y-2">
                        {hits.map((hit) => {
                            const isSyncingThis = syncing === hit.identifier;
                            return (
                                <li
                                    key={hit.identifier}
                                    className="border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-3"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium truncate">
                                            {hit.title}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                            {corpus.identifier_label} {hit.identifier}
                                            {hit.date && (
                                                <span className="ml-2">· {hit.date}</span>
                                            )}
                                        </div>
                                        {hit.url && (
                                            <a
                                                href={hit.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 mt-1"
                                            >
                                                <ExternalLink className="h-3 w-3" /> Apri
                                            </a>
                                        )}
                                    </div>
                                    {corpus.capabilities.fetch && (
                                        <button
                                            type="button"
                                            onClick={() => syncHit(hit)}
                                            disabled={isSyncingThis}
                                            className="shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs bg-black text-white hover:bg-gray-900 disabled:opacity-50"
                                        >
                                            {isSyncingThis ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : null}
                                            {isSyncingThis ? "Sync…" : "Indicizza"}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {hits !== null && hits.length === 0 && (
                <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                    Nessun risultato per &quot;{query}&quot;.
                </div>
            )}

            {/* Indexed documents */}
            {corpus.capabilities.documents && indexedDocs.length > 0 && (
                <section>
                    <h3 className="text-sm font-medium mb-2">
                        Documenti indicizzati ({indexedDocs.length})
                    </h3>
                    <ul className="space-y-2">
                        {indexedDocs.map((doc) => (
                            <li
                                key={doc.id}
                                className="border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium truncate flex items-center gap-2">
                                        {doc.filename}
                                        {doc.status === "ready" && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 text-[10px] font-normal">
                                                <CheckCircle2 className="h-3 w-3" />
                                                indicizzato
                                            </span>
                                        )}
                                        {doc.status === "interrupted" && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-normal">
                                                <AlertCircle className="h-3 w-3" />
                                                interrotto
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {corpus.identifier_label} {doc.corpus_identifier} ·{" "}
                                        {doc.corpus_language?.toUpperCase()}
                                        <span className="ml-2 text-gray-400">
                                            {(doc.size_bytes / 1024).toFixed(0)} KB
                                        </span>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
