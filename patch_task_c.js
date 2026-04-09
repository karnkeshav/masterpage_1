const fs = require('fs');
const file = 'app/consoles/student.html';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `window.routeToLibrary = (subject) => {
                window.location.href = \`../study-library.html?subject=\${encodeURIComponent(subject)}\`;
            };`;

const newStr = `window.routeToLibrary = (subject) => {
                const userGrade = window.currentUserProfile?.grade || window.currentUserProfile?.classId?.split('-')[0] || "9";
                window.location.href = \`../study-library.html?grade=\${userGrade}&subject=\${encodeURIComponent(subject)}\`;
            };`;

if (code.includes('window.routeToLibrary = (subject) => {')) {
    // Basic replacement for routeToLibrary
    code = code.replace(/window\.routeToLibrary = \(subject\) => \{[\s\S]*?\};/, newStr);
    fs.writeFileSync(file, code);
    console.log("Patched routeToLibrary in student.html");
} else {
    console.log("Could not find routeToLibrary");
}
