import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // arquivos lidos em tempo de execução (schema do banco e binários do PGlite)
  outputFileTracingIncludes: {
    "/**": ["./db/schema.sql", "./node_modules/@electric-sql/pglite/dist/**/*.{wasm,data}"],
  },
  experimental: {
    // importação de clientes: arquivos de até 5 MB (o servidor também valida)
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
