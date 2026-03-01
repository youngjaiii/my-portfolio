import { readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const root = "./dist";

function fixImports(dir) {
  const files = readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      fixImports(fullPath);
      continue;
    }

    if (!file.name.endsWith(".js")) continue;

    let content = readFileSync(fullPath, "utf8");

    // import "./routes/payout.route" → "./routes/payout.route.js"
    // import "../lib/utils" → "../lib/utils.js"
    // import ... from "./routes/payout.route" → import ... from "./routes/payout.route.js"
    // 큰따옴표와 작은따옴표 모두 처리
    // from 키워드가 있는 import 문 처리
    content = content.replace(/from\s+["'](.+?)["']/g, (match, p1) => {
      if (
        (p1.startsWith("./") || p1.startsWith("../")) &&
        !p1.endsWith(".js") &&
        !p1.endsWith(".json") &&
        !p1.endsWith(".mjs") &&
        !p1.endsWith(".cjs")
      ) {
        const quote = match.includes("'") ? "'" : '"';
        return match.replace(p1, `${p1}.js`);
      }
      return match;
    });
    
    // import ... from 없이 직접 import하는 패턴 처리
    // import "./routes/payout.route" → import "./routes/payout.route.js"
    content = content.replace(/import\s+["'](.+?)["']/g, (match, p1) => {
      if (
        (p1.startsWith("./") || p1.startsWith("../")) &&
        !p1.endsWith(".js") &&
        !p1.endsWith(".json") &&
        !p1.endsWith(".mjs") &&
        !p1.endsWith(".cjs") &&
        !match.includes(" from ") // from이 있는 경우는 이미 위에서 처리됨
      ) {
        const quote = match.includes("'") ? "'" : '"';
        return match.replace(p1, `${p1}.js`);
      }
      return match;
    });

    // export ... from 패턴도 처리
    content = content.replace(/export\s+.+\s+from\s+["'](.+?)["']/g, (match, p1) => {
      if (
        (p1.startsWith("./") || p1.startsWith("../")) &&
        !p1.endsWith(".js") &&
        !p1.endsWith(".json") &&
        !p1.endsWith(".mjs") &&
        !p1.endsWith(".cjs")
      ) {
        return match.replace(p1, `${p1}.js`);
      }
      return match;
    });

    // 동적 import도 처리
    content = content.replace(/import\(["'](.+?)["']\)/g, (match, p1) => {
      if (
        (p1.startsWith("./") || p1.startsWith("../")) &&
        !p1.endsWith(".js") &&
        !p1.endsWith(".json") &&
        !p1.endsWith(".mjs") &&
        !p1.endsWith(".cjs")
      ) {
        const quote = match.includes("'") ? "'" : '"';
        return `import(${quote}${p1}.js${quote})`;
      }
      return match;
    });

    writeFileSync(fullPath, content);
  }
}

fixImports(root);

console.log("✨ All import extensions fixed!");
