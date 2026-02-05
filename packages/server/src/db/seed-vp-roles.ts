import { initDatabaseAsync, dbGet, dbRun, dbAll, closeDatabase } from './init.js';

const VP_ROLES = [
  { code: 'Anderson', title: 'VP of Development' },
  { code: 'Brandes', title: 'VP of Information Technology' },
  { code: 'Dams', title: 'VP of Enrollment and Marketing' },
  { code: 'Grigsby', title: 'President' },
  { code: 'Hunt', title: 'VP for Inclusive Excellence' },
  { code: 'Loyd', title: 'VP of University Life' },
  { code: 'Ragsdale', title: 'VP of School of Theology' },
  { code: 'Reed', title: 'VP of Finance' },
  { code: 'Tejani', title: 'VP of SPSI' },
  { code: 'Traupman-Carr', title: 'VP of Academic Affairs' },
];

async function seedVpRoles() {
  console.log('Initializing database...');
  await initDatabaseAsync();

  // Migrate schema: add new columns if they don't exist
  console.log('Checking schema...');
  try {
    dbRun('ALTER TABLE vp_roles ADD COLUMN assigned_email TEXT');
    console.log('  Added assigned_email column');
  } catch { /* column exists */ }
  
  try {
    dbRun('ALTER TABLE vp_roles ADD COLUMN assigned_name TEXT');
    console.log('  Added assigned_name column');
  } catch { /* column exists */ }

  console.log('Seeding VP roles...');
  
  for (const { code, title } of VP_ROLES) {
    // Get position count for this VP stem
    const countResult = dbGet<{ count: number }>(
      'SELECT COUNT(*) as count FROM position_mappings WHERE vp_stem = ?',
      [code]
    );
    const positionCount = countResult?.count || 0;
    
    // Check if role already exists
    const existing = dbGet<{ id: number }>('SELECT id FROM vp_roles WHERE code = ?', [code]);
    
    if (existing) {
      console.log(`  Updating: ${code} -> "${title}" (${positionCount} positions)`);
      dbRun(
        'UPDATE vp_roles SET title = ?, position_count = ? WHERE code = ?',
        [title, positionCount, code]
      );
    } else {
      console.log(`  Creating: ${code} -> "${title}" (${positionCount} positions)`);
      dbRun(
        'INSERT INTO vp_roles (code, title, position_count) VALUES (?, ?, ?)',
        [code, title, positionCount]
      );
    }
  }

  // Show final state
  console.log('\nVP Roles:');
  const roles = dbAll<{ code: string; title: string; position_count: number; assigned_email: string | null }>(
    'SELECT code, title, position_count, assigned_email FROM vp_roles ORDER BY title'
  );
  for (const role of roles) {
    const assignee = role.assigned_email ? ` -> ${role.assigned_email}` : '';
    console.log(`  ${role.code}: ${role.title} (${role.position_count} positions)${assignee}`);
  }

  closeDatabase();
  console.log('\nVP roles seeded successfully!');
}

seedVpRoles().catch(err => {
  console.error('Failed to seed VP roles:', err);
  process.exit(1);
});
