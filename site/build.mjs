// Génère le site statique (dist/) : page d'accueil + résumé détaillé (resume.md → resume.html).
// Tous les liens sont relatifs : le site fonctionne sous https://<utilisateur>.github.io/<dépôt>/.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { marked } from "marked";

const repo = process.env.GITHUB_REPOSITORY || "OWNER/fleetdesk";
const repoUrl = `https://github.com/${repo}`;
const appUrl = (process.env.APP_URL || "").trim();

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const appLink = appUrl
  ? `<a class="btn primary" href="${esc(appUrl)}">Ouvrir l'application</a>`
  : `<span class="btn off" title="Définis la variable APP_URL du dépôt après le déploiement Vercel">Application : à déployer</span>`;

const fill = (html) =>
  html.replaceAll("{{REPO_URL}}", esc(repoUrl)).replaceAll("{{APP_LINK}}", appLink).replaceAll("{{REPO}}", esc(repo));

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

const css = readFileSync("style.css", "utf8");
const home = readFileSync("index.template.html", "utf8").replace("/*CSS*/", css);
writeFileSync("dist/index.html", fill(home));

marked.setOptions({ gfm: true });
const resume = marked.parse(readFileSync("../resume.md", "utf8"));
const page = readFileSync("resume.template.html", "utf8").replace("/*CSS*/", css).replace("{{CONTENT}}", resume);
writeFileSync("dist/resume.html", fill(page));

writeFileSync("dist/.nojekyll", "");
console.log("Site généré dans site/dist (", repoUrl, ")");
