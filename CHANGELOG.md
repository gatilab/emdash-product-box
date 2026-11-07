# Changelog

## 0.1.0 (unreleased)

First release: an EmDash port of the ACF Blocks Product Box, with live Amazon pricing.

- `productBox` Portable Text block with every ACF field (image, title and link, rating, features, spec chips, description, label, badge, rank, score ring, verdict, prices, savings, price-checked date, perks, buttons, emphasis, arrow, shine, new tab, disclosure, spotlight, accent color, image fit and frame, layouts), stored under the ACF field names.
- Astro renderer that reproduces `product-box.php`'s markup and classes, and the block's CSS with fallback tokens and dark defaults.
- Buttons accept any URL, including `/go/` managed links, with a per-button "sponsored" option (`rel="sponsored nofollow"`) and a region (US or India) that fills the URL from the cached Amazon affiliate link.
- Optional ASIN and marketplace per box. ASINs are tracked from saved content, from rendered boxes (sealed lookups) and from the admin, and refreshed through the Amazon Creators API into plugin storage every 15 minutes as they fall due.
- Fresh cached prices, ratings and availability win over the manual fields; stale data (older than 24 hours by default) falls back to them.
- "Amazon products" admin page: tracked ASINs, status, last refresh, per-row and bulk refresh, manual tracking.
- Product JSON-LD with Offer and, when a rating count is shown, AggregateRating.
- `fromAcfBlock()` to convert blocks exported from WordPress.
