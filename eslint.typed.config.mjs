// Type-aware lint tier, deliberately kept OUT of eslint.config.mjs. Turning
// on projectService means ESLint builds a full TypeScript program, which on
// a large codebase is slow enough to break a pre-commit hook and heavy
// enough to exhaust the heap on a small CI runner.
//
// Two config files and two npm scripts (`lint` and `lint:typed`), rather
// than one config branching on process.env.CI: branching makes local and CI
// behavior diverge silently for identical code, and reading process.env
// inside a flat config file trips that config's own no-undef rule.
import defaultConfig from "./eslint.config.mjs";

// Parser e plugin @typescript-eslint já vêm do eslint-config-next/typescript
// (importado em eslint.config.mjs); aqui só se liga o projectService.

const typedConfig = [
  ...defaultConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Advanced legacy adoption: measure violation counts, runtime and memory.
      // Promote each rule only once clean; new Next projects use next.typed instead.
      // Medição em 22/10/2026: ~20 s e ~0,9 GB de pico de memória (fora do lint rápido e do CI).
      "@typescript-eslint/no-floating-promises": "warn", // baseline 22/10/2026: 11
      "@typescript-eslint/no-misused-promises": "warn", // baseline 22/10/2026: 26
      "@typescript-eslint/no-unsafe-assignment": "warn", // baseline 22/10/2026: 2
      "@typescript-eslint/no-unsafe-member-access": "warn", // baseline 22/10/2026: 11
      "@typescript-eslint/no-unsafe-call": "error", // limpo na instalação → error
      "@typescript-eslint/no-unsafe-return": "error", // limpo na instalação → error
      "@typescript-eslint/no-unsafe-argument": "warn", // baseline 22/10/2026: 9
      "@typescript-eslint/only-throw-error": "error", // limpo na instalação → error
      "@typescript-eslint/return-await": ["error", "in-try-catch"], // limpo na instalação → error
      "@typescript-eslint/await-thenable": "error", // limpo na instalação → error
      "@typescript-eslint/unbound-method": "error", // limpo na instalação → error
      "@typescript-eslint/restrict-template-expressions": "error", // limpo na instalação → error
      "@typescript-eslint/restrict-plus-operands": "error", // limpo na instalação → error
      "@typescript-eslint/require-await": "warn", // baseline 22/10/2026: 2
    },
  },
];

export default typedConfig;
