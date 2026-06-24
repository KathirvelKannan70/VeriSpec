import express from 'express';
import cors from 'cors';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { 
  connectDB, User, Document, TestCase, Script, Defect, TestRun 
} from './db.js';
import { generateTestCasesFromSRS } from './services/ai.js';
import { 
  generatePlaywrightScript, simulatePlaywrightExecution, 
  generateCypressScript, generateSeleniumScript 
} from './services/generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'wk-secret-compliance-key-2026';

// Middleware
app.use(cors());
app.use(express.json());

// Root health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'Wolters Kluwer VeriSpec Backend API',
    timestamp: new Date()
  });
});

// Setup file uploads directory
const uploadDir = path.join(__dirname, 'uploads');
const testDir = path.join(__dirname, 'generated_tests');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Initialize database connection
connectDB().catch(console.error);

// ----------------------------------------------------
// Authentication Routes
// ----------------------------------------------------

// User register
app.post('/api/auth/register', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role === 'admin' ? 'admin' : 'user';
    await new User({ username, password: hashedPassword, role: userRole }).save();
    res.json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, username: user.username, role: user.role });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Middleware for JWT authorization
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Middleware for admin restriction
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  next();
};

// ----------------------------------------------------
// Document / SRS Routes
// ----------------------------------------------------

// List all documents
app.get('/api/documents', async (req, res) => {
  try {
    const docs = await Document.find().sort({ created_at: -1 });
    res.json(docs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Single document with its test cases, scripts, defects, and run history
app.get('/api/documents/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const testCases = await TestCase.find({ document_id: req.params.id });
    const script = await Script.findOne({ document_id: req.params.id });
    const defects = await Defect.find({ document_id: req.params.id }).sort({ created_at: -1 });
    const testRuns = await TestRun.find({ document_id: req.params.id }).sort({ created_at: -1 });

    res.json({ doc, testCases, script, defects, testRuns });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload SRS document and generate test cases
app.post('/api/documents/upload', upload.single('srsFile'), async (req, res) => {
  if (!req.file && !req.body.textInput) {
    return res.status(400).json({ error: 'Please upload an SRS file or enter document text' });
  }

  try {
    let filename = '';
    let content = '';

    if (req.file) {
      filename = req.file.originalname;
      content = fs.readFileSync(req.file.path, 'utf8');
    } else {
      filename = req.body.title || 'Manually_Entered_SRS.txt';
      content = req.body.textInput;
    }

    // Save document to MongoDB
    const doc = await new Document({ filename, content, status: 'processing' }).save();
    const documentId = doc._id;

    // Generate Test Cases (Gemini/Mock parsing)
    const testCases = await generateTestCasesFromSRS(filename, content);

    // Save test cases to database
    for (const tc of testCases) {
      await new TestCase({
        document_id: documentId,
        section: tc.section,
        title: tc.title,
        steps: tc.steps,
        expected: tc.expected,
        status: 'draft'
      }).save();
    }

    // Update document status
    doc.status = 'pending_approval';
    await doc.save();

    res.json({
      message: 'SRS parsed and test cases generated successfully',
      documentId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a test case inline
app.put('/api/test-cases/:id', async (req, res) => {
  const { title, steps, expected, section } = req.body;
  if (!title || !steps || !expected) {
    return res.status(400).json({ error: 'Title, steps, and expected fields are required' });
  }
  try {
    await TestCase.findByIdAndUpdate(req.params.id, {
      title, steps, expected, section: section || 'General'
    });
    res.json({ message: 'Test case updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve a document: generates Playwright Script code
app.post('/api/documents/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const testCases = await TestCase.find({ document_id: req.params.id });
    
    // Generate Playwright test script
    const scriptCode = generatePlaywrightScript(doc.filename, testCases);

    // Write to a local test file for simulation run support
    const testFilePath = path.join(testDir, `document_${doc.id}.spec.js`);
    fs.writeFileSync(testFilePath, scriptCode, 'utf8');

    // Save or update script reference in DB
    await Script.findOneAndUpdate(
      { document_id: doc._id },
      { script_code: scriptCode, status: 'approved', updated_at: new Date() },
      { upsert: true, new: true }
    );

    // Set document status
    doc.status = 'approved';
    await doc.save();

    res.json({
      message: 'SRS approved and Playwright script generated',
      scriptCode
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reject a document
app.post('/api/documents/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await Document.findByIdAndUpdate(req.params.id, { status: 'rejected' });
    res.json({ message: 'SRS document rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run a generated Playwright script (SSE support for real-time console streaming)
app.get('/api/documents/:id/run-script', async (req, res) => {
  const documentId = req.params.id;
  try {
    const script = await Script.findOne({ document_id: documentId });
    if (!script) {
      return res.status(404).json({ error: 'No approved script found for this document' });
    }

    // Set headers for Server-Sent Events (SSE) to enable real-time streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let allLogs = [];
    await simulatePlaywrightExecution(script.script_code, (logLine) => {
      allLogs.push(logLine);
      res.write(`data: ${JSON.stringify({ log: logLine })}\n\n`);
    });

    const finalLogs = allLogs.join('\n');
    const finalStatus = finalLogs.includes('Failed') ? 'failed' : 'passed';
    
    // Save final status and complete logs to database
    script.logs = finalLogs;
    script.status = finalStatus;
    script.updated_at = new Date();
    await script.save();

    // Log automation execution result to runs history
    await new TestRun({
      document_id: documentId,
      run_type: 'automated',
      status: finalStatus,
      passed_count: finalLogs.includes('Failed') ? 2 : 3,
      failed_count: finalLogs.includes('Failed') ? 1 : 0
    }).save();

    res.write(`data: ${JSON.stringify({ status: finalStatus, done: true })}\n\n`);
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    await Document.findByIdAndDelete(req.params.id);
    await TestCase.deleteMany({ document_id: req.params.id });
    await Script.deleteMany({ document_id: req.params.id });
    await Defect.deleteMany({ document_id: req.params.id });
    await TestRun.deleteMany({ document_id: req.params.id });
    res.json({ message: 'Document and all associated data deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new defect ticket
app.post('/api/defects', async (req, res) => {
  const { document_id, test_case_id, title, description, severity } = req.body;
  if (!document_id || !test_case_id || !title || !description) {
    return res.status(400).json({ error: 'document_id, test_case_id, title, and description are required' });
  }
  try {
    const result = await new Defect({
      document_id, test_case_id, title, description, severity: severity || 'Medium', status: 'Open'
    }).save();
    res.json({ message: 'Defect logged successfully', id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update defect status (resolve bug)
app.put('/api/defects/:id', async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });
  try {
    await Defect.findByIdAndUpdate(req.params.id, { status });
    res.json({ message: 'Defect status updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit a new manual or automated test run execution log
app.post('/api/test-runs', async (req, res) => {
  const { document_id, run_type, status, passed_count, failed_count } = req.body;
  if (!document_id || !run_type || !status) {
    return res.status(400).json({ error: 'document_id, run_type, and status are required' });
  }
  try {
    const result = await new TestRun({
      document_id, run_type, status, passed_count: passed_count || 0, failed_count: failed_count || 0
    }).save();
    res.json({ message: 'Test execution run saved', id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Compile dynamic automation scripts based on framework parameter
app.get('/api/documents/:id/compile-framework', async (req, res) => {
  const { framework } = req.query; // 'playwright' | 'cypress' | 'selenium'
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const testCases = await TestCase.find({ document_id: req.params.id });
    
    let scriptCode = '';
    let language = '';

    if (framework === 'cypress') {
      scriptCode = generateCypressScript(doc.filename, testCases);
      language = 'JavaScript (Cypress)';
    } else if (framework === 'selenium') {
      scriptCode = generateSeleniumScript(doc.filename, testCases);
      language = 'Java (Selenium JUnit)';
    } else {
      scriptCode = generatePlaywrightScript(doc.filename, testCases);
      language = 'JavaScript (Playwright)';
    }

    res.json({ scriptCode, language, framework });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
