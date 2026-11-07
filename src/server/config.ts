/**
 * Settings and secrets.
 *
 * Settings live in EmDash plugin settings (`admin.settingsSchema`).
 * Creators API credentials are `secret` fields, encrypted at rest by the
 * host; they are read only when a refresh runs and never returned by a
 * route or written to storage.
 */
import type { PluginContext } from "emdash";

import type { Credentials } from "../core/amazon.js";
import { MARKETPLACE_IDS, type Marketplace } from "../core/types.js";

type Ctx = Pick<PluginContext, "settings">;

export const CREDENTIAL_KEYS: Record<Marketplace, { id: string; secret: string; tag: string }> = {
	us: { id: "amazon_us_credential_id", secret: "amazon_us_credential_secret", tag: "amazon_us_partner_tag" },
	in: { id: "amazon_in_credential_id", secret: "amazon_in_credential_secret", tag: "amazon_in_partner_tag" },
};

export interface Settings {
	/** Hours between successful refreshes of one ASIN. */
	refreshHours: number;
	/** Live data older than this is not shown. Amazon expects 24 or less. */
	maxAgeHours: number;
	/** Emit AggregateRating in the Product JSON-LD. */
	schemaRating: boolean;
}

export const DEFAULT_SETTINGS: Settings = { refreshHours: 12, maxAgeHours: 24, schemaRating: true };

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
	const n = Number(v);
	return v === null || v === undefined || v === "" || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};

export async function readSettings(ctx: Ctx): Promise<Settings> {
	const [refresh, maxAge, rating] = await Promise.all([
		ctx.settings.get<unknown>("refresh_hours"),
		ctx.settings.get<unknown>("max_age_hours"),
		ctx.settings.get<unknown>("schema_rating"),
	]);
	return {
		refreshHours: clamp(refresh, 1, 24, DEFAULT_SETTINGS.refreshHours),
		maxAgeHours: clamp(maxAge, 1, 24, DEFAULT_SETTINGS.maxAgeHours),
		schemaRating: rating === null || rating === undefined || rating === "" ? DEFAULT_SETTINGS.schemaRating : rating === true || rating === "1" || rating === "true",
	};
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Credentials for one marketplace, or null when any part is missing. */
export async function readCredentials(ctx: Ctx, marketplace: Marketplace): Promise<Credentials | null> {
	const keys = CREDENTIAL_KEYS[marketplace];
	const [credentialId, secret, partnerTag] = (await Promise.all([ctx.settings.get<string>(keys.id), ctx.settings.get<string>(keys.secret), ctx.settings.get<string>(keys.tag)])).map(text);
	return credentialId && secret && partnerTag ? { credentialId, secret, partnerTag } : null;
}

/** Which marketplaces are configured. Booleans only: no values leave the server. */
export async function credentialStatus(ctx: Ctx): Promise<Record<Marketplace, { credentials: boolean; partnerTag: boolean }>> {
	const entries = await Promise.all(
		MARKETPLACE_IDS.map(async (m) => {
			const keys = CREDENTIAL_KEYS[m];
			const [id, secret, tag] = (await Promise.all([ctx.settings.get<string>(keys.id), ctx.settings.get<string>(keys.secret), ctx.settings.get<string>(keys.tag)])).map(text);
			return [m, { credentials: Boolean(id && secret), partnerTag: Boolean(tag) }] as const;
		}),
	);
	return Object.fromEntries(entries) as Record<Marketplace, { credentials: boolean; partnerTag: boolean }>;
}
