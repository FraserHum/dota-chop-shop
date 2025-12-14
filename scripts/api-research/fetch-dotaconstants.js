/**
 * Script to inspect the dotaconstants npm package data
 * 
 * dotaconstants: https://github.com/odota/dotaconstants
 * - NPM package maintained by OpenDota team
 * - Contains pre-built JSON files with game constants
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'responses');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'dotaconstants-items.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

try {
  // Load items from dotaconstants package
  const items = require('dotaconstants/build/items.json');
  const itemCount = Object.keys(items).length;
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2));
  console.log(`Success! Saved ${itemCount} items to ${OUTPUT_FILE}`);
  
  // Print first few item keys as preview
  const keys = Object.keys(items).slice(0, 10);
  console.log(`\nFirst 10 item keys: ${keys.join(', ')}`);
  
  // Also save item abilities if available
  try {
    const itemAbilities = require('dotaconstants/build/item_ids.json');
    const idsFile = path.join(OUTPUT_DIR, 'dotaconstants-item-ids.json');
    fs.writeFileSync(idsFile, JSON.stringify(itemAbilities, null, 2));
    console.log(`\nAlso saved item IDs to ${idsFile}`);
  } catch (e) {
    console.log('\nNo item_ids.json available');
  }
  
} catch (err) {
  console.error('Failed to load dotaconstants:', err.message);
  console.log('\nMake sure to run: npm install dotaconstants');
}
