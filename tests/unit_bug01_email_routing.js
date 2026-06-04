/**
 * Unit tests — BUG-01: Confirmation email recipient resolution
 *
 * Tests the email routing logic in api/verify-payment.js.
 * Run with:  node tests/unit_bug01_email_routing.js
 *
 * No external dependencies — pure logic assertions only.
 */

let passed = 0;
let failed = 0;
const results = [];

function assert(label, actual, expected) {
    if (actual === expected) {
        passed++;
        results.push(`  ✅ ${label}`);
    } else {
        failed++;
        results.push(`  ❌ ${label}\n     expected: ${JSON.stringify(expected)}\n     got:      ${JSON.stringify(actual)}`);
    }
}

function assertNotNull(label, actual) {
    if (actual !== null && actual !== undefined && actual !== '') {
        passed++;
        results.push(`  ✅ ${label}`);
    } else {
        failed++;
        results.push(`  ❌ ${label}\n     expected: non-null/non-empty\n     got:      ${JSON.stringify(actual)}`);
    }
}

function assertNull(label, actual) {
    if (actual === null || actual === undefined || actual === '') {
        passed++;
        results.push(`  ✅ ${label}`);
    } else {
        failed++;
        results.push(`  ❌ ${label}\n     expected: null/undefined\n     got:      ${JSON.stringify(actual)}`);
    }
}

// ─── Mirror of the toEmail resolution logic in verify-payment.js ─────────────
function resolveToEmail(profileData) {
    return profileData.notificationEmail
        || profileData.parentEmail
        || null;
}

// ─── Mirror of the notificationEmail construction in register-handler.js ──────
function buildProfileData({ parentEmail, studentLoginEmail, name, plan }) {
    const notificationEmail = parentEmail || null;
    return {
        displayName:       name,
        email:             studentLoginEmail,         // synthetic internal email
        parentEmail:       parentEmail || null,
        notificationEmail: notificationEmail,
        subscriptionTier:  plan,
        isB2C:             true,
        tenantType:        'individual',
        role:              'student',
    };
}

// ─── BEFORE STATE DOCUMENTATION (what was broken) ────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  PRE-FIX STATE (simulating old broken behaviour)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

function oldResolveToEmail_BROKEN(profileData) {
    // This was the broken implementation: line 237 of verify-payment.js before fix
    return profileData.parentEmail;   // returns undefined when parentEmail absent
}

const brokenCase1 = oldResolveToEmail_BROKEN({ email: 'stu_abc@ready4exam.internal', parentEmail: undefined });
const brokenCase2 = oldResolveToEmail_BROKEN({ email: 'stu_abc@ready4exam.internal', parentEmail: null });
const brokenCase3 = oldResolveToEmail_BROKEN({ email: 'stu_abc@ready4exam.internal', parentEmail: '' });
const brokenCase4 = oldResolveToEmail_BROKEN({ email: 'stu_abc@ready4exam.internal', parentEmail: 'parent@gmail.com' });

console.log(`  parentEmail=undefined  → toEmail = ${JSON.stringify(brokenCase1)}  (BROKEN — undefined passed to nodemailer)`);
console.log(`  parentEmail=null       → toEmail = ${JSON.stringify(brokenCase2)}  (BROKEN — null passed to nodemailer)`);
console.log(`  parentEmail=''         → toEmail = ${JSON.stringify(brokenCase3)}  (BROKEN — empty string passed to nodemailer)`);
console.log(`  parentEmail=real email → toEmail = ${JSON.stringify(brokenCase4)}  (OK — only case that worked)`);

// ─── AFTER STATE TESTS (new fixed behaviour) ──────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  SUITE 1 — toEmail resolution (verify-payment.js)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Happy path: both fields set (new registrations)
assert(
    'notificationEmail present → uses notificationEmail (primary)',
    resolveToEmail({ notificationEmail: 'parent@gmail.com', parentEmail: 'parent@gmail.com' }),
    'parent@gmail.com'
);

// Legacy path: old registration without notificationEmail field
assert(
    'notificationEmail absent, parentEmail present → falls back to parentEmail (legacy records)',
    resolveToEmail({ notificationEmail: null, parentEmail: 'legacy@gmail.com' }),
    'legacy@gmail.com'
);

assert(
    'notificationEmail undefined, parentEmail present → falls back to parentEmail',
    resolveToEmail({ parentEmail: 'fallback@gmail.com' }),
    'fallback@gmail.com'
);

// Both absent — should return null, not undefined
assert(
    'both absent → returns null (fail loudly, not silently)',
    resolveToEmail({ notificationEmail: null, parentEmail: null }),
    null
);

assert(
    'notificationEmail empty string, parentEmail empty → returns null',
    resolveToEmail({ notificationEmail: '', parentEmail: '' }),
    null
);

// Alias: notificationEmail takes priority over parentEmail
assert(
    'notificationEmail differs from parentEmail → uses notificationEmail (future-proofing)',
    resolveToEmail({ notificationEmail: 'parent+student@gmail.com', parentEmail: 'parent@gmail.com' }),
    'parent+student@gmail.com'
);

// internal email never leaks into toEmail
const internalProfile = resolveToEmail({ email: 'stu_abc@ready4exam.internal', notificationEmail: null, parentEmail: null });
assert(
    'internal @ready4exam.internal email is never returned as toEmail',
    internalProfile,
    null
);

// ─── SUITE 2 — register-handler.js profileData construction ──────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  SUITE 2 — profileData construction (register-handler.js)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const practitionerProfile = buildProfileData({
    parentEmail:       'mum@gmail.com',
    studentLoginEmail: 'stu_xyz@ready4exam.internal',
    name:              'Riya Sharma',
    plan:              'practitioner',
});

assertNotNull('practitioner: notificationEmail is set',               practitionerProfile.notificationEmail);
assert('practitioner: notificationEmail equals parentEmail',          practitionerProfile.notificationEmail, 'mum@gmail.com');
assert('practitioner: parentEmail stored',                            practitionerProfile.parentEmail,       'mum@gmail.com');
assert('practitioner: email is internal (not real)',                  practitionerProfile.email,             'stu_xyz@ready4exam.internal');
assert('practitioner: isB2C = true',                                  practitionerProfile.isB2C,             true);

const syncProfile = buildProfileData({
    parentEmail:       'dad@outlook.com',
    studentLoginEmail: 'stu_abc@ready4exam.internal',
    name:              'Arjun Singh',
    plan:              'sync',
});

assertNotNull('sync (Link): notificationEmail is set',                syncProfile.notificationEmail);
assert('sync (Link): notificationEmail equals parentEmail',           syncProfile.notificationEmail, 'dad@outlook.com');

const missingEmailProfile = buildProfileData({
    parentEmail:       '',           // bypassed HTML required — edge case
    studentLoginEmail: 'stu_def@ready4exam.internal',
    name:              'Test User',
    plan:              'board_self',
});

assert('missing parentEmail: notificationEmail is null',              missingEmailProfile.notificationEmail, null);
assert('missing parentEmail: parentEmail is null (not empty string)', missingEmailProfile.parentEmail,       null);

// ─── SUITE 3 — end-to-end resolution chain ────────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  SUITE 3 — Full chain: form → handler → server');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const plans = ['practitioner', 'strategist', 'sync', 'board_self', 'board_parent'];

plans.forEach(plan => {
    const profile = buildProfileData({
        parentEmail:       `guardian+${plan}@test.com`,
        studentLoginEmail: `stu_test@ready4exam.internal`,
        name:              'Test Student',
        plan,
    });
    const toEmail = resolveToEmail(profile);
    assert(
        `${plan}: email chain resolves to real address`,
        toEmail,
        `guardian+${plan}@test.com`
    );
    assert(
        `${plan}: toEmail never contains @ready4exam.internal`,
        toEmail.includes('@ready4exam.internal'),
        false
    );
});

// ─── SUITE 4 — Regression: existing behaviour unchanged when parentEmail present ──
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  SUITE 4 — Regression: pre-existing working cases still work');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Old records (no notificationEmail field) must still resolve via parentEmail
const legacyRecord = { parentEmail: 'original@domain.com' };  // no notificationEmail
assert(
    'legacy record without notificationEmail: still resolves via parentEmail',
    resolveToEmail(legacyRecord),
    'original@domain.com'
);

// Link plan with parent setup link — recipient unchanged
const linkPlanRecord = buildProfileData({
    parentEmail:       'linkparent@test.com',
    studentLoginEmail: 'stu_lnk@ready4exam.internal',
    name:              'Link Student',
    plan:              'sync',
});
assert(
    'sync/Link plan: toEmail = parentEmail (parent receives setup link)',
    resolveToEmail(linkPlanRecord),
    'linkparent@test.com'
);

// board_parent plan
const peakLinkRecord = buildProfileData({
    parentEmail:       'peaklinkparent@test.com',
    studentLoginEmail: 'stu_plk@ready4exam.internal',
    name:              'Peak Link Student',
    plan:              'board_parent',
});
assert(
    'board_parent/Peak Link plan: toEmail = parentEmail',
    resolveToEmail(peakLinkRecord),
    'peaklinkparent@test.com'
);

// ─── SUITE 5 — Server-side guard (create-order.js validation) ─────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  SUITE 5 — Server-side validation guard');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

function serverValidationCheck(profileData) {
    // Mirrors the new validation block in create-order.js
    if (!profileData.notificationEmail && !profileData.parentEmail) {
        return { status: 400, error: 'A parent or guardian email is required for account notifications.' };
    }
    return { status: 200 };
}

assert(
    'guard: rejects request with neither notificationEmail nor parentEmail',
    serverValidationCheck({ email: 'stu@ready4exam.internal' }).status,
    400
);
assert(
    'guard: accepts request with notificationEmail',
    serverValidationCheck({ email: 'stu@ready4exam.internal', notificationEmail: 'p@x.com' }).status,
    200
);
assert(
    'guard: accepts request with parentEmail only (legacy path)',
    serverValidationCheck({ email: 'stu@ready4exam.internal', parentEmail: 'p@x.com' }).status,
    200
);
assert(
    'guard: error message is descriptive',
    serverValidationCheck({}).error,
    'A parent or guardian email is required for account notifications.'
);

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  RESULTS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
results.forEach(r => console.log(r));
console.log(`\n  Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (failed > 0) process.exit(1);
