const fs = require('fs');
const path = require('path');
const { minify } = require('html-minifier-terser');

const SPLIT_THRESHOLD = 275000;

async function build() {
  const srcPath = path.join(__dirname, 'index.html');
  const html = fs.readFileSync(srcPath, 'utf8');

  let minified = await minify(html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: { format: { ascii_only: true } },
  });

  const docsDir = path.join(__dirname, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });

  const minifiedBytes = Buffer.byteLength(minified, 'utf8');
  if (minifiedBytes > SPLIT_THRESHOLD) {
    const styleMatch = minified.match(/<style>([\s\S]*?)<\/style>/);
    if (styleMatch) {
      fs.writeFileSync(path.join(docsDir, 'pt.css'), styleMatch[1], 'utf8');
      minified = minified.replace(
        /<style>[\s\S]*?<\/style>/,
        '<link rel="stylesheet" href="pt.css">'
      );
      console.log('Split: extracted <style> block into docs/pt.css');
    }
  }

  fs.writeFileSync(path.join(docsDir, 'index.html'), minified, 'utf8');

  const assetsSrc = path.join(__dirname, 'assets');
  const assetsDest = path.join(docsDir, 'assets');
  if (fs.existsSync(assetsSrc)) {
    fs.cpSync(assetsSrc, assetsDest, { recursive: true });
  }

  for (const name of ['manifest.json', 'sw.js']) {
    const from = path.join(__dirname, name);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(docsDir, name));
    }
  }

  for (const name of fs.readdirSync(docsDir)) {
    const full = path.join(docsDir, name);
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      console.log(`docs/${name}: ${stat.size} bytes`);
    }
  }
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
