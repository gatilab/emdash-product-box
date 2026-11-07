/**
 * Server-side loader for cached Amazon data while a page renders.
 *
 * Calls the plugin's public `lookup` route in-process through EmDash's
 * public route dispatcher (no HTTP round trip; available on anonymous
 * requests). Lookups are memoized per request, so a roundup with ten boxes
 * reads each ASIN once. Every failure degrades to "no live data": the box
 * then renders its manual fields.
 */
import type { PublicPluginRuntimeLocals } from "emdash/plugin-utils";

import { amazonRefs } from "../core/fields.js";
import { productKey } from "../core/merge.js";
import type { PublicProduct } from "../core/types.js";
import { sealLookupKey } from "../seal.js";

export const PLUGIN_ID = "product-box";
export const LOOKUP_PATH = "/lookup";

export interface LiveData {
	products: Map<string, PublicProduct>;
	maxAgeHours: number;
	schemaRating: boolean;
}

interface AstroLike {
	locals: unknown;
	url: URL;
}

interface LookupResponse {
	items?: Record<string, PublicProduct | null>;
	maxAgeHours?: number;
	schemaRating?: boolean;
}

const MEMO = Symbol.for("gatilab:product-box:lookups");

export const emptyLive = (): LiveData => ({ products: new Map(), maxAgeHours: 24, schemaRating: true });

async function callLookup(astro: AstroLike, refs: { asin: string; marketplace: "us" | "in" }[]): Promise<LookupResponse | null> {
	const dispatch = (astro.locals as PublicPluginRuntimeLocals | undefined)?.emdash?.handlePublicPluginApiRoute;
	if (typeof dispatch !== "function") return null;
	const items = await Promise.all(
		refs.map(async (r) => {
			let key: string | undefined;
			try {
				key = await sealLookupKey(productKey(r.marketplace, r.asin));
			} catch {
				// No EMDASH_ENCRYPTION_KEY: look up without tracking.
			}
			return { ...r, ...(key && { key }) };
		}),
	);
	const request = new Request(new URL(`/_emdash/api/plugins/${PLUGIN_ID}${LOOKUP_PATH}`, astro.url), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ items }),
	});
	try {
		const res = await dispatch(PLUGIN_ID, "POST", LOOKUP_PATH, request);
		return res.success ? ((res.data ?? null) as LookupResponse | null) : null;
	} catch (error) {
		console.warn("[product-box] lookup failed; rendering manual fields", error);
		return null;
	}
}

/** Cached data for every ASIN a block can use (the box's and its regional buttons'). */
export async function loadLive(astro: AstroLike, node: unknown): Promise<LiveData> {
	const refs = amazonRefs(node);
	if (!refs.length) return emptyLive();

	const locals = (astro.locals ?? {}) as Record<symbol, unknown>;
	const memo = (locals[MEMO] ??= new Map<string, Promise<LookupResponse | null>>()) as Map<string, Promise<LookupResponse | null>>;
	const memoKey = refs.map((r) => productKey(r.marketplace, r.asin)).sort().join(",");
	let pending = memo.get(memoKey);
	if (!pending) {
		pending = callLookup(astro, refs);
		memo.set(memoKey, pending);
	}
	const res = await pending;
	const live = emptyLive();
	if (!res) return live;
	for (const [key, product] of Object.entries(res.items ?? {})) if (product) live.products.set(key, product);
	if (typeof res.maxAgeHours === "number" && res.maxAgeHours > 0) live.maxAgeHours = res.maxAgeHours;
	if (typeof res.schemaRating === "boolean") live.schemaRating = res.schemaRating;
	return live;
}
