/** Pure display helpers for the admin, kept separate so they can be tested. */
import type { ProductStatus, StoredProduct } from "../core/types.js";

export const STATUS_LABELS: Record<ProductStatus, string> = { pending: "Pending", ok: "OK", error: "Error", not_found: "Not found" };
export const STATUS_BADGES: Record<ProductStatus, "neutral" | "green" | "red" | "orange"> = { pending: "neutral", ok: "green", error: "red", not_found: "orange" };

/** "3 min ago", "in 2 h", "never". */
export function relativeTime(ms: number, now = Date.now()): string {
	if (!ms) return "never";
	const diff = ms - now;
	const abs = Math.abs(diff);
	const [value, unit] = abs < 60_000 ? [0, "now"] : abs < 3_600_000 ? [Math.round(abs / 60_000), "min"] : abs < 86_400_000 ? [Math.round(abs / 3_600_000), "h"] : [Math.round(abs / 86_400_000), "d"];
	if (unit === "now") return "just now";
	return diff < 0 ? `${value} ${unit} ago` : `in ${value} ${unit}`;
}

/** The price shown in the list, or a dash. */
export const priceLabel = (row: StoredProduct): string => row.data?.price?.display ?? "—";

/** The product's title, else its ASIN. */
export const titleLabel = (row: StoredProduct): string => row.data?.title || row.asin;
