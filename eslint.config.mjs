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
      // Cada regra nova com violações começa em "warn", com a contagem medida na
      // instalação (22/10/2026) como baseline. A migração termina quando a contagem
      // chega a zero e a regra volta para "error". Não aumente o teto de linhas.
      //
      // Baseline: 7 arquivos acima de 350 linhas.
      "quality/max-lines": ["warn", { max: 350 }],
      // Baseline: 9 chamadas de console → 0 (todas passam por src/lib/log.ts).
      "quality/no-direct-console": ["warn", { logger: "log.info() / log.erro() de @/lib/log" }],
      // Baseline: 33 imports do cliente do banco (@/lib/db: db, q, q1, tx) em 32 arquivos
      // de src/app (páginas, rotas e ações consultam o banco direto). Alvo: passar por
      // funções de src/lib (repositórios/serviços).
      "quality/no-direct-data-access": [
        "warn",
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
