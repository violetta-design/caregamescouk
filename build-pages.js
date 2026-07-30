// build-pages.js
// Reads pages.json and automatically rebuilds:
//   1. The "Guides & Activities" and "Carer Stories" sections in index.html
//   2. sitemap.xml
//
// Runs automatically as part of the Netlify build step. No manual editing
// of index.html or sitemap.xml needed after this is set up — just add a new
// entry to pages.json when publishing a new page.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SITE_URL = 'https://caregames.co.uk';

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function writeText(file, content) {
  fs.writeFileSync(path.join(ROOT, file), content, 'utf8');
}

function buildLinkList(items, kind) {
  const label = kind === 'story' ? 'read the story' : 'read the guide';
  return items
    .map(item => `  <p><a href="/${item.file}">${item.title} — ${label}</a></p>`)
    .join('\n');
}

function replaceBetweenMarkers(content, startMarker, endMarker, newInner) {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(
      `Could not find markers "${startMarker}" / "${endMarker}" in index.html. ` +
      `Automation cannot run until these markers are added once.`
    );
  }

  const before = content.slice(0, startIdx + startMarker.length);
  const after = content.slice(endIdx);

  return `${before}\n${newInner}\n${after}`;
}

function buildIndexHtml(manifest) {
  let content = readText('index.html');

  const guidesHtml = buildLinkList(manifest.guides, 'guide');
  content = replaceBetweenMarkers(
    content,
    '<!-- GUIDES_START -->',
    '<!-- GUIDES_END -->',
    guidesHtml
  );

  const storiesHtml = buildLinkList(manifest.stories, 'story');
  content = replaceBetweenMarkers(
    content,
    '<!-- STORIES_START -->',
    '<!-- STORIES_END -->',
    storiesHtml
  );

  writeText('index.html', content);
}

function buildSitemap(manifest) {
  const allPages = [...manifest.guides, ...manifest.stories];

  const urlEntries = allPages
    .map(item => `<url>\n<loc>${SITE_URL}/${item.file}</loc>\n</url>`)
    .join('\n');

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
<loc>${SITE_URL}/</loc>
<priority>1.0</priority>
</url>
${urlEntries}
</urlset>
`;

  writeText('sitemap.xml', xml);
}

function main() {
  const manifest = readJSON('pages.json');
  buildIndexHtml(manifest);
  buildSitemap(manifest);
  console.log(
    `Build complete: ${manifest.guides.length} guides, ${manifest.stories.length} stories.`
  );
}

main();
