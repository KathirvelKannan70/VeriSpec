/**
 * AI Service for SRS parsing and Test Case generation.
 * Integrates live Google Gemini API with offline mock fallback capability.
 */
import dotenv from 'dotenv';
dotenv.config();

export const generateTestCasesFromSRS = async (filename, content) => {
  console.log(`Parsing SRS document: ${filename} (Length: ${content.length} chars)`);

  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey.trim() !== '' && apiKey !== 'YOUR_GEMINI_API_KEY') {
    try {
      console.log('GEMINI_API_KEY detected. Ingesting requirement spec to Gemini LLM...');

      const prompt = `You are a Senior QA Automation Architect at VeriSpec. 
Analyze the following Software Requirements Specification (SRS) text and compile a comprehensive list of manual verification test cases.

Return your response strictly as a JSON array of objects. Do not include markdown wraps (like \`\`\`json).
Each object in the array MUST contain precisely these four string fields:
- "section": The functional category (e.g., "Authentication", "Validation", "Audit Logging").
- "title": A descriptive, clear test case title.
- "steps": Detailed, step-by-step numbered instructions for a manual QA tester, separated by newlines.
- "expected": The expected system behavior.

Here is the SRS Document to parse:
---
${content}
---`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API responded with status ${response.status}`);
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawText) {
        throw new Error('Gemini API returned an empty or invalid content structure.');
      }

      // Parse JSON array
      const parsedCases = JSON.parse(rawText.trim());
      
      if (Array.isArray(parsedCases)) {
        console.log(`Successfully generated ${parsedCases.length} test cases using live Gemini API.`);
        return parsedCases.map((tc, index) => ({
          id: index + 1,
          section: tc.section || 'General',
          title: tc.title || `Verify Requirement Feature #${index + 1}`,
          steps: tc.steps || '1. Perform standard verification clicks.',
          expected: tc.expected || 'System state remains stable.',
          status: 'draft'
        }));
      } else {
        throw new Error('Gemini output parsed successfully, but was not a JSON Array.');
      }

    } catch (apiErr) {
      console.error('Gemini API execution failed. Falling back to offline engine:', apiErr.message);
    }
  } else {
    console.log('GEMINI_API_KEY is not configured in .env file. Running local rule-based parsing engine...');
  }

  // --- OFFLINE FALLBACK PARSER ---
  const lowerContent = content.toLowerCase();
  
  let domain = 'Tax & Compliance';
  if (lowerContent.includes('health') || lowerContent.includes('patient') || lowerContent.includes('medical')) {
    domain = 'Healthcare Portal';
  } else if (lowerContent.includes('legal') || lowerContent.includes('law') || lowerContent.includes('contract')) {
    domain = 'Legal Document Management';
  } else if (lowerContent.includes('finance') || lowerContent.includes('invoice') || lowerContent.includes('payment')) {
    domain = 'Financial Auditing';
  }

  const testSuiteTemplates = {
    'Tax & Compliance': [
      {
        section: 'Authentication & Access Control',
        title: 'Verify VeriSpec Secure Login with MFA',
        steps: '1. Navigate to the VeriSpec Tax Portal login page.\n2. Enter valid credentials (username: admin, password: admin123).\n3. Click Login.\n4. Input the 6-digit MFA verification code received via SMS/Email.\n5. Click Verify.',
        expected: 'User is successfully redirected to the Compliance Dashboard. Session token is stored securely.'
      },
      {
        section: 'Tax Form Validation',
        title: 'Verify Automatic Validation of IRS Form 1040 Ingestion',
        steps: '1. Navigate to "Document Upload" page.\n2. Upload a valid IRS 1040 PDF document.\n3. Wait for compliance analysis status.\n4. Inspect highlighted field discrepancies.',
        expected: 'System successfully parses XML fields. Tax values are validated against IRS rules database. Discrepancies are flagged in red.'
      },
      {
        section: 'Audit Logs',
        title: 'Verify Audit Trail Integrity for Tax adjustments',
        steps: '1. Navigate to the Client Tax Ledger.\n2. Edit deduction value for client "VS-7781" to $15,000.\n3. Click Save.\n4. Open Audit Log history.\n5. Inspect the newly created log entry.',
        expected: 'Audit log registers change containing: timestamp, user (admin), changed property (deduction), old value, and new value. Log is cryptographically hashed.'
      }
    ],
    'Healthcare Portal': [
      {
        section: 'Patient Records Compliance',
        title: 'Verify Patient EHR Ingestion and HIPAA Compliance Encryption',
        steps: '1. Ingest electronic health record (EHR) text payload.\n2. Verify database records for patient identity "John Doe".\n3. Inspect columns in database directly to check encryption.',
        expected: 'Patient Name, SSN, and DOB fields are fully AES-256 encrypted in transit and at rest. Access logs register HIPAA query.'
      },
      {
        section: 'Access Auditing',
        title: 'Verify Non-Authorized Medical Staff Access Prevention',
        steps: '1. Login as staff member "Nurse-Jane" (restricted role).\n2. Attempt to open patient "VS-Patient-992" medical prescription history via direct URL API.\n3. Submit request.',
        expected: 'Access is denied (HTTP 403 Forbidden). Incident report is generated in admin alert console.'
      }
    ],
    'Legal Document Management': [
      {
        section: 'Contract Ingestion',
        title: 'Verify AI Clause Extraction from Legal PDF Agreement',
        steps: '1. Upload agreement document "Partnership_VS_v2.pdf".\n2. Click "Extract Clauses" button.\n3. Review parsed list of Indemnity and Liability clauses.',
        expected: 'AI engine highlights exactly 4 liability clauses. Accuracy confidence score > 92% is rendered on panel.'
      },
      {
        section: 'Version Control',
        title: 'Verify Concurrent Modification Lock on Legal Contracts',
        steps: '1. User A opens contract document #421 for writing.\n2. User B simultaneously attempts to open contract document #421 for writing.\n3. User B edits a sentence and clicks Save.',
        expected: 'User B receives a "Document Locked" message. User B\'s edits are staged as a draft branch to prevent data overwrite.'
      }
    ],
    'Financial Auditing': [
      {
        section: 'Data Ingest',
        title: 'Verify Transaction Log CSV Parsing and Reconciliation',
        steps: '1. Drag and drop "ledger_Q2_2026.csv" containing 10,000 entries into importer.\n2. Wait for background reconciliation engine to finish processing.\n3. View mismatch results report.',
        expected: 'Reconciliation process completes in under 3.5 seconds. Exactly 14 balance mismatches are displayed with adjustment recommendations.'
      },
      {
        section: 'Reporting',
        title: 'Verify PDF Auditor Summary Report Compilation',
        steps: '1. Open Financial Dashboard.\n2. Select Date range (01/01/2026 to 06/30/2026).\n3. Click "Generate Auditor PDF".\n4. Review downloaded PDF format and branding logos.',
        expected: 'PDF contains VeriSpec corporate headers, table of contents, executive balance sheet, and compliance certificate signature page.'
      }
    ]
  };

  const dynamicCases = [];
  const lines = content.split('\n');
  let currentSection = 'SRS Parsed Section';
  
  let reqCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith('section') || trimmed.toLowerCase().startsWith('feature:')) {
      currentSection = trimmed;
    }
    if (trimmed.toLowerCase().includes('shall') || trimmed.toLowerCase().includes('should') || trimmed.toLowerCase().includes('must') || trimmed.includes('REQ-')) {
      reqCount++;
      let title = trimmed.replace(/^[-\s*]+/g, '');
      if (title.length > 80) title = title.substring(0, 77) + '...';
      
      dynamicCases.push({
        section: currentSection,
        title: `Verify: ${title}`,
        steps: `1. Setup workspace based on ${currentSection}.\n2. Trigger execution path matching specification: "${trimmed}".\n3. Monitor interface status and state validation.`,
        expected: `System satisfies requirement and operates in strict accordance with policy: "${trimmed}".`
      });
    }
    if (reqCount >= 4) break;
  }

  const baseCases = testSuiteTemplates[domain] || testSuiteTemplates['Tax & Compliance'];
  const finalCases = [...dynamicCases, ...baseCases];

  return finalCases.map((tc, index) => ({
    id: index + 1,
    section: tc.section,
    title: tc.title,
    steps: tc.steps,
    expected: tc.expected,
    status: 'draft'
  }));
};
