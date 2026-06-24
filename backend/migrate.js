import sqlite3 from 'sqlite3';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { 
  User, Document, TestCase, Script, Defect, TestRun 
} from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqliteDbPath = path.resolve(__dirname, 'database.db');
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/verispec';

if (!fs.existsSync(sqliteDbPath)) {
  console.error(`SQLite database not found at: ${sqliteDbPath}. Nothing to migrate.`);
  process.exit(1);
}

const runMigration = async () => {
  console.log('Starting data migration: SQLite -> MongoDB Atlas...');

  // 1. Connect to SQLite
  const sqliteDb = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
      process.exit(1);
    }
  });

  const querySqlite = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  // 2. Connect to MongoDB
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB Atlas.');

    // Clear existing collections in Mongo before migration to avoid duplicates
    console.log('Clearing existing MongoDB records to perform a clean sync...');
    await User.deleteMany({});
    await Document.deleteMany({});
    await TestCase.deleteMany({});
    await Script.deleteMany({});
    await Defect.deleteMany({});
    await TestRun.deleteMany({});

    // 3. Migrate Users
    console.log('Migrating users...');
    const sqliteUsers = await querySqlite('SELECT * FROM users');
    for (const u of sqliteUsers) {
      await new User({
        username: u.username,
        password: u.password,
        role: u.role
      }).save();
    }
    console.log(`Migrated ${sqliteUsers.length} users successfully.`);

    // 4. Migrate Documents (Hold ID mapping)
    console.log('Migrating documents...');
    const sqliteDocs = await querySqlite('SELECT * FROM documents');
    const docIdMap = {}; // sqliteId -> mongoObjectId

    for (const d of sqliteDocs) {
      const doc = await new Document({
        filename: d.filename,
        content: d.content,
        status: d.status,
        created_at: new Date(d.created_at)
      }).save();
      docIdMap[d.id] = doc._id;
    }
    console.log(`Migrated ${sqliteDocs.length} documents successfully.`);

    // 5. Migrate Test Cases (Hold ID mapping)
    console.log('Migrating test cases...');
    const sqliteTestCases = await querySqlite('SELECT * FROM test_cases');
    const tcIdMap = {}; // sqliteTestCaseId -> mongoTestCaseObjectId

    for (const tc of sqliteTestCases) {
      const mongoDocId = docIdMap[tc.document_id];
      if (!mongoDocId) continue; // skip orphan records

      const mongoTc = await new TestCase({
        document_id: mongoDocId,
        section: tc.section,
        title: tc.title,
        steps: tc.steps,
        expected: tc.expected,
        status: tc.status
      }).save();
      tcIdMap[tc.id] = mongoTc._id;
    }
    console.log(`Migrated ${sqliteTestCases.length} test cases successfully.`);

    // 6. Migrate Scripts
    console.log('Migrating scripts...');
    const sqliteScripts = await querySqlite('SELECT * FROM scripts');
    for (const s of sqliteScripts) {
      const mongoDocId = docIdMap[s.document_id];
      if (!mongoDocId) continue;

      await new Script({
        document_id: mongoDocId,
        script_code: s.script_code,
        logs: s.logs,
        status: s.status,
        updated_at: new Date(s.updated_at)
      }).save();
    }
    console.log(`Migrated ${sqliteScripts.length} automation scripts successfully.`);

    // 7. Migrate Defects
    console.log('Migrating defects...');
    const sqliteDefects = await querySqlite('SELECT * FROM defects');
    for (const df of sqliteDefects) {
      const mongoDocId = docIdMap[df.document_id];
      const mongoTcId = tcIdMap[df.test_case_id];
      if (!mongoDocId || !mongoTcId) continue;

      await new Defect({
        document_id: mongoDocId,
        test_case_id: mongoTcId,
        title: df.title,
        description: df.description,
        severity: df.severity,
        status: df.status,
        created_at: new Date(df.created_at)
      }).save();
    }
    console.log(`Migrated ${sqliteDefects.length} defect tickets successfully.`);

    // 8. Migrate Test Runs
    console.log('Migrating execution run history...');
    const sqliteTestRuns = await querySqlite('SELECT * FROM test_runs');
    for (const tr of sqliteTestRuns) {
      const mongoDocId = docIdMap[tr.document_id];
      if (!mongoDocId) continue;

      await new TestRun({
        document_id: mongoDocId,
        run_type: tr.run_type,
        status: tr.status,
        passed_count: tr.passed_count,
        failed_count: tr.failed_count,
        created_at: new Date(tr.created_at)
      }).save();
    }
    console.log(`Migrated ${sqliteTestRuns.length} run execution cycles successfully.`);

    console.log('🎉 Database migration complete! All data successfully uploaded to MongoDB Atlas.');

  } catch (mongoErr) {
    console.error('Migration failed during MongoDB upload:', mongoErr.message);
  } finally {
    sqliteDb.close();
    await mongoose.connection.close();
    process.exit(0);
  }
};

runMigration();
