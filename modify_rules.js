const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

const newRule = `
    // PYQ Bank Collection
    match /PYQ_Bank/{document=**} {
      allow read: if isLoggedIn();
      allow write: if isAdmin() || isOwner();
    }
`;

rules = rules.replace('    // Activity Logs Collection', newRule + '\n    // Activity Logs Collection');

fs.writeFileSync('firestore.rules', rules);
