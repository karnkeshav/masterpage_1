const fs = require('fs');
let code = fs.readFileSync('js/admin-console.js', 'utf8');

// I'll just find the "if (type === 'student')" block and replace the deleteUser button in it
const parts = code.split("if (type === 'student') {");
if (parts.length > 1) {
    let studentBlock = parts[1];

    // The replace target
    const target = 'onclick="window.deleteUser(';
    const targetIdx = studentBlock.indexOf(target);

    if (targetIdx !== -1) {
        // Find the button end
        const btnEnd = studentBlock.indexOf('</button>', targetIdx) + 9;

        // Extract the original button to keep its internal string interpolation
        const oldBtn = studentBlock.substring(studentBlock.lastIndexOf('<button', targetIdx), btnEnd);

        const newBtn = oldBtn
            .replace('window.deleteUser', 'window.deleteStudent')
            .replace('active:scale-95"', 'active:scale-95 ml-2"');

        studentBlock = studentBlock.replace(oldBtn, newBtn);
        code = parts[0] + "if (type === 'student') {" + studentBlock;
        fs.writeFileSync('js/admin-console.js', code);
        console.log("Patched successfully");
    } else {
        console.log("Could not find window.deleteUser in student block");
    }
}
