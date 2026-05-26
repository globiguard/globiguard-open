const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..");
const sourceIcon = path.join(
  packageRoot,
  "src",
  "nodes",
  "GlobiGuard",
  "globiguard.svg"
);
const targetIcon = path.join(
  packageRoot,
  "dist",
  "nodes",
  "GlobiGuard",
  "globiguard.svg"
);

if (fs.existsSync(sourceIcon)) {
  fs.mkdirSync(path.dirname(targetIcon), { recursive: true });
  fs.copyFileSync(sourceIcon, targetIcon);
}
