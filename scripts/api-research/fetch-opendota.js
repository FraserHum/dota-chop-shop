/**
 * Script to fetch item data from OpenDota API and save to file
 * 
 * OpenDota API: https://api.opendota.com/api/constants/items
 * - Free, no API key required
 * - Contains item stats, costs, and build information
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'responses');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'opendota-items.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const url = 'https://api.opendota.com/api/constants/items';

console.log(`Fetching items from OpenDota API: ${url}`);

https.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      // Parse to validate JSON, then write formatted
      const json = JSON.parse(data);
      const itemCount = Object.keys(json).length;
      
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(json, null, 2));
      console.log(`Success! Saved ${itemCount} items to ${OUTPUT_FILE}`);
      
      // Print first few item keys as preview
      const keys = Object.keys(json).slice(0, 10);
      console.log(`\nFirst 10 item keys: ${keys.join(', ')}`);
    } catch (err) {
      console.error('Failed to parse JSON:', err.message);
      // Write raw response for debugging
      fs.writeFileSync(OUTPUT_FILE + '.raw', data);
    }
  });

}).on('error', (err) => {
  console.error('Request failed:', err.message);
});
