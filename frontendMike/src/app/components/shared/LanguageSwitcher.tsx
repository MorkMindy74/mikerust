"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocaleCookie } from "@/i18n/actions";
import { locales, type Locale } from "@/i18n/config";
import { apiBase } from "@/lib/apiBase";

// Persist the choice on the backend (data\storage\, via /user/locale) so it
// follows the data folder, then mirror to the cookie that next-intl uses
// for SSR. Backend write is best-effort: if the user is offline or the
// session is expired, the cookie still works for the local session.
async function persistLocaleOnBackend(locale: Locale) {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("mike_auth_token");
    if (!token) return;
    try {
        await fetch(`${apiBase()}/user/locale`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ locale }),
        });
    } catch {
        // Backend offline; cookie is still set so the local session reflects
        // the choice. The next successful login will re-sync.
    }
}

// Inline SVG flags — chosen over emoji because Windows doesn't ship the
// regional-indicator flag font, so emoji flags fall back to the bare
// country code letters there. SVGs render identically on every OS the
// app ships to (Windows, macOS, Linux) and stay crisp at any DPI. The
// flags are minimal (no coats of arms, no fine detail) because they're
// rendered at ~16px — anything more elaborate would just blur.
function Flag({ locale }: { locale: Locale }) {
    const common = "rounded-sm shrink-0";
    const w = 18;
    const h = 12;
    switch (locale) {
        case "it":
            return (
                <svg width={w} height={h} viewBox="0 0 3 2" className={common} aria-hidden>
                    <rect width="1" height="2" x="0" fill="#009246" />
                    <rect width="1" height="2" x="1" fill="#ffffff" />
                    <rect width="1" height="2" x="2" fill="#ce2b37" />
                </svg>
            );
        case "en":
            // Simplified Union Jack — red cross of St George + white
            // saltire on a blue field. Skips the saltire counterchange
            // because at 18×12 it just looks like noise.
            return (
                <svg width={w} height={h} viewBox="0 0 60 40" className={common} aria-hidden>
                    <rect width="60" height="40" fill="#012169" />
                    <path d="M0,0 L60,40 M60,0 L0,40" stroke="#ffffff" strokeWidth="6" />
                    <path d="M0,0 L60,40 M60,0 L0,40" stroke="#c8102e" strokeWidth="3" />
                    <path d="M30,0 V40 M0,20 H60" stroke="#ffffff" strokeWidth="10" />
                    <path d="M30,0 V40 M0,20 H60" stroke="#c8102e" strokeWidth="6" />
                </svg>
            );
        case "fr":
            return (
                <svg width={w} height={h} viewBox="0 0 3 2" className={common} aria-hidden>
                    <rect width="1" height="2" x="0" fill="#0055a4" />
                    <rect width="1" height="2" x="1" fill="#ffffff" />
                    <rect width="1" height="2" x="2" fill="#ef4135" />
                </svg>
            );
        case "de":
            return (
                <svg width={w} height={h} viewBox="0 0 5 3" className={common} aria-hidden>
                    <rect width="5" height="1" y="0" fill="#000000" />
                    <rect width="5" height="1" y="1" fill="#dd0000" />
                    <rect width="5" height="1" y="2" fill="#ffce00" />
                </svg>
            );
        case "es":
            return (
                <svg width={w} height={h} viewBox="0 0 4 3" className={common} aria-hidden>
                    <rect width="4" height="0.75" y="0" fill="#aa151b" />
                    <rect width="4" height="1.5" y="0.75" fill="#f1bf00" />
                    <rect width="4" height="0.75" y="2.25" fill="#aa151b" />
                </svg>
            );
        case "pt":
            return (
                <svg width={w} height={h} viewBox="0 0 5 3" className={common} aria-hidden>
                    <rect width="2" height="3" x="0" fill="#006600" />
                    <rect width="3" height="3" x="2" fill="#ff0000" />
                </svg>
            );
    }
}

// Language picker — Radix dropdown with an inline SVG flag next to each
// option's native-language label. Persists the choice on the backend
// (primary, portable store) and in a cookie used by next-intl SSR, then
// refreshes the route so the next render reads from the new catalog.
//
// The component renders only the trigger (no label) so the parent page
// can place a block label above it and align widths with sibling form
// rows (see the Account page). The trigger is `w-full` and matches the
// border / padding style of the displayName <Input> sibling.
export function LanguageSwitcher() {
    const t = useTranslations("Account");
    const locale = useLocale() as Locale;
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);

    const handleChange = (next: Locale) => {
        if (next === locale || pending) return;
        startTransition(async () => {
            await persistLocaleOnBackend(next);
            await setLocaleCookie(next);
            router.refresh();
        });
    };

    const labels: Record<Locale, string> = {
        it: t("languageItalian"),
        en: t("languageEnglish"),
        fr: t("languageFrench"),
        de: t("languageGerman"),
        es: t("languageSpanish"),
        pt: t("languagePortuguese"),
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    disabled={pending}
                    className={
                        "inline-flex w-full items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm hover:border-gray-400 transition-colors " +
                        (pending ? "opacity-60 cursor-not-allowed" : "cursor-pointer")
                    }
                >
                    <Flag locale={locale} />
                    <span className="flex-1 text-left">{labels[locale]}</span>
                    <ChevronDown
                        className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[200px]" align="start">
                {locales.map((loc) => (
                    <DropdownMenuItem
                        key={loc}
                        onSelect={() => handleChange(loc)}
                        className="cursor-pointer gap-2"
                    >
                        <Flag locale={loc} />
                        <span className="flex-1">{labels[loc]}</span>
                        {loc === locale && (
                            <Check className="h-3.5 w-3.5 text-gray-600" />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
