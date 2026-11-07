/**
 * The "Product box" editor block (`admin.portableTextBlocks`).
 *
 * Each field's `action_id` is the ACF field name, so a block exported from
 * WordPress opens with its values in place (see `fromAcfBlock()` for the
 * flattened repeater format ACF saves). Fields the editor doesn't declare
 * are preserved when a block is edited.
 *
 * Editor notes:
 * - Repeater sub-fields can only be text, number, select or toggle inputs;
 *   the first text input labels a collapsed row.
 * - `media_picker` stores the picked image's URL. Alt text has its own field
 *   because the URL carries none.
 * - Numbers use `number_input` without min/max: with a min, browsers reject
 *   half steps such as 4.5 under the default step. The renderer clamps.
 */
import type { PortableTextBlockConfig, PortableTextBlockField } from "emdash";

import { BLOCK_TYPE, MARKETPLACES } from "./core/types.js";

type Field = PortableTextBlockField;
type RepeaterField = Extract<Field, { type: "repeater" }>;
type SubField = RepeaterField["fields"][number];
type Option = { value: string; label: string };

const text = (action_id: string, label: string, placeholder?: string): Extract<Field, { type: "text_input" }> => ({ type: "text_input", action_id, label, ...(placeholder !== undefined && { placeholder }) });
const multiline = (action_id: string, label: string, placeholder?: string): Field => ({ type: "text_input", action_id, label, multiline: true, ...(placeholder !== undefined && { placeholder }) });
const number = (action_id: string, label: string): Extract<Field, { type: "number_input" }> => ({ type: "number_input", action_id, label });
const toggle = (action_id: string, label: string, initial_value: boolean, description?: string): Extract<Field, { type: "toggle" }> => ({ type: "toggle", action_id, label, initial_value, ...(description && { description }) });
const select = (action_id: string, label: string, options: Option[], initial_value?: string): Extract<Field, { type: "select" }> => ({ type: "select", action_id, label, options, ...(initial_value !== undefined && { initial_value }) });
const repeater = (action_id: string, label: string, item_label: string, fields: SubField[], max_items: number): RepeaterField => ({ type: "repeater", action_id, label, item_label, fields, max_items });

const marketplaceOptions: Option[] = Object.entries(MARKETPLACES).map(([value, m]) => ({ value, label: m.label }));

export const PRODUCT_BOX_BLOCK: PortableTextBlockConfig = {
	type: BLOCK_TYPE,
	label: "Product box",
	icon: "cart",
	category: "Affiliate",
	description: "Product listing with image, rating, features, price and buy buttons, with optional live Amazon pricing.",
	fields: [
		// ── Product
		{ type: "media_picker", action_id: "pb_image", label: "Product image (media library)", mime_type_filter: "image/" },
		text("pb_image_alt", "Image alt text", "Defaults to the product title"),
		text("pb_image_url", "Or image URL", "Overrides the picked image. Prefer the media library."),
		text("pb_title", "Product title"),
		text("pb_title_url", "Title link URL", "https://… or /go/slug/"),
		text("pb_title_rel", "Title & image link rel", "nofollow sponsored"),
		select(
			"pb_title_tag",
			"Title heading level",
			[
				{ value: "p", label: "Paragraph (default)" },
				{ value: "h2", label: "H2" },
				{ value: "h3", label: "H3" },
				{ value: "h4", label: "H4" },
				{ value: "h5", label: "H5" },
				{ value: "h6", label: "H6" },
			],
			"p",
		),
		number("pb_rating", "Rating (0 to 5, half stars; 0 hides)"),
		text("pb_rating_count", "Rating count", "1,234 ratings"),
		repeater("pb_features", "Features", "feature", [text("pb_feature_text", "Feature")], 10),
		repeater("pb_specs", "Spec chips", "spec", [text("pb_spec_text", "Spec", '49", 144Hz')], 8),
		multiline("pb_description", "Description", "HTML allowed: <a>, <strong>, <em>, <br>, <p>, <ul>, <ol>, <li>."),
		text("pb_brand", "Brand (for structured data)"),

		// ── Highlights
		text("pb_label", "Highlight label", "Best Overall"),
		text("pb_badge_text", "Sale badge text", "SAVE 10%"),
		text("pb_badge_color", "Badge color", "#22c55e"),
		number("pb_rank", "Rank (1 to 99; empty hides)"),
		number("pb_score", "Review score (empty hides)"),
		select(
			"pb_score_max",
			"Score out of",
			[
				{ value: "10", label: "10" },
				{ value: "5", label: "5" },
				{ value: "100", label: "100" },
			],
			"10",
		),
		text("pb_score_label", "Score label", "Our score"),
		text("pb_verdict", "Verdict", "The widest screen you can buy without a multi-monitor mess."),
		text("pb_verdict_label", "Verdict label", "Why it wins"),

		// ── Amazon
		text("pb_asin", "Amazon ASIN (optional)", "B0… or an Amazon product URL"),
		select("pb_marketplace", "Amazon marketplace", marketplaceOptions, "us"),
		toggle("pb_live", "Use live Amazon data", true, "Shows the cached Amazon price, rating and availability, refreshed on a schedule. Manual prices are the fallback."),

		// ── Price & buttons
		text("pb_original_price", "Original price", "$99.99"),
		text("pb_discount_percent", "Discount", "-15%"),
		text("pb_current_price", "Current price", "$79.99"),
		text("pb_currency", "Currency code (structured data)", "USD"),
		text("pb_price_note", "Price note", "Free shipping"),
		toggle("pb_show_savings", "Show “You save” amount", false),
		{ type: "date_input", action_id: "pb_price_checked", label: "Price checked on" },
		repeater(
			"pb_perks",
			"Perks",
			"perk",
			[
				text("pb_perk_text", "Text", "Free shipping"),
				select(
					"pb_perk_icon",
					"Icon",
					[
						{ value: "check", label: "Checkmark" },
						{ value: "truck", label: "Shipping" },
						{ value: "return", label: "Returns" },
						{ value: "shield", label: "Warranty" },
						{ value: "lock", label: "Secure" },
						{ value: "tag", label: "Deal" },
						{ value: "clock", label: "Fast" },
						{ value: "gift", label: "Gift" },
					],
					"check",
				),
			],
			6,
		),
		repeater(
			"pb_buttons",
			"Buttons",
			"button",
			[
				text("pb_cta_text", "Button text", "Buy on Amazon US"),
				text("pb_cta_url", "Button URL", "https://… or /go/slug/ (empty: Amazon link for the region)"),
				select("pb_cta_region", "Region", [{ value: "", label: "Box marketplace / any" }, ...marketplaceOptions], ""),
				text("pb_cta_asin", "ASIN for this button", "Defaults to the box ASIN"),
				toggle("pb_cta_sponsored", "Sponsored link (rel=\"sponsored nofollow\")", false),
				select(
					"pb_cta_style",
					"Style",
					[
						{ value: "primary", label: "Primary (filled)" },
						{ value: "secondary", label: "Secondary (outline)" },
						{ value: "amazon", label: "Amazon style" },
						{ value: "amazon-yellow", label: "Amazon yellow" },
						{ value: "custom", label: "Custom (CSS class)" },
					],
					"primary",
				),
				select(
					"pb_cta_icon",
					"Icon",
					[
						{ value: "none", label: "None" },
						{ value: "cart", label: "Shopping cart" },
						{ value: "amazon", label: "Amazon" },
						{ value: "external", label: "External link" },
						{ value: "check", label: "Checkmark" },
					],
					"none",
				),
				text("pb_cta_class", "CSS class"),
				text("pb_cta_rel", "Rel attribute", "nofollow sponsored"),
			],
			4,
		),
		toggle("pb_cta_emphasis", "Emphasize first button", false),
		toggle("pb_btn_arrow", "Arrow on first button", false),
		select(
			"pb_btn_shine",
			"Shine on first button",
			[
				{ value: "off", label: "Off" },
				{ value: "hover", label: "On hover" },
				{ value: "repeat", label: "Repeat" },
			],
			"off",
		),
		toggle("pb_new_tab", "Open links in a new tab", false),
		text("pb_disclosure", "Disclosure", "As an Amazon Associate I earn from qualifying purchases."),

		// ── Display
		select(
			"pb_layout",
			"Layout",
			[
				{ value: "default", label: "Image left" },
				{ value: "top-image", label: "Top image" },
				{ value: "no-image", label: "No image" },
			],
			"default",
		),
		select(
			"pb_box_style",
			"Box style",
			[
				{ value: "standard", label: "Standard" },
				{ value: "spotlight", label: "Spotlight" },
			],
			"standard",
		),
		text("pb_accent_color", "Accent color", "#2563eb"),
		select(
			"pb_image_fit",
			"Image fit",
			[
				{ value: "contain", label: "Show full image" },
				{ value: "cover", label: "Fill & crop" },
			],
			"contain",
		),
		select(
			"pb_image_ratio",
			"Top image frame",
			[
				{ value: "auto", label: "Auto (image's own shape)" },
				{ value: "16-9", label: "Wide (16:9)" },
				{ value: "4-3", label: "Standard (4:3)" },
				{ value: "1-1", label: "Square (1:1)" },
			],
			"auto",
		),
		toggle("pb_schema", "Output Product structured data", true),
	],
};
