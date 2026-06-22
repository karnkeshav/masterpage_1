# Ready4Exam — Product Manual

**Version:** 2.0 | **Platform:** ready4exam.in

---

## Table of Contents

1. [School Onboarding](#1-school-onboarding)
2. [Admin Console](#2-admin-console)
3. [Principal Console](#3-principal-console)
4. [Teacher Console](#4-teacher-console)
5. [Student Console — School (B2B)](#5-student-console--school-b2b)
6. [Student Console — Individual (B2C)](#6-student-console--individual-b2c)
7. [Parent Console](#7-parent-console)
8. [Class 10 & 12 Exclusive Features](#8-class-10--12-exclusive-features)

---

## 1. School Onboarding

The school is onboarded by the platform owner through the **Owner Command Center**. This section covers what the owner needs and what gets provisioned — it does not cover the owner's own operational tools.

### What the Owner Needs Before Provisioning

| Field | Description |
|---|---|
| School Name | Full legal name of the institution |
| Logo URL | Direct link to the school logo image |
| Board | CBSE / ICSE / SCERT |
| Student Strength | Total number of students enrolled |
| Teaching Staff | Number of teachers |
| Admins & VIPs | Number of admin-level and VIP accounts |
| Calculated Licenses | Auto-computed from above (read-only) |
| Amount Paid (₹) | Manual payment amount recorded by owner |
| Area | Locality / neighbourhood |
| District | District name |
| State | State name |
| Principal Email | Used to create the principal's login |
| Principal Phone | Contact number |

### What Gets Created After Provisioning

Once the owner submits the Provision School form:

1. A **school record** is created in Firestore with the details above and a unique school ID.
2. A **Principal account** is automatically generated using the Principal Email provided.
3. An **Admin account** is created, linked to the same school.
4. The school appears in the owner's B2B ledger with payment amount and license count.

### Admin and Principal First Login

- Both Admin and Principal receive their credentials (email + temporary password) via the Principal Email entered during provisioning.
- On first login, they are directed to their respective consoles at `app/consoles/admin.html` and `app/consoles/principal.html`.
- The school landing page (`school-landing.html`) provides role-specific entry points for all stakeholders: Principal, Admin, Teacher, Student, and Parent.

---

## 2. Admin Console

**URL:** `/app/consoles/admin.html`  
**Role badge:** Admin  
**Console title:** Relational Bridge — Ready4Exam Master IAM

The Admin console is the Identity & Access Management hub for the school. It has three sections accessible from the sidebar (desktop) or bottom tab bar (mobile).

---

### Tab 1: Inventory

The Inventory tab is divided into three Vaults.

#### Vault 1 — Academic Classes

Displays all students enrolled in the school, organised by grade and section.

| Action | Description |
|---|---|
| Browse by Grade/Section | View students in a specific class and section |
| View Student Profile | See student name, login email, class, section, board |
| Edit Student | Modify student details (name, class, section) |
| Reset Password | Generate a new temporary password for a student |
| Delete Student | Remove the student account permanently |

#### Vault 2 — Faculty Inventory

Manages all teacher accounts in the school.

| Action | Description |
|---|---|
| Add Teacher | Create a new teacher account with name, email, subject, grade/section assignment |
| Assign Grade/Section | Link the teacher to one or more classes they teach |
| Edit Teacher | Update name, email, subject, or grade/section assignment |
| Reset Password | Generate a new temporary password for the teacher |
| Delete Teacher | Remove the teacher account permanently |

Teacher records show: Teacher name, login email, subject, assigned grade/section, and action buttons (Edit / Reset Password / Delete).

#### Vault 3 — VIP Dignitaries

Manages special-access accounts (school directors, trustees, observers).

| Action | Description |
|---|---|
| Add VIP | Create a VIP account with read-only access to school analytics |
| Edit VIP | Update VIP profile details |
| Delete VIP | Remove VIP account |

---

### Tab 2: Observability

A read-only analytics dashboard for principals, directors, and other observers. Admin can view school-wide performance metrics from this tab. This is the same data that VIP accounts see when they log in.

Metrics shown:
- Overall school mastery percentage
- Grade-wise performance breakdown
- Subject-wise coverage
- Chapter completion rates across all classes

---

### Tab 3: Messaging (Sovereign Intercom)

The communication hub for the admin to reach parents and teachers.

| Action | Description |
|---|---|
| Broadcast to All Parents | Send a message to every parent linked to the school |
| Message to Teachers | Send a targeted message to all teachers in the school |

Messages appear in the recipient's inbox within their respective consoles.

---

### CSV Import (Bulk Onboarding)

Admin can import students in bulk using a CSV file. The CSV requires:
- Student Name
- Class (grade number)
- Section
- Parent Email

The system creates student login credentials and sends them to the parent email.

---

## 3. Principal Console

**URL:** `/app/consoles/principal.html`  
**Role badge:** Institutional Head  
**Console title:** Principal Command

The Principal console is the school's strategic analytics dashboard. It has five tabs in the sidebar (desktop) or mobile tab bar.

The sidebar also shows a **Board Readiness** progress bar indicating what percentage of the syllabus has been validated by teachers.

---

### Tab 1: Global Overview

Four KPI cards at the top:

| KPI | Description |
|---|---|
| Average Mastery | School-wide average quiz mastery percentage |
| Test Turnaround | Average time (in days) for students to attempt a chapter quiz after it is marked finished by the teacher |
| Curriculum Sync | Percentage of chapters that have been marked finished by teachers |
| Board Confidence | Average mastery for Classes 10 and 12 specifically |

Charts below the KPIs:
- **Student Distribution** — Doughnut chart showing student count per grade
- **Mastery Performance by Grade** — Bar chart showing average mastery for each grade

Alert panels below the charts:
- **Punctuality Alerts** — Lists classes (grade + section) that are behind schedule, i.e., teachers have not marked chapters finished within the expected timeline
- **Defaulting Students** — Lists students who have not attempted any quiz in a significant period. The "Nudge All Parents" button triggers a notification to all parents of defaulting students

---

### Tab 2: Curriculum Velocity

Live tracking of how teachers are progressing through their syllabi.

- **Subject Filter** — Dropdown to filter the heatmap by a specific subject
- **Curriculum Heatmap** — A grid showing every grade-section-subject combination. Each cell indicates whether the teacher has marked chapters as finished. Colour intensity represents the percentage of chapters completed. Hovering on a cell shows the chapter count detail.

This tab answers: "Which teacher in which class is lagging behind on their syllabus?"

---

### Tab 3: Board War Room (Classes 10 & 12)

High-stakes performance metrics for board examination classes only.

- **Download PDF Report** — Exports the full board readiness report as a PDF
- **Subject Strength Matrix** — Radar chart showing average mastery per subject for Classes 10 and 12 students
- **Critical Chapter Bottlenecks** — List of chapters where student mastery is lowest, ranked by severity. Each bottleneck shows subject, chapter name, and average mastery score.
- **Board Tier Specialists** — Table listing students who have scored above 95% in Advanced-tier questions. These are the school's top performers for board preparation.

---

### Tab 4: Talent & Recovery Hub

Identifies the best-performing and struggling students for targeted intervention.

**First-Strike Toppers:**
- Students who achieved 95%+ in their very first quiz attempt on a chapter
- Listed with student name, class, section, and subject

**Recovery Queue (Remedial):**
- Students who are stuck in Simple-tier quizzes and have not progressed to Medium or Advanced difficulty
- Listed with student name, class, section, and the subject/chapter where they are stuck

**Cognitive Migration Pipeline:**
- Shows the movement of students across difficulty tiers (Simple → Medium → Advanced) by subject
- Helps the principal understand where cohort-level interventions are working

---

### Tab 5: Faculty Efficiency

A benchmarking table measuring teaching impact.

Table columns:
- **Faculty Member** — Teacher name
- **Subject / Class** — Subject and grade the teacher covers
- **Avg Attempts to 95%** — How many quiz attempts students in this teacher's class need on average before reaching 95% mastery. Lower is better (stronger teaching).
- **Efficiency Rating** — A derived label (e.g., Excellent / Good / Needs Support) based on the attempts metric

---

## 4. Teacher Console

**URL:** `/app/consoles/teacher.html`  
**Role badge:** Teacher  
**Console title:** Sovereignty Navigation — Multi-Discipline

The Teacher console connects the classroom to the student mastery matrix in real time. The header has three dropdown controls that must be set before working in any tab:

| Control | Description |
|---|---|
| Grade | Select the class number (e.g., 8, 9, 10, 11, 12) |
| Section | Select the section (e.g., A, B, C) |
| Discipline | Select the subject being taught |

Changing any of these controls reloads the tab content for the selected combination.

---

### Tab 1: Curriculum Hub

The primary workflow tab for teachers.

Displays the chapter list for the selected grade-section-discipline combination.

For each chapter:

| Action | When Available | Description |
|---|---|---|
| **Mark Finished** | Chapter not yet marked | Signals to students that this chapter has been taught in class. Triggers a notification in every student's inbox in that grade-section. |
| **Revoke** | Chapter already marked finished | Undoes the "Mark Finished" status, typically used if a chapter is revisited or if it was marked in error. |

When a teacher marks a chapter finished:
- A `student_notification` document is written to Firestore for every student in that grade-section.
- Students see the notification appear in their Priority Inbox.
- The chapter becomes eligible for quizzing in the student's quiz engine.

---

### Tab 2: Live Analytics

A heatmap showing quiz performance across the selected grade-section for the chosen subject.

- Each row is a chapter, each column represents a difficulty tier (Simple, Medium, Advanced).
- Cells are colour-coded by average mastery: green (high), amber (medium), red (low), grey (not attempted).
- Hovering on a cell shows the exact average mastery percentage.

This tab answers: "Which chapters are students struggling with in my class right now?"

---

### Tab 3: Remedial Queue

Lists students in the selected grade-section-discipline who are stuck in the lowest difficulty tier.

For each student in the queue:
- Student name
- Chapter where they are stuck
- Number of attempts at Simple level
- Last attempt date

This helps the teacher identify students who need individual attention before the class moves to the next topic.

---

### Tab 4: Student Roster

A full list of all students in the selected grade-section.

For each student:
- Student name
- Student badge ID (S.Grade.Section format)
- Overall mastery percentage for the selected subject
- Clicking on a student opens an individual score drilldown showing chapter-level mastery across all three difficulty tiers

---

## 5. Student Console — School (B2B)

**URL:** `/app/consoles/student.html`  
**Role badge:** Grade [number]

School students are assigned by the admin. They log in using the credentials the admin created for them. They are not subject to plan gates — all features are available regardless of subscription tier, because their school has paid a B2B licence fee.

---

### Header & Quick Actions

The header shows the student's name and grade badge. Quick action buttons in the action bar:

| Button | Description |
|---|---|
| Mistake Notebook | Opens the mistake notebook page |
| Exam Pulse | Opens the exam pulse page (visible for Class 10 & 12 students) |
| PYQ Paper | Opens the PYQ Vault (visible for Class 10 & 12 students) |
| New Quiz | Opens the curriculum page to start a new chapter quiz |

---

### Stats Dashboard (Three Cards)

**Card 1 — Average Mastery:**
- Overall mastery percentage with an animated radial donut chart
- Total quiz attempts across all chapters
- Global performance badge: Foundational / Standard / Challenger
- Per-subject tier badges
- Professional journey progress bar with three milestones

**Card 2 — Subject Mastery:**
- Animated progress bars showing mastery level for each enrolled subject

**Card 3 — Total Chapters:**
- Total chapters covered out of total available
- Radial progress bar for chapter coverage
- Coverage breakdown for core subjects (Math, Science, Social Studies)
- Mastery funnel: Simple (S), Medium (M), Advanced (A) attempt distribution

---

### Chapter Health & Grit Grid

A grid (5 columns on wide screens) showing each chapter's health status. Each cell shows:
- Chapter name
- Mastery tier achieved
- Grit score (number of attempts it took)

---

### Knowledge Hub

A curated set of links to study materials organised by subject. Links are injected dynamically based on the student's class and subjects. This section provides access to reference notes, formula sheets, and study content pages.

---

### Recent Performance

A scrollable history of the student's most recent quiz sessions, showing:
- Chapter name
- Subject
- Score percentage
- Date of attempt
- Difficulty tier taken

---

### Priority Inbox

The notification slide-over panel (toggled from the bell icon in the header):
- Shows all `student_notifications` sent by the teacher when chapters are marked finished
- Notifications are listed in reverse chronological order
- Each notification shows the chapter name, subject, and the date the teacher marked it

Notifications remain in the inbox until the student achieves 95% mastery on the chapter — they are not dismissible before that.

---

### Quiz Flow (Starting a Quiz)

1. Student clicks **New Quiz** → goes to `curriculum.html`
2. Selects subject and chapter
3. Selects difficulty tier (Simple / Medium / Advanced)
4. Quiz engine (`quiz-engine.html`) loads questions
5. After submission, student sees the review page (`review.html`) with correct/incorrect breakdown
6. Incorrect answers are automatically logged to the Mistake Notebook

---

### Mistake Notebook

**URL:** `/app/mistake-book.html`

Automatically populated whenever a student answers a question incorrectly. The student cannot manually add or remove entries.

For each mistake entry:
- Question text
- The student's incorrect answer
- The correct answer
- Subject and chapter
- Date of the mistake

Students can re-attempt questions from the Mistake Notebook to clear them.

---

## 6. Student Console — Individual (B2C)

Individual students subscribe directly at `ready4exam.in` by choosing a plan and completing payment. There are five subscription tiers with different feature access.

---

### How B2C Registration Works

1. Student (or parent) visits the pricing/offering page and selects a plan and duration (3 Months / 1 Year / 3 Years).
2. They are redirected to `register.html` with the plan and duration pre-filled.
3. The form collects: Student Name, Parent/Guardian Email, Parent Name (optional), Password, Class, Board, and Stream/Subject (for Class 11/12).
4. On submit, a Razorpay payment is initiated.
5. After successful payment, the account is created and the student is logged in automatically.
6. A confirmation email with login credentials is sent to the Parent/Guardian Email.

The student login email is an internal address (`stu_[id]@ready4exam.internal`) — students log in using the Parent/Guardian Email and the password they set during registration.

---

### Plan Comparison

| Feature | Base (Practitioner) | Core (Strategist) | Link (Sync) | Peak (Board Self) | Peak Link (Board Parent) |
|---|---|---|---|---|---|
| Simple Quizzes | Yes | Yes | Yes | Yes | Yes |
| Medium Quizzes | Yes | Yes | Yes | Yes | Yes |
| Advanced Quizzes | Yes | Yes | Yes | Yes | Yes |
| Mistake Notebook | No | Yes | Yes | Yes | Yes |
| Knowledge Hub | No | Yes | Yes | Yes | Yes |
| Behavioral Analytics | No | Yes | Yes | Yes | Yes |
| Diagnostic Console | No | Yes | Yes | Yes | Yes |
| Parent Console | No | No | Yes | No | Yes |
| PYQ Vault | No | No | No | Yes | Yes |
| Exam Pulse | No | No | No | Yes | Yes |
| PYQ Insights | No | No | No | Yes | Yes |

---

### Base Plan Console (Practitioner)

**URL:** `/app/consoles/practitioner.html`

The Base plan has a simplified console instead of the full student dashboard.

Left panel shows:
- Active plan badge
- Included access: Simple, Medium, and Advanced Difficulty Quizzes
- Locked features list (Mistake Notebook, Knowledge Hub — greyed out)
- **Upgrade My Package** button → goes to `offering.html`

Right panel shows:
- **TAKE CHAPTER TEST** — large call-to-action button going to `curriculum.html`
- Note: "Unlimited Attempts for All Difficulty Levels"

---

### Core, Link, Peak, and Peak Link Plans

Students on Core and above get the full student console (`student.html`) with all stat cards, chapter health, knowledge hub, and recent performance.

**Mistake Notebook** is available on Core and above. Students on Base plan who click the Mistake Notebook button are redirected to `offering.html`.

**Parent Console** is available on Link and Peak Link plans. These plans include a linked parent portal where the parent can view the student's progress in mirror mode.

**PYQ Vault, Exam Pulse, and PYQ Insights** are available on Peak and Peak Link plans only, and only for students in Class 10 or 12.

---

## 7. Parent Console

**URL:** `/app/consoles/parent.html`  
**Role badge:** Parent

Parents can be linked to school students (B2B) or to individually subscribed students (B2C Link / Peak Link plans).

---

### Header Inbox

The header contains a persistent bell icon with a red badge showing the count of unread alerts. Clicking it opens a dropdown showing priority notifications. These alerts are **un-dismissible** until the child achieves 95% mastery on the relevant chapter — they cannot be manually cleared.

---

### Multi-Child Switcher

If the parent has more than one child linked to their account, a switcher allows them to toggle between children. Each child's data is fetched separately.

---

### Topic 1 & 2 — School-Home Sync Wall

A scrollable feed showing the teacher's chapter-finished notifications for the child's grade and section. This is the parent's view of "what has been taught in school."

Each item shows:
- Chapter name
- Subject
- The date the teacher marked it finished
- Whether the child has attempted the quiz yet (and their score if attempted)

---

### Topic 3 — Diagnostic Report Card

A detailed matrix showing the child's quiz scores at chapter level, organised by subject.

The table shows three columns per chapter:
- **Simple** — mastery percentage at simple difficulty
- **Medium** — mastery percentage at medium difficulty
- **Advanced** — mastery percentage at advanced difficulty

This is the "Truth Engine" — an unfiltered view of the child's actual mastery, chapter by chapter.

---

### Section Analyzer Tool

Three progress bars showing the child's question-type mastery:
- **Pure MCQ Logic (Simple)** — performance on straightforward recall questions
- **A/R Logic (Medium)** — performance on assertion-reason question types
- **Case-Based Logic (Advanced)** — performance on case-study/scenario questions

This helps parents understand whether difficulty is coming from question format rather than content gaps.

---

### Topic 4 — Persistent Inbox & Legacy Vault

A chart showing the child's performance growth over time (Class 6 through Class 12). Records are archived annually but remain accessible.

Information panel explaining two concepts:
- **Un-Dismissible Inbox** — alerts stay visible until the child reaches 95%, keeping both parent and child accountable
- **Expiries** — at year-end, in-year data is archived to the vault; historical records from all classes are preserved

---

### Topic 5 — Mirror Portal

Allows the parent to open a read-only view of the child's full student console.

Features available in mirror mode:
- Secure, read-only view of the live student dashboard
- Audit time spent per question
- View the child's Mistake Notebook entries
- Identify rushing behaviour or late-night practice patterns

The **Launch Mirror** button opens the student console in mirror mode using a session flag. The parent cannot take quizzes or modify any data — it is strictly observational.

---

## 8. Class 10 & 12 Exclusive Features

These features are available only to students in Class 10 or Class 12. For B2B school students, all three are accessible automatically. For B2C individual students, they additionally require the **Peak** or **Peak Link** plan.

---

### PYQ Vault

**URL:** `/app/pyq.html`

A collection of past year board examination questions organised by subject and chapter.

- Browse questions by year, subject, and chapter
- Attempt individual PYQ questions
- Answers are marked and tracked

---

### Exam Pulse

**URL:** `/app/exam_pulse.html`

A real-time readiness diagnostic specifically calibrated for board examinations.

- Shows current readiness percentage by subject
- Highlights chapters needing urgent revision before the exam
- Tracks improvement velocity (how fast mastery is growing)

---

### PYQ Insights

**URL:** `/app/pyq_insights.html`

An analytical overlay on PYQ performance showing:
- Weightage distribution across chapters (which chapters appear most frequently in board exams)
- Student's mastery vs. chapter weightage (identifies high-risk gaps — topics with high exam weightage but low mastery)
- Marking guide access for board exam answers

This is the most advanced preparation tool and is designed for students aiming for 90%+ in board examinations.

---

*Ready4Exam — Precision Mastery for Every Learner*
