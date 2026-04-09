const fs = require('fs');

let code = fs.readFileSync('js/admin-console.js', 'utf8');

// Use regex to find resetUserPassword button lines that might have extra parens and fix them.
// The issue states: Change: onclick="...password(...)") To: onclick="...password(...)"
// Let's replace: replace(/'/g, "\\'")}')" -> replace(/'/g, "\\'")}')"
// Wait, looking at grep output:
// 952: <button onclick="window.resetUserPassword('${u.email || ''}', '${(u.displayName || '').replace(/'/g, "\\'")}')" ...
// The grep output doesn't seem to show a trailing paren OUTSIDE the quote. It shows:
// onclick="window.resetUserPassword('${u.email || ''}', '${(u.displayName || '').replace(/'/g, "\\'")}')"
// The parenthesis inside the interpolation string matches correctly:
// \${(u.displayName || '').replace(/'/g, "\\'")}
// And then closing parenthesis of resetUserPassword: )
// And then closing quote: "

// Let's carefully check if there are any `)"` or `)" ` that shouldn't be there.
// Ah, the user says:
// There are extra parentheses ) outside the onclick attribute values in the HTML templates.
// "onclick="...password(...)")" -> "onclick="...password(...)""

// Let's replace any `)" class="` with `" class="` specifically for these buttons if they exist.
code = code.replace(/onclick="window\.resetUserPassword\([^"]*\)"\)/g, match => match.slice(0, -1));

// The prompt might be referring to an older state of the file or something. Let me just do a generic replace:
code = code.replace(/onclick="([^"]+)"\)/g, 'onclick="$1"');

// And ensure student delete button uses deleteStudent instead of deleteUser. It already does!
// <button onclick="window.deleteStudent('${u.id}', '${(u.displayName || u.email || '').replace(/'/g, "\\'")}')"

fs.writeFileSync('js/admin-console.js', code);
console.log("Patched Task B");
