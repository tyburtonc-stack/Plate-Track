const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

  const manifestSrc = path.join(__dirname, 'manifest.json');
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, path.join(docsDir, 'manifest.json'));
  }

  // Stamp the service worker cache with a hash of the built app so each deploy busts the cache.
  const hash = crypto.createHash('sha256');
  for (const name of ['index.html', 'pt.css', 'manifest.json']) {
    const f = path.join(docsDir, name);
    if (fs.existsSync(f)) hash.update(fs.readFileSync(f));
  }
  const version = hash.digest('hex').slice(0, 10);
  const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8')
    .replace(/const CACHE_NAME = '[^']*';/, `const CACHE_NAME = 'platetrack-${version}';`);
  fs.writeFileSync(path.join(docsDir, 'sw.js'), sw, 'utf8');

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
