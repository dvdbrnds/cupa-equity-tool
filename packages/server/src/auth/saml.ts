import passport from 'passport';
import { Strategy as SamlStrategy } from '@node-saml/passport-saml';
import type { Profile } from '@node-saml/node-saml';
import type { VerifiedCallback } from '@node-saml/passport-saml';
import { dbGet, dbRun } from '../db/init.js';
import { generateToken } from '../middleware/auth.js';
import type { User } from '@cupa/shared';

// ── SAML Configuration from environment ─────────────────────────────────────

export const SAML_ENABLED = !!(
  process.env.SAML_ENTRY_POINT &&
  process.env.SAML_ISSUER &&
  process.env.SAML_CERT
);

const SAML_CONFIG = {
  entryPoint: process.env.SAML_ENTRY_POINT || '',
  issuer: process.env.SAML_ISSUER || '',
  cert: process.env.SAML_CERT || '',
  callbackUrl: process.env.SAML_CALLBACK_URL || '',
  // Okta group names that map to app roles
  adminGroup: process.env.SAML_ADMIN_GROUP || 'CUPA Admins',
  vpGroup: process.env.SAML_VP_GROUP || 'CUPA VPs',
  // Default role for users not in any known group
  defaultRole: 'hr_analyst' as const,
};

// ── Group → Role mapping ────────────────────────────────────────────────────

type AppRole = 'system_admin' | 'hr_admin' | 'hr_analyst' | 'vp_reviewer' | 'executive' | 'academic_dean';

function mapGroupsToRole(groups: string[]): AppRole {
  const lowerGroups = groups.map(g => g.toLowerCase());
  const adminGroupLower = SAML_CONFIG.adminGroup.toLowerCase();
  const vpGroupLower = SAML_CONFIG.vpGroup.toLowerCase();

  // Check for admin group membership
  if (lowerGroups.some(g => g === adminGroupLower || g.includes(adminGroupLower))) {
    return 'hr_admin';
  }

  // Check for VP group membership
  if (lowerGroups.some(g => g === vpGroupLower || g.includes(vpGroupLower))) {
    return 'vp_reviewer';
  }

  return SAML_CONFIG.defaultRole;
}

// ── Extract attributes from SAML profile ────────────────────────────────────

interface SamlUserAttributes {
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  oktaId: string;
  groups: string[];
}

function extractAttributes(profile: Profile): SamlUserAttributes {
  // Okta sends attributes in various formats depending on config
  const email = (
    profile.email ||
    profile.nameID ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
    ''
  ) as string;

  const firstName = (
    profile.firstName ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] ||
    profile['User.FirstName'] ||
    ''
  ) as string;

  const lastName = (
    profile.lastName ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'] ||
    profile['User.LastName'] ||
    ''
  ) as string;

  const name = firstName && lastName
    ? `${firstName} ${lastName}`
    : (profile.displayName || profile.name || email.split('@')[0] || 'Unknown User') as string;

  const oktaId = (profile.nameID || email) as string;

  // Groups can come as a string or array
  let groups: string[] = [];
  const rawGroups = profile.groups || profile['http://schemas.xmlsoap.org/claims/Group'] || profile.memberOf || [];
  if (typeof rawGroups === 'string') {
    groups = [rawGroups];
  } else if (Array.isArray(rawGroups)) {
    groups = rawGroups as string[];
  }

  return { email, name, firstName, lastName, oktaId, groups };
}

// ── Find or create user from SAML profile ───────────────────────────────────

export function findOrCreateSamlUser(profile: Profile): { user: User; token: string } {
  const attrs = extractAttributes(profile);

  if (!attrs.email) {
    throw new Error('No email address in SAML response');
  }

  // Look for existing user by okta_id first, then email
  let dbUser = dbGet<{
    id: number;
    email: string;
    name: string;
    role: string;
    division: string | null;
    is_active: number;
    created_at: string;
    okta_id: string | null;
    auth_provider: string | null;
  }>(
    'SELECT id, email, name, role, division, is_active, created_at, okta_id, auth_provider FROM users WHERE okta_id = ? OR email = ?',
    [attrs.oktaId, attrs.email]
  );

  if (dbUser) {
    // Update existing user with Okta info if not already set
    if (!dbUser.okta_id || dbUser.auth_provider !== 'okta') {
      dbRun(
        'UPDATE users SET okta_id = ?, auth_provider = ?, name = ? WHERE id = ?',
        [attrs.oktaId, 'okta', attrs.name, dbUser.id]
      );
    }

    // Update role based on group membership (unless system_admin — don't demote)
    if (dbUser.role !== 'system_admin' && attrs.groups.length > 0) {
      const newRole = mapGroupsToRole(attrs.groups);
      if (newRole !== dbUser.role) {
        dbRun('UPDATE users SET role = ? WHERE id = ?', [newRole, dbUser.id]);
        dbUser.role = newRole;
      }
    }

    if (!dbUser.is_active) {
      throw new Error('Account is disabled');
    }
  } else {
    // Create new user from SAML attributes
    const role = attrs.groups.length > 0 ? mapGroupsToRole(attrs.groups) : SAML_CONFIG.defaultRole;

    const result = dbRun(
      'INSERT INTO users (email, password_hash, name, role, division, okta_id, auth_provider) VALUES (?, NULL, ?, ?, NULL, ?, ?)',
      [attrs.email, attrs.name, role, attrs.oktaId, 'okta']
    );

    dbUser = {
      id: result.lastInsertRowid,
      email: attrs.email,
      name: attrs.name,
      role: role,
      division: null,
      is_active: 1,
      created_at: new Date().toISOString(),
      okta_id: attrs.oktaId,
      auth_provider: 'okta',
    };
  }

  const user: User = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role as User['role'],
    division: dbUser.division,
    isActive: Boolean(dbUser.is_active),
    createdAt: dbUser.created_at,
  };

  const token = generateToken(user);
  return { user, token };
}

// ── Initialize Passport SAML Strategy ───────────────────────────────────────

export function initializeSaml(): void {
  if (!SAML_ENABLED) {
    console.log('SAML not configured — Okta SSO disabled');
    return;
  }

  console.log(`SAML configured — Okta SSO enabled (issuer: ${SAML_CONFIG.issuer})`);
  console.log(`  Admin group: "${SAML_CONFIG.adminGroup}"`);
  console.log(`  VP group: "${SAML_CONFIG.vpGroup}"`);

  const strategy = new SamlStrategy(
    {
      callbackUrl: SAML_CONFIG.callbackUrl,
      entryPoint: SAML_CONFIG.entryPoint,
      issuer: SAML_CONFIG.issuer,
      idpCert: SAML_CONFIG.cert,
      wantAssertionsSigned: false,
      wantAuthnResponseSigned: false,
    },
    // Verify callback for sign-on
    (profile: Profile | null, done: VerifiedCallback) => {
      if (!profile) {
        return done(new Error('No SAML profile received'));
      }
      try {
        const { user } = findOrCreateSamlUser(profile);
        return done(null, user as unknown as Record<string, unknown>);
      } catch (err) {
        return done(err as Error);
      }
    },
    // Verify callback for logout
    (profile: Profile | null, done: VerifiedCallback) => {
      return done(null, (profile || {}) as Record<string, unknown>);
    }
  );

  passport.use(strategy);
  setSamlStrategyRef(strategy);

  // Serialize/deserialize (we don't use passport sessions — we use JWT cookies)
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user: Record<string, unknown>, done) => done(null, user as Express.User));
}

// ── Generate SP Metadata ────────────────────────────────────────────────────

// Hold a reference to the strategy for metadata generation
let samlStrategyInstance: SamlStrategy | null = null;

export function setSamlStrategyRef(strategy: SamlStrategy): void {
  samlStrategyInstance = strategy;
}

export function getSpMetadata(): string | null {
  if (!SAML_ENABLED || !samlStrategyInstance) return null;
  return samlStrategyInstance.generateServiceProviderMetadata(null, null);
}
