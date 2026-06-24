import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure dynamic MongoDB URI
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/verispec';

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB successfully.');
    await initDB();
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
  }
};

const options = {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
};

// ----------------------------------------------------
// Schemas
// ----------------------------------------------------

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' }
}, options);

const documentSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  content: { type: String, required: true },
  status: { type: String, default: 'pending' },
  created_at: { type: Date, default: Date.now }
}, options);

const testCaseSchema = new mongoose.Schema({
  document_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  section: { type: String, required: true },
  title: { type: String, required: true },
  steps: { type: String, required: true },
  expected: { type: String, required: true },
  status: { type: String, default: 'draft' }
}, options);

const scriptSchema = new mongoose.Schema({
  document_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  script_code: { type: String, required: true },
  logs: { type: String },
  status: { type: String, default: 'pending' },
  updated_at: { type: Date, default: Date.now }
}, options);

const defectSchema = new mongoose.Schema({
  document_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  test_case_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TestCase', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  severity: { type: String, default: 'Medium' },
  status: { type: String, default: 'Open' },
  created_at: { type: Date, default: Date.now }
}, options);

const testRunSchema = new mongoose.Schema({
  document_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  run_type: { type: String, required: true },
  status: { type: String, required: true },
  passed_count: { type: Number, default: 0 },
  failed_count: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
}, options);

// Virtual virtual mappings for SQLite compatibility
userSchema.virtual('id').get(function() { return this._id.toHexString(); });
documentSchema.virtual('id').get(function() { return this._id.toHexString(); });
testCaseSchema.virtual('id').get(function() { return this._id.toHexString(); });
scriptSchema.virtual('id').get(function() { return this._id.toHexString(); });
defectSchema.virtual('id').get(function() { return this._id.toHexString(); });
testRunSchema.virtual('id').get(function() { return this._id.toHexString(); });

export const User = mongoose.model('User', userSchema);
export const Document = mongoose.model('Document', documentSchema);
export const TestCase = mongoose.model('TestCase', testCaseSchema);
export const Script = mongoose.model('Script', scriptSchema);
export const Defect = mongoose.model('Defect', defectSchema);
export const TestRun = mongoose.model('TestRun', testRunSchema);

// ----------------------------------------------------
// Database Seeding
// ----------------------------------------------------
export const initDB = async () => {
  // Seed default admin if not exists
  const adminExists = await User.findOne({ username: 'admin' });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await new User({ username: 'admin', password: hashedPassword, role: 'admin' }).save();
    console.log('Seeded default admin user: admin / admin123');
  }

  // Seed default user if not exists
  const userExists = await User.findOne({ username: 'user' });
  if (!userExists) {
    const hashedPassword = await bcrypt.hash('user123', 10);
    await new User({ username: 'user', password: hashedPassword, role: 'user' }).save();
    console.log('Seeded default user: user / user123');
  }

  // Seed default approved SRS document if empty
  const docExists = await Document.findOne();
  if (!docExists) {
    const filename = 'sample.txt';
    const content = `SRS SPECIFICATION: WOLTERS KLUWER TAX & COMPLIANCE SYSTEM\n\n1. The system shall enforce login with Multi-Factor Authentication (MFA) to protect tax records.\n2. The ingestion module shall parse IRS Form 1040 PDF documents and execute schema validations.\n3. The system shall log all tax ledger modifications to an immutable audit ledger.`;
    
    const doc = await new Document({ filename, content, status: 'approved' }).save();
    const documentId = doc._id;
    console.log(`Seeded default approved SRS document (ID: ${documentId})`);

    // Insert default test cases
    const tc1 = await new TestCase({
      document_id: documentId,
      section: 'Authentication & Access Control',
      title: 'Verify Wolters Kluwer Secure Login with MFA',
      steps: '1. Navigate to the WK Tax Portal login page.\n2. Enter valid credentials (username: admin, password: admin123).\n3. Click Login.\n4. Input the 6-digit MFA verification code.\n5. Click Verify.',
      expected: 'User is successfully redirected to the Compliance Dashboard. Session token is stored securely.',
      status: 'approved'
    }).save();

    const tc2 = await new TestCase({
      document_id: documentId,
      section: 'Tax Form Validation',
      title: 'Verify Automatic Validation of IRS Form 1040 Ingestion',
      steps: '1. Navigate to "Document Upload" page.\n2. Upload a valid IRS 1040 PDF document.\n3. Wait for compliance analysis status.\n4. Inspect highlighted field discrepancies.',
      expected: 'System successfully parses XML fields. Tax values are validated against IRS rules database. Discrepancies are flagged.',
      status: 'approved'
    }).save();

    const tc3 = await new TestCase({
      document_id: documentId,
      section: 'Audit Logs',
      title: 'Verify Audit Trail Integrity for Tax adjustments',
      steps: '1. Navigate to the Client Tax Ledger.\n2. Edit deduction value for client "WK-7781" to $15,000.\n3. Click Save.\n4. Open Audit Log history.\n5. Inspect the newly created log entry.',
      expected: 'Audit log registers change containing: timestamp, user (admin), changed property (deduction), old value, and new value.',
      status: 'approved'
    }).save();

    console.log('Seeded test cases');

    // Seed default Playwright script code
    const scriptCode = `import { test, expect } from '@playwright/test';

/**
 * Playwright Automated QA Suite for: sample.txt
 * Generated automatically by Wolters Kluwer VeriSpec.
 */

test.describe('Compliance Verification Suite - sample.txt', () => {

  test('Test 1: Verify Wolters Kluwer Secure Login with MFA', async ({ page }) => {
    console.log('Starting Test Execution: Verify Wolters Kluwer Secure Login with MFA');
    await page.goto('https://compliance-qa.wolterskluwer.com/dashboard');
    await page.fill('input[placeholder*="username"]', 'admin');
    await page.click('button[type="submit"]');
    await page.fill('input[placeholder*="mfa"]', '123456');
    await page.click('button[type="submit"]');

    const headerText = await page.locator('h1.dashboard-header, div.banner-message').textContent();
    expect(headerText).toBeDefined();
    console.log('Passed Test: Verify Wolters Kluwer Secure Login with MFA');
  });

  test('Test 2: Verify Automatic Validation of IRS Form 1040 Ingestion', async ({ page }) => {
    console.log('Starting Test Execution: Verify Automatic Validation of IRS Form 1040 Ingestion');
    await page.goto('https://compliance-qa.wolterskluwer.com/dashboard');
    await page.setInputFiles('input[type="file"]', 'test-data/srs_doc.pdf');
    await page.waitForTimeout(500);

    const headerText = await page.locator('h1.dashboard-header, div.banner-message').textContent();
    expect(headerText).toBeDefined();
    console.log('Passed Test: Verify Automatic Validation of IRS Form 1040 Ingestion');
  });

  test('Test 3: Verify Audit Trail Integrity for Tax adjustments', async ({ page }) => {
    console.log('Starting Test Execution: Verify Audit Trail Integrity for Tax adjustments');
    await page.goto('https://compliance-qa.wolterskluwer.com/dashboard');
    await page.fill('input[name="deduction"]', '15000');
    await page.click('button[type="submit"]');
    await page.click('a[href*="audit-log"]');
    await page.waitForTimeout(500);

    const headerText = await page.locator('h1.dashboard-header, div.banner-message').textContent();
    expect(headerText).toBeDefined();
    console.log('Passed Test: Verify Audit Trail Integrity for Tax adjustments');
  });
});
`;

    // Save script
    await new Script({
      document_id: documentId,
      script_code: scriptCode,
      status: 'approved'
    }).save();

    // Write file to local disk for simulation purposes
    try {
      const testDir = path.resolve(__dirname, 'generated_tests');
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
      const testFilePath = path.join(testDir, `document_${documentId}.spec.js`);
      fs.writeFileSync(testFilePath, scriptCode, 'utf8');
      console.log(`Saved seeded Playwright script to disk: ${testFilePath}`);
    } catch (fsErr) {
      console.error('Error writing script to disk:', fsErr.message);
    }

    // Seed execution runs history
    await new TestRun({ document_id: documentId, run_type: 'manual', status: 'passed', passed_count: 3, failed_count: 0 }).save();
    await new TestRun({ document_id: documentId, run_type: 'manual', status: 'failed', passed_count: 2, failed_count: 1 }).save();
    console.log('Seeded execution runs history');

    // Seed defect
    await new Defect({
      document_id: documentId,
      test_case_id: tc3._id,
      title: 'Audit Trail Logs fail to persist on concurrent ledger updates',
      description: 'During manual execution, modifying deduction values simultaneously and saving ledger inputs did not register in the audit logs tab. The div.log-history-panel did not render in DOM.',
      severity: 'High',
      status: 'Open'
    }).save();
    console.log('Seeded default open QA defect');
  }
};
