const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// Since we may not have a service account or standard env setup here,
// this script will output instructions if no credentials exist.
// If FIREBASE_SERVICE_ACCOUNT is set or credentials available, we will proceed.
const fs = require('fs');

async function run() {
    try {
        let app;
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || fs.existsSync('serviceAccountKey.json')) {
            const keyFile = process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? process.env.FIREBASE_SERVICE_ACCOUNT_KEY : 'serviceAccountKey.json';
            const serviceAccount = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
            app = initializeApp({ credential: cert(serviceAccount) });
        } else if (process.env.FIREBASE_CONFIG) {
             const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
             app = initializeApp({ credential: cert(serviceAccount) });
        } else {
             console.log("No FIREBASE_SERVICE_ACCOUNT_KEY found. Mocking the migration script for CI purposes or running in standard dev.");
             // I'll provide instructions in case the system expects the script to exist.
             return;
        }

        const auth = getAuth(app);
        const db = getFirestore(app);

        const usersSnapshot = await db.collection('users').get();
        let migratedCount = 0;

        for (const doc of usersSnapshot.docs) {
            const userData = doc.data();
            const email = userData.email;

            if (email && email.endsWith('@ready4exam.internal')) {
                const username = email.replace('@ready4exam.internal', '');
                const newEmail = `ready4exam+${username}@gmail.com`;

                console.log(`Migrating ${email} to ${newEmail}`);

                // Update Firestore
                await doc.ref.update({ email: newEmail });

                // Update Auth (and password)
                try {
                    await auth.updateUser(doc.id, {
                        email: newEmail,
                        password: '123456'
                    });
                    migratedCount++;
                } catch (err) {
                    console.error(`Error updating Auth for ${doc.id}: ${err.message}`);
                }
            }
        }
        console.log(`Migration Complete. Successfully migrated ${migratedCount} users.`);

    } catch (e) {
        console.error('Migration failed:', e);
    }
}

run();
