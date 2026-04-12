import re

with open("app/consoles/teacher.html", "r") as f:
    content = f.read()

# 1. Update imports
old_import = """        import { loadCurriculum, getGradeFromURL } from "../../js/curriculum/loader.js";"""
new_import = """        import { loadCurriculum, getGradeFromURL, flattenSubject } from "../../js/curriculum/loader.js";"""

content = content.replace(old_import, new_import)

# 2. Update updateActiveChapters
old_update = """            // Search all subjects for the discipline
            for (const [subject, subDiscs] of Object.entries(curriculumData)) {
                if (subDiscs[disc]) {
                    chaps = subDiscs[disc];
                    currentSubject = subject.toLowerCase().replace(/\s+/g, '_');
                    break;
                }
            }"""

new_update = """            // Search all subjects for the discipline
            for (const [subject, subDiscs] of Object.entries(curriculumData)) {
                if (subDiscs[disc]) {
                    chaps = flattenSubject(subDiscs[disc]);
                    currentSubject = subject.toLowerCase().replace(/\s+/g, '_');
                    break;
                }
            }"""

content = content.replace(old_update, new_update)

with open("app/consoles/teacher.html", "w") as f:
    f.write(content)
