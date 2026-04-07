const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

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
             return;
        }

        const auth = getAuth(app);
        const db = getFirestore(app);

        const usersSnapshot = await db.collection('users').get();
        let migratedCount = 0;

                for (const doc of usersSnapshot.docs) {
            const userData = doc.data();
            const email = userData.email;

            if (email) {
                let username = null;
                if (email.endsWith('@ready4exam.internal')) {
                    username = email.replace('@ready4exam.internal', '');
                } else if (email.startsWith('ready4exam+') && email.endsWith('@gmail.com')) {
                    username = email.substring('ready4exam+'.length, email.indexOf('@gmail.com'));
                }

                if (username !== null) {
                    const newEmail = `ready4urexam+${username}@gmail.com`;

                    console.log(`Migrating ${email} to ${newEmail}`);

                    await doc.ref.update({ email: newEmail });

                    try {
                        const updatePayload = { email: newEmail };

                        if (!['keshav', 'dps.ready4exam', 'admin'].includes(username)) {
                            updatePayload.password = '123456';
                        }

                        await auth.updateUser(doc.id, updatePayload);
                        migratedCount++;
                    } catch (err) {
                        console.error(`Error updating Auth for ${doc.id}: ${err.message}`);
                    }
                }
            }
        }
        console.log(`Migration Complete. Successfully migrated ${migratedCount} users.`);

    } catch (e) {
        console.error('Migration failed:', e);
    }
}

run();
