# @gatilab/emdash-product-box

A product box for [EmDash](https://github.com/emdash-cms/emdash): image, rating, features, spec chips, pricing, regional buy buttons and Product JSON-LD, with optional live Amazon pricing (US and India) through the Amazon Creators API.

It's a port of the ACF Blocks **Product Box** for WordPress. Field names, markup and CSS classes carry over, so imported blocks open with their values in place and theme styles written for the WordPress block keep working.

## Install

```sh
pnpm add @gatilab/emdash-product-box
```

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { productBox } from "@gatilab/emdash-product-box";

export default defineConfig({
	integrations: [emdash({ plugins: [productBox()] })],
});
```

EmDash picks up the editor block, the renderer (`componentsEntry`) and the admin page from the descriptor. Requires EmDash 1.4+, Astro 7, and `EMDASH_ENCRYPTION_KEY` (EmDash needs it for secret settings anyway).

To render a box outside Portable Text:

```astro
---
import { ProductBox } from "@gatilab/emdash-product-box/astro";
---
<ProductBox node={{ _type: "productBox", pb_title: "USB-C Hub", pb_current_price: "$24.50" }} />
```

## The block

Type `productBox`, label "Product box", in the "Affiliate" slash-menu category. Every ACF field is there under its ACF name:

| Group | Fields |
|---|---|
| Product | `pb_image` (media library), `pb_image_alt`, `pb_image_url`, `pb_title`, `pb_title_url`, `pb_title_rel`, `pb_title_tag`, `pb_rating`, `pb_rating_count`, `pb_features[]`, `pb_specs[]`, `pb_description`, `pb_brand` |
| Highlights | `pb_label`, `pb_badge_text`, `pb_badge_color`, `pb_rank`, `pb_score`, `pb_score_max`, `pb_score_label`, `pb_verdict`, `pb_verdict_label` |
| Amazon | `pb_asin`, `pb_marketplace` (`us` or `in`), `pb_live` |
| Price & buttons | `pb_original_price`, `pb_discount_percent`, `pb_current_price`, `pb_currency`, `pb_price_note`, `pb_show_savings`, `pb_price_checked`, `pb_perks[]`, `pb_buttons[]`, `pb_cta_emphasis`, `pb_btn_arrow`, `pb_btn_shine`, `pb_new_tab`, `pb_disclosure` |
| Display | `pb_layout` (image left, top image, no image), `pb_box_style`, `pb_accent_color`, `pb_image_fit`, `pb_image_ratio`, `pb_schema` |

New in EmDash: `pb_image_alt` (a media picker stores only a URL), `pb_brand` and `pb_currency` (structured data), `pb_layout` (WordPress used block style variations; `className: "is-style-top-image"` still works), the Amazon fields, and three button sub-fields.

### Buttons

Each button takes any URL: a full URL, a root-relative path, or a `/go/slug/` managed link from a link manager such as the planned `@gatilab/emdash-link-manager`. There is no dependency on one; the box just links.

- **Sponsored link** adds `rel="sponsored nofollow"`. The free-text rel field still works too.
- **Region** (`us`, `in`) marks a regional button, e.g. "Buy on Amazon US" and "Buy on Amazon India" side by side, each with its own label. Leave the URL empty and the button uses the cached Amazon affiliate link for that marketplace and the box's ASIN, or the button's own **ASIN** when the India listing differs. Filled-in Amazon links are always marked sponsored. A button with no URL and nothing cached isn't shown, as in WordPress.

### Images

Pick product images from the media library. `pb_image_url` exists for parity with WordPress and overrides the picked image; keep it pointed at your own storage.

When a box has an ASIN but no image of its own, it falls back to the Amazon image URL from the cache. That's a fallback, not a plan: Amazon image URLs change, they're served only while the cache is fresh, and a box whose cache goes stale loses the image and drops to the no-image layout. The server never downloads Amazon images.

## Live Amazon pricing

### Setup

1. Create Creators API credentials at [affiliate-program.amazon.com/creatorsapi](https://affiliate-program.amazon.com/creatorsapi), one set per marketplace. India needs its own set; US credentials can't read Amazon.in.
2. In **Plugins → Product box → Settings**, fill in the partner tag, credential ID and secret for each marketplace you use. ID and secret are encrypted secret settings. No route returns them and they're never written to storage or logs.
3. Add an ASIN (or paste an Amazon product URL) to a box and save.

Amazon only serves the API to accounts with at least 10 qualifying sales in the trailing 30 days, scored per marketplace and re-checked continuously. Below that, every call returns `403 AssociateNotEligible` (also for up to 48 hours after creating a credential). New credentials don't fix it. The admin page shows the error and boxes keep their manual prices.

### How it works

- **Tracking.** An ASIN gets tracked when a saved entry contains a box that uses it (`content:afterSave` hook, any collection, nested blocks included), when a box renders for an ASIN that isn't tracked yet, or when you add it on the admin page.
- **Refreshing.** A cron task runs every 15 minutes and refreshes rows that are due, oldest first: up to 50 ASINs per run, 10 per `getItems` call, per marketplace. A row is due again after **Refresh every** hours (default 12). Failures keep the last good data and back off from 15 minutes. Missing ASINs are retried daily, missing credentials hourly.
- **Rendering.** The renderer reads the cache in-process through EmDash's public route dispatcher. It never calls Amazon while a page renders.
- **Cache window.** Amazon's terms expect displayed prices to be no older than 24 hours. Cached data older than **Show live data for** hours (default and maximum 24) isn't shown. The box falls back to its manual fields. Live prices show a "Price checked 7 Nov 2026, 11:00 UTC" line with the fetch time.

### Which value wins

| Field | Fresh cache | No or stale cache |
|---|---|---|
| Current price, original price, discount, savings | Amazon (manual discount cleared if Amazon shows none) | Manual |
| Rating and count, availability | Amazon | Manual |
| Price checked | Fetch time | `pb_price_checked` |
| Title, image, brand | Manual; Amazon only if empty | Manual |
| Features, specs, description, verdict | Manual | Manual |
| Title link, regional button URLs | Manual; Amazon affiliate URL if empty (from any cached row) | Same |

Turn **Use live Amazon data** off on a box to ignore Amazon entirely.

### Admin

**Plugins → Amazon products** lists tracked ASINs with marketplace, title, cached price, status (OK, Pending, Error, Not found), last and next refresh, the last error, and where the ASIN was last seen. Refresh a row, refresh what's due, refresh everything (the first 50 run now, the rest over the next cron runs), stop tracking, or track an ASIN by hand. A banner says which marketplaces are missing credentials.

### Network access

The plugin declares `network:request` with `allowedHosts: ["api.amazon.com", "creatorsapi.amazon"]`: the Login with Amazon token endpoint and the Creators API. Nothing else.

## Structured data

Each box with `pb_schema` on (the default) emits Product JSON-LD:

- `Offer` with price, ISO currency, availability (from Amazon) and the box's link. Manual prices are parsed ("$927.58", "₹1,29,999"); set `pb_currency` when the symbol is ambiguous.
- `AggregateRating` when the box shows a rating and a rating count. Google rejects one without a count, so a bare star rating isn't emitted.
- No JSON-LD without a title, or without either an offer or a rating.

Ratings copied from Amazon are third-party ratings, and Google's review snippet guidelines discourage marking those up. Switch **Include ratings in structured data** off if that's a concern for your site.

## Product box or product review?

`@gatilab/emdash-content-blocks` has a `productReview` block. They do different jobs:

- **Product box** (this package) is a buying unit: a listing for an affiliate page, roundup or deal post. It has prices, regional buy buttons, badges, a rank and live Amazon data, and its schema is Product with Offer and the product's own aggregate rating.
- **Product review** is your editorial verdict: feature-by-feature ratings, pros and cons, a byline, and Product or SoftwareApplication schema with a single `Review`.

Use the review block for your opinion and the product box for where to buy. On one page, keep structured data on only one of the two for the same product.

## Moving from WordPress

`fromAcfBlock()` converts an ACF Product Box as WordPress stores it (the block's `attrs`, or just its `data`): it unpacks ACF's flattened repeaters (`pb_features_0_pb_feature_text`), drops the `_pb_*` field-key references, and keeps `className`, `anchor` and `align`.

```ts
import { fromAcfBlock } from "@gatilab/emdash-product-box";

const node = fromAcfBlock(wordpressBlock.attrs); // { _type: "productBox", pb_title: …, pb_buttons: [ … ] }
```

An image picked from the WordPress media library is stored as an attachment ID, which means nothing in EmDash. Move the image into the EmDash media library and set `pb_image` to its URL. Blocks that used `pb_image_url` carry over as they are.

## Styling

`@gatilab/emdash-product-box/styles/product-box.css` loads with the component. It's the WordPress block's stylesheet with the same classes. Colors come from the ACF Blocks tokens (`--acfb-*`) when your theme defines them, else from built-in light defaults, with dark defaults under `.dark` or `[data-theme="dark"]`. Override any `--pb-*` variable on `.acf-product-box` for finer control. Button icons use `md-icon-*` classes, as in WordPress; supply an icon font or style them yourself.

## Development

```sh
pnpm install
pnpm typecheck   # tsc + astro check
pnpm test        # vitest: field mapping, prices, Creators API parsing (fixtures, mocked fetch), cache precedence, refresh, routes, JSON-LD, rendering
```

Tests never call Amazon. The fixtures in `tests/fixtures/` are synthetic, shaped like the verified Creators API contract.

## License

MIT © 2026 Gatilab
