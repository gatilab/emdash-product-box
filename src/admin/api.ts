/**
 * Typed client for the plugin's private admin routes (src/server/routes.ts).
 * Every call is a JSON POST through EmDash's `apiFetch`, which adds the
 * `X-EmDash-Request` header private routes require; `parseApiResponse`
 * unwraps the `{ success, data }` envelope and throws the server's message.
 */
import { apiFetch, parseApiResponse } from "emdash/plugin-utils";

import type { Marketplace, ProductStatus, StoredProduct } from "../core/types.js";

export const PLUGIN_ID = "product-box";
export const API_BASE = `/_emdash/api/plugins/${PLUGIN_ID}`;
/** The auto-generated settings page (settingsSchema). */
export const SETTINGS_HREF = `/_emdash/admin/plugins-manager/${PLUGIN_ID}/settings`;

export interface RefreshSummary {
	refreshed: number;
	notFound: number;
	failed: number;
	messages: string[];
	queued: number;
}

export interface ProductPage {
	items: StoredProduct[];
	cursor?: string;
	counts: Record<ProductStatus, number>;
}

export interface PluginStatus {
	marketplaces: Record<Marketplace, { credentials: boolean; partnerTag: boolean }>;
	settings: { refreshHours: number; maxAgeHours: number; schemaRating: boolean };
	cron: { schedule: string; nextRunAt: string; lastRunAt: string | null } | null;
}

async function call<T>(route: string, body: unknown, fallback: string, signal?: AbortSignal): Promise<T> {
	const response = await apiFetch(`${API_BASE}/${route}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body ?? {}),
		signal,
	});
	return parseApiResponse<T>(response, fallback);
}

export const listProducts = (input: { status?: ProductStatus | "all"; cursor?: string }, signal?: AbortSignal) => call<ProductPage>("products/list", input, "Could not load tracked products.", signal);
export const getStatus = (signal?: AbortSignal) => call<PluginStatus>("status", {}, "Could not load the plugin status.", signal);
export const refreshProducts = (input: { keys?: string[]; all?: boolean }) => call<RefreshSummary>("products/refresh", input, "Refresh failed.");
export const trackProduct = (asin: string, marketplace: Marketplace) =>
	call<{ key: string; added: boolean; summary: RefreshSummary; item: StoredProduct | null }>("products/track", { asin, marketplace }, "Could not add that ASIN.");
export const removeProducts = (keys: string[]) => call<{ removed: number }>("products/remove", { keys }, "Could not remove the products.");

export function isAbortError(error: unknown): boolean {
	return (error as { name?: string } | null)?.name === "AbortError";
}

export const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
