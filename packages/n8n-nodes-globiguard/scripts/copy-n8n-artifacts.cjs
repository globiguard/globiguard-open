const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..");
const sourceIcon = path.join(packageRoot, "src", "nodes", "GlobiGuard", "globiguard.svg");

const nodeNames = [
  "GlobiGuard",
  "GlobiGuardDetect",
  "GlobiGuardAiAgent",
  "GlobiGuardObserve"
];

for (const name of nodeNames) {
  const targetDir = path.join(packageRoot, "dist", "nodes", name);
  const targetIcon = path.join(targetDir, "globiguard.svg");
  if (fs.existsSync(sourceIcon)) {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(sourceIcon, targetIcon);
  }
}
