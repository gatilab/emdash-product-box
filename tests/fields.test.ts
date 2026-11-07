import { describe, expect, it } from "vitest";

import { amazonRefs, flag, fromAcfBlock, normalizeAsin, normalizeBlock } from "../src/core/fields.js";
import fixture from "./fixtures/acf-block-data.json" with { type: "json" };

describe("normalizeBlock", () => {
	it("applies the WordPress defaults to an empty block", () => {
		const m = normalizeBlock({ _type: "productBox" });
		expect(m).toMatchObject({
			layout: "default",
			image: null,
			titleTag: "p",
			badgeColor: "#22c55e",
			scoreMax: 10,
			scoreLabel: "Our score",
			verdictLabel: "Why it wins",
			imageFit: "contain",
			imageRatio: "auto",
			btnShine: "",
			live: true,
			schema: true,
			amazon: null,
		});
	});

	it("validates and clamps like product-box.php", () => {
		const m = normalizeBlock({
			_type: "productBox",
			pb_title_tag: "h1",
			pb_rank: 120,
			pb_score: 14,
			pb_score_max: "7",
			pb_rating: 9,
			pb_btn_shine: "off",
			pb_image_fit: "stretch",
			pb_image_ratio: "21-9",
			pb_accent_color: "red; background:url(x)",
			pb_badge_color: "expression(alert(1))",
			className: "is-style-no-image my-box \"><script>",
			anchor: "1bad id",
			align: "left",
		});
		expect(m.titleTag).toBe("p");
		expect(m.rank).toBe(0);
		expect(m.scoreMax).toBe(10);
		expect(m.score).toBe(10);
		expect(m.rating).toBe(5);
		expect(m.btnShine).toBe("");
		expect(m.imageFit).toBe("contain");
		expect(m.imageRatio).toBe("auto");
		expect(m.accent).toBe("");
		expect(m.badgeColor).toBe("#22c55e");
		expect(m.layout).toBe("no-image");
		expect(m.extraClass).toBe("my-box");
		expect(m.anchor).toBe("");
		expect(m.align).toBe("");
	});

	it("reads repeaters as rows or plain strings and drops empty rows", () => {
		const m = normalizeBlock({
			_type: "productBox",
			pb_features: [{ pb_feature_text: "One" }, { pb_feature_text: " " }, "Two"],
			pb_specs: ["49\""],
			pb_perks: [{ pb_perk_icon: "rocket", pb_perk_text: "Fast" }, { pb_perk_text: "" }],
			pb_buttons: [
				{ pb_cta_text: "Buy", pb_cta_url: "/go/x/", pb_cta_style: "neon", pb_cta_region: "in", pb_cta_sponsored: true, pb_cta_asin: "b0pbxtest1", pb_cta_class: "a b<c" },
				{ pb_cta_text: "", pb_cta_url: "/go/y/" },
			],
		});
		expect(m.features).toEqual(["One", "Two"]);
		expect(m.specs).toEqual(['49"']);
		expect(m.perks).toEqual([{ icon: "check", text: "Fast" }]);
		expect(m.buttons).toEqual([{ text: "Buy", url: "/go/x/", style: "primary", icon: "none", className: "a", rel: "", sponsored: true, region: "in", asin: "B0PBXTEST1" }]);
	});

	it("prefers the direct image URL, then the picked image, and ignores attachment IDs", () => {
		expect(normalizeBlock({ _type: "productBox", pb_title: "Hub", pb_image: "/media/hub.webp", pb_image_url: "https://cdn.test/a.jpg" }).image).toEqual({ src: "https://cdn.test/a.jpg", alt: "Hub" });
		expect(normalizeBlock({ _type: "productBox", pb_image: { src: "/media/hub.webp", alt: "USB hub", width: 800, height: 600 } }).image).toEqual({ src: "/media/hub.webp", alt: "USB hub", width: 800, height: 600 });
		expect(normalizeBlock({ _type: "productBox", pb_image: "/media/hub.webp", pb_image_alt: "Front view" }).image?.alt).toBe("Front view");
		expect(normalizeBlock({ _type: "productBox", pb_image: 48213 }).image).toBeNull();
	});

	it("takes the ASIN from a product URL and defaults the marketplace to US", () => {
		expect(normalizeBlock({ _type: "productBox", pb_asin: "https://www.amazon.in/dp/B0PBXTEST1/ref=x", pb_marketplace: "in" }).amazon).toEqual({ asin: "B0PBXTEST1", marketplace: "in" });
		expect(normalizeBlock({ _type: "productBox", pb_asin: "b0pbxtest1", pb_marketplace: "de" }).amazon).toEqual({ asin: "B0PBXTEST1", marketplace: "us" });
		expect(normalizeAsin("not an asin")).toBe("");
		expect(normalizeAsin("https://www.amazon.com/gp/product/B004YAVF8I?th=1")).toBe("B004YAVF8I");
	});

	it("reads ACF true_false strings", () => {
		expect([flag("1"), flag("0"), flag(""), flag(undefined, true), flag(0), flag("true")]).toEqual([true, false, false, true, false, true]);
	});
});

describe("amazonRefs", () => {
	it("lists the box ASIN and URL-less regional buttons, once each", () => {
		const refs = amazonRefs({
			_type: "productBox",
			pb_asin: "B0PBXTEST1",
			pb_buttons: [
				{ pb_cta_text: "Amazon US", pb_cta_region: "us" },
				{ pb_cta_text: "Amazon India", pb_cta_region: "in" },
				{ pb_cta_text: "Amazon India (other)", pb_cta_region: "in", pb_cta_asin: "B0PBXIN001" },
				{ pb_cta_text: "Managed link", pb_cta_url: "/go/x/", pb_cta_region: "in", pb_cta_asin: "B0PBXIN002" },
			],
		});
		expect(refs).toEqual([
			{ asin: "B0PBXTEST1", marketplace: "us" },
			{ asin: "B0PBXTEST1", marketplace: "in" },
			{ asin: "B0PBXIN001", marketplace: "in" },
		]);
	});

	it("is empty when live data is off", () => {
		expect(amazonRefs({ _type: "productBox", pb_asin: "B0PBXTEST1", pb_live: false })).toEqual([]);
	});
});

describe("fromAcfBlock", () => {
	it("unpacks a WordPress ACF block into the EmDash block", () => {
		const block = fromAcfBlock(fixture.attrs);
		expect(block._type).toBe("productBox");
		expect(block.pb_image).toBeUndefined();
		expect(Object.keys(block).some((k) => k.startsWith("_pb") || /_\d+_/.test(k))).toBe(false);
		expect(block.pb_features).toEqual([{ pb_feature_text: "49-Inch Class Super wide 32:9 LED monitor" }, { pb_feature_text: "1800R curved VA screen for immersive viewing" }]);
		expect(block.pb_buttons?.[0]).toEqual({
			pb_cta_text: "Grab This",
			pb_cta_url: "/go/philips-499p9h/",
			pb_cta_style: "amazon-yellow",
			pb_cta_icon: "amazon",
			pb_cta_class: "",
			pb_cta_rel: "nofollow sponsored",
		});
		expect(block).toMatchObject({ className: "is-style-top-image", anchor: "best-monitor", align: "wide", pb_title_tag: "h3" });

		const m = normalizeBlock(block);
		expect(m).toMatchObject({
			layout: "top-image",
			title: 'PHILIPS Brilliance 49" SuperWide Curved Monitor',
			titleTag: "h3",
			rating: 4.5,
			rank: 1,
			score: 9.2,
			showSavings: true,
			ctaEmphasis: true,
			btnArrow: true,
			btnShine: "hover",
			newTab: false,
			spotlight: true,
			accent: "#f97316",
			imageRatio: "16-9",
			align: "wide",
			anchor: "best-monitor",
			perks: [{ icon: "truck", text: "Free shipping" }],
			specs: ["5120×1440"],
		});
		expect(m.image?.src).toBe("https://gauravtiwari.org/wp-content/uploads/2026/10/philips-499p9h.webp");
		expect(m.buttons.map((b) => b.style)).toEqual(["amazon-yellow", "secondary"]);
	});

	it("accepts bare data with repeaters already as arrays", () => {
		expect(fromAcfBlock({ pb_title: "X", pb_features: [{ pb_feature_text: "A" }] })).toEqual({ _type: "productBox", pb_title: "X", pb_features: [{ pb_feature_text: "A" }] });
	});
});
