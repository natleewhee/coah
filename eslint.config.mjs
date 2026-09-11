import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Every remaining `react-hooks/set-state-in-effect` finding in these
    // client components is one of two deliberate patterns, not an
    // oversight: (1) a post-mount read of localStorage/sessionStorage,
    // which does not exist during SSR and so cannot move into a lazy
    // useState initializer without crashing the server render; or (2) a
    // "Saved" flash indicator whose state intentionally lags a write's
    // success/failure and is not part of the render output it's synced
    // from. `ProfileSwitcher` uses `useSyncExternalStore` instead and
    // needs no exception. Replaces every scattered inline
    // eslint-disable for the rule (see docs/plans/2026-08-30 U6).
    files: [
      "src/app/**/page.js",
      "src/components/drive/CarPicker.js",
      "src/components/ledger/CapacityModule.js",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
