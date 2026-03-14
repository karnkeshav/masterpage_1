with open('masterpage_1/js/admin-console.js', 'r') as f:
    content = f.read()

old_code = '''                    <td class="p-4 text-xs font-bold text-slate-500">${u.mapped_discipline || 'Unassigned'}</td>
                    <td class="p-4 text-xs font-bold text-slate-500">${u.mapped_section || 'Unassigned'}</td>'''

new_code = '''                    <td class="p-4 text-xs font-bold text-slate-500">${(u.mapped_disciplines || []).join(', ') || u.mapped_discipline || 'Unassigned'}</td>
                    <td class="p-4 text-xs font-bold text-slate-500">${(u.sections || []).join(', ') || u.mapped_section || 'Unassigned'}</td>'''

content = content.replace(old_code, new_code)

with open('masterpage_1/js/admin-console.js', 'w') as f:
    f.write(content)
