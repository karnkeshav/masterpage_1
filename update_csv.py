with open('masterpage_1/js/admin-console.js', 'r') as f:
    content = f.read()

old_code = '''                        await updateDoc(doc(db, "users", userId), {
                            mapped_grade: targetGrade,
                            mapped_section: targetSection,
                            mapped_discipline: targetDiscipline,
                            updated_at: serverTimestamp()
                        });'''

new_code = '''                        await updateDoc(doc(db, "users", userId), {
                            sections: arrayUnion(`${targetGrade}${targetSection}`),
                            mapped_disciplines: arrayUnion(targetDiscipline),
                            updated_at: serverTimestamp()
                        });'''

content = content.replace(old_code, new_code)

with open('masterpage_1/js/admin-console.js', 'w') as f:
    f.write(content)
