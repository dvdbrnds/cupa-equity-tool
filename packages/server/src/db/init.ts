import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file location - use data directory in project root or Docker volume
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../../../data');
const DB_PATH = path.join(DATA_DIR, 'cupa.db');

let db: SqlJsDatabase | null = null;
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export async function initDatabaseAsync(): Promise<SqlJsDatabase> {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log(`Initializing database at: ${DB_PATH}`);
  
  // Initialize sql.js
  SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  // Create tables
  createTables(db);
  
  // Run migrations for existing databases
  runMigrations(db);
  
  // Seed default admin user if no users exist
  seedDefaultUsers(db);
  
  // Save after creating tables
  saveDatabase();

  return db;
}

function seedDefaultUsers(database: SqlJsDatabase): void {
  const userCount = database.exec('SELECT COUNT(*) as count FROM users');
  const count = userCount[0]?.values[0]?.[0] as number || 0;
  
  if (count === 0) {
    console.log('No users found, seeding default users...');
    
    const adminPassword = bcrypt.hashSync('admin123', 10);
    database.run(
      'INSERT INTO users (email, password_hash, name, role, division) VALUES (?, ?, ?, ?, ?)',
      ['admin@moravian.edu', adminPassword, 'System Administrator', 'system_admin', null]
    );
    console.log('Created admin user: admin@moravian.edu / admin123');
    
    const hrPassword = bcrypt.hashSync('hr123', 10);
    database.run(
      'INSERT INTO users (email, password_hash, name, role, division) VALUES (?, ?, ?, ?, ?)',
      ['hr@moravian.edu', hrPassword, 'HR Administrator', 'hr_admin', null]
    );
    console.log('Created HR user: hr@moravian.edu / hr123');
  }
}

// Synchronous init for compatibility - loads from file if exists
export function initDatabase(): SqlJsDatabase {
  if (db) return db;
  
  // This is a synchronous fallback - should use initDatabaseAsync when possible
  throw new Error('Database not initialized. Call initDatabaseAsync() first.');
}

// Save database to file
export function saveDatabase(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Auto-save periodically
let saveInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSave(intervalMs = 5000): void {
  if (saveInterval) return;
  saveInterval = setInterval(saveDatabase, intervalMs);
}

export function stopAutoSave(): void {
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
}

function createTables(database: SqlJsDatabase): void {
  database.run(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('system_admin', 'hr_admin', 'hr_analyst', 'vp_reviewer', 'executive', 'academic_dean')),
      division TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      okta_id TEXT,
      auth_provider TEXT DEFAULT 'local',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    -- CUPA positions catalog
    CREATE TABLE IF NOT EXISTS cupa_positions (
      cupa_code TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      bls_soc_code TEXT,
      bls_soc_name TEXT,
      population_type TEXT NOT NULL DEFAULT 'staff' CHECK (population_type IN ('staff', 'faculty')),
      catalog_year TEXT NOT NULL
    )
  `);

  database.run(`
    -- Audit cycles
    CREATE TABLE IF NOT EXISTS audit_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
      created_by_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    -- Position mappings (institutional positions mapped to CUPA codes)
    CREATE TABLE IF NOT EXISTS position_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL UNIQUE,
      cupa_code TEXT REFERENCES cupa_positions(cupa_code),
      institutional_title TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      division TEXT NOT NULL,
      department TEXT NOT NULL,
      supervisor TEXT,
      vp_stem TEXT NOT NULL,
      audit_status TEXT NOT NULL DEFAULT 'pending' CHECK (audit_status IN ('pending', 'under_review', 'confirmed', 'flagged', 'resolved')),
      assigned_reviewer_id INTEGER REFERENCES users(id),
      review_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    -- VP Roles (organizational structure)
    CREATE TABLE IF NOT EXISTS vp_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      assigned_email TEXT,
      assigned_name TEXT,
      position_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    -- Review comments and history
    CREATE TABLE IF NOT EXISTS review_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_mapping_id INTEGER NOT NULL REFERENCES position_mappings(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      comment TEXT NOT NULL,
      flag_reason TEXT CHECK (flag_reason IN ('wrong_cupa_code', 'job_duties_changed', 'position_eliminated', 'new_position', 'other')),
      suggested_cupa_code TEXT REFERENCES cupa_positions(cupa_code),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    -- Mapping history (for audit trail)
    CREATE TABLE IF NOT EXISTS mapping_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_mapping_id INTEGER NOT NULL REFERENCES position_mappings(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      old_cupa_code TEXT,
      new_cupa_code TEXT,
      old_status TEXT,
      new_status TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    -- CUPA salary data (median salaries by CUPA code, per comparison group)
    CREATE TABLE IF NOT EXISTS cupa_salary_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cupa_code TEXT NOT NULL REFERENCES cupa_positions(cupa_code),
      data_year TEXT NOT NULL,
      comparison_group TEXT NOT NULL DEFAULT 'default',
      median_salary REAL NOT NULL,
      percentile_25 REAL,
      percentile_75 REAL,
      sample_count INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(cupa_code, data_year, comparison_group)
    )
  `);

  // Migration: recreate cupa_salary_data if it has the old unique constraint UNIQUE(cupa_code, data_year)
  // instead of the new UNIQUE(cupa_code, data_year, comparison_group).
  // We check the CREATE TABLE SQL for the old constraint pattern.
  try {
    const tableInfo = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='cupa_salary_data'");
    const createSql = tableInfo.length > 0 && tableInfo[0].values.length > 0 ? String(tableInfo[0].values[0][0]) : '';
    // Detect old schema: has UNIQUE(cupa_code, data_year) without comparison_group in the constraint
    const needsMigration = createSql && createSql.includes('UNIQUE(cupa_code, data_year)') && !createSql.includes('UNIQUE(cupa_code, data_year, comparison_group)');
    if (needsMigration) {
      console.log('Migrating cupa_salary_data: recreating table with comparison_group in unique constraint...');
      database.run('DROP TABLE IF EXISTS cupa_salary_data');
      database.run(`
        CREATE TABLE cupa_salary_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cupa_code TEXT NOT NULL REFERENCES cupa_positions(cupa_code),
          data_year TEXT NOT NULL,
          comparison_group TEXT NOT NULL DEFAULT 'default',
          median_salary REAL NOT NULL,
          percentile_25 REAL,
          percentile_75 REAL,
          sample_count INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(cupa_code, data_year, comparison_group)
        )
      `);
      console.log('Migration complete.');
    }
  } catch (_e) {
    // Ignore migration errors
  }

  database.run(`
    -- Equity analysis results (calculated gaps per position)
    CREATE TABLE IF NOT EXISTS equity_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_mapping_id INTEGER NOT NULL UNIQUE REFERENCES position_mappings(id) ON DELETE CASCADE,
      base_median REAL,
      adjusted_median REAL,
      total_compensation REAL,
      equity_gap REAL,
      gap_percentage REAL,
      years_in_role REAL,
      proposed_raise REAL DEFAULT 0,
      adjustment_notes TEXT,
      calculated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    -- Salary history for tracking year-over-year changes
    CREATE TABLE IF NOT EXISTS salary_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      employee_name TEXT,
      vp_stem TEXT,
      department TEXT,
      institutional_title TEXT,
      current_salary REAL,
      equity_gap REAL,
      proposed_raise REAL,
      actual_raise_given REAL,
      data_year TEXT NOT NULL,
      snapshot_date TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT,
      UNIQUE(employee_id, data_year)
    )
  `);

  database.run(`
    -- Equity review cycles (formal review workflow)
    CREATE TABLE IF NOT EXISTS equity_review_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      fiscal_year TEXT NOT NULL,
      total_budget REAL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calculating', 'pending_vp_review', 'vp_review_in_progress', 'hr_final_review', 'pending_pc_approval', 'pc_approved', 'pc_rejected', 'approved', 'implemented', 'archived')),
      cupa_data_year TEXT,
      deadline TEXT,
      created_by_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT
    )
  `);

  database.run(`
    -- VP review status within a cycle (one per VP per cycle)
    CREATE TABLE IF NOT EXISTS vp_review_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL REFERENCES equity_review_cycles(id) ON DELETE CASCADE,
      vp_stem TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'approved', 'changes_requested', 'hr_revised', 'finalized')),
      allocated_budget REAL,
      proposed_total REAL,
      employee_count INTEGER,
      sent_at TEXT,
      reviewed_at TEXT,
      reviewed_by_id INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(cycle_id, vp_stem)
    )
  `);

  database.run(`
    -- Employee-level feedback from VPs during review
    CREATE TABLE IF NOT EXISTS employee_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL REFERENCES equity_review_cycles(id) ON DELETE CASCADE,
      position_mapping_id INTEGER NOT NULL REFERENCES position_mappings(id) ON DELETE CASCADE,
      feedback_type TEXT NOT NULL CHECK (feedback_type IN ('approve', 'increase', 'decrease', 'defer', 'discuss')),
      adjusted_raise REAL,
      notes TEXT,
      created_by_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(cycle_id, position_mapping_id)
    )
  `);

  // Add compensation columns to position_mappings if they don't exist
  // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check pragmatically
  const columns = database.exec('PRAGMA table_info(position_mappings)');
  const existingColumns = columns[0]?.values.map(row => row[1] as string) || [];
  
  const compensationColumns = [
    { name: 'current_salary', type: 'REAL' },
    { name: 'hire_date', type: 'TEXT' },
    { name: 'role_start_date', type: 'TEXT' },
    { name: 'hourly_rate', type: 'REAL' },
    { name: 'fte', type: 'REAL DEFAULT 1.0' },
    { name: 'appointment_months', type: 'INTEGER DEFAULT 12' },
    { name: 'compensation_type', type: "TEXT DEFAULT 'salaried'" },
    { name: 'has_housing_benefit', type: 'INTEGER DEFAULT 0' },
    { name: 'housing_value', type: 'REAL DEFAULT 15000' },
  ];

  for (const col of compensationColumns) {
    if (!existingColumns.includes(col.name)) {
      try {
        database.run(`ALTER TABLE position_mappings ADD COLUMN ${col.name} ${col.type}`);
        console.log(`Added column ${col.name} to position_mappings`);
      } catch {
        // Column might already exist
      }
    }
  }

  // Create indexes
  database.run('CREATE INDEX IF NOT EXISTS idx_position_mappings_vp_stem ON position_mappings(vp_stem)');
  database.run('CREATE INDEX IF NOT EXISTS idx_position_mappings_division ON position_mappings(division)');
  database.run('CREATE INDEX IF NOT EXISTS idx_position_mappings_audit_status ON position_mappings(audit_status)');
  database.run('CREATE INDEX IF NOT EXISTS idx_position_mappings_assigned_reviewer ON position_mappings(assigned_reviewer_id)');
  database.run('CREATE INDEX IF NOT EXISTS idx_position_mappings_cupa_code ON position_mappings(cupa_code)');
  database.run('CREATE INDEX IF NOT EXISTS idx_cupa_positions_category ON cupa_positions(category)');
  database.run('CREATE INDEX IF NOT EXISTS idx_cupa_positions_title ON cupa_positions(title)');
  database.run('CREATE INDEX IF NOT EXISTS idx_review_comments_position ON review_comments(position_mapping_id)');
  database.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  database.run('CREATE INDEX IF NOT EXISTS idx_users_division ON users(division)');
  database.run('CREATE INDEX IF NOT EXISTS idx_vp_roles_code ON vp_roles(code)');
  database.run('CREATE INDEX IF NOT EXISTS idx_vp_roles_assigned_email ON vp_roles(assigned_email)');
  database.run('CREATE INDEX IF NOT EXISTS idx_cupa_salary_data_code ON cupa_salary_data(cupa_code)');
  database.run('CREATE INDEX IF NOT EXISTS idx_cupa_salary_data_year ON cupa_salary_data(data_year)');
  database.run('CREATE INDEX IF NOT EXISTS idx_equity_analysis_position ON equity_analysis(position_mapping_id)');
  database.run('CREATE INDEX IF NOT EXISTS idx_position_mappings_employee_id ON position_mappings(employee_id)');
  database.run('CREATE INDEX IF NOT EXISTS idx_salary_history_employee ON salary_history(employee_id)');
  database.run('CREATE INDEX IF NOT EXISTS idx_salary_history_year ON salary_history(data_year)');
  database.run('CREATE INDEX IF NOT EXISTS idx_salary_history_vp ON salary_history(vp_stem)');
  
  // Equity review workflow indexes
  database.run('CREATE INDEX IF NOT EXISTS idx_equity_review_cycles_status ON equity_review_cycles(status)');
  database.run('CREATE INDEX IF NOT EXISTS idx_equity_review_cycles_fiscal_year ON equity_review_cycles(fiscal_year)');
  database.run('CREATE INDEX IF NOT EXISTS idx_vp_review_status_cycle ON vp_review_status(cycle_id)');
  database.run('CREATE INDEX IF NOT EXISTS idx_vp_review_status_vp ON vp_review_status(vp_stem)');
  database.run('CREATE INDEX IF NOT EXISTS idx_vp_review_status_status ON vp_review_status(status)');
  database.run('CREATE INDEX IF NOT EXISTS idx_employee_feedback_cycle ON employee_feedback(cycle_id)');
  database.run('CREATE INDEX IF NOT EXISTS idx_employee_feedback_position ON employee_feedback(position_mapping_id)');
  
  // Add proposed_raise column to equity_analysis if it doesn't exist (migration)
  const eaColumns = database.exec('PRAGMA table_info(equity_analysis)');
  const existingEaColumns = eaColumns[0]?.values.map(row => row[1] as string) || [];
  if (!existingEaColumns.includes('proposed_raise')) {
    try {
      database.run('ALTER TABLE equity_analysis ADD COLUMN proposed_raise REAL DEFAULT 0');
      console.log('Added proposed_raise column to equity_analysis');
    } catch {
      // Column might already exist
    }
  }

  console.log('Database tables created/verified');
}

// Migration function to handle existing databases with audit_cycle_id
function runMigrations(database: SqlJsDatabase): void {
  // Check if position_mappings has audit_cycle_id column (old schema)
  const pmColumns = database.exec('PRAGMA table_info(position_mappings)');
  const pmColumnNames = pmColumns[0]?.values.map(row => row[1] as string) || [];
  
  if (pmColumnNames.includes('audit_cycle_id')) {
    console.log('Migrating database: removing audit_cycle_id dependencies...');
    
    try {
      // Create new position_mappings table without audit_cycle_id
      database.run(`
        CREATE TABLE IF NOT EXISTS position_mappings_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id TEXT NOT NULL UNIQUE,
          cupa_code TEXT REFERENCES cupa_positions(cupa_code),
          institutional_title TEXT NOT NULL,
          employee_name TEXT NOT NULL,
          division TEXT NOT NULL,
          department TEXT NOT NULL,
          supervisor TEXT,
          vp_stem TEXT NOT NULL,
          audit_status TEXT NOT NULL DEFAULT 'pending',
          assigned_reviewer_id INTEGER REFERENCES users(id),
          review_date TEXT,
          current_salary REAL,
          hire_date TEXT,
          role_start_date TEXT,
          hourly_rate REAL,
          fte REAL DEFAULT 1.0,
          appointment_months INTEGER DEFAULT 12,
          compensation_type TEXT DEFAULT 'salaried',
          has_housing_benefit INTEGER DEFAULT 0,
          housing_value REAL DEFAULT 15000,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      
      // Copy data - keep most recent entry for each employee_id
      // Use CASE to handle columns that may not exist yet in the old table
      const oldPmCols = database.exec('PRAGMA table_info(position_mappings)');
      const oldPmColNames = oldPmCols[0]?.values.map(row => row[1] as string) || [];
      const hasRoleStartDate = oldPmColNames.includes('role_start_date');
      const hasHourlyRate = oldPmColNames.includes('hourly_rate');
      
      database.run(`
        INSERT OR REPLACE INTO position_mappings_new 
        (id, employee_id, cupa_code, institutional_title, employee_name, division, department, 
         supervisor, vp_stem, audit_status, assigned_reviewer_id, review_date, 
         current_salary, hire_date, role_start_date, hourly_rate, fte, appointment_months, compensation_type, 
         has_housing_benefit, housing_value, created_at)
        SELECT id, employee_id, cupa_code, institutional_title, employee_name, division, department,
               supervisor, vp_stem, audit_status, assigned_reviewer_id, review_date,
               current_salary, hire_date, 
               ${hasRoleStartDate ? 'role_start_date' : 'NULL'},
               ${hasHourlyRate ? 'hourly_rate' : 'NULL'},
               fte, appointment_months, compensation_type,
               has_housing_benefit, housing_value, created_at
        FROM position_mappings
        WHERE id IN (
          SELECT MAX(id) FROM position_mappings GROUP BY employee_id
        )
      `);
      
      // Drop old table and rename new one
      database.run('DROP TABLE position_mappings');
      database.run('ALTER TABLE position_mappings_new RENAME TO position_mappings');
      
      console.log('Migrated position_mappings table');
    } catch (err) {
      console.error('Error migrating position_mappings:', err);
    }
    
    try {
      // Check equity_analysis table
      const eaColumns = database.exec('PRAGMA table_info(equity_analysis)');
      const eaColumnNames = eaColumns[0]?.values.map(row => row[1] as string) || [];
      
      if (eaColumnNames.includes('audit_cycle_id')) {
        // Create new equity_analysis table without audit_cycle_id
        database.run(`
          CREATE TABLE IF NOT EXISTS equity_analysis_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            position_mapping_id INTEGER NOT NULL UNIQUE REFERENCES position_mappings(id) ON DELETE CASCADE,
            base_median REAL,
            adjusted_median REAL,
            total_compensation REAL,
            equity_gap REAL,
            gap_percentage REAL,
            years_in_role REAL,
            proposed_raise REAL DEFAULT 0,
            adjustment_notes TEXT,
            calculated_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);
        
        // Copy data - keep most recent analysis for each position
        database.run(`
          INSERT OR REPLACE INTO equity_analysis_new
          (id, position_mapping_id, base_median, adjusted_median, total_compensation, 
           equity_gap, gap_percentage, years_in_role, adjustment_notes, calculated_at)
          SELECT id, position_mapping_id, base_median, adjusted_median, total_compensation,
                 equity_gap, gap_percentage, years_in_role, adjustment_notes, calculated_at
          FROM equity_analysis
          WHERE id IN (
            SELECT MAX(id) FROM equity_analysis GROUP BY position_mapping_id
          )
        `);
        
        // Drop old table and rename new one  
        database.run('DROP TABLE equity_analysis');
        database.run('ALTER TABLE equity_analysis_new RENAME TO equity_analysis');
        
        console.log('Migrated equity_analysis table');
      }
    } catch (err) {
      console.error('Error migrating equity_analysis:', err);
    }
    
    // Recreate indexes
    database.run('CREATE INDEX IF NOT EXISTS idx_position_mappings_vp_stem ON position_mappings(vp_stem)');
    database.run('CREATE INDEX IF NOT EXISTS idx_position_mappings_division ON position_mappings(division)');
    database.run('CREATE INDEX IF NOT EXISTS idx_position_mappings_audit_status ON position_mappings(audit_status)');
    database.run('CREATE INDEX IF NOT EXISTS idx_position_mappings_cupa_code ON position_mappings(cupa_code)');
    database.run('CREATE INDEX IF NOT EXISTS idx_position_mappings_employee_id ON position_mappings(employee_id)');
    database.run('CREATE INDEX IF NOT EXISTS idx_equity_analysis_position ON equity_analysis(position_mapping_id)');
    
    console.log('Database migration complete');
  }

  // Migrate equity_review_cycles to add PC workflow statuses to CHECK constraint
  const ercTableInfo = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='equity_review_cycles'");
  const ercCreateSql = ercTableInfo[0]?.values[0]?.[0] as string || '';
  
  if (ercCreateSql && !ercCreateSql.includes('pending_pc_approval')) {
    console.log('Migrating equity_review_cycles to add PC workflow statuses...');
    try {
      database.run(`
        CREATE TABLE equity_review_cycles_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          fiscal_year TEXT NOT NULL,
          total_budget REAL,
          status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calculating', 'pending_vp_review', 'vp_review_in_progress', 'hr_final_review', 'pending_pc_approval', 'pc_approved', 'pc_rejected', 'approved', 'implemented', 'archived')),
          cupa_data_year TEXT,
          deadline TEXT,
          created_by_id INTEGER NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          notes TEXT,
          pc_submitted_at TEXT DEFAULT NULL,
          pc_submitted_by_id INTEGER DEFAULT NULL,
          pc_vote_date TEXT DEFAULT NULL,
          pc_vote_result TEXT DEFAULT NULL,
          pc_vote_notes TEXT DEFAULT NULL
        )
      `);
      
      // Get column names from old table to handle migration gracefully
      const oldCols = database.exec('PRAGMA table_info(equity_review_cycles)');
      const oldColNames = oldCols[0]?.values.map(row => row[1] as string) || [];
      const hasPcCols = oldColNames.includes('pc_submitted_at');
      
      if (hasPcCols) {
        database.run(`
          INSERT INTO equity_review_cycles_new 
          SELECT id, name, fiscal_year, total_budget, status, cupa_data_year, deadline,
                 created_by_id, created_at, updated_at, notes,
                 pc_submitted_at, pc_submitted_by_id, pc_vote_date, pc_vote_result, pc_vote_notes
          FROM equity_review_cycles
        `);
      } else {
        database.run(`
          INSERT INTO equity_review_cycles_new (id, name, fiscal_year, total_budget, status, cupa_data_year, deadline,
                 created_by_id, created_at, updated_at, notes)
          SELECT id, name, fiscal_year, total_budget, status, cupa_data_year, deadline,
                 created_by_id, created_at, updated_at, notes
          FROM equity_review_cycles
        `);
      }
      
      database.run('DROP TABLE equity_review_cycles');
      database.run('ALTER TABLE equity_review_cycles_new RENAME TO equity_review_cycles');
      
      console.log('Successfully migrated equity_review_cycles table');
    } catch (err) {
      console.error('Failed to migrate equity_review_cycles:', err);
    }
  }

  // Add vp_supplemental_offer column to vp_review_status if it doesn't exist
  const vprsColumns = database.exec('PRAGMA table_info(vp_review_status)');
  const vprsColumnNames = vprsColumns[0]?.values.map(row => row[1] as string) || [];
  
  if (!vprsColumnNames.includes('vp_supplemental_offer')) {
    try {
      database.run('ALTER TABLE vp_review_status ADD COLUMN vp_supplemental_offer REAL DEFAULT NULL');
      database.run('ALTER TABLE vp_review_status ADD COLUMN supplemental_offer_notes TEXT DEFAULT NULL');
      database.run('ALTER TABLE vp_review_status ADD COLUMN supplemental_offered_at TEXT DEFAULT NULL');
      console.log('Added vp_supplemental_offer columns to vp_review_status');
    } catch {
      // Columns might already exist
    }
  }

  // Add HR approval columns to vp_review_status if they don't exist
  if (!vprsColumnNames.includes('hr_approved_at')) {
    try {
      database.run('ALTER TABLE vp_review_status ADD COLUMN hr_approved_at TEXT DEFAULT NULL');
      database.run('ALTER TABLE vp_review_status ADD COLUMN hr_approved_by_id INTEGER DEFAULT NULL');
      console.log('Added HR approval columns to vp_review_status');
    } catch {
      // Columns might already exist
    }
  }

  // Add PC (President's Cabinet) approval columns to equity_review_cycles if they don't exist
  const ercColumns = database.exec('PRAGMA table_info(equity_review_cycles)');
  const ercColumnNames = ercColumns[0]?.values.map(row => row[1] as string) || [];
  
  if (!ercColumnNames.includes('pc_submitted_at')) {
    try {
      database.run('ALTER TABLE equity_review_cycles ADD COLUMN pc_submitted_at TEXT DEFAULT NULL');
      database.run('ALTER TABLE equity_review_cycles ADD COLUMN pc_submitted_by_id INTEGER DEFAULT NULL');
      database.run('ALTER TABLE equity_review_cycles ADD COLUMN pc_vote_date TEXT DEFAULT NULL');
      database.run('ALTER TABLE equity_review_cycles ADD COLUMN pc_vote_result TEXT DEFAULT NULL');
      database.run('ALTER TABLE equity_review_cycles ADD COLUMN pc_vote_notes TEXT DEFAULT NULL');
      console.log('Added PC approval columns to equity_review_cycles');
    } catch {
      // Columns might already exist
    }
  }

  // Add SAML/Okta columns to users table if they don't exist
  const userColumns = database.exec('PRAGMA table_info(users)');
  const userColumnNames = userColumns[0]?.values.map(row => row[1] as string) || [];
  
  if (!userColumnNames.includes('okta_id')) {
    try {
      database.run("ALTER TABLE users ADD COLUMN okta_id TEXT DEFAULT NULL");
      database.run("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'");
      console.log('Added okta_id and auth_provider columns to users');
    } catch {
      // Columns might already exist
    }
  }

  // Migrate vp_review_status to add 'finalized' status to CHECK constraint
  // Check if we need to migrate by looking at the table schema
  const vprsTableInfo = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='vp_review_status'");
  const vprsCreateSql = vprsTableInfo[0]?.values[0]?.[0] as string || '';
  
  if (vprsCreateSql && !vprsCreateSql.includes('finalized')) {
    console.log('Migrating vp_review_status to add finalized status...');
    try {
      // Create new table with updated constraint
      database.run(`
        CREATE TABLE vp_review_status_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cycle_id INTEGER NOT NULL REFERENCES equity_review_cycles(id) ON DELETE CASCADE,
          vp_stem TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'approved', 'changes_requested', 'hr_revised', 'finalized')),
          allocated_budget REAL,
          proposed_total REAL,
          employee_count INTEGER,
          sent_at TEXT,
          reviewed_at TEXT,
          reviewed_by_id INTEGER REFERENCES users(id),
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          vp_supplemental_offer REAL DEFAULT NULL,
          supplemental_offer_notes TEXT DEFAULT NULL,
          supplemental_offered_at TEXT DEFAULT NULL,
          hr_approved_at TEXT DEFAULT NULL,
          hr_approved_by_id INTEGER DEFAULT NULL,
          UNIQUE(cycle_id, vp_stem)
        )
      `);
      
      // Copy data from old table
      database.run(`
        INSERT INTO vp_review_status_new 
        SELECT id, cycle_id, vp_stem, status, allocated_budget, proposed_total, employee_count,
               sent_at, reviewed_at, reviewed_by_id, notes, created_at,
               vp_supplemental_offer, supplemental_offer_notes, supplemental_offered_at,
               hr_approved_at, hr_approved_by_id
        FROM vp_review_status
      `);
      
      // Drop old table and rename new one
      database.run('DROP TABLE vp_review_status');
      database.run('ALTER TABLE vp_review_status_new RENAME TO vp_review_status');
      
      console.log('Successfully migrated vp_review_status table');
    } catch (err) {
      console.error('Failed to migrate vp_review_status:', err);
    }
  }
}

// Close database connection (for clean shutdown)
export function closeDatabase(): void {
  stopAutoSave();
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}

// Helper function to run parameterized queries and get results
export function dbAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const db = getDatabase();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function dbGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  const results = dbAll<T>(sql, params);
  return results[0];
}

export function dbRun(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number } {
  const db = getDatabase();
  db.run(sql, params);
  const changes = db.getRowsModified();
  const lastInsertRowid = dbGet<{ id: number }>('SELECT last_insert_rowid() as id')?.id || 0;
  saveDatabase(); // Auto-save after writes
  return { changes, lastInsertRowid };
}
