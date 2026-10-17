import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixe la racine du projet : sans cela, un package-lock.json oublié dans un dossier parent
  // (ex. C:\Users\<toi>\package-lock.json) fait deviner à Next/Turbopack une mauvaise racine
  // et peut provoquer des chunks 404 et des erreurs de rechargement à chaud.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
