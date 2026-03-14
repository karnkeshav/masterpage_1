with open('masterpage_1/js/admin-console.js', 'r') as f:
    content = f.read()

old_code = '''                    const classTeachers = teacherList.filter(t => {
                        const tSecs = t.sections || [];
                        return tSecs.includes(sectionKey) || tSecs.includes(sectionKeyHyphen);
                    });'''

new_code = '''                    const classTeachers = teacherList.filter(t => {
                        const tSecs = t.sections || [];
                        // Check array field (new format)
                        if (tSecs.includes(sectionKey) || tSecs.includes(sectionKeyHyphen)) return true;
                        // Fallback: check singular fields (old format from Assign button / CSV)
                        if (t.mapped_grade == g && t.mapped_section === s) return true;
                        return false;
                    });'''

content = content.replace(old_code, new_code)

with open('masterpage_1/js/admin-console.js', 'w') as f:
    f.write(content)
