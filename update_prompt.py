with open('masterpage_1/js/admin-console.js', 'r') as f:
    content = f.read()

old_code = '''const section = prompt("Enter Section (e.g., A):");'''

new_code = '''const section = prompt("Enter Section letter (e.g., A):");'''

content = content.replace(old_code, new_code)

with open('masterpage_1/js/admin-console.js', 'w') as f:
    f.write(content)
