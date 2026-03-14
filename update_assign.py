import re

with open('masterpage_1/js/admin-console.js', 'r') as f:
    content = f.read()

old_code = '''        await updateDoc(doc(db, "users", teacherUid), {
            mapped_grade: grade,
            mapped_section: section,
            mapped_discipline: discipline,
            updated_at: serverTimestamp()
        });'''

new_code = '''        await updateDoc(doc(db, "users", teacherUid), {
            sections: arrayUnion(`${grade}${section}`),
            mapped_disciplines: arrayUnion(discipline),
            updated_at: serverTimestamp()
        });'''

content = content.replace(old_code, new_code)

with open('masterpage_1/js/admin-console.js', 'w') as f:
    f.write(content)
