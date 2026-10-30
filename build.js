const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { minify } = require('html-minifier-terser');

const SPLIT_THRESHOLD = 275000;

// Minify one page into outDir, moving the <style> block into pt.css when the page is large.
async function buildPage(html, outDir) {
  let minified = await minify(html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: { format: { ascii_only: true } },
  });

  fs.mkdirSync(outDir, { recursive: true });

  const minifiedBytes = Buffer.byteLength(minified, 'utf8');
  if (minifiedBytes > SPLIT_THRESHOLD) {
    const styleMatch = minified.match(/<style>([\s\S]*?)<\/style>/);
    if (styleMatch) {
      fs.writeFileSync(path.join(outDir, 'pt.css'), styleMatch[1], 'utf8');
      minified = minified.replace(
        /<style>[\s\S]*?<\/style>/,
        '<link rel="stylesheet" href="pt.css">'
      );
      console.log(`Split: extracted <style> block into ${path.relative(__dirname, outDir)}/pt.css`);
    }
  }

  fs.writeFileSync(path.join(outDir, 'index.html'), minified, 'utf8');

  const assetsSrc = path.join(__dirname, 'assets');
  if (fs.existsSync(assetsSrc)) {
    fs.cpSync(assetsSrc, path.join(outDir, 'assets'), { recursive: true });
  }
}

// v2 (job-first layout) is the current app plus the files in v2/, served at /Plate-Track/v2/.
// The current app's source is not changed, so it keeps working at /Plate-Track/ as before.
function v2Html(html) {
  const v2Dir = path.join(__dirname, 'v2');
  const css = fs.readFileSync(path.join(v2Dir, 'jobfirst.css'), 'utf8');
  const js = fs.readFileSync(path.join(v2Dir, 'jobfirst.js'), 'utf8');
  const out = html
    .replace('<link rel="manifest" href="/Plate-Track/manifest.json">', '<link rel="manifest" href="/Plate-Track/v2/manifest.json">')
    .replace('<meta name="apple-mobile-web-app-title" content="PlateTrack">', '<meta name="apple-mobile-web-app-title" content="PlateTrack v2">')
    .replace('<title>PlateTrack</title>', '<title>PlateTrack v2</title>')
    .replace('</style>', () => css + '\n</style>')
    .replace(/<\/body>(?![\s\S]*<\/body>)/, () => '<script>\n' + js + '\n</script>\n</body>');
  if (!out.includes('/Plate-Track/v2/manifest.json') || !out.includes('rJobsHome')) {
    throw new Error('v2 build: index.html no longer has the tags build.js looks for');
  }
  return out;
}

async function build() {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const docsDir = path.join(__dirname, 'docs');
  const v2Out = path.join(docsDir, 'v2');

  await buildPage(html, docsDir);
  await buildPage(v2Html(html), v2Out);

  const manifestSrc = path.join(__dirname, 'manifest.json');
  fs.copyFileSync(manifestSrc, path.join(docsDir, 'manifest.json'));
  const manifest = JSON.parse(fs.readFileSync(manifestSrc, 'utf8'));
  Object.assign(manifest, {
    name: 'PlateTrack v2',
    short_name: 'PlateTrack v2',
    start_url: '/Plate-Track/v2/',
    scope: '/Plate-Track/v2/',
  });
  fs.writeFileSync(path.join(v2Out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // Stamp the service worker cache with a hash of both built apps so each deploy busts the cache.
  const hash = crypto.createHash('sha256');
  for (const dir of [docsDir, v2Out]) {
    for (const name of ['index.html', 'pt.css', 'manifest.json']) {
      const f = path.join(dir, name);
      if (fs.existsSync(f)) hash.update(fs.readFileSync(f));
    }
  }
  const version = hash.digest('hex').slice(0, 10);
  const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8')
    .replace(/const CACHE_NAME = '[^']*';/, `const CACHE_NAME = 'platetrack-${version}';`);
  fs.writeFileSync(path.join(docsDir, 'sw.js'), sw, 'utf8');

  for (const dir of [docsDir, v2Out]) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isFile()) {
        console.log(`${path.relative(__dirname, full)}: ${fs.statSync(full).size} bytes`);
      }
    }
  }
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
