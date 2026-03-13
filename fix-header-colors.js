const fs = require('fs');
let curr = fs.readFileSync('app/curriculum.html', 'utf8');
curr = curr.replace(/<header class="bg-cbse-blue[^"]*"/g, '<header class="!bg-cbse-blue shadow-lg py-4 px-6 sticky top-0 z-40 flex justify-between items-center w-full"');
fs.writeFileSync('app/curriculum.html', curr);

let chap = fs.readFileSync('app/chapter-selection.html', 'utf8');
chap = chap.replace(/<header class="bg-cbse-blue[^"]*"/g, '<header class="!bg-cbse-blue shadow-lg py-4 px-6 sticky top-0 z-40 flex justify-between items-center w-full"');
fs.writeFileSync('app/chapter-selection.html', chap);
console.log('Done replacing header backgrounds.');
