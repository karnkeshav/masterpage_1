const fs = require('fs');
const path = require('path');

const getFiles = (dir, fileList = []) => {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      if (!name.includes('node_modules') && !name.includes('.git') && !name.includes('data')) {
        getFiles(name, fileList);
      }
    } else if (file === 'curriculum.js') {
      fileList.push(name);
    }
  });
  return fileList;
};

const curriculumFiles = getFiles('./');
const timestamp = new Date().toISOString().split('T')[0];
const results = { cbse: [], scert: [], icse: [], other: [] };

// Subjects to be EXCLUDED from the "Core" report
const languageSubjects = ["hindi", "english", "sanskrit"];

curriculumFiles.forEach(filePath => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/curriculum\s*=\s*(\{[\s\S]*\});/);
    if (!match) return;

    const curriculum = new Function(`return ${match[1]}`)();
    const pathParts = filePath.split(path.sep);
    const board = pathParts[0].toLowerCase();
    const className = pathParts[1].toUpperCase();
    const targetBoard = results[board] ? board : 'other';

    Object.keys(curriculum).forEach(subject => {
      const subjectsData = curriculum[subject];
      Object.keys(subjectsData).forEach(bookOrStream => {
        const count = subjectsData[bookOrStream].length;

        let categoryName = bookOrStream;
        if (className.includes("11") || className.includes("12")) {
            if (bookOrStream.toLowerCase().includes("science")) categoryName = "Science Stream";
            else if (bookOrStream.toLowerCase().includes("commerce")) categoryName = "Commerce Stream";
            else if (bookOrStream.toLowerCase().includes("humanities") || bookOrStream.toLowerCase().includes("arts")) categoryName = "Humanities Stream";
        }

        results[targetBoard].push({ 
          "Class": className, 
          "Subject": subject, 
          "Category": categoryName,
          "Count": count,
          "IsLanguage": languageSubjects.includes(subject.toLowerCase())
        });
      });
    });
  } catch (e) { console.error(`Error: ${e.message}`); }
});

Object.keys(results).forEach(board => {
  if (results[board].length === 0) return;

  const dir = path.join('data', board);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const generateFiles = (isFullReport, suffix) => {
    const data = isFullReport ? results[board] : results[board].filter(r => !r.IsLanguage);
    const title = isFullReport ? "FULL CONTENT (All Subjects)" : "CORE CONTENT (No Languages)";
    
    // Custom sort: Class 6, 7, 8, 9, 10, 11, 12
    data.sort((a, b) => {
      const numA = parseInt(a.Class.match(/\d+/));
      const numB = parseInt(b.Class.match(/\d+/));
      return numA - numB;
    });

    let mdTable = `# ${board.toUpperCase()} ${title} - ${timestamp}\n\n`;
    mdTable += `| Class | Subject | Category/Stream | Chapters |\n| :--- | :--- | :--- | :--- |\n`;
    
    let csv = `Class,Subject,Category,Chapters\n`;
    let grandTotal = 0;
    let currentClass = "";
    let classTotal = 0;

    data.forEach((row, index) => {
      // Logic for Class Subtotals
      if (currentClass !== "" && currentClass !== row.Class) {
        mdTable += `| **${currentClass}** | **TOTAL FOR ${currentClass}** | **---** | **${classTotal}** |\n`;
        grandTotal += classTotal;
        classTotal = 0;
      }
      
      currentClass = row.Class;
      classTotal += row.Count;
      mdTable += `| ${row.Class} | ${row.Subject} | ${row.Category} | ${row.Count} |\n`;
      csv += `${row.Class},${row.Subject},${row.Category},${row.Count}\n`;

      // Handle the final class subtotal
      if (index === data.length - 1) {
        mdTable += `| **${currentClass}** | **TOTAL FOR ${currentClass}** | **---** | **${classTotal}** |\n`;
        grandTotal += classTotal;
      }
    });

    mdTable += `| | | **GRAND TOTAL ALL CLASSES** | **${grandTotal}** |\n`;
    csv += `,,,TOTAL:${grandTotal}\n`;

    fs.writeFileSync(path.join(dir, `report_${suffix}_${timestamp}.md`), mdTable);
    fs.writeFileSync(path.join(dir, `data_${suffix}_${timestamp}.csv`), csv);
  };

  generateFiles(true, "full");   // Includes Hindi, English, Sanskrit
  generateFiles(false, "core");  // Excludes Hindi, English, Sanskrit
});
