import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, requireRoles, type AuthenticatedRequest } from '../middleware/auth.js';
import { dbRun, saveDatabase } from '../db/init.js';

export const adminRouter = Router();

// POST /api/admin/reset-database — wipe all data and recreate test users
adminRouter.post(
  '/reset-database',
  requireAuth,
  requireRoles('system_admin', 'hr_admin'),
  async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    console.log(`⚠️  Database reset triggered by ${user.email}`);

    try {
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
        } catch {
          console.log(`  ⚠ Skipped ${table} (may not exist)`);
        }
      }

      // Re-create admin user
      const adminPassword = bcrypt.hashSync('admin123', 10);
      dbRun(
        'INSERT INTO users (email, password_hash, name, role, division) VALUES (?, ?, ?, ?, ?)',
        ['admin@moravian.edu', adminPassword, 'System Administrator', 'system_admin', null]
      );

      // Re-create HR admin
      const hrPassword = bcrypt.hashSync('hr123', 10);
      dbRun(
        'INSERT INTO users (email, password_hash, name, role, division) VALUES (?, ?, ?, ?, ?)',
        ['hr@moravian.edu', hrPassword, 'HR Administrator', 'hr_admin', null]
      );

      // Re-create VP reviewer accounts
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
      }

      saveDatabase();

      console.log('✅ Database reset complete via API');

      res.json({
        success: true,
        message: 'Database reset complete. All data cleared, login users recreated.',
        usersCreated: 2 + vpStems.length,
      });
    } catch (err) {
      console.error('Database reset failed:', err);
      res.status(500).json({
        success: false,
        message: err instanceof Error ? err.message : 'Reset failed',
      });
    }
  }
);
