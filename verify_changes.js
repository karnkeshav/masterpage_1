const fs = require('fs');

const filesToCheck = [
    'cbse/class-9/js/auth-paywall.js',
    'cbse/class-9/js/api.js',
    'cbse/class-9/js/quiz-engine.js',
    'cbse/class-9/index.html',
    'cbse/class-9/chapter-selection.html',
    'cbse/class-9/cognitive-priming.html',
    'cbse/class-9/consoles/admin.html',
    'cbse/class-9/consoles/principal.html',
    'cbse/class-9/consoles/teacher.html',
    'cbse/class-9/consoles/student.html',
    'cbse/class-9/consoles/parent.html',
    'cbse/class-9/js/ui-renderer.js'
];

let errors = [];

filesToCheck.forEach(file => {
    if (!fs.existsSync(file)) {
        errors.push(`Missing file: ${file}`);
    } else {
        console.log(`Verified existence: ${file}`);
    }
});

// Check content of auth-paywall.js for checkRole
const authContent = fs.readFileSync('cbse/class-9/js/auth-paywall.js', 'utf8');
if (!authContent.includes('export async function checkRole')) {
    errors.push('auth-paywall.js missing checkRole export');
}

// Check api.js for getChapterMastery
const apiContent = fs.readFileSync('cbse/class-9/js/api.js', 'utf8');
if (!apiContent.includes('export async function getChapterMastery')) {
    errors.push('api.js missing getChapterMastery export');
}

// Check quiz-engine.js for Fortress Logic
const quizContent = fs.readFileSync('cbse/class-9/js/quiz-engine.js', 'utf8');
if (!quizContent.includes('getChapterMastery')) {
    errors.push('quiz-engine.js missing getChapterMastery call');
}

if (errors.length > 0) {
    console.error('Verification Failed:');
    errors.forEach(e => console.error(`- ${e}`));
    process.exit(1);
} else {
    console.log('All static verifications passed.');
}
