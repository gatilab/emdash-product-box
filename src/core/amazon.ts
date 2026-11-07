/**
 * Amazon Creators API client (the OAuth2 successor to PA-API 5.0).
 *
 * Contract, as verified for the Gatilab accounts in June 2026:
 *
 * - Token: `POST https://api.amazon.com/auth/o2/token` (the global Login with
 *   Amazon endpoint, shared by every marketplace), JSON body with
 *   `grant_type=client_credentials` and `scope=creatorsapi::default`.
 *   Returns a bearer token valid for `expires_in` (3600) seconds.
 * - Catalog: `POST https://creatorsapi.amazon/catalog/v1/getItems`, with
 *   `Authorization: Bearer …` and `x-marketplace: www.amazon.com` (one host
 *   for every locale; the header routes the marketplace).
 * - Body fields are lowerCamelCase (`itemIds`, `partnerTag`, `resources`);
 *   offers live under `offersV2.listings.*`. At most 10 item IDs per call.
 * - Each marketplace needs its own credential set: US credentials can't read
 *   www.amazon.in. A 403 `AssociateNotEligible` means the account is below
 *   Amazon's trailing-30-day sales gate (or a new credential is still in its
 *   48-hour review); new credentials don't fix it.
 *
 * Fetch is injected, so the plugin passes `ctx.http.fetch` (limited to the
 * declared `allowedHosts`) and tests pass a mock. Tokens are cached in memory
 * only, never written to storage.
 */
import { MARKETPLACES, type AmazonProduct, type Marketplace, type Money } from "./types.js";

export const TOKEN_URL = "https://api.amazon.com/auth/o2/token";
export const API_ORIGIN = "https://creatorsapi.amazon";
export const GET_ITEMS_URL = `${API_ORIGIN}/catalog/v1/getItems`;
export const SCOPE = "creatorsapi::default";
/** Every host the plugin calls. Product images are never fetched server-side. */
export const AMAZON_HOSTS = ["api.amazon.com", "creatorsapi.amazon"];
export const MAX_ITEMS_PER_REQUEST = 10;

export const RESOURCES = [
	"itemInfo.title",
	"itemInfo.byLineInfo",
	"offersV2.listings.price",
	"offersV2.listings.availability",
	"images.primary.large",
	"customerReviews.starRating",
	"customerReviews.count",
];

export interface Credentials {
	credentialId: string;
	secret: string;
	partnerTag: string;
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export class AmazonApiError extends Error {
	override name = "AmazonApiError";
	constructor(
		message: string,
		readonly status: number,
		readonly code: string,
		/** Worth retrying later without a configuration change. */
		readonly retryable: boolean,
	) {
		super(message);
	}
}

export interface ItemError {
	code: string;
	message: string;
	/** The ASIN the error names, when it names one. */
	asin: string;
}

export interface GetItemsResult {
	items: AmazonProduct[];
	errors: ItemError[];
}

// ── Response helpers ────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** A field by its lowerCamelCase name, falling back to PA-API 5's PascalCase. */
function field(obj: unknown, name: string): unknown {
	if (!isObj(obj)) return undefined;
	if (name in obj) return obj[name];
	const pascal = name.charAt(0).toUpperCase() + name.slice(1);
	if (pascal in obj) return obj[pascal];
	// PA-API 5 spelled a few keys in capitals ("ASIN").
	const lower = name.toLowerCase();
	const key = Object.keys(obj).find((k) => k.toLowerCase() === lower);
	return key === undefined ? undefined : obj[key];
}

/** Walk a dotted path with `field()` at each step. */
function path(obj: unknown, dotted: string): unknown {
	return dotted.split(".").reduce<unknown>((node, key) => field(node, key), obj);
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const number = (v: unknown): number => {
	const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
	return Number.isFinite(n) ? n : 0;
};

function money(node: unknown, marketplace: Marketplace): Money | null {
	const m = field(node, "money") ?? node;
	const amount = number(field(m, "amount"));
	if (!(amount > 0)) return null;
	const currency = text(field(m, "currency")) || MARKETPLACES[marketplace].currency;
	let display = text(field(m, "displayAmount"));
	if (!display) {
		try {
			display = new Intl.NumberFormat(marketplace === "in" ? "en-IN" : "en-US", { style: "currency", currency }).format(amount);
		} catch {
			display = `${currency} ${amount.toFixed(2)}`;
		}
	}
	return { amount, currency, display };
}

/** The listing to show: the buy box winner when Amazon marks one, else the first. */
function pickListing(item: unknown): unknown {
	const listings = path(item, "offersV2.listings");
	if (!Array.isArray(listings) || !listings.length) return undefined;
	return listings.find((l) => field(l, "isBuyBoxWinner") === true) ?? listings[0];
}

/** Parse one Creators API item. Returns null without an ASIN. */
export function parseItem(item: unknown, marketplace: Marketplace): AmazonProduct | null {
	const asin = text(field(item, "asin")).toUpperCase();
	if (!/^[A-Z0-9]{10}$/.test(asin)) return null;

	const listing = pickListing(item);
	const price = money(path(listing, "price"), marketplace);
	let savingBasis = money(path(listing, "price.savingBasis"), marketplace);
	if (savingBasis && (!price || savingBasis.amount <= price.amount || savingBasis.currency !== price.currency)) savingBasis = null;
	let savingsPercent = Math.round(number(path(listing, "price.savings.percentage")));
	if (!savingsPercent && savingBasis && price) savingsPercent = Math.round(((savingBasis.amount - price.amount) / savingBasis.amount) * 100);

	const image = path(item, "images.primary.large") ?? path(item, "images.primary.medium");
	const url = text(field(item, "detailPageURL"));

	return {
		asin,
		marketplace,
		title: text(path(item, "itemInfo.title.displayValue")),
		brand: text(path(item, "itemInfo.byLineInfo.brand.displayValue")) || text(path(item, "itemInfo.byLineInfo.manufacturer.displayValue")),
		imageUrl: /^https:\/\//.test(text(field(image, "url"))) ? text(field(image, "url")) : "",
		imageWidth: Math.trunc(number(field(image, "width"))),
		imageHeight: Math.trunc(number(field(image, "height"))),
		price,
		savingBasis,
		savingsPercent: savingsPercent > 0 && savingsPercent < 100 ? savingsPercent : 0,
		availability: text(path(listing, "availability.type")).toUpperCase(),
		availabilityMessage: text(path(listing, "availability.message")),
		rating: Math.max(0, Math.min(5, number(path(item, "customerReviews.starRating.value")))),
		ratingCount: Math.max(0, Math.trunc(number(path(item, "customerReviews.count")))),
		affiliateUrl: /^https:\/\//.test(url) ? url : "",
	};
}

/** Parse a getItems response body into products and per-item errors. */
export function parseGetItemsResponse(json: unknown, marketplace: Marketplace): GetItemsResult {
	const items = path(json, "itemsResult.items");
	const errors = field(json, "errors");
	return {
		items: (Array.isArray(items) ? items : []).map((i) => parseItem(i, marketplace)).filter((p): p is AmazonProduct => p !== null),
		errors: (Array.isArray(errors) ? errors : []).map((e) => {
			const message = text(field(e, "message"));
			return { code: text(field(e, "code")), message, asin: /\b([A-Z0-9]{10})\b/.exec(message)?.[1] ?? "" };
		}),
	};
}

/** The code and message of an error body, whichever shape it takes. */
function errorInfo(body: unknown, status: number): { code: string; message: string } {
	const first = (field(body, "errors") as unknown[] | undefined)?.[0];
	const code = text(field(first, "code")) || text(field(body, "code")) || text(field(body, "__type")).split("#").pop() || text(field(body, "reason")) || (typeof field(body, "error") === "string" ? text(field(body, "error")) : "") || `HTTP${status}`;
	const message = text(field(first, "message")) || text(field(body, "message")) || text(field(body, "error_description")) || `Amazon returned HTTP ${status}.`;
	return { code, message: message.slice(0, 300) };
}

async function readJson(res: Response): Promise<unknown> {
	try {
		return await res.json();
	} catch {
		return {};
	}
}

// ── Token ───────────────────────────────────────────────────────────────────

const tokens = new Map<string, { token: string; expiresAt: number }>();

/** Forget cached tokens (tests, and after a credential change). */
export function clearTokenCache(): void {
	tokens.clear();
}

export async function getAccessToken(fetch: Fetch, marketplace: Marketplace, creds: Credentials, options: { force?: boolean; now?: number } = {}): Promise<string> {
	const now = options.now ?? Date.now();
	const cacheKey = `${marketplace}|${creds.credentialId}`;
	const cached = tokens.get(cacheKey);
	if (!options.force && cached && cached.expiresAt > now) return cached.token;

	const res = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify({ grant_type: "client_credentials", client_id: creds.credentialId, client_secret: creds.secret, scope: SCOPE }),
	});
	const body = await readJson(res);
	const token = text(field(body, "access_token"));
	if (!res.ok || !token) {
		const info = errorInfo(body, res.status);
		// The body of a failed token call never contains the secret, but keep
		// the message short and generic anyway.
		throw new AmazonApiError(`Token request failed (${info.code}): ${info.message}`, res.status, info.code, res.status >= 500 || res.status === 429);
	}
	const ttl = Math.max(60, number(field(body, "expires_in")) || 3600);
	tokens.set(cacheKey, { token, expiresAt: now + (ttl - 60) * 1000 });
	return token;
}

// ── getItems ────────────────────────────────────────────────────────────────

export function buildGetItemsBody(asins: string[], partnerTag: string): Record<string, unknown> {
	return { itemIds: asins, itemIdType: "ASIN", partnerTag, partnerType: "Associates", resources: RESOURCES };
}

/**
 * Fetch up to 10 ASINs from one marketplace. Retries once with a fresh
 * token on 401/403 (an expired or revoked token). Throws AmazonApiError for
 * request-level failures; item-level problems come back in `errors`.
 */
export async function getItems(fetch: Fetch, marketplace: Marketplace, creds: Credentials, asins: string[], options: { now?: number } = {}): Promise<GetItemsResult> {
	if (asins.length === 0) return { items: [], errors: [] };
	if (asins.length > MAX_ITEMS_PER_REQUEST) throw new RangeError(`getItems takes at most ${MAX_ITEMS_PER_REQUEST} ASINs.`);

	const body = JSON.stringify(buildGetItemsBody(asins, creds.partnerTag));
	const call = async (token: string) =>
		fetch(GET_ITEMS_URL, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json", "x-marketplace": MARKETPLACES[marketplace].domain },
			body,
		});

	let res = await call(await getAccessToken(fetch, marketplace, creds, options));
	if (res.status === 401 || res.status === 403) {
		res = await call(await getAccessToken(fetch, marketplace, creds, { ...options, force: true }));
	}

	const json = await readJson(res);
	if (!res.ok) {
		const info = errorInfo(json, res.status);
		const retryable = res.status === 429 || res.status >= 500;
		throw new AmazonApiError(`${info.code}: ${info.message}`, res.status, info.code, retryable);
	}
	return parseGetItemsResponse(json, marketplace);
}
