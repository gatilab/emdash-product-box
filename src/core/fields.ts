/**
 * Field mapping: the stored block (ACF field names) to the render model,
 * with the same validation and defaults product-box.php applied, plus an
 * importer for ACF block data saved by WordPress.
 */
import { sanitizeCssColor, sanitizeHex } from "./price.js";
import { str } from "./text.js";
import {
	BLOCK_TYPE,
	isMarketplace,
	type ButtonIcon,
	type ButtonModel,
	type ButtonStyle,
	type ImageModel,
	type ImageRatio,
	type Layout,
	type Marketplace,
	type PerkIcon,
	type ProductBoxBlock,
	type ProductBoxModel,
	type TitleTag,
} from "./types.js";

export const TITLE_TAGS: TitleTag[] = ["p", "h2", "h3", "h4", "h5", "h6"];
export const BUTTON_STYLES: ButtonStyle[] = ["primary", "secondary", "amazon", "amazon-yellow", "custom"];
export const BUTTON_ICONS: ButtonIcon[] = ["none", "cart", "amazon", "external", "check"];
export const PERK_ICONS: PerkIcon[] = ["check", "truck", "return", "shield", "lock", "tag", "clock", "gift"];
export const IMAGE_RATIOS: ImageRatio[] = ["auto", "16-9", "4-3", "1-1"];
export const DEFAULT_BADGE_COLOR = "#22c55e";
export const DEFAULT_SCORE_LABEL = "Our score";
export const DEFAULT_VERDICT_LABEL = "Why it wins";

/** Repeaters and their sub-fields, as ACF names them. */
export const REPEATERS = {
	pb_features: ["pb_feature_text"],
	pb_specs: ["pb_spec_text"],
	pb_perks: ["pb_perk_icon", "pb_perk_text"],
	pb_buttons: ["pb_cta_text", "pb_cta_url", "pb_cta_style", "pb_cta_icon", "pb_cta_class", "pb_cta_rel"],
} as const;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
	const v = str(value);
	return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
};

/** ACF stores true_false as "1"/"0"; the EmDash toggle stores booleans. */
export function flag(value: unknown, fallback = false): boolean {
	if (value === undefined || value === null || value === "") return fallback;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	return ["1", "true", "on", "yes"].includes(String(value).trim().toLowerCase());
}

export function num(value: unknown): number {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const n = Number(String(value ?? "").trim());
	return Number.isFinite(n) ? n : 0;
}

/**
 * A 10-character ASIN from an ASIN or an Amazon product URL
 * (`/dp/B0…`, `/gp/product/B0…`). Returns "" when none is found.
 */
export function normalizeAsin(value: unknown): string {
	const s = str(value);
	if (!s) return "";
	const fromUrl = /\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Za-z0-9]{10})(?:[/?#]|$)/.exec(s);
	const candidate = (fromUrl?.[1] ?? s).replace(/\s+/g, "").toUpperCase();
	return /^[A-Z0-9]{10}$/.test(candidate) ? candidate : "";
}

/** Space-separated class names, keeping only safe tokens. */
const classTokens = (value: unknown): string[] => str(value).split(/\s+/).filter((t) => /^-?[_a-zA-Z][\w-]*$/.test(t));

/** Rows of a repeater, whether stored as row objects or as plain strings. */
function rows(value: unknown, textField: string): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((row) => (typeof row === "string" ? { [textField]: row } : row && typeof row === "object" ? (row as Record<string, unknown>) : null))
		.filter((row): row is Record<string, unknown> => row !== null);
}

function resolveImage(block: ProductBoxBlock, fallbackAlt: string): ImageModel | null {
	const altField = str(block.pb_image_alt);
	// The direct URL takes priority over the picked image, as in WordPress.
	const direct = str(block.pb_image_url);
	if (direct) return { src: direct, alt: altField || fallbackAlt };
	const img = block.pb_image;
	if (typeof img === "string" && img.trim()) return { src: img.trim(), alt: altField || fallbackAlt };
	if (img && typeof img === "object") {
		const src = str(img.src) || str(img.url);
		if (!src) return null;
		const width = Math.trunc(num(img.width));
		const height = Math.trunc(num(img.height));
		return { src, alt: altField || str(img.alt) || fallbackAlt, ...(width > 0 && height > 0 && { width, height }) };
	}
	// A bare number is a WordPress attachment ID, which has no meaning here.
	return null;
}

function toButton(row: Record<string, unknown>): ButtonModel {
	const region = str(row.pb_cta_region);
	return {
		text: str(row.pb_cta_text),
		url: str(row.pb_cta_url),
		style: oneOf(row.pb_cta_style, BUTTON_STYLES, "primary"),
		icon: oneOf(row.pb_cta_icon, BUTTON_ICONS, "none"),
		className: classTokens(row.pb_cta_class).join(" "),
		rel: str(row.pb_cta_rel),
		sponsored: flag(row.pb_cta_sponsored),
		region: isMarketplace(region) ? region : "",
		asin: normalizeAsin(row.pb_cta_asin),
	};
}

function layoutOf(block: ProductBoxBlock): Layout {
	const explicit = str(block.pb_layout);
	if (explicit === "top-image" || explicit === "no-image" || explicit === "default") return explicit;
	const cls = classTokens(block.className);
	if (cls.includes("is-style-top-image")) return "top-image";
	if (cls.includes("is-style-no-image")) return "no-image";
	return "default";
}

/** Normalize a stored block into the render model. Never throws. */
export function normalizeBlock(input: unknown): ProductBoxModel {
	const block = (input && typeof input === "object" ? input : {}) as ProductBoxBlock;
	const title = str(block.pb_title);

	const scoreMaxRaw = Math.trunc(num(block.pb_score_max));
	const scoreMax = scoreMaxRaw === 5 || scoreMaxRaw === 100 ? scoreMaxRaw : 10;
	const score = Math.max(0, Math.min(num(block.pb_score), scoreMax));
	const rank = Math.trunc(num(block.pb_rank));
	const rating = Math.max(0, Math.min(num(block.pb_rating), 5));
	const shine = str(block.pb_btn_shine);
	const align = str(block.align);
	const asin = normalizeAsin(block.pb_asin);
	const marketplace: Marketplace = isMarketplace(str(block.pb_marketplace)) ? (str(block.pb_marketplace) as Marketplace) : "us";

	return {
		layout: layoutOf(block),
		image: resolveImage(block, title || "Product image"),
		title,
		titleUrl: str(block.pb_title_url),
		titleRel: str(block.pb_title_rel),
		titleTag: oneOf(block.pb_title_tag, TITLE_TAGS, "p"),
		rating,
		ratingCount: str(block.pb_rating_count),
		features: rows(block.pb_features, "pb_feature_text").map((r) => str(r.pb_feature_text)).filter(Boolean),
		specs: rows(block.pb_specs, "pb_spec_text").map((r) => str(r.pb_spec_text)).filter(Boolean),
		description: typeof block.pb_description === "string" ? block.pb_description : "",
		brand: str(block.pb_brand),

		label: str(block.pb_label),
		badgeText: str(block.pb_badge_text),
		badgeColor: sanitizeCssColor(block.pb_badge_color) || DEFAULT_BADGE_COLOR,
		rank: rank >= 1 && rank <= 99 ? rank : 0,
		score,
		scoreMax,
		scoreLabel: str(block.pb_score_label) || DEFAULT_SCORE_LABEL,
		verdict: str(block.pb_verdict),
		verdictLabel: str(block.pb_verdict_label) || DEFAULT_VERDICT_LABEL,

		originalPrice: str(block.pb_original_price),
		discountPercent: str(block.pb_discount_percent),
		currentPrice: str(block.pb_current_price),
		priceNote: str(block.pb_price_note),
		showSavings: flag(block.pb_show_savings),
		priceChecked: str(block.pb_price_checked),
		currency: str(block.pb_currency).toUpperCase(),
		perks: rows(block.pb_perks, "pb_perk_text")
			.map((r) => ({ icon: oneOf(r.pb_perk_icon, PERK_ICONS, "check"), text: str(r.pb_perk_text) }))
			.filter((p) => p.text),
		buttons: rows(block.pb_buttons, "pb_cta_text").map(toButton).filter((b) => b.text),
		ctaEmphasis: flag(block.pb_cta_emphasis),
		btnArrow: flag(block.pb_btn_arrow),
		btnShine: shine === "hover" || shine === "repeat" ? shine : "",
		newTab: flag(block.pb_new_tab),
		disclosure: str(block.pb_disclosure),

		spotlight: str(block.pb_box_style) === "spotlight",
		accent: sanitizeHex(block.pb_accent_color),
		imageFit: str(block.pb_image_fit) === "cover" ? "cover" : "contain",
		imageRatio: oneOf(block.pb_image_ratio, IMAGE_RATIOS, "auto"),
		anchor: /^[A-Za-z][\w:.-]*$/.test(str(block.anchor)) ? str(block.anchor) : "",
		align: align === "wide" || align === "full" ? align : "",
		extraClass: classTokens(block.className)
			.filter((t) => !t.startsWith("is-style-"))
			.join(" "),

		amazon: asin ? { asin, marketplace } : null,
		live: flag(block.pb_live, true),
		schema: flag(block.pb_schema, true),
	};
}

/** Every (ASIN, marketplace) pair a block can show data for: the box's and each regional button's. */
export function amazonRefs(input: unknown): { asin: string; marketplace: Marketplace }[] {
	const model = normalizeBlock(input);
	const out = new Map<string, { asin: string; marketplace: Marketplace }>();
	if (!model.live) return [];
	if (model.amazon) out.set(`${model.amazon.marketplace}:${model.amazon.asin}`, model.amazon);
	for (const b of model.buttons) {
		const asin = b.asin || model.amazon?.asin || "";
		const marketplace = b.region || model.amazon?.marketplace || "";
		// A button only needs Amazon data when it has an ASIN to resolve and no URL of its own.
		if (!asin || !marketplace || b.url) continue;
		out.set(`${marketplace}:${asin}`, { asin, marketplace });
	}
	return [...out.values()];
}

// ── WordPress import ────────────────────────────────────────────────────────

/**
 * Convert an ACF Product Box block, as WordPress saved it, into the EmDash
 * block. Accepts the block's `attrs` (`{ data, className, anchor, align }`)
 * or the bare `data` object. ACF stores repeaters flattened
 * (`pb_features: 2`, `pb_features_0_pb_feature_text: "…"`) and keeps
 * `_pb_title: "field_…"` key references; both are unpacked or dropped.
 * A numeric `pb_image` (attachment ID) is dropped: import the image into the
 * media library and set `pb_image` to its URL.
 */
export function fromAcfBlock(input: unknown): ProductBoxBlock {
	const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
	const data = (src.data && typeof src.data === "object" ? src.data : src) as Record<string, unknown>;
	const out: ProductBoxBlock = { _type: BLOCK_TYPE };
	const flattened = new Set<string>();

	for (const [name, subFields] of Object.entries(REPEATERS)) {
		const value = data[name];
		if (Array.isArray(value)) {
			out[name] = value;
			continue;
		}
		const count = Math.trunc(num(value));
		const list: Record<string, unknown>[] = [];
		for (let i = 0; i < Math.min(count, 50); i++) {
			const row: Record<string, unknown> = {};
			for (const sub of subFields) {
				const key = `${name}_${i}_${sub}`;
				flattened.add(key);
				if (data[key] !== undefined) row[sub] = data[key];
			}
			list.push(row);
		}
		if (list.length) out[name] = list;
	}

	for (const [key, value] of Object.entries(data)) {
		if (key.startsWith("_") || key in REPEATERS || flattened.has(key) || /^pb_(features|specs|perks|buttons)_\d+_/.test(key)) continue;
		if (key === "pb_image" && (typeof value === "number" || /^\d+$/.test(String(value)))) continue;
		if (key.startsWith("pb_")) out[key] = value;
	}

	for (const key of ["className", "anchor", "align"] as const) {
		const v = str(src[key]);
		if (v) out[key] = v;
	}
	return out;
}
