/**
 * Shared types: the stored block, the normalized render model, and the
 * Amazon product cache.
 *
 * The stored block keeps the ACF field names (`pb_title`, `pb_buttons`, …)
 * as its property names, so a block exported from WordPress maps onto the
 * EmDash block one to one. Repeaters are arrays of row objects keyed by the
 * ACF sub-field names.
 */

export const BLOCK_TYPE = "productBox";

export const MARKETPLACES = {
	us: { domain: "www.amazon.com", currency: "USD", label: "Amazon.com (US)", short: "US" },
	in: { domain: "www.amazon.in", currency: "INR", label: "Amazon.in (India)", short: "India" },
} as const;

export type Marketplace = keyof typeof MARKETPLACES;
export const MARKETPLACE_IDS = Object.keys(MARKETPLACES) as Marketplace[];

export const isMarketplace = (v: unknown): v is Marketplace => typeof v === "string" && Object.hasOwn(MARKETPLACES, v);

// ── Stored block ────────────────────────────────────────────────────────────

/** Booleans and numbers may arrive as strings from a WordPress import ("1", "4.5"). */
type Flag = boolean | string | number | null;
type Num = number | string | null;

export interface FeatureRow {
	pb_feature_text?: string;
}
export interface SpecRow {
	pb_spec_text?: string;
}
export interface PerkRow {
	pb_perk_icon?: string;
	pb_perk_text?: string;
}
export interface ButtonRow {
	pb_cta_text?: string;
	pb_cta_url?: string;
	pb_cta_style?: string;
	pb_cta_icon?: string;
	pb_cta_class?: string;
	pb_cta_rel?: string;
	/** New in EmDash: adds `rel="sponsored nofollow"`. */
	pb_cta_sponsored?: Flag;
	/** New in EmDash: the marketplace this button sends readers to ("", "us", "in"). */
	pb_cta_region?: string;
	/** New in EmDash: ASIN for this button when it differs from the box's. */
	pb_cta_asin?: string;
}

/** A `media_picker` stores a URL string; imported blocks may carry an object. */
export type StoredImage = string | { src?: string; url?: string; alt?: string; width?: Num; height?: Num } | number | null;

export interface ProductBoxBlock {
	_type: typeof BLOCK_TYPE;
	_key?: string;

	// Product
	pb_image?: StoredImage;
	pb_image_url?: string;
	pb_image_alt?: string;
	pb_title?: string;
	pb_title_url?: string;
	pb_title_rel?: string;
	pb_title_tag?: string;
	pb_rating?: Num;
	pb_rating_count?: string;
	pb_features?: FeatureRow[] | string[];
	pb_specs?: SpecRow[] | string[];
	pb_description?: string;
	pb_brand?: string;

	// Highlights
	pb_label?: string;
	pb_badge_text?: string;
	pb_badge_color?: string;
	pb_rank?: Num;
	pb_score?: Num;
	pb_score_max?: Num;
	pb_score_label?: string;
	pb_verdict?: string;
	pb_verdict_label?: string;

	// Price & buttons
	pb_original_price?: string;
	pb_discount_percent?: string;
	pb_current_price?: string;
	pb_price_note?: string;
	pb_show_savings?: Flag;
	pb_price_checked?: string;
	pb_currency?: string;
	pb_perks?: PerkRow[];
	pb_buttons?: ButtonRow[];
	pb_cta_emphasis?: Flag;
	pb_btn_arrow?: Flag;
	pb_btn_shine?: string;
	pb_new_tab?: Flag;
	pb_disclosure?: string;

	// Display
	pb_box_style?: string;
	pb_accent_color?: string;
	pb_image_fit?: string;
	pb_image_ratio?: string;
	pb_layout?: string;

	// Amazon and schema (new in EmDash)
	pb_asin?: string;
	pb_marketplace?: string;
	pb_live?: Flag;
	pb_schema?: Flag;

	// WordPress block supports
	className?: string;
	anchor?: string;
	align?: string;

	[key: string]: unknown;
}

// ── Normalized model ────────────────────────────────────────────────────────

export type TitleTag = "p" | "h2" | "h3" | "h4" | "h5" | "h6";
export type Layout = "default" | "top-image" | "no-image";
export type ButtonStyle = "primary" | "secondary" | "amazon" | "amazon-yellow" | "custom";
export type ButtonIcon = "none" | "cart" | "amazon" | "external" | "check";
export type PerkIcon = "check" | "truck" | "return" | "shield" | "lock" | "tag" | "clock" | "gift";
export type ImageFit = "contain" | "cover";
export type ImageRatio = "auto" | "16-9" | "4-3" | "1-1";

export interface ImageModel {
	src: string;
	alt: string;
	width?: number;
	height?: number;
}

export interface ButtonModel {
	text: string;
	url: string;
	style: ButtonStyle;
	icon: ButtonIcon;
	className: string;
	rel: string;
	sponsored: boolean;
	region: Marketplace | "";
	asin: string;
}

export interface AmazonRef {
	asin: string;
	marketplace: Marketplace;
}

export interface ProductBoxModel {
	layout: Layout;
	image: ImageModel | null;
	title: string;
	titleUrl: string;
	titleRel: string;
	titleTag: TitleTag;
	rating: number;
	ratingCount: string;
	features: string[];
	specs: string[];
	description: string;
	brand: string;

	label: string;
	badgeText: string;
	badgeColor: string;
	rank: number;
	score: number;
	scoreMax: 5 | 10 | 100;
	scoreLabel: string;
	verdict: string;
	verdictLabel: string;

	originalPrice: string;
	discountPercent: string;
	currentPrice: string;
	priceNote: string;
	showSavings: boolean;
	/** Raw stored date (YYYYMMDD from ACF, or YYYY-MM-DD). */
	priceChecked: string;
	currency: string;
	perks: { icon: PerkIcon; text: string }[];
	buttons: ButtonModel[];
	ctaEmphasis: boolean;
	btnArrow: boolean;
	btnShine: "" | "hover" | "repeat";
	newTab: boolean;
	disclosure: string;

	spotlight: boolean;
	accent: string;
	imageFit: ImageFit;
	imageRatio: ImageRatio;
	anchor: string;
	align: "" | "wide" | "full";
	extraClass: string;

	amazon: AmazonRef | null;
	live: boolean;
	schema: boolean;
}

// ── Amazon cache ────────────────────────────────────────────────────────────

export interface Money {
	amount: number;
	currency: string;
	display: string;
}

/** Product data as parsed from a Creators API item. */
export interface AmazonProduct {
	asin: string;
	marketplace: Marketplace;
	title: string;
	brand: string;
	imageUrl: string;
	imageWidth: number;
	imageHeight: number;
	price: Money | null;
	/** List or "was" price Amazon compares against. */
	savingBasis: Money | null;
	savingsPercent: number;
	/** e.g. IN_STOCK, OUT_OF_STOCK, PREORDER. */
	availability: string;
	availabilityMessage: string;
	rating: number;
	ratingCount: number;
	affiliateUrl: string;
}

export type ProductStatus = "pending" | "ok" | "error" | "not_found";

/** A tracked ASIN as stored: the last good data plus refresh bookkeeping. */
export interface StoredProduct {
	key: string;
	asin: string;
	marketplace: Marketplace;
	status: ProductStatus;
	data: AmazonProduct | null;
	/** Epoch ms of the last successful fetch; 0 before the first. */
	fetchedAt: number;
	lastAttemptAt: number;
	nextRefreshAt: number;
	failures: number;
	error: string;
	createdAt: number;
	/** Epoch ms the ASIN was last seen in saved or rendered content. */
	seenAt: number;
	/** Where it was last seen, e.g. "posts/01J…" or "render". */
	source: string;
}

/** What the public lookup route returns: product data only, no bookkeeping. */
export interface PublicProduct extends AmazonProduct {
	fetchedAt: number;
}
