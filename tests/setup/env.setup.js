'use strict';

// Load test environment before anything else
const path = require('path');
const fs = require('fs');

const envTestPath = path.join(__dirname, '../../.env.test');
if (fs.existsSync(envTestPath)) {
  const lines = fs.readFileSync(envTestPath, 'utf8').split('\n');
  for (const line of lines) {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...rest] = line.split('=');
      if (key && rest.length > 0) {
        const envKey = key.trim();
        if (process.env[envKey] === undefined) {
          process.env[envKey] = rest.join('=').trim();
        }
      }
    }
  }
}
