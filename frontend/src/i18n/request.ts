import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

// next-intl entry point: invoked once per request to resolve the active
// locale and load the corresponding messages. We don't use locale-prefixed
// routes (the app's URL structure stays as-is); instead the user's choice
// is persisted in a cookie and read here.
export default getRequestConfig(async () => {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
    const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

    const messages = (await import(`../../messages/${locale}.json`)).default;

    return {
        locale,
        messages,
    };
});
