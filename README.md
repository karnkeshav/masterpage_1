# Ready4Exam — Masterpage Repository

Ready4Exam is a web-based learning platform for schools, students, parents, teachers, administrators, principals, practitioners, and platform owners. In simple words, it helps a student choose a class and subject, study a chapter, take quizzes, identify mistakes, and get guided remediation until mastery improves. At the same time, adults around the student can monitor progress and take action from role-specific consoles.

This README is written for non-technical readers first, and then for developers who need to run, test, or extend the repository.

---

## 1. What this product does

Ready4Exam is built around one idea: **learning should not stop when a quiz ends**.

A normal quiz app only shows marks. Ready4Exam tries to create a full learning loop:

1. A learner signs in.
2. The system sends the learner to the correct dashboard based on their role.
3. The learner selects a class, subject, chapter, and quiz difficulty.
4. The quiz engine records the attempt.
5. Weak areas and mistakes are saved.
6. The student, parent, teacher, and school can see what needs attention.
7. Remedial practice and follow-up workflows help the learner improve.

The repository currently supports:

- A public marketing and login flow.
- A unified app area for classes, curriculum, study content, quizzes, previous-year questions, exam analytics, and mistake review.
- Persona dashboards for students, parents, teachers, school admins, principals, practitioners, and platform owners.
- Firebase-backed authentication, user profiles, school tenancy, quiz attempts, messaging, and remediation data.
- A testing toolchain for curriculum and browser audits.

---

## 2. Plain-English glossary

| Term | Meaning |
| --- | --- |
| **Persona** | A type of user, such as student, parent, teacher, admin, principal, practitioner, or owner. |
| **Console** | A dashboard made for one persona. For example, the Teacher Console is the teacher's dashboard. |
| **Tenant** | A customer group. A school is a tenant; an individual paid user can also be treated as an individual tenant. |
| **B2B / School user** | A user who belongs to a school account. |
| **B2C / Individual user** | A user who buys or uses Ready4Exam directly, not through a school. |
| **Curriculum** | The structured list of classes, subjects, chapters, and learning units. |
| **Quiz Engine** | The common quiz screen and logic used across classes and subjects. |
| **Mistake Notebook** | A saved list of questions/concepts a learner got wrong, used for remediation. |
| **Remediation** | Follow-up learning or practice given after weak performance. |
| **Intercom / Messaging** | Internal messages and alerts between school/admin/teacher/parent/student workflows. |
| **Exam Pulse** | Analytics that look at exam patterns and help students focus on high-priority chapters/topics. |
| **PYQ** | Previous Year Question papers or question practice. |

---

## 3. Repository architecture at a glance

The project has moved from old folder-based pages to a more unified Single Page Application style. New development should happen mainly in `app/` and `js/`.

```text
masterpage_1/
├── index.html                  # Public landing/login entry
├── register.html               # Registration page
├── school-landing.html          # School landing/gateway page
├── offering.html                # Offering/subscription page
├── app/                         # Main app screens
│   ├── class-hub.html           # Class/grade landing experience
│   ├── curriculum.html          # Subject/chapter selection
│   ├── study-content.html       # Study material view
│   ├── quiz-engine.html         # Unified quiz interface
│   ├── review.html              # Mistake review / notebook path
│   ├── mistake-book.html        # Mistake book experience
│   ├── pyq.html                 # Previous-year question vault
│   ├── pyq_insights.html        # PYQ insights
│   ├── exam_pulse.html          # Exam pattern analytics
│   └── consoles/                # Persona dashboards
│       ├── student.html/js
│       ├── teacher.html/js
│       ├── parent.html/js
│       ├── admin.html/js
│       ├── principal.html/js
│       ├── practitioner.html/js
│       └── owner.html/js
├── js/                          # Shared application logic
│   ├── auth-paywall.js          # Login, profile, and routing decisions
│   ├── api.js                   # Firebase data access and scoring helpers
│   ├── quiz-engine.js           # Quiz controller
│   ├── curriculum/              # Curriculum data by class and loader
│   ├── shell.js                 # Shared header/footer shell
│   ├── config.js                # Firebase initialization wrapper
│   └── ...                      # Feature-specific modules
├── css/                         # Global styling
├── images/                      # Static images and flags
├── api/                         # Serverless payment/password endpoints
├── tests/                       # Python and JS verification scripts
├── testing_tool/                # Playwright/stress/curriculum testing utilities
├── verification/                # Verification assets and screenshots
├── data/                        # CBSE/SCERT report and CSV data
├── archive/                     # Refined exam/question datasets
├── firestore.rules              # Firebase Firestore security rules
├── firestore.indexes.json       # Firestore indexes
├── package.json                 # Root Node.js dependencies and scripts
└── vercel.json                  # Deployment configuration
```

### Important architectural rules

- **Use `app/` for new screens.** Old `cbse/`-style folders are deprecated and should not receive new feature work.
- **Use shared JavaScript in `js/`.** Do not duplicate quiz/auth/curriculum logic inside individual pages unless truly necessary.
- **Do not hardcode old `cbse/` routes.** User routing is centralized in `js/auth-paywall.js`.
- **Keep app paths Android-friendly.** Pages inside `app/` should use relative imports such as `../js/...` or `../../js/...`, not absolute `/js/...` paths, so the app can work with `file://` packaging.
- **Preserve remediation.** Mistakes and weak areas should continue to feed the Mistake Notebook and remedial workflows.

---

## 4. Main personas and what each one does

Ready4Exam is a multi-persona system. Each persona sees a different console.

### 4.1 Student

**Who this is for:** A learner using Ready4Exam to study, practice, and improve.

**Main file:** `app/consoles/student.html` with logic in `app/consoles/student.js`.

**Student can:**

- See their learning dashboard.
- View class/grade context.
- Open subject and chapter learning rooms.
- Start a new quiz.
- Review average mastery, subject mastery, chapter coverage, and recent performance.
- Open the Knowledge Hub for subject-based learning.
- Access Exam Pulse and PYQ tools when available.
- Receive inbox/intercom nudges from adults or system workflows.
- Launch assigned remediation from inbox alerts.
- Build progress through repeated quiz attempts.

**Typical student workflow:**

1. Student logs in.
2. System routes student to the Student Console.
3. Student chooses subject or chapter.
4. Student studies content or starts a quiz.
5. Quiz result is saved.
6. Mistakes and weak topics are tracked.
7. Student reviews weak areas and attempts remediation.
8. Dashboard mastery updates after attempts.

---

### 4.2 Parent

**Who this is for:** A parent or guardian who wants to monitor and support a child's learning.

**Main file:** `app/consoles/parent.html` with logic in `app/consoles/parent.js`.

**Parent can:**

- View child performance and chapter-level readiness.
- Switch between linked children if more than one child is connected.
- See priority alerts and inbox messages.
- Review score patterns and growth indicators.
- Use a parent-facing matrix to understand where the child is strong or weak.
- Open a mirrored student learning portal where supported.
- See command/remediation prompts that stay active until the student improves.

**Typical parent workflow:**

1. Parent logs in.
2. System finds the linked child or children.
3. Parent selects a child.
4. Parent sees chapter and performance status.
5. Parent checks alerts and recommended action.
6. Parent nudges or supports the child to complete remediation.

---

### 4.3 Teacher

**Who this is for:** A teacher responsible for a class, section, or subject.

**Main file:** `app/consoles/teacher.html` with logic in `app/consoles/teacher.js`.

**Teacher can:**

- Select grade, section, and discipline/subject.
- Use the Curriculum Hub to mark chapters as finished or revoke completion.
- See class heatmaps and chapter health.
- View analytics for student attempts and mastery.
- Maintain a class roster view.
- Identify remedial queues of students who need help.
- Nudge parents about a student's weak area.
- Open student detail views for deeper inspection.

**Typical teacher workflow:**

1. Teacher logs in.
2. Teacher chooses grade, section, and discipline.
3. Teacher opens Curriculum Hub.
4. Teacher marks taught chapters as finished.
5. Teacher reviews heatmap and analytics.
6. Teacher checks remedial queue.
7. Teacher nudges parent/student where action is needed.

---

### 4.4 School Admin

**Who this is for:** A school operations user who manages people and communication.

**Main file:** `app/consoles/admin.html` with logic in `app/consoles/admin.js`.

**Admin can:**

- Manage school inventory of classes, sections, students, teachers, and VIP users.
- Add students, teachers, and VIP dignitaries.
- Auto-provision accounts in Firebase Authentication.
- Link students to parent accounts.
- Use bulk processing/import flows.
- Observe VIP users and operational status.
- Send messages through the Sovereign Intercom.

**Typical admin workflow:**

1. Admin logs in.
2. Admin opens Inventory.
3. Admin creates or imports users.
4. Admin assigns students to grade/section and teachers to responsibilities.
5. Admin links parent accounts to students.
6. Admin uses messaging for announcements or targeted alerts.
7. Admin monitors observability panels.

---

### 4.5 Principal / Institutional Head

**Who this is for:** A school leader who wants institutional-level visibility.

**Main file:** `app/consoles/principal.html` with logic in `app/consoles/principal.js`.

**Principal can:**

- View institutional pulse/overview.
- Track curriculum status.
- Review talent or student distribution views.
- See a board war-room style view for school readiness.
- Monitor faculty efficiency by subject or teacher activity.
- Watch progress across classes/sections from a leadership perspective.

**Typical principal workflow:**

1. Principal logs in.
2. Principal lands on school/institution view.
3. Principal checks overview metrics.
4. Principal reviews curriculum and faculty progress.
5. Principal identifies classes or subjects needing intervention.
6. Principal coordinates with teachers/admins.

---

### 4.6 Practitioner

**Who this is for:** An individual user focused mainly on practice, usually outside a school tenant.

**Main file:** `app/consoles/practitioner.html` with logic in `app/consoles/practitioner.js`.

**Practitioner can:**

- Access a practice-first console.
- Select practice context.
- Move into curriculum or quiz flows.
- Use Ready4Exam as an individual learning/practice tool.

**Typical practitioner workflow:**

1. Practitioner logs in.
2. System verifies individual practitioner access.
3. Practitioner chooses class/subject/chapter.
4. Practitioner starts practice or quiz.
5. Results feed the same learning and improvement loop.

---

### 4.7 Owner / Platform Operator

**Who this is for:** The person or team operating Ready4Exam as a platform.

**Main file:** `app/consoles/owner.html` with logic in `app/consoles/owner.js`.

**Owner can:**

- View platform command center.
- Monitor revenue and usage KPIs.
- Provision school instances.
- Calculate licenses.
- Manage B2C users.
- Reset user passwords.
- Archive school instances.
- View event ledgers and system pulse.
- Manage platform-level operational data.

**Typical owner workflow:**

1. Owner logs in.
2. Owner opens Command Center.
3. Owner reviews revenue/KPI panels.
4. Owner provisions a school or manages users.
5. Owner checks event ledger/system pulse.
6. Owner performs operational actions such as reset/archive when needed.

---

## 5. Main user-routing workflow

The file `js/auth-paywall.js` is the central gatekeeper. After login, it checks the user's Firestore profile and sends the user to the correct destination.

### Routing in plain English

- If the user is an **owner**, send them to the Owner Console.
- If the user belongs to a **school**:
  - Admin goes to Admin Console.
  - Principal/school gateway-style users may go through `school-landing.html`.
  - Other school roles go to their matching console, such as student, teacher, or parent.
- If the user is an **individual**:
  - Practitioner-tier users go to the Practitioner Console.
  - Strategist and other individual tiers go to the Student Console.
- If a profile is invalid or missing required school data, the system signs out the user.

### Hardcoded seed credentials

The code contains seed-style credential mappings for platform/school bootstrap roles. These are used to create or route known administrative accounts during development and setup. Production handling should be reviewed carefully before exposing any real credentials publicly.

---

## 6. Learning workflows

### 6.1 Public visitor workflow

1. Visitor opens `index.html`.
2. Visitor reads about the product or starts login/registration.
3. Visitor may open `offering.html` to see plans or product offerings.
4. Visitor registers or signs in.
5. Auth routing sends the visitor to the correct console.

### 6.2 School onboarding workflow

1. Owner provisions a school from the Owner Console.
2. School/admin user configures classes, sections, teachers, and students.
3. Student accounts are created.
4. Parent accounts are linked where available.
5. Teachers are assigned grade/section/discipline contexts.
6. Principal/admin can monitor readiness.
7. Students start learning and quiz attempts.

### 6.3 Student learning workflow

1. Student opens Student Console.
2. Student chooses subject/chapter from Knowledge Hub or curriculum.
3. Student studies or starts quiz.
4. Quiz attempt is saved.
5. Score updates mastery indicators.
6. Wrong answers become remediation material.
7. Student uses Mistake Notebook/review to improve.

### 6.4 Quiz workflow

1. A user arrives at `app/quiz-engine.html` with class, subject, chapter, or difficulty context.
2. `js/quiz-engine.js` loads the proper quiz data and state.
3. Student answers questions.
4. Results are calculated.
5. Attempt data is stored through shared API/Firebase helpers.
6. Mistakes are captured for review.
7. The user is guided back into study, review, or next practice.

### 6.5 Mistake Notebook workflow

1. Student takes a quiz.
2. Incorrect answers are saved.
3. Mistake review screens display weak questions/concepts.
4. Student retries or studies the related concept.
5. Improved attempts should reduce the active weakness over time.

### 6.6 Teacher remediation workflow

1. Teacher opens a class/section/discipline view.
2. Teacher reviews heatmaps and remedial queue.
3. Teacher identifies students below target.
4. Teacher nudges parent/student.
5. Student completes remediation.
6. Teacher sees updated attempt/mastery data.

### 6.7 Parent monitoring workflow

1. Parent opens Parent Console.
2. Parent selects child.
3. Parent reviews dashboard matrix, growth, and alerts.
4. Parent supports the child on active weak chapters.
5. Parent sees progress after new attempts.

### 6.8 Admin inventory and messaging workflow

1. Admin opens Inventory.
2. Admin adds students, teachers, or VIPs.
3. Admin links parent accounts.
4. Admin uses Intercom/Messaging to communicate.
5. Messages/notifications appear in relevant user inboxes.

### 6.9 Principal oversight workflow

1. Principal opens Institutional Pulse.
2. Principal checks overview, curriculum, talent, board war-room, and faculty views.
3. Principal identifies weak classes/subjects.
4. Principal directs teachers/admins to act.

### 6.10 Owner operations workflow

1. Owner opens platform Command Center.
2. Owner provisions schools or manages B2C users.
3. Owner monitors revenue/KPI/system pulse.
4. Owner manages platform-level ledgers and operational actions.

---

## 7. App screens explained for laymen

| Screen | What it is used for |
| --- | --- |
| `index.html` | Main public entry and login area. |
| `register.html` | New user registration. |
| `school-landing.html` | Landing page for school-linked users. |
| `offering.html` | Product offerings/subscription explanation. |
| `app/class-hub.html` | Starting point for a class or grade. |
| `app/curriculum.html` | Shows subjects and chapters to choose from. |
| `app/chapter-selection.html` | Chapter-selection flow. |
| `app/study-content.html` | Study material for selected chapter/content. |
| `app/quiz-engine.html` | Main quiz-taking page. |
| `app/review.html` | Review/remediation page. |
| `app/mistake-book.html` | Mistake Notebook experience. |
| `app/study-library.html` | Study library view. |
| `app/pyq.html` | Previous-year question paper vault. |
| `app/pyq_insights.html` | Previous-year question insights. |
| `app/exam_pulse.html` | Exam pattern and priority analytics. |
| `app/cognitive-priming.html` | Pre-learning or mental warm-up experience. |

---

## 8. Data and Firebase collections, conceptually

The app uses Firebase services for authentication and Firestore data. Exact collection names can evolve, but the code clearly works with concepts such as:

- `users` — user profiles, roles, tenant information, grade/section assignments, parent links.
- `schools` — school-level configuration and tenant data.
- `messages` — intercom/inbox messages and alerts.
- Quiz attempt/score records — saved performance history.
- `mistake_notebook` or mistake-style records — incorrect answers and remediation material.
- Curriculum files in `js/curriculum/` — class-wise subject/chapter structure.

The app also includes:

- `firestore.rules` for database security rules.
- `firestore.indexes.json` for Firestore query indexes.
- Firebase configuration helpers in `js/firebase-master-config.js`, `js/firebase-automation-config.js`, and `js/config.js`.

---

## 9. Curriculum structure

Curriculum data lives in `js/curriculum/`.

```text
js/curriculum/
├── class-6.js
├── class-7.js
├── class-8.js
├── class-9.js
├── class-10.js
├── class-11.js
├── class-12.js
└── loader.js
```

The loader helps app pages fetch the correct grade curriculum. Class files hold the subjects/chapters used by curriculum screens, quiz routing, dashboards, and progress calculations.

When adding curriculum:

1. Add or update the appropriate `class-X.js` file.
2. Keep subject names consistent across dashboards and quiz attempts.
3. Make sure chapter identifiers/slugs match quiz and performance data.
4. Run the curriculum test script.

---

## 10. Payments and serverless API endpoints

The `api/` folder contains serverless-style endpoints for operational flows such as:

- `api/create-order.js` — create a payment order.
- `api/verify-payment.js` — verify payment completion.
- `api/secure-reset.js` — secure reset flow.

The root dependencies include Razorpay, Firebase Admin, JSON Web Tokens, Nodemailer, and related packages. These endpoints should be deployed in an environment that provides the required secrets and environment variables.

---

## 11. Setup for developers

### Requirements

- Node.js and npm.
- Internet access for CDN scripts and package installation.
- Firebase project credentials/configuration.
- Browser for manual testing.
- Optional: Python if running Python verification scripts.

### Install dependencies

From the repository root:

```bash
npm install
```

The testing tool has its own package file. If you need that tool directly:

```bash
cd testing_tool
npm install
```

### Run the default test

From the repository root:

```bash
npm test
```

This runs:

```bash
node testing_tool/run_tests_curriculum.js
```

### Run a local static server

Because many files are browser pages, a simple static server is useful:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/index.html
```

If Python is unavailable, any static web server can be used.

---

## 12. Testing and verification tools

Useful files and commands:

| Purpose | Command or file |
| --- | --- |
| Default curriculum test | `npm test` |
| Curriculum test directly | `node testing_tool/run_tests_curriculum.js` |
| Full testing tool package | `testing_tool/package.json` |
| Playwright audit | `testing_tool/exhaustive_playwright_audit.js` |
| Stress test | `testing_tool/stress_test.js` |
| Performance test | `testing_tool/performance_test.js` |
| Health check | `tests/health_check.js` |
| Centralization verification | `tests/verify_centralization.py` |
| Enterprise verification | `tests/verify_enterprise.py` |
| School portal verification | `tests/verify_school_portal.py` |
| Owner verification | `tests/verify_owner.py` |
| Guest quiz verification | `verification/verify_guest_quiz.py` |

Testing reports and artifacts are stored under folders such as `test-results/`, `testing_tool/reports/`, `verification/`, and `verification_results/`.

---

## 13. Development guidelines

### Routing guidelines

- Put new main app screens under `app/`.
- Use `js/auth-paywall.js` for routing decisions.
- Do not create new hardcoded old `cbse/` paths.
- Keep persona console routes in `app/consoles/`.

### Path guidelines

Inside `app/`, use relative paths:

```html
<script src="../js/config.js" type="module"></script>
```

or for nested console pages:

```html
<script src="../../js/config.js" type="module"></script>
```

Avoid absolute paths like:

```html
<script src="/js/config.js"></script>
```

This matters because Android packaging and `file://` loading may break absolute paths.

### Data guidelines

- Keep tenant data scoped by `tenantId`, `tenantType`, `school_id`, or equivalent profile fields.
- Avoid mixing one school's data with another school's data.
- Ensure student records, parent links, teacher assignments, and school IDs stay consistent.

### Remediation guidelines

- Do not remove mistake tracking when changing quiz behavior.
- If a quiz result changes, ensure the Mistake Notebook/review flow still receives enough data.
- Teacher/parent remediation dashboards depend on saved attempt and weakness data.

### UI guidelines

- Reuse shared shell/header/footer logic where possible.
- Keep persona dashboards easy to understand.
- Add clear loading and empty states for non-technical users.
- Prefer responsive layouts because many users may be on phones.

---

## 14. Common feature-change examples

### Add a new student-facing page

1. Create the HTML page in `app/`.
2. Add related logic in `js/` or `app/` if it is tightly tied to a console.
3. Use relative script paths.
4. Link to it from Student Console or Curriculum flow.
5. Test with a student profile.

### Add a new persona console

1. Create `app/consoles/new-role.html`.
2. Create `app/consoles/new-role.js`.
3. Add or update role routing in `js/auth-paywall.js` if needed.
4. Ensure Firestore user profiles can contain `role: "new-role"`.
5. Add guard logic so other roles cannot access it.
6. Test login and direct URL access.

### Add a new class curriculum

1. Add `js/curriculum/class-X.js`.
2. Update `js/curriculum/loader.js` if needed.
3. Make sure UI screens can discover the new class.
4. Add quiz/study content for new chapters if required.
5. Run `npm test`.

### Add a new quiz type

1. Update the quiz data format or loader carefully.
2. Update `js/quiz-engine.js` to render and score it.
3. Ensure results still save consistently.
4. Ensure wrong answers still feed review/mistake workflows.
5. Test student, parent, and teacher dashboards after attempts.

---

## 15. Deployment notes

The repository includes `vercel.json`, so Vercel-style deployment is supported. Firebase configuration and serverless endpoint secrets must be configured in the deployment environment.

Before deployment:

1. Install dependencies.
2. Run tests.
3. Confirm Firebase config is correct.
4. Confirm Firestore rules and indexes are deployed or compatible.
5. Confirm payment endpoints have required Razorpay secrets.
6. Manually test login and at least one user from each important persona.

---

## 16. Security and privacy reminders

This platform handles student data. Treat it carefully.

- Do not commit real private keys or production secrets.
- Do not expose real student data in test reports or screenshots.
- Keep Firebase rules strict.
- Verify role-based access for every console.
- Keep school data separated by tenant/school ID.
- Review bootstrap credentials before production use.
- Password reset and payment flows must run only in trusted environments.

---

## 17. Quick start checklist for a new team member

1. Read this README fully once.
2. Open `index.html` to understand the public entry.
3. Open `js/auth-paywall.js` to understand role routing.
4. Open `app/consoles/student.html` and `app/consoles/student.js` to understand the learner experience.
5. Open `js/quiz-engine.js` to understand quiz behavior.
6. Open `js/api.js` to understand shared data operations.
7. Run `npm install`.
8. Run `npm test`.
9. Use a local static server to manually browse the app.
10. Before editing, identify which persona and workflow your change affects.

---

## 18. The core product promise

Ready4Exam is not just a collection of quiz pages. It is a connected learning system:

- **Students** practice and improve.
- **Parents** understand and support.
- **Teachers** identify and remediate.
- **Admins** manage people and communication.
- **Principals** monitor institutional readiness.
- **Practitioners** practice independently.
- **Owners** operate the platform.

Every code change should protect that connected loop.
