// Lint rápido (sem informação de tipos). As regras que precisam do type checker
// ficam em eslint.typed.config.mjs, com script próprio (npm run lint:typed).
//
// Base: a configuração do Next (core-web-vitals + typescript), que já existia.
// Em cima dela, os 3 "quality gates" do vibe-coding-toolkit (eslint-rules/*.cjs,
// copiados sem alteração): teto de linhas por arquivo, sem console direto e sem
// acesso direto ao banco nas camadas de apresentação.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import quality from "./eslint-rules/index.cjs";

const testFiles = [
  "**/*{.,-}{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  "**/{__tests__,__mocks__,fixtures,mocks}/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
    plugins: { quality },
    rules: {
      // As três regras começaram em "warn" com baseline medido na instalação (22/10/2026:
      // 7 arquivos grandes, 9 consoles, 33 imports do banco em src/app). Zeradas no mesmo
      // dia e promovidas a "error": violação nova quebra o lint. Não aumente o teto de linhas.
      "quality/max-lines": ["error", { max: 350 }],
      // Logs do servidor passam por src/lib/log.ts (único arquivo liberado, bloco abaixo).
      "quality/no-direct-console": ["error", { logger: "log.info() / log.erro() de @/lib/log" }],
      // Páginas, rotas e server actions não importam @/lib/db: consultas ficam em
      // src/lib/consultas (leitura) e src/lib/repositorios (gravação), sempre por empresa.
      "quality/no-direct-data-access": [
        "error",
        {
          modules: ["@/lib/db"],
          bindings: ["db", "q", "q1", "tx"],
          layers: ["/src/app/", "/src/components/"],
          extensions: [".tsx"],
        },
      ],
    },
  },
  {
    // O adaptador de log É o wrapper do console. Este bloco fica DEPOIS do que liga a
    // regra: no flat config o último bloco que casa com o arquivo vence.
    files: ["src/lib/log.ts"],
    rules: {
      "quality/no-direct-console": "off",
    },
  },
  {
    // Mesmo teto para arquivos de teste, como aviso. Fica DEPOIS do bloco acima
    // (no flat config o último bloco que casa com o arquivo vence).
    files: testFiles,
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: 350, includeTests: true }],
    },
  },
  {
    files: ["eslint-rules/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "readonly", require: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  globalIgnores([
    // Ignorados padrão do eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Deste projeto:
    ".data/**", // banco PGlite local
    "e2e/capturas/**",
    "coverage/**",
    "**/*.tsbuildinfo",
    ".claude/**",
  ]),
]);

export default eslintConfig;
