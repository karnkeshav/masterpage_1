import re

with open("app/consoles/teacher.html", "r") as f:
    content = f.read()

# Add renderRoster and nudgeParent functions before renderRemedialQueue
render_functions = """        function calculateRemedialQueue() {"""

new_render_functions = """
        window.nudgeParent = async (uid) => {
            const students = window.sectionStudents || { uids: [], names: {}, parentIds: {} };
            const parentId = students.parentIds[uid];
            if (!parentId) return;

            const studentName = students.names[uid] || uid;
            const chapter = activeChapters.find(c => c.id === selectedChapterId)?.title || selectedChapterId;

            try {
                await addDoc(collection(db, "messages"), {
                    type: "NUDGE",
                    target_role: "parent",
                    target_uid: [parentId],
                    content: `Hi, your child ${studentName} hasn't attempted the ${chapter} quiz yet. Please encourage them to practice.`,
                    timestamp: serverTimestamp(),
                    school_id: window.teacherProfile?.school_id || ''
                });
                alert('Nudge sent to parent successfully.');
            } catch (error) {
                console.error("Error sending nudge", error);
                alert("Failed to send nudge: " + error.message);
            }
        };

        function renderRoster() {
            let optionsHtml = activeChapters.map(c => `<option value="${c.id}" ${c.id === selectedChapterId ? 'selected' : ''}>${esc(c.title)}</option>`).join('');

            const students = window.sectionStudents || { uids: [], names: {}, parentIds: {} };
            const studentCount = students.uids.length;

            let rosterHtml = '';
            if (studentCount === 0) {
                rosterHtml = `<tr><td colSpan="3" class="p-8 text-center text-slate-400 italic font-medium">No students found in this section.</td></tr>`;
            } else {
                students.uids.forEach(uid => {
                    const hasScore = studentScores.some(s =>
                        s.user_id === uid && (s.topicSlug === selectedChapterId || s.topic === selectedChapterId || s.chapter === selectedChapterId)
                    );
                    const name = students.names[uid] || uid;
                    const parentId = students.parentIds[uid];

                    let connectivityHtml = '';
                    if (!hasScore) {
                        if (parentId) {
                            connectivityHtml = `<button onclick="window.nudgeParent('${uid}')" class="bg-cbse-blue text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm hover:bg-blue-800 transition active:scale-95">Nudge Parent</button>`;
                        } else {
                            connectivityHtml = `
                                <div class="flex items-center gap-2">
                                    <span class="bg-warning-yellow/10 text-warning-yellow px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-warning-yellow/20">Unlinked</span>
                                    <button class="bg-slate-200 text-slate-600 px-3 py-1 rounded-lg text-xs font-bold shadow-sm hover:bg-slate-300 transition active:scale-95">Prompt Student</button>
                                </div>
                            `;
                        }
                    } else {
                        connectivityHtml = `<span class="text-success-green font-bold text-xs"><i class="fas fa-check"></i> Attempted</span>`;
                    }

                    rosterHtml += `
                        <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0">
                            <td class="p-4 font-bold text-slate-800">${esc(name)}</td>
                            <td class="p-4 text-center font-bold text-slate-500">${currentContext.section}</td>
                            <td class="p-4 text-right">${connectivityHtml}</td>
                        </tr>
                    `;
                });
            }

            document.getElementById('tab-viewport').innerHTML = `
                <div class="space-y-6">
                    <div class="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <div>
                            <h2 class="text-xl font-black text-slate-800">Section Performance (Roster)</h2>
                            <p class="text-sm text-slate-500">View roster and connectivity status for ${currentContext.grade}-${currentContext.section}.</p>
                        </div>
                        <select onchange="window.handleSelectChapter(event)" class="bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm font-bold px-4 py-2 outline-none focus:ring-2 focus:ring-cbse-blue cursor-pointer shadow-sm">
                            ${optionsHtml}
                        </select>
                    </div>

                    <div class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm">
                                <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                                    <tr>
                                        <th class="p-4">Student</th>
                                        <th class="p-4 text-center">Class / Sec</th>
                                        <th class="p-4 text-right">Parent Connectivity</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-50">
                                    ${rosterHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }

        function calculateRemedialQueue() {"""

content = content.replace(render_functions, new_render_functions)

with open("app/consoles/teacher.html", "w") as f:
    f.write(content)
