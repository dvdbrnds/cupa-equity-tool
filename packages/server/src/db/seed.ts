import bcrypt from 'bcryptjs';
import { initDatabaseAsync, dbGet, dbRun, closeDatabase } from './init.js';

async function seed() {
  console.log('Initializing database...');
  await initDatabaseAsync();

  console.log('Seeding database with initial data...');

  // Create admin user
  const adminPassword = bcrypt.hashSync('admin123', 10);
  
  const existingAdmin = dbGet<{ id: number }>('SELECT id FROM users WHERE email = ?', ['admin@moravian.edu']);
  
  if (!existingAdmin) {
    dbRun('INSERT INTO users (email, password_hash, name, role, division) VALUES (?, ?, ?, ?, ?)',
      ['admin@moravian.edu', adminPassword, 'System Administrator', 'system_admin', null]);
    console.log('Created admin user: admin@moravian.edu / admin123');
  } else {
    console.log('Admin user already exists');
  }

  // Create HR Admin user
  const hrPassword = bcrypt.hashSync('hr123', 10);
  
  const existingHr = dbGet<{ id: number }>('SELECT id FROM users WHERE email = ?', ['hr@moravian.edu']);
  
  if (!existingHr) {
    dbRun('INSERT INTO users (email, password_hash, name, role, division) VALUES (?, ?, ?, ?, ?)',
      ['hr@moravian.edu', hrPassword, 'HR Administrator', 'hr_admin', null]);
    console.log('Created HR user: hr@moravian.edu / hr123');
  } else {
    console.log('HR user already exists');
  }

  // Create sample VP reviewers
  const vpStems = [
    { email: 'provost@moravian.edu', name: 'Provost User', division: 'Provost, VP for Academic Affairs, CAO' },
    { email: 'evp@moravian.edu', name: 'EVP User', division: 'Executive VP for University Life, COO' },
    { email: 'cfo@moravian.edu', name: 'CFO User', division: 'VP for Finance & Administration, CFO' },
    { email: 'cio@moravian.edu', name: 'CIO User', division: 'VP and Chief Information Officer' },
  ];

  const vpPassword = bcrypt.hashSync('vp123', 10);
  
  for (const vp of vpStems) {
    const existing = dbGet<{ id: number }>('SELECT id FROM users WHERE email = ?', [vp.email]);
    if (!existing) {
      dbRun('INSERT INTO users (email, password_hash, name, role, division) VALUES (?, ?, ?, ?, ?)',
        [vp.email, vpPassword, vp.name, 'vp_reviewer', vp.division]);
      console.log(`Created VP user: ${vp.email} / vp123`);
    }
  }

  // Create a sample audit cycle
  const existingCycle = dbGet<{ id: number }>('SELECT id FROM audit_cycles WHERE name = ?', ['2024-25 Annual CUPA Audit']);
  
  if (!existingCycle) {
    const adminUser = dbGet<{ id: number }>('SELECT id FROM users WHERE email = ?', ['admin@moravian.edu']);
    if (adminUser) {
      dbRun('INSERT INTO audit_cycles (name, start_date, end_date, status, created_by_id) VALUES (?, ?, ?, ?, ?)',
        ['2024-25 Annual CUPA Audit', '2024-09-01', '2024-11-30', 'draft', adminUser.id]);
      console.log('Created sample audit cycle: 2024-25 Annual CUPA Audit');
    }
  } else {
    console.log('Sample audit cycle already exists');
  }

  console.log('Seed completed successfully!');
  closeDatabase();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
