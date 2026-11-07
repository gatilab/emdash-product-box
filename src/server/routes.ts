/**
 * Route, cron and hook handlers.
 *
 * Public: `lookup`, read-only cached product data for the renderer.
 * Admin (private; EmDash checks the session or API token first):
 * `products/list`, `products/refresh`, `products/track`, `products/remove`,
 * `status`.
 */
import { PluginRouteError } from "emdash";
import type { ContentHookEvent, PluginContext, RouteContext } from "emdash";

import { normalizeAsin } from "../core/fields.js";
import { productKey } from "../core/merge.js";
import { isMarketplace, type Marketplace, type ProductStatus, type PublicProduct, type StoredProduct } from "../core/types.js";
import { openLookupKey } from "../seal.js";
import { credentialStatus, readSettings } from "./config.js";
import { refsInContent } from "./discover.js";
import { markAllDue, refreshDue, refreshKeys, track } from "./refresh.js";
import { products, toPublic } from "./storage.js";

type Ctx = RouteContext<unknown>;

export const CRON_TASK = "refresh";
export const CRON_SCHEDULE = "*/15 * * * *";
const CRON_FLAG = "state:cron:v1";
const MAX_LOOKUP_ITEMS = 12;
const STATUSES: ProductStatus[] = ["pending", "ok", "error", "not_found"];

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Schedule the refresh task once per deployment of this version. */
export async function ensureCron(ctx: Pick<PluginContext, "kv" | "cron">): Promise<void> {
	if (!ctx.cron || (await ctx.kv.get<boolean>(CRON_FLAG))) return;
	await ctx.cron.schedule(CRON_TASK, { schedule: CRON_SCHEDULE });
	await ctx.kv.set(CRON_FLAG, true);
}

// ── Public ──────────────────────────────────────────────────────────────────

export interface LookupItem {
	marketplace: Marketplace;
	asin: string;
	/** Sealed `marketplace:ASIN` from the site's renderer; lets a miss start tracking. */
	key?: string;
}

/** Cached data for up to 12 ASINs. Never calls Amazon. */
export async function lookup(ctx: Ctx): Promise<{ items: Record<string, PublicProduct | null>; maxAgeHours: number; schemaRating: boolean }> {
	const input = obj(ctx.input);
	const list = Array.isArray(input.items) ? input.items.slice(0, MAX_LOOKUP_ITEMS) : [];
	const wanted: { key: string; asin: string; marketplace: Marketplace; sealed: unknown }[] = [];
	for (const raw of list) {
		const item = obj(raw);
		const asin = normalizeAsin(item.asin);
		const marketplace = str(item.marketplace);
		if (!asin || !isMarketplace(marketplace)) continue;
		wanted.push({ key: productKey(marketplace, asin), asin, marketplace, sealed: item.key });
	}

	const rows = wanted.length ? await products(ctx).getMany(wanted.map((w) => w.key)) : new Map<string, StoredProduct>();
	const items: Record<string, PublicProduct | null> = {};
	const toTrack: { asin: string; marketplace: Marketplace }[] = [];
	for (const w of wanted) {
		const row = rows.get(w.key);
		items[w.key] = toPublic(row);
		if (!row && (await openLookupKey(w.sealed)) === w.key) toTrack.push({ asin: w.asin, marketplace: w.marketplace });
	}
	if (toTrack.length) {
		await track(ctx, toTrack, "render");
		await ensureCron(ctx);
	}
	const settings = await readSettings(ctx);
	return { items, maxAgeHours: settings.maxAgeHours, schemaRating: settings.schemaRating };
}

// ── Admin ───────────────────────────────────────────────────────────────────

async function listProducts(ctx: Ctx) {
	const input = obj(ctx.input);
	const status = str(input.status) as ProductStatus;
	const where = STATUSES.includes(status) ? { status } : undefined;
	const limit = Math.min(100, Math.max(1, Number(input.limit) || 50));
	const col = products(ctx);
	const [page, counts] = await Promise.all([
		col.query({ ...(where && { where }), orderBy: { seenAt: "desc" }, limit, cursor: str(input.cursor) || undefined }),
		Promise.all(STATUSES.map(async (s) => [s, await col.count({ status: s })] as const)),
	]);
	return {
		items: page.items.map((i) => i.data),
		cursor: page.hasMore ? page.cursor : undefined,
		counts: Object.fromEntries(counts) as Record<ProductStatus, number>,
	};
}

async function refresh(ctx: Ctx) {
	const input = obj(ctx.input);
	const keys = Array.isArray(input.keys) ? input.keys.filter((k): k is string => typeof k === "string" && /^(us|in):[A-Z0-9]{10}$/.test(k)) : [];
	if (keys.length) return { ...(await refreshKeys(ctx, keys)), queued: 0 };
	if (input.all === true) {
		const queued = await markAllDue(ctx);
		return { ...(await refreshDue(ctx)), queued };
	}
	return { ...(await refreshDue(ctx)), queued: 0 };
}

async function trackOne(ctx: Ctx) {
	const input = obj(ctx.input);
	const asin = normalizeAsin(input.asin);
	const marketplace = str(input.marketplace);
	if (!asin) throw PluginRouteError.badRequest("Enter a 10-character ASIN or an Amazon product URL.");
	if (!isMarketplace(marketplace)) throw PluginRouteError.badRequest("Choose a marketplace.");
	const added = await track(ctx, [{ asin, marketplace }], "admin");
	const key = productKey(marketplace, asin);
	const summary = await refreshKeys(ctx, [key]);
	return { key, added: added > 0, summary, item: await products(ctx).get(key) };
}

async function remove(ctx: Ctx) {
	const keys = obj(ctx.input).keys;
	const list = Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string").slice(0, 100) : [];
	return { removed: list.length ? await products(ctx).deleteMany(list) : 0 };
}

async function status(ctx: Ctx) {
	const [marketplaces, settings, tasks] = await Promise.all([credentialStatus(ctx), readSettings(ctx), ctx.cron?.list().catch(() => []) ?? Promise.resolve([])]);
	const task = tasks.find((t) => t.name === CRON_TASK);
	return { marketplaces, settings, cron: task ? { schedule: task.schedule, nextRunAt: task.nextRunAt, lastRunAt: task.lastRunAt } : null };
}

export const adminRoutes = {
	"products/list": listProducts,
	"products/refresh": refresh,
	"products/track": trackOne,
	"products/remove": remove,
	status,
};

// ── Cron and hooks ──────────────────────────────────────────────────────────

export async function onCron(event: { name: string }, ctx: PluginContext): Promise<void> {
	if (event.name !== CRON_TASK) return;
	const summary = await refreshDue(ctx);
	if (summary.failed) ctx.log.warn("[product-box] some ASINs failed to refresh", { failed: summary.failed, messages: summary.messages });
}

/** Track every ASIN in a saved record's product boxes. */
export async function onContentSaved(event: Pick<ContentHookEvent, "content" | "collection">, ctx: PluginContext): Promise<void> {
	const refs = refsInContent(event.content);
	if (!refs.length) return;
	const id = str(obj(event.content).id);
	await track(ctx, refs, id ? `${event.collection}/${id}` : event.collection);
	await ensureCron(ctx);
}
