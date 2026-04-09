import re

with open('js/admin-console.js', 'r') as f:
    content = f.read()

# Replace the delete button for students
# We only want to replace it in the 'student' block
# Find the student block:
student_block_match = re.search(r"(if \(type === 'student'\) \{.*?\n\s+return `.*?)(\s*<button onclick=\"window\.deleteUser.*?)(</div>)", content, re.DOTALL)

if student_block_match:
    prefix = student_block_match.group(1)
    # The new button
    new_btn = """<button onclick="window.deleteStudent('${u.id}', '${(u.displayName || u.email || '').replace(/'/g, "\\\\'")}')" class="text-danger-red hover:text-red-800 font-bold text-[10px] bg-red-50 px-2 py-1 rounded-lg border border-red-100 shadow-sm transition active:scale-95 ml-2">Delete</button>"""

    # We need to replace the old button in the student block specifically
    # Instead of regex group replacement which can be tricky, let's just do a string replacement on the extracted student block

    # Actually, simpler: search for the specific deleteUser button in the student block
    pass
