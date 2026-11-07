/**
 * @gatilab/emdash-product-box
 *
 * A Portable Text "Product box" for EmDash: image, rating, features, spec
 * chips, pricing, regional buy buttons and Product JSON-LD. Optional live
 * Amazon data (US and India) through the Creators API: ASINs used in boxes
 * are tracked, refreshed by cron into plugin storage, and the renderer
 * prefers fresh cached prices over the manual fields. Port of the ACF Blocks
 * Product Box; its field names carry over.
 *
 * @example
 * ```js
 * // astro.config.mjs
 * import { productBox } from "@gatilab/emdash-product-box";
 *
 * export default defineConfig({
 *   integrations: [emdash({ plugins: [productBox()] })],
 * });
 * ```
 */
import { definePlugin } from "emdash";
import type { PluginDescriptor, ResolvedPlugin, RouteContext } from "emdash";

import { PRODUCT_BOX_BLOCK } from "./blocks.js";
import { AMAZON_HOSTS } from "./core/amazon.js";
import { CREDENTIAL_KEYS, DEFAULT_SETTINGS } from "./server/config.js";
import { adminRoutes, ensureCron, lookup, onContentSaved, onCron } from "./server/routes.js";
import { STORAGE } from "./server/storage.js";

export const PLUGIN_ID = "product-box";
export const PLUGIN_VERSION = "0.1.0";
export const PACKAGE_NAME = "@gatilab/emdash-product-box";

export type ProductBoxOptions = Record<string, never>;

/** Descriptor factory for the `plugins` array of the `emdash()` integration. */
export function productBox(options: ProductBoxOptions = {}): PluginDescriptor<ProductBoxOptions> {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint: PACKAGE_NAME,
		componentsEntry: `${PACKAGE_NAME}/astro`,
		adminEntry: `${PACKAGE_NAME}/admin`,
		options,
	};
}

type Handler = (ctx: RouteContext<unknown>) => Promise<unknown>;

const json = (handler: Handler, maxBytes = 16 * 1024) => ({ request: { body: "json" as const, maxBytes }, handler });

/** Admin routes also make sure the refresh task is scheduled. */
const admin = (handler: Handler) =>
	json(async (ctx) => {
		await ensureCron(ctx);
		return handler(ctx);
	});

export function createPlugin(_options: ProductBoxOptions = {}): ResolvedPlugin {
	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		// Outbound calls go to the Login with Amazon token endpoint and the
		// Creators API only. Product images are never fetched by the server.
		capabilities: ["network:request"],
		allowedHosts: AMAZON_HOSTS,
		storage: STORAGE,
		hooks: {
			"plugin:activate": async (_event, ctx) => ensureCron(ctx),
			"content:afterSave": { timeout: 5_000, errorPolicy: "continue", handler: onContentSaved },
			cron: { timeout: 25_000, handler: onCron },
		},
		routes: {
			lookup: { public: true, methods: ["POST"], ...json(lookup, 4 * 1024) },
			...Object.fromEntries(Object.entries(adminRoutes).map(([name, handler]) => [name, admin(handler)])),
		},
		admin: {
			entry: `${PACKAGE_NAME}/admin`,
			pages: [{ path: "/", label: "Amazon products", icon: "cart" }],
			portableTextBlocks: [PRODUCT_BOX_BLOCK],
			settingsSchema: {
				refresh_hours: { type: "number", label: "Refresh every (hours)", description: "How often each tracked ASIN is refreshed from Amazon.", default: DEFAULT_SETTINGS.refreshHours, min: 1, max: 24 },
				max_age_hours: {
					type: "number",
					label: "Show live data for (hours)",
					description: "Cached Amazon prices older than this are not shown; boxes fall back to their manual prices. Amazon's terms expect displayed prices to be no older than 24 hours.",
					default: DEFAULT_SETTINGS.maxAgeHours,
					min: 1,
					max: 24,
				},
				schema_rating: {
					type: "boolean",
					label: "Include ratings in structured data",
					description: "Adds AggregateRating to the Product JSON-LD when a box shows a rating and a count. Google's review snippet guidelines discourage marking up ratings taken from other sites, such as Amazon.",
					default: DEFAULT_SETTINGS.schemaRating,
				},
				[CREDENTIAL_KEYS.us.tag]: { type: "string", label: "Amazon.com partner tag", description: "Your US Associates tag, e.g. yourtag-20." },
				[CREDENTIAL_KEYS.us.id]: { type: "secret", label: "Amazon.com Creators API credential ID" },
				[CREDENTIAL_KEYS.us.secret]: { type: "secret", label: "Amazon.com Creators API secret" },
				[CREDENTIAL_KEYS.in.tag]: { type: "string", label: "Amazon.in partner tag", description: "Your India Associates tag, e.g. yourtag-21." },
				[CREDENTIAL_KEYS.in.id]: { type: "secret", label: "Amazon.in Creators API credential ID", description: "India needs its own credential set; US credentials can't read Amazon.in." },
				[CREDENTIAL_KEYS.in.secret]: { type: "secret", label: "Amazon.in Creators API secret" },
			},
		},
	});
}

export default createPlugin;

export * from "./core/index.js";
export { PRODUCT_BOX_BLOCK } from "./blocks.js";
