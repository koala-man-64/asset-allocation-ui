import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const assetsDir = path.join(distDir, 'assets');
const indexHtmlPath = path.join(distDir, 'index.html');

const ENTRY_JS_LIMIT_BYTES = 550_000;
const ASYNC_JS_LIMIT_BYTES = 250_000;
const TOTAL_CSS_LIMIT_BYTES = 190_000;

function readRequiredFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required build artifact is missing: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function getEntryScriptName(indexHtml) {
  const match = indexHtml.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/i);
  if (!match?.[1]) {
    throw new Error('Could not determine the built entry script from dist/index.html');
  }
  return match[1];
}

function listAssetFiles(extension) {
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Assets directory is missing: ${assetsDir}`);
  }

  return fs
    .readdirSync(assetsDir)
    .filter((fileName) => fileName.endsWith(extension))
    .map((fileName) => ({
      fileName,
      filePath: path.join(assetsDir, fileName),
      size: fs.statSync(path.join(assetsDir, fileName)).size
    }));
}

function formatKb(size) {
  return `${(size / 1000).toFixed(2)} kB`;
}

const indexHtml = readRequiredFile(indexHtmlPath);
const entryScriptName = getEntryScriptName(indexHtml);
const jsAssets = listAssetFiles('.js');
const cssAssets = listAssetFiles('.css');

const entryAsset = jsAssets.find((asset) => asset.fileName === entryScriptName);
if (!entryAsset) {
  throw new Error(`Entry asset ${entryScriptName} was not found in dist/assets`);
}

const asyncAssets = jsAssets.filter((asset) => asset.fileName !== entryScriptName);
const largestAsyncAsset = asyncAssets.reduce(
  (largest, asset) => (asset.size > largest.size ? asset : largest),
  {
    fileName: '(none)',
    size: 0
  }
);

const totalCssBytes = cssAssets.reduce((total, asset) => total + asset.size, 0);

const failures = [];

if (entryAsset.size > ENTRY_JS_LIMIT_BYTES) {
  failures.push(
    `Entry JS ${entryAsset.fileName} is ${formatKb(entryAsset.size)} (limit ${formatKb(ENTRY_JS_LIMIT_BYTES)})`
  );
}

if (largestAsyncAsset.size > ASYNC_JS_LIMIT_BYTES) {
  failures.push(
    `Largest async JS ${largestAsyncAsset.fileName} is ${formatKb(largestAsyncAsset.size)} (limit ${formatKb(ASYNC_JS_LIMIT_BYTES)})`
  );
}

if (totalCssBytes > TOTAL_CSS_LIMIT_BYTES) {
  failures.push(
    `Total CSS is ${formatKb(totalCssBytes)} (limit ${formatKb(TOTAL_CSS_LIMIT_BYTES)})`
  );
}

console.log('Bundle budget summary');
console.log(`- entry JS: ${entryAsset.fileName} -> ${formatKb(entryAsset.size)}`);
console.log(
  `- largest async JS: ${largestAsyncAsset.fileName} -> ${formatKb(largestAsyncAsset.size)}`
);
console.log(`- total CSS: ${formatKb(totalCssBytes)}`);

if (failures.length > 0) {
  console.error('Bundle budget check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Bundle budget check passed.');
