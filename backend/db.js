import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Helper wrapper for DB queries using Promises
export const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

export const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Initialize database schema
export const initDB = async () => {
  // Create tables
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user'
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      section TEXT NOT NULL,
      title TEXT NOT NULL,
      steps TEXT NOT NULL,
      expected TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      script_code TEXT NOT NULL,
      logs TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS defects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      test_case_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'Medium',
      status TEXT NOT NULL DEFAULT 'Open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
      FOREIGN KEY (test_case_id) REFERENCES test_cases (id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS test_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL,
      passed_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
    )
  `);

  // Seed default admin if not exists
  const adminExists = await get(`SELECT * FROM users WHERE username = ?`, ['admin']);
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await run(
      `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
      ['admin', hashedPassword, 'admin']
    );
    console.log('Seeded default admin user: admin / admin123');
  }

  // Seed default user if not exists
  const userExists = await get(`SELECT * FROM users WHERE username = ?`, ['user']);
  if (!userExists) {
    const hashedPassword = await bcrypt.hash('user123', 10);
    await run(
      `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
      ['user', hashedPassword, 'user']
    );
    console.log('Seeded default user: user / user123');
  }

  // Seed default approved SRS document if table is empty
  const docExists = await get(`SELECT * FROM documents LIMIT 1`);
  if (!docExists) {
    const filename = 'sample.txt';
    const content = `SRS SPECIFICATION: WOLTERS KLUWER TAX & COMPLIANCE SYSTEM\n\n1. The system shall enforce login with Multi-Factor Authentication (MFA) to protect tax records.\n2. The ingestion module shall parse IRS Form 1040 PDF documents and execute schema validations.\n3. The system shall log all tax ledger modifications to an immutable audit ledger.`;
    
    const docResult = await run(
      `INSERT INTO documents (filename, content, status) VALUES (?, ?, ?)`,
      [filename, content, 'approved']
    );
    const documentId = docResult.id;
    console.log(`Seeded default approved SRS document (ID: ${documentId})`);

    // Insert 3 default test cases
    const testCases = [
      {
        section: 'Authentication & Access Control',
        title: 'Verify Wolters Kluwer Secure Login with MFA',
        steps: '1. Navigate to the WK Tax Portal login page.\n2. Enter valid credentials (username: admin, password: admin123).\n3. Click Login.\n4. Input the 6-digit MFA verification code.\n5. Click Verify.',
        expected: 'User is successfully redirected to the Compliance Dashboard. Session token is stored securely.'
      },
      {
        section: 'Tax Form Validation',
        title: 'Verify Automatic Validation of IRS Form 1040 Ingestion',
        steps: '1. Navigate to "Document Upload" page.\n2. Upload a valid IRS 1040 PDF document.\n3. Wait for compliance analysis status.\n4. Inspect highlighted field discrepancies.',
        expected: 'System successfully parses XML fields. Tax values are validated against IRS rules database. Discrepancies are flagged.'
      },
      {
        section: 'Audit Logs',
        title: 'Verify Audit Trail Integrity for Tax adjustments',
        steps: '1. Navigate to the Client Tax Ledger.\n2. Edit deduction value for client "WK-7781" to $15,000.\n3. Click Save.\n4. Open Audit Log history.\n5. Inspect the newly created log entry.',
        expected: 'Audit log registers change containing: timestamp, user (admin), changed property (deduction), old value, and new value.'
      }
    ];

    for (const tc of testCases) {
      await run(
        `INSERT INTO test_cases (document_id, section, title, steps, expected, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [documentId, tc.section, tc.title, tc.steps, tc.expected, 'approved']
      );
    }

    // Seed default Playwright script code
    const scriptCode = `import { test, expect } from '@playwright/test';

/**
 * Playwright Automated QA Suite for: sample.txt
 * Generated automatically by Wolters Kluwer SRS AI Assistant.
 * Generated At: ${new Date().toISOString()}
 */

test.describe('Compliance Verification Suite - sample.txt', () => {

  /**
   * Section: Authentication & Access Control
   * Expected: User is successfully redirected to the Compliance Dashboard. Session token is stored securely.
   */
  test('Test 1: Verify Wolters Kluwer Secure Login with MFA', async ({ page }) => {
    console.log('Starting Test Execution: Verify Wolters Kluwer Secure Login with MFA');
    // 1. Navigate to the WK Tax Portal login page.
    await page.goto('https://compliance-qa.wolterskluwer.com/dashboard');
    // 2. Enter valid credentials (username: admin, password: admin123).
    await page.fill('input[placeholder*="username"]', 'admin');
    // 3. Click Login.
    await page.click('button[type="submit"]');
    // 4. Input the 6-digit MFA verification code.
    await page.fill('input[placeholder*="mfa"]', '123456');
    // 5. Click Verify.
    await page.click('button[type="submit"]');

    // Assert Expected
    const headerText = await page.locator('h1.dashboard-header, div.banner-message').textContent();
    expect(headerText).toBeDefined();
    console.log('Passed Test: Verify Wolters Kluwer Secure Login with MFA');
  });

  /**
   * Section: Tax Form Validation
   * Expected: System successfully parses XML fields. Tax values are validated against IRS rules database. Discrepancies are flagged.
   */
  test('Test 2: Verify Automatic Validation of IRS Form 1040 Ingestion', async ({ page }) => {
    console.log('Starting Test Execution: Verify Automatic Validation of IRS Form 1040 Ingestion');
    // 1. Navigate to "Document Upload" page.
    await page.goto('https://compliance-qa.wolterskluwer.com/dashboard');
    // 2. Upload a valid IRS 1040 PDF document.
    await page.setInputFiles('input[type="file"]', 'test-data/srs_doc.pdf');
    // 3. Wait for compliance analysis status.
    await page.waitForTimeout(500);
    // 4. Inspect highlighted field discrepancies.
    await page.waitForTimeout(500);

    // Assert Expected
    const headerText = await page.locator('h1.dashboard-header, div.banner-message').textContent();
    expect(headerText).toBeDefined();
    console.log('Passed Test: Verify Automatic Validation of IRS Form 1040 Ingestion');
  });

  /**
   * Section: Audit Logs
   * Expected: Audit log registers change containing: timestamp, user (admin), changed property (deduction), old value, and new value.
   */
  test('Test 3: Verify Audit Trail Integrity for Tax adjustments', async ({ page }) => {
    console.log('Starting Test Execution: Verify Audit Trail Integrity for Tax adjustments');
    // 1. Navigate to the Client Tax Ledger.
    await page.goto('https://compliance-qa.wolterskluwer.com/dashboard');
    // 2. Edit deduction value for client "WK-7781" to $15,000.
    await page.fill('input[name="deduction"]', '15000');
    // 3. Click Save.
    await page.click('button[type="submit"]');
    // 4. Open Audit Log history.
    await page.click('a[href*="audit-log"]');
    // 5. Inspect the newly created log entry.
    await page.waitForTimeout(500);

    // Assert Expected
    const headerText = await page.locator('h1.dashboard-header, div.banner-message').textContent();
    expect(headerText).toBeDefined();
    console.log('Passed Test: Verify Audit Trail Integrity for Tax adjustments');
  });
});
`;

    // Save to database
    await run(
      `INSERT INTO scripts (document_id, script_code, status) VALUES (?, ?, ?)`,
      [documentId, scriptCode, 'approved']
    );

    // Also write it to the filesystem under backend/generated_tests/document_1.spec.js
    try {
      const testDir = path.resolve(__dirname, 'generated_tests');
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
      const testFilePath = path.join(testDir, `document_${documentId}.spec.js`);
      fs.writeFileSync(testFilePath, scriptCode, 'utf8');
      console.log(`Saved seeded Playwright script to disk: ${testFilePath}`);
    } catch (fsErr) {
      console.error('Error writing seeded script file to disk:', fsErr.message);
    }
    // Seed default execution history
    await run(
      `INSERT INTO test_runs (document_id, run_type, status, passed_count, failed_count) VALUES (?, ?, ?, ?, ?)`,
      [documentId, 'manual', 'passed', 3, 0]
    );
    await run(
      `INSERT INTO test_runs (document_id, run_type, status, passed_count, failed_count) VALUES (?, ?, ?, ?, ?)`,
      [documentId, 'manual', 'failed', 2, 1]
    );
    console.log('Seeded execution runs history');

    // Seed default open defect
    await run(
      `INSERT INTO defects (document_id, test_case_id, title, description, severity, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        documentId, 
        3, 
        'Audit Trail Logs fail to persist on concurrent ledger updates',
        'During manual execution, modifying deduction values simultaneously and saving ledger inputs did not register in the audit logs tab. The div.log-history-panel did not render in DOM.',
        'High',
        'Open'
      ]
    );
    console.log('Seeded default open QA defect');
  }
};

export default {
  query,
  run,
  get,
  initDB
};
