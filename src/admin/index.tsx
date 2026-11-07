/**
 * Product Box admin entry (`@gatilab/emdash-product-box/admin`).
 * Page keys are paths under /_emdash/admin/plugins/product-box, matching
 * `admin.pages` in the plugin definition. Settings are EmDash's
 * auto-generated page (settingsSchema), linked from the products page.
 */
import type { PluginAdminExports } from "emdash";

import { ProductsPage } from "./ProductsPage.js";

export const pages: PluginAdminExports["pages"] = {
	"/": ProductsPage,
};
