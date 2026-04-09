const fs = require('fs');

let code = fs.readFileSync('js/admin-console.js', 'utf8');

// The original deleteStudent function
const oldFuncRegex = /window\.deleteStudent = async \(studentUid, name\) => \{[\s\S]*?alert\('Failed to delete student: ' \+ error\.message\);\s*\n\s*\};\n/g;

const newFunc = `window.deleteStudent = async (studentUid, name) => {
    if (!confirm(\`Are you sure you want to permanently delete student \${name}? This will also unlink them from their parent.\`)) return;

    try {
        const { db } = await getInitializedClients();
        const studentRef = doc(db, 'users', studentUid);
        const studentSnap = await getDoc(studentRef);

        if (studentSnap.exists()) {
            const studentData = studentSnap.data();
            const parentId = studentData.parent_id;

            if (parentId) {
                // Remove student from parent's linked_children array
                try {
                    const parentRef = doc(db, 'users', parentId);
                    await updateDoc(parentRef, {
                        linked_children: arrayRemove(studentUid),
                        updated_at: serverTimestamp()
                    });
                } catch (unlinkErr) {
                    console.warn("Could not unlink from parent:", unlinkErr);
                }
            }
        }

        // Delete the student record from Firestore
        await deleteDoc(studentRef);
        alert('Student deleted successfully.');
    } catch (error) {
        console.error("Failed to delete student:", error);
        alert("Failed to delete student: " + error.message);
    }
};
`;

code = code.replace(oldFuncRegex, newFunc);
fs.writeFileSync('js/admin-console.js', code);
console.log("Patched Task A");
