import re

with open("app/consoles/teacher.html", "r") as f:
    content = f.read()

# 1. Update fetchSectionStudents
old_fetch = """            const studentNames = {};
            studentsSnap.docs.forEach(d => {
                studentNames[d.id] = d.data().displayName || d.data().email || d.id;
            });
            window.sectionStudents = { uids: studentUids, names: studentNames };"""

new_fetch = """            const studentNames = {};
            const studentParentIds = {};
            studentsSnap.docs.forEach(d => {
                const data = d.data();
                studentNames[d.id] = data.displayName || data.email || d.id;
                studentParentIds[d.id] = data.parent_id || null;
            });
            window.sectionStudents = { uids: studentUids, names: studentNames, parentIds: studentParentIds };"""

content = content.replace(old_fetch, new_fetch)

# 2. Add roster tab to desktop sidebar
old_sidebar_btn = """                <button id="tab-btn-remedial" onclick="window.switchTab('remedial')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm shadow-sm text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-200">
                    <i class="fas fa-user-nurse w-5 text-center"></i> Remedial Queue
                </button>"""

new_sidebar_btn = """                <button id="tab-btn-remedial" onclick="window.switchTab('remedial')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm shadow-sm text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-200">
                    <i class="fas fa-user-nurse w-5 text-center"></i> Remedial Queue
                </button>
                <button id="tab-btn-roster" onclick="window.switchTab('roster')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm shadow-sm text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-200">
                    <i class="fas fa-users w-5 text-center"></i> Student Roster
                </button>"""

content = content.replace(old_sidebar_btn, new_sidebar_btn)

# 3. Add roster tab to mobile nav
old_mobile_btn = """            <button onclick="window.switchTab('remedial')" class="flex flex-col items-center text-xs font-bold text-slate-500 hover:text-cbse-blue">
                <i class="fas fa-user-nurse text-lg mb-1"></i> Remedial
            </button>"""

new_mobile_btn = """            <button onclick="window.switchTab('remedial')" class="flex flex-col items-center text-xs font-bold text-slate-500 hover:text-cbse-blue">
                <i class="fas fa-user-nurse text-lg mb-1"></i> Remedial
            </button>
            <button onclick="window.switchTab('roster')" class="flex flex-col items-center text-xs font-bold text-slate-500 hover:text-cbse-blue">
                <i class="fas fa-users text-lg mb-1"></i> Roster
            </button>"""

content = content.replace(old_mobile_btn, new_mobile_btn)


# 4. Update switchTab logic
old_switch_tab = """            ['curriculum', 'analytics', 'remedial'].forEach(t => {"""
new_switch_tab = """            ['curriculum', 'analytics', 'remedial', 'roster'].forEach(t => {"""

content = content.replace(old_switch_tab, new_switch_tab)

# 5. Update renderTab logic
old_render_tab = """        function renderTab() {
            if (activeTab === 'curriculum') renderCurriculumHub();
            else if (activeTab === 'analytics') renderSectionHeatmap();
            else if (activeTab === 'remedial') renderRemedialQueue();
        }"""

new_render_tab = """        function renderTab() {
            if (activeTab === 'curriculum') renderCurriculumHub();
            else if (activeTab === 'analytics') renderSectionHeatmap();
            else if (activeTab === 'remedial') renderRemedialQueue();
            else if (activeTab === 'roster') renderRoster();
        }"""

content = content.replace(old_render_tab, new_render_tab)

with open("app/consoles/teacher.html", "w") as f:
    f.write(content)
