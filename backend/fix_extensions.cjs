const fs = require('fs');
const path = require('path');

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (p.endsWith('.ts')) {
      let content = fs.readFileSync(p, 'utf8');
      const newContent = content.replace(/from\s+['"]([^'"]+)\.ts['"]/g, "from '$1.js'");
      if (content !== newContent) {
        fs.writeFileSync(p, newContent);
        console.log('Updated ' + p);
      }
    }
  }
}

walk('src');
