import { getViteConfig } from "astro/config";
import { configDefaults } from "vitest/config";

// getViteConfig lets the render tests compile .astro components through the
// Astro Container API without a host site.
export default getViteConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		// A fixed, test-only key: lookup keys are sealed with EmDash's
		// secret-setting encryption, which needs one.
		env: { EMDASH_ENCRYPTION_KEY: `emdash_enc_v1_${"A".repeat(43)}` },
		exclude: [...configDefaults.exclude],
	},
});
