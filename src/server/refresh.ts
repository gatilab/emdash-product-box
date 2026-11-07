/**
 * Tracking and refreshing ASINs.
 *
 * - `track()` registers ASINs found in saved content (the `content:afterSave`
 *   hook), in rendered boxes (the sealed lookup), or added by hand in the
 *   admin. New rows are due at once.
 * - `refreshDue()` runs from cron: it takes the rows whose `nextRefreshAt`
 *   has passed, batches them 10 ASINs per getItems call per marketplace, and
 *   writes the results. A failed refresh keeps the last good data (the
 *   renderer stops using it once it is older than the cache window) and
 *   backs off.
 */
import type { PluginContext } from "emdash";

import { AmazonApiError, getItems, MAX_ITEMS_PER_REQUEST, type Fetch } from "../core/amazon.js";
import { productKey } from "../core/merge.js";
import { MARKETPLACES, type AmazonProduct, type Marketplace, type StoredProduct } from "../core/types.js";
import { readCredentials, readSettings } from "./config.js";
import { newRow, products } from "./storage.js";

type Ctx = Pick<PluginContext, "storage" | "settings" | "http" | "log">;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Retry delay for ASINs Amazon says don't exist or can't be served. */
const NOT_FOUND_RETRY = 24 * HOUR;
/** Retry delay while a marketplace has no credentials. */
const UNCONFIGURED_RETRY = HOUR;
const NOT_FOUND_CODES = new Set(["InvalidParameterValue", "ItemNotAccessible", "ItemNotFound", "NotFound"]);
export const MAX_TRACK_PER_CALL = 50;
export const MAX_REFRESH_PER_RUN = 50;

export interface RefreshSummary {
	refreshed: number;
	notFound: number;
	failed: number;
	/** Distinct problems, for the admin. Never contains credentials. */
	messages: string[];
}

const emptySummary = (): RefreshSummary => ({ refreshed: 0, notFound: 0, failed: 0, messages: [] });

/** Exponential backoff from 15 minutes, never longer than the normal refresh interval. */
export function backoffMs(failures: number, refreshMs: number): number {
	return Math.min(refreshMs, 15 * MINUTE * 2 ** Math.max(0, failures - 1));
}

/** Register ASINs. Returns how many were new. */
export async function track(ctx: Pick<PluginContext, "storage">, refs: { asin: string; marketplace: Marketplace }[], source: string, now = Date.now()): Promise<number> {
	const col = products(ctx);
	let added = 0;
	for (const { asin, marketplace } of refs.slice(0, MAX_TRACK_PER_CALL)) {
		const id = productKey(marketplace, asin);
		const seen = await col.updateIf(id, { where: {}, set: { seenAt: now, source } });
		if (seen.applied) continue;
		const created = await col.compareAndSet(id, null, newRow(marketplace, asin, now, source));
		if (created.applied) added++;
	}
	return added;
}

async function mark(ctx: Ctx, rows: StoredProduct[], set: (row: StoredProduct) => Partial<StoredProduct>): Promise<void> {
	const col = products(ctx);
	await Promise.all(rows.map((row) => col.updateIf(row.key, { where: {}, set: set(row) })));
}

/** Refresh specific rows. Rows may span marketplaces; at most MAX_REFRESH_PER_RUN are processed. */
export async function refreshRows(ctx: Ctx, rows: StoredProduct[], now = Date.now()): Promise<RefreshSummary> {
	const summary = emptySummary();
	const note = (message: string) => {
		if (!summary.messages.includes(message)) summary.messages.push(message);
	};
	const settings = await readSettings(ctx);
	const refreshMs = settings.refreshHours * HOUR;
	const fetch: Fetch | undefined = ctx.http ? (url, init) => ctx.http!.fetch(url, init) : undefined;

	const byMarket = new Map<Marketplace, StoredProduct[]>();
	for (const row of rows.slice(0, MAX_REFRESH_PER_RUN)) {
		const list = byMarket.get(row.marketplace) ?? [];
		list.push(row);
		byMarket.set(row.marketplace, list);
	}

	for (const [marketplace, list] of byMarket) {
		const label = MARKETPLACES[marketplace].label;
		const creds = await readCredentials(ctx, marketplace);
		if (!creds || !fetch) {
			const message = !fetch ? "Network access is unavailable to the plugin." : `Add the ${label} credentials and partner tag in the plugin settings.`;
			note(message);
			summary.failed += list.length;
			await mark(ctx, list, (row) => ({ status: row.data ? row.status : "error", error: message, lastAttemptAt: now, nextRefreshAt: now + UNCONFIGURED_RETRY }));
			continue;
		}

		for (let i = 0; i < list.length; i += MAX_ITEMS_PER_REQUEST) {
			const chunk = list.slice(i, i + MAX_ITEMS_PER_REQUEST);
			try {
				const result = await getItems(fetch, marketplace, creds, chunk.map((r) => r.asin), { now });
				const found = new Map<string, AmazonProduct>(result.items.map((p) => [p.asin, p]));
				const col = products(ctx);
				for (const row of chunk) {
					const product = found.get(row.asin);
					if (product) {
						summary.refreshed++;
						await col.updateIf(row.key, {
							where: {},
							set: { status: "ok", data: product, fetchedAt: now, lastAttemptAt: now, nextRefreshAt: now + refreshMs, failures: 0, error: "" },
						});
						continue;
					}
					const err = result.errors.find((e) => e.asin === row.asin) ?? result.errors.find((e) => NOT_FOUND_CODES.has(e.code));
					const message = err ? `${err.code}: ${err.message}`.slice(0, 300) : "Amazon returned no data for this ASIN.";
					summary.notFound++;
					await col.updateIf(row.key, { where: {}, set: { status: "not_found", error: message, lastAttemptAt: now, nextRefreshAt: now + NOT_FOUND_RETRY } });
				}
			} catch (error) {
				const apiError = error instanceof AmazonApiError ? error : null;
				const message = apiError ? `${label}: ${apiError.message}` : `${label}: request failed.`;
				ctx.log.warn("[product-box] Amazon refresh failed", { marketplace, status: apiError?.status, code: apiError?.code });
				note(message);
				summary.failed += chunk.length;
				await mark(ctx, chunk, (row) => {
					const failures = row.failures + 1;
					return { status: "error", error: message, failures, lastAttemptAt: now, nextRefreshAt: now + backoffMs(failures, refreshMs) };
				});
				// Throttled or locked out: leave the marketplace's remaining rows for the next run.
				if (apiError && (apiError.status === 429 || apiError.status === 401 || apiError.status === 403)) break;
			}
		}
	}
	return summary;
}

/** Refresh rows that are due, oldest first. */
export async function refreshDue(ctx: Ctx, now = Date.now(), limit = MAX_REFRESH_PER_RUN): Promise<RefreshSummary> {
	const { items } = await products(ctx).query({ where: { nextRefreshAt: { lte: now } }, orderBy: { nextRefreshAt: "asc" }, limit: Math.min(limit, MAX_REFRESH_PER_RUN) });
	if (!items.length) return emptySummary();
	return refreshRows(
		ctx,
		items.map((i) => i.data),
		now,
	);
}

/** Refresh the given keys now, whatever their schedule. */
export async function refreshKeys(ctx: Ctx, keys: string[], now = Date.now()): Promise<RefreshSummary> {
	const found = await products(ctx).getMany(keys.slice(0, MAX_REFRESH_PER_RUN));
	return refreshRows(ctx, [...found.values()], now);
}

/** Make every tracked row due, so the next runs refresh everything. Returns how many rows. */
export async function markAllDue(ctx: Pick<PluginContext, "storage">, cap = 2000): Promise<number> {
	const col = products(ctx);
	let cursor: string | undefined;
	let n = 0;
	do {
		const page = await col.query({ orderBy: { createdAt: "asc" }, limit: 100, cursor });
		await Promise.all(page.items.map((i) => col.updateIf(i.id, { where: {}, set: { nextRefreshAt: 0 } })));
		n += page.items.length;
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor && n < cap);
	return n;
}
