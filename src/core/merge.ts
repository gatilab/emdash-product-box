/**
 * Cache precedence: how live Amazon data and the editor's fields combine.
 *
 * - Volatile commerce facts come from Amazon when a fresh cached row exists:
 *   current price, the "was" price and discount, rating and rating count,
 *   availability, and the "Price checked" date (the fetch time). Manual
 *   price fields are a fallback, so a stale or failed refresh never shows a
 *   number older than the cache window allows.
 * - Editorial fields stay the editor's: title, image, features, description,
 *   brand. Amazon fills them only when the editor left them empty. The image
 *   in particular should come from the media library; the Amazon image URL
 *   is a fallback.
 * - Affiliate URLs fill empty title links and buttons that name a
 *   marketplace (or inherit the box's), and get `rel="sponsored nofollow"`.
 *   A URL is a link, not displayed product content, so it is used from any
 *   cached row, fresh or not.
 */
import { currencyFor, formatDate, formatDateTime, parsePrice, savings, type DisplayDate } from "./price.js";
import { relTokens, safeUrl } from "./text.js";
import type { ButtonModel, ImageModel, Marketplace, ProductBoxModel, PublicProduct } from "./types.js";

export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const productKey = (marketplace: Marketplace, asin: string): string => `${marketplace}:${asin}`;

export type ProductLookup = ReadonlyMap<string, PublicProduct>;

export interface ViewOptions {
	now?: number;
	/** Live prices older than this fall back to the manual fields. */
	maxAgeMs?: number;
	locale?: string;
}

export interface ViewModel extends ProductBoxModel {
	/** The fresh Amazon row the price came from, if any. */
	liveProduct: PublicProduct | null;
	imageFromAmazon: boolean;
	titleFromAmazon: boolean;
	savingsText: string;
	priceCheckedDate: DisplayDate | null;
	/** Numeric offer for JSON-LD, when the price can be read. */
	offer: { amount: number; currency: string } | null;
	availability: string;
	availabilityMessage: string;
	/** Numeric rating count for JSON-LD (parsed from the manual text when not live). */
	ratingCountNumber: number;
}

export function isFresh(product: PublicProduct | undefined | null, now: number, maxAgeMs: number): product is PublicProduct {
	return Boolean(product && product.fetchedAt > 0 && now - product.fetchedAt <= maxAgeMs);
}

/** "1,234 ratings" → 1234. */
export function countFromText(text: string): number {
	const m = /\d[\d,.\u00A0\u202F ]*/.exec(text);
	if (!m) return 0;
	const n = Number(m[0].replace(/[^\d]/g, ""));
	return Number.isSafeInteger(n) ? n : 0;
}

function resolveButtons(model: ProductBoxModel, products: ProductLookup): ButtonModel[] {
	const out: ButtonModel[] = [];
	for (const b of model.buttons) {
		let url = safeUrl(b.url);
		let sponsored = b.sponsored;
		if (!b.url && model.live) {
			const asin = b.asin || model.amazon?.asin || "";
			const marketplace = b.region || model.amazon?.marketplace;
			const product = asin && marketplace ? products.get(productKey(marketplace, asin)) : undefined;
			if (product?.affiliateUrl) {
				url = product.affiliateUrl;
				sponsored = true;
			}
		}
		// As in WordPress, a button needs both text and a URL.
		if (!b.text || !url) continue;
		out.push({ ...b, url, sponsored });
	}
	return out;
}

/** Combine the normalized block with cached Amazon rows into what the renderer shows. */
export function buildView(model: ProductBoxModel, products: ProductLookup = new Map(), options: ViewOptions = {}): ViewModel {
	const now = options.now ?? Date.now();
	const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
	const locale = options.locale ?? "en-US";
	const cached = model.live && model.amazon ? products.get(productKey(model.amazon.marketplace, model.amazon.asin)) : undefined;
	const live = isFresh(cached, now, maxAgeMs) ? cached : null;

	const view: ViewModel = {
		...model,
		buttons: resolveButtons(model, products),
		liveProduct: live,
		imageFromAmazon: false,
		titleFromAmazon: false,
		savingsText: "",
		priceCheckedDate: null,
		offer: null,
		availability: "",
		availabilityMessage: "",
		ratingCountNumber: countFromText(model.ratingCount),
	};

	if (live) {
		if (!view.title && live.title) {
			view.title = live.title;
			view.titleFromAmazon = true;
		}
		if (!view.brand) view.brand = live.brand;
		if (!view.image && live.imageUrl) {
			const image: ImageModel = { src: live.imageUrl, alt: view.title || "Product image" };
			if (live.imageWidth > 0 && live.imageHeight > 0) Object.assign(image, { width: live.imageWidth, height: live.imageHeight });
			view.image = image;
			view.imageFromAmazon = true;
		}
		if (live.price) {
			view.currentPrice = live.price.display;
			view.originalPrice = live.savingBasis?.display ?? "";
			view.discountPercent = live.savingsPercent ? `-${live.savingsPercent}%` : "";
			view.offer = { amount: live.price.amount, currency: live.price.currency };
			view.priceCheckedDate = formatDateTime(live.fetchedAt);
		}
		if (live.rating > 0) {
			view.rating = live.rating;
			view.ratingCountNumber = live.ratingCount;
			view.ratingCount = live.ratingCount ? `${live.ratingCount.toLocaleString(locale)} ${live.ratingCount === 1 ? "rating" : "ratings"}` : "";
		}
		view.availability = live.availability;
		view.availabilityMessage = live.availabilityMessage;
	}

	// The title links to the product: the editor's URL, else the affiliate URL.
	if (!view.titleUrl && model.live && cached?.affiliateUrl) {
		view.titleUrl = cached.affiliateUrl;
		view.titleRel = relTokens(view.titleRel, "sponsored nofollow").join(" ");
	}
	view.titleUrl = safeUrl(view.titleUrl);

	if (!view.offer) {
		const parsed = parsePrice(view.currentPrice);
		const currency = parsed ? currencyFor(parsed, model.currency) : "";
		if (parsed && currency) view.offer = { amount: parsed.amount, currency };
	}
	if (!view.priceCheckedDate) view.priceCheckedDate = formatDate(model.priceChecked);
	if (view.showSavings) view.savingsText = savings(view.originalPrice, view.currentPrice);
	return view;
}
