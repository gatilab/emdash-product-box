/**
 * Astro renderers. EmDash imports `blockComponents` from this module (the
 * descriptor's `componentsEntry`) and merges it into `<PortableText>`; the
 * key matches the stored `_type`.
 *
 * ```astro
 * ---
 * import { ProductBox } from "@gatilab/emdash-product-box/astro";
 * ---
 * <ProductBox node={{ _type: "productBox", pb_title: "PHILIPS Brilliance 49\"", pb_asin: "B0…" }} />
 * ```
 */
import ProductBox from "./ProductBox.astro";

export { ProductBox };
export { emptyLive, loadLive, type LiveData } from "./live.js";

export const blockComponents = {
	productBox: ProductBox,
} as const;
