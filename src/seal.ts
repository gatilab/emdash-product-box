/**
 * Sealed lookup keys.
 *
 * The renderer asks the public `lookup` route for cached data. Anyone can
 * call that route, so it never starts tracking an ASIN on its own say-so:
 * that would let anonymous visitors fill storage and spend the site's API
 * quota. When the request comes from the site's own renderer, it carries
 * `marketplace:ASIN` sealed with EmDash's secret-setting encryption (AES-GCM
 * under the site's `EMDASH_ENCRYPTION_KEY`), and only then does a miss
 * register the ASIN. The sealed key travels in-process and is never written
 * into the page. Without `EMDASH_ENCRYPTION_KEY`, sealing fails quietly and
 * boxes are tracked by the `content:afterSave` hook and the admin only.
 */
import { decodePluginSettingValue, encryptPluginSetting } from "emdash";

const PLUGIN_ID = "product-box";
const FIELD = "lookup-key";
const SCHEMA = { [FIELD]: { type: "secret" as const, label: "Lookup key" } };
/** A sealed key older than this is refused, so a leaked key goes stale. */
const MAX_AGE_MS = 10 * 60 * 1000;

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function fromBase64Url(s: string): Uint8Array | null {
	try {
		const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
		return Uint8Array.from(bin, (c) => c.charCodeAt(0));
	} catch {
		return null;
	}
}

export async function sealLookupKey(key: string, now = Date.now()): Promise<string> {
	const envelope = await encryptPluginSetting(PLUGIN_ID, FIELD, `${now}|${key}`);
	return toBase64Url(new TextEncoder().encode(JSON.stringify(envelope)));
}

/** The `marketplace:ASIN` a sealed key names, or null for anything this site didn't seal recently. */
export async function openLookupKey(token: unknown, now = Date.now()): Promise<string | null> {
	if (typeof token !== "string" || token.length < 40 || token.length > 2048) return null;
	const bytes = fromBase64Url(token);
	if (!bytes) return null;
	try {
		const envelope: unknown = JSON.parse(new TextDecoder().decode(bytes));
		const plain = await decodePluginSettingValue<string>(PLUGIN_ID, FIELD, envelope, SCHEMA);
		const m = typeof plain === "string" ? /^(\d+)\|((?:us|in):[A-Z0-9]{10})$/.exec(plain) : null;
		if (!m) return null;
		const age = now - Number(m[1]);
		return age >= -60_000 && age <= MAX_AGE_MS ? (m[2] ?? null) : null;
	} catch {
		return null;
	}
}
