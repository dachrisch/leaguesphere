#!/usr/bin/env node

/**
 * Translation Validation Script
 *
 * Validates that all translation keys exist in both EN and DE locales.
 * Exits with code 1 if any keys are missing, preventing CI builds from passing.
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '../src/i18n/locales');
const NAMESPACES = ['ui', 'domain', 'validation', 'modal', 'error'];
const LANGUAGES = ['en', 'de'];

/**
 * Load a JSON file and return its parsed content
 */
function loadJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error loading ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Recursively extract all keys from a nested object
 * Returns an array of dot-notation keys (e.g., ['label.home', 'label.away'])
 */
function extractKeys(obj, prefix = '') {
  const keys = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...extractKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys.sort();
}

/**
 * Compare two sets of keys and return missing keys
 */
function findMissingKeys(sourceKeys, targetKeys) {
  return sourceKeys.filter(key => !targetKeys.includes(key));
}

/**
 * Main validation function
 */
function validateTranslations() {
  console.log('🔍 Validating translation files...\n');

  let hasErrors = false;
  let totalMissingKeys = 0;

  for (const namespace of NAMESPACES) {
    // Load both language files
    const enPath = path.join(LOCALES_DIR, 'en', `${namespace}.json`);
    const dePath = path.join(LOCALES_DIR, 'de', `${namespace}.json`);

    // Skip if either file doesn't exist
    if (!fs.existsSync(enPath) && !fs.existsSync(dePath)) {
      continue; // Both don't exist, skip this namespace
    }

    if (!fs.existsSync(enPath)) {
      console.log(`⚠️  ${namespace}.json - missing EN file`);
      hasErrors = true;
      continue;
    }

    if (!fs.existsSync(dePath)) {
      console.log(`⚠️  ${namespace}.json - missing DE file`);
      hasErrors = true;
      continue;
    }

    const enData = loadJsonFile(enPath);
    const deData = loadJsonFile(dePath);

    if (!enData || !deData) {
      hasErrors = true;
      continue;
    }

    // Extract keys from both files
    const enKeys = extractKeys(enData);
    const deKeys = extractKeys(deData);

    // Find missing keys in each direction
    const missingInEn = findMissingKeys(deKeys, enKeys);
    const missingInDe = findMissingKeys(enKeys, deKeys);

    if (missingInEn.length === 0 && missingInDe.length === 0) {
      console.log(`✅ ${namespace}.json - all keys match (${enKeys.length} keys)`);
    } else {
      hasErrors = true;

      if (missingInEn.length > 0) {
        console.log(`❌ ${namespace}.json - missing in EN: ${missingInEn.join(', ')} (${missingInEn.length} keys)`);
        totalMissingKeys += missingInEn.length;
      }

      if (missingInDe.length > 0) {
        console.log(`❌ ${namespace}.json - missing in DE: ${missingInDe.join(', ')} (${missingInDe.length} keys)`);
        totalMissingKeys += missingInDe.length;
      }
    }
  }

  console.log('');

  if (hasErrors) {
    console.error(`❌ Translation validation failed: ${totalMissingKeys} missing keys\n`);
    process.exit(1);
  } else {
    console.log('✅ All translation files are valid!\n');
    process.exit(0);
  }
}

// Run validation
validateTranslations();
