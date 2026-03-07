62:        if (tabId === 'inventory') window.renderInventoryEngine();
63-        if (tabId === 'observability') window.renderObservability();
64-        if (tabId === 'messaging') window.renderMessaging();
65-    }
66-};
67-
68-// --- THE INVENTORY NAVIGATION ENGINE ---
69:window.renderInventoryEngine = async () => {
70-    const container = document.getElementById('tab-inventory');
71-
72-    // Generate Accordion HTML structure
73-    let classesAccordionHtml = '';
74-    const grades = [6, 7, 8, 9, 10, 11, 12];
75-    const sections = ['A', 'B', 'C'];
76-
77-    grades.forEach(g => {
78-        let sectionHtml = '';
79-        sections.forEach(s => {
80-            sectionHtml += `
81-                <div class="mb-2 border border-slate-200 rounded bg-white">
82-                    <button onclick="window.toggleAccordion('acc-sec-${g}-${s}')" class="w-full text-left p-2 font-bold flex justify-between items-center text-xs hover:bg-slate-50">
83-                        <span>Section ${s}</span>
84-                        <i class="fas fa-chevron-down text-slate-400 transition-transform duration-200" id="icon-acc-sec-${g}-${s}"></i>
85-                    </button>
86-                    <div id="acc-sec-${g}-${s}" class="hidden p-2 border-t border-slate-100">
87-                        <div class="flex justify-end mb-2">
88-                            <button onclick="window.showAddModal('student', '${g}', '${s}')" class="bg-cbse-blue hover:bg-blue-800 text-white px-3 py-1.5 text-xs rounded-lg font-bold shadow-sm transition"><i class="fas fa-plus mr-1"></i> Add Student</button>
89-                        </div>
90-                        <div class="overflow-x-auto rounded-lg border border-slate-100">
91-                            <table class="w-full text-left text-xs">
92-                                <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
93-                                    <tr><th class="p-2">Name / Email</th><th class="p-2">Linked Parent</th><th class="p-2 text-right">Actions</th></tr>
94-                                </thead>
95-                                <tbody id="tbody-student-${g}-${s}" class="divide-y divide-slate-50"><tr><td colspan="3" class="p-2 text-center text-slate-400 italic">Loading...</td></tr></tbody>
96-                            </table>
97-                        </div>
98-                    </div>
99-                </div>
100-            `;
101-        });
102-
103-        classesAccordionHtml += `
104-            <div class="mb-2 border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm">
105-                <button onclick="window.toggleAccordion('acc-grade-${g}')" class="w-full text-left p-3 font-bold flex justify-between items-center text-sm hover:bg-slate-50">
106-                    <span class="text-slate-800"><i class="fas fa-graduation-cap text-cbse-blue mr-2"></i> Grade ${g}</span>
107-                    <i class="fas fa-chevron-down text-slate-400 transition-transform duration-200" id="icon-acc-grade-${g}"></i>
108-                </button>
109-                <div id="acc-grade-${g}" class="hidden p-3 border-t border-slate-100 bg-slate-50/50">
110-                    ${sectionHtml}
111-                </div>
112-            </div>
113-        `;
114-    });
115-
116-    container.innerHTML = `
117-        <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 h-full flex flex-col" id="inventory-main">
118-            <div class="flex justify-between items-center mb-6">
119-                <div>
120-                    <h2 class="text-2xl font-black text-slate-800">Inventory Registry</h2>
121-                    <p class="text-sm text-slate-500 mt-1">Manage ${currentSchoolId} registry via the Master Vaults.</p>
122-                </div>
123-            </div>
124-
125-            <div class="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
126-
127-                <!-- Vault 1: Academic Classes -->
128-                <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
129-                    <button onclick="window.toggleAccordion('acc-classes')" class="w-full text-left p-4 bg-slate-50 font-bold flex justify-between items-center hover:bg-slate-100 transition">
130-                        <span class="text-lg text-slate-800"><i class="fas fa-layer-group text-cbse-blue mr-2"></i> Vault 1: Academic Classes</span>
131-                        <i class="fas fa-chevron-down text-slate-400 transition-transform duration-200" id="icon-acc-classes"></i>
132-                    </button>
133-                    <div id="acc-classes" class="hidden p-4 border-t border-slate-200 bg-slate-50/30">
134-                        ${classesAccordionHtml}
135-                    </div>
136-                </div>
137-
138-                <!-- Vault 2: Faculty Inventory -->
139-                <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
140-                    <button onclick="window.toggleAccordion('acc-teachers')" class="w-full text-left p-4 bg-slate-50 font-bold flex justify-between items-center hover:bg-slate-100 transition">
141-                        <span class="text-lg text-slate-800"><i class="fas fa-chalkboard-teacher text-amber-500 mr-2"></i> Vault 2: Faculty Inventory</span>
142-                        <i class="fas fa-chevron-down text-slate-400 transition-transform duration-200" id="icon-acc-teachers"></i>
143-                    </button>
144-                    <div id="acc-teachers" class="hidden p-4 border-t border-slate-200">
145-                        <div class="flex justify-end mb-4">
146-                            <button onclick="window.showAddModal('teacher')" class="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-xs rounded-xl font-bold shadow-sm transition"><i class="fas fa-plus mr-1"></i> Add Teacher</button>
147-                        </div>
148-                        <div class="overflow-hidden border border-slate-100 rounded-xl bg-white shadow-sm">
149-                            <table class="w-full text-left text-sm">
150-                                <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
151-                                    <tr><th class="p-4">Name / Email</th><th class="p-4">Discipline</th><th class="p-4">Assigned Section</th><th class="p-4 text-right">Actions</th></tr>
152-                                </thead>
153-                                <tbody id="tbody-teachers" class="divide-y divide-slate-50"><tr><td colspan="4" class="p-4 text-center text-slate-400 italic">Loading...</td></tr></tbody>
154-                            </table>
155-                        </div>
156-                    </div>
157-                </div>
158-
159-                <!-- Vault 3: VIP Dignitaries -->
160-                <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
161-                    <button onclick="window.toggleAccordion('acc-vips')" class="w-full text-left p-4 bg-slate-50 font-bold flex justify-between items-center hover:bg-slate-100 transition">
162-                        <span class="text-lg text-slate-800"><i class="fas fa-star text-purple-500 mr-2"></i> Vault 3: VIP Dignitaries</span>
163-                        <i class="fas fa-chevron-down text-slate-400 transition-transform duration-200" id="icon-acc-vips"></i>
164-                    </button>
165-                    <div id="acc-vips" class="hidden p-4 border-t border-slate-200">
166-                        <div class="flex justify-end mb-4">
167-                            <button onclick="window.showAddModal('vip')" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-xs rounded-xl font-bold shadow-sm transition"><i class="fas fa-plus mr-1"></i> Add VIP</button>
168-                        </div>
169-                        <div class="overflow-hidden border border-slate-100 rounded-xl bg-white shadow-sm">
170-                            <table class="w-full text-left text-sm">
171-                                <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
172-                                    <tr><th class="p-4">Name / Email</th><th class="p-4">Role</th><th class="p-4">School ID</th><th class="p-4 text-right">Status</th></tr>
173-                                </thead>
174-                                <tbody id="tbody-vips" class="divide-y divide-slate-50"><tr><td colspan="4" class="p-4 text-center text-slate-400 italic">Loading...</td></tr></tbody>
175-                            </table>
176-                        </div>
177-                    </div>
178-                </div>
179-
180-            </div>
181-
182-            <!-- Relational Onboarding -->
183-            <div class="mt-6 border-t border-slate-100 pt-6">
184-                ${getRelationalOnboardingHTML()}
185-            </div>
186-
187-            <!-- Manual Onboarding Modal Container -->
188-            <div id="modal-container"></div>
189-        </div>
190-    `;
191-
192-    // Listen to real-time updates for all buckets
193-    if(unsubRegistry) { unsubRegistry(); }
194-
195-    const { db } = await getInitializedClients();
196-    const q = query(
197-        collection(db, "users"),
198-        where("school_id", "==", currentSchoolId)
199-    );
200-
201-    unsubRegistry = onSnapshot(q, (snapshot) => {
202-        const studentMap = {}; // grade-section -> [students]
203-        const teacherMap = [];
204-        const vipMap = [];
205-
206-        snapshot.forEach(doc => {
207-            const data = doc.data();
208-            const u = { id: doc.id, ...data };
209-
210-            if (u.role === 'student') {
211-                const g = u.grade || 'Unknown';
212-                // Extract section correctly. e.g., '9-A' -> 'A', 'A' -> 'A'
213-                let s = u.section_id || u.section || 'Unknown';
214-                if(s.includes('-')) s = s.split('-')[1];
215-
216-                const key = `${g}-${s}`;
217-                if(!studentMap[key]) studentMap[key] = [];
218-                studentMap[key].push(u);
219-            }
