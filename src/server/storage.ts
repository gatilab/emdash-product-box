/**
 * Storage: one collection of tracked ASINs, keyed `marketplace:ASIN`. Each
 * document holds the last good product data and its refresh bookkeeping.
 *
 * EmDash storage queries are AND-only and every filtered or sorted field
 * must be indexed: the cron filters and sorts on `nextRefreshAt`, the admin
 * list sorts on `seenAt` and filters on `status`.
 */
import type { PluginContext, PluginStorageConfig, StorageCollection } from "emdash";

import { productKey } from "../core/merge.js";
import type { Marketplace, PublicProduct, StoredProduct } from "../core/types.js";

export const STORAGE: PluginStorageConfig = {
	products: {
		indexes: ["status", "marketplace", "nextRefreshAt", "seenAt", "createdAt", ["status", "seenAt"]],
	},
};

type Ctx = Pick<PluginContext, "storage">;

export const products = (ctx: Ctx) => ctx.storage.products as StorageCollection<StoredProduct>;

export function newRow(marketplace: Marketplace, asin: string, now: number, source: string): StoredProduct {
	return {
		key: productKey(marketplace, asin),
		asin,
		marketplace,
		status: "pending",
		data: null,
		fetchedAt: 0,
		lastAttemptAt: 0,
		nextRefreshAt: now,
		failures: 0,
		error: "",
		createdAt: now,
		seenAt: now,
		source,
	};
}

/** The product data a page may show, or null before the first good fetch. */
export function toPublic(row: StoredProduct | null | undefined): PublicProduct | null {
	return row?.data ? { ...row.data, fetchedAt: row.fetchedAt } : null;
}
