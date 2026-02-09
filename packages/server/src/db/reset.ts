import bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import { initDatabaseAsync, dbRun, dbGet, saveDatabase, closeDatabase } from './init.js';

async function reset() {
  // Kill any running dev server first so it can't overwrite the reset with its in-memory copy
  console.log('⚙️  Checking for running dev server on port 3001...');
  try {
    const pids = execSync('lsof -ti :3001 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (pids) {
      console.log(`  ⚠ Found running processes on port 3001 — killing them first`);
      execSync(`lsof -ti :3001 | xargs kill -9 2>/dev/null`);
      // Give the OS a moment to release the port and file handles
      await new Promise(r => setTimeout(r, 500));
      console.log('  ✓ Dev server killed');
    } else {
      console.log('  ✓ No dev server running');
    }
  } catch {
    console.log('  ✓ No dev server running');
  }

  console.log('\nInitializing database connection...');
  await initDatabaseAsync();

  console.log('\n🗑️  Clearing ALL data...\n');

  // Clear all data tables (order matters for foreign keys)
  const tables = [
    'employee_feedback',
    'vp_review_status',
    'equity_review_cycles',
    'salary_history',
    'equity_analysis',
    'cupa_salary_data',
    'mapping_history',
    'review_comments',
    'position_mappings',
    'cupa_positions',
    'audit_cycles',
    'vp_roles',
    'users',
  ];

  for (const table of tables) {
    try {
      dbRun(`DELETE FROM ${table}`);
      console.log(`  ✓ Cleared ${table}`);
    } catch (err) {
      console.log(`  ⚠ Skipped ${table} (may not exist)`);
    }
  }

  console.log('\n👤 Re-creating login users...\n');

  // Re-create admin user
  const adminPassword = bcrypt.hashSync('admin123', 10);
  dbRun(
    'INSERT INTO users (email, password_hash, name, role, division) VALUES (?, ?, ?, ?, ?)',
    ['admin@moravian.edu', adminPassword, 'System Administrator', 'system_admin', null]
  );
  console.log('  ✓ admin@moravian.edu / admin123 (system_admin)');

  // Re-create HR admin
  const hrPassword = bcrypt.hashSync('hr123', 10);
  dbRun(
    'INSERT INTO users (email, password_hash, name, role, division) VALUES (?, ?, ?, ?, ?)',
    ['hr@moravian.edu', hrPassword, 'HR Administrator', 'hr_admin', null]
  );
  console.log('  ✓ hr@moravian.edu / hr123 (hr_admin)');

  // Re-create VP reviewer accounts matching the actual VP stems from the audit workbook
  const vpPassword = bcrypt.hashSync('vp123', 10);
  const vpStems = [
    { email: 'anderson@moravian.edu', name: 'Jill Anderson', division: 'Anderson' },
    { email: 'brandes@moravian.edu', name: 'David Brandes', division: 'Brandes' },
    { email: 'dams@moravian.edu', name: 'Timothy Dams', division: 'Dams' },
    { email: 'grigsby@moravian.edu', name: 'Bryon Grigsby', division: 'Grigsby' },
    { email: 'hunt@moravian.edu', name: 'Christopher Hunt', division: 'Hunt' },
    { email: 'loyd@moravian.edu', name: 'Gary Loyd', division: 'Loyd' },
    { email: 'ragsdale@moravian.edu', name: 'Frank Ragsdale', division: 'Ragsdale' },
    { email: 'reed@moravian.edu', name: 'Yasmin Reed', division: 'Reed' },
    { email: 'tejani@moravian.edu', name: 'Shafiq Tejani', division: 'Tejani' },
    { email: 'traupman-carr@moravian.edu', name: 'Carol Traupman-Carr', division: 'Traupman-Carr' },
  ];
  for (const vp of vpStems) {
    dbRun(
      'INSERT INTO users (email, password_hash, name, role, division) VALUES (?, ?, ?, ?, ?)',
      [vp.email, vpPassword, vp.name, 'vp_reviewer', vp.division]
    );
    console.log(`  ✓ ${vp.email} / vp123 (vp_reviewer - ${vp.division})`);
  }

  saveDatabase();

  console.log('\n✅ Database reset complete! All data cleared, login users recreated.');
  console.log('\nYou can now log in and import data through the UI.\n');
  
  closeDatabase();
}

reset().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
