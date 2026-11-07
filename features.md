SkillForge: Peer-to-Peer Skill Exchange Platform for Students

1. Main Idea

SkillForge is not just a posting or transaction platform. It is a peer-learning ecosystem where students teach each other, learn new skills, complete gamified learning activities, demonstrate their abilities, and collaborate on real projects.

Main Workflow:

MATCH → LEARN → PRACTICE → PROVE → BUILD → COLLABORATE → IMPROVE

The platform combines peer-to-peer learning, gamification, skill verification, and project collaboration.

---

2. Main Features

1. Student Profile

Each student has a profile containing:

- Name, course, and year level
- Bio and profile photo
- Selected skills
- Current proficiency levels
- Skills they can teach
- Skills they want to learn
- Learning goals
- Availability
- Learning progress and achievements

Students can update their own profile and manage their skills and learning goals.

2. Skill Catalog

A predefined catalog of skills and categories, including:

- Programming
- UI/UX Design
- Networking
- Video Editing
- Graphic Design
- Database Management
- Web Development
- Other approved skill categories

Students select skills from the catalog instead of relying entirely on free-text input.

3. Smart Skill Matching

The system recommends compatible students based on:

- Shared or related skills
- Teaching and learning preferences
- Current proficiency levels
- Learning goals
- Availability
- Previous learning activity
- Skill Passport evidence

Example workflow:

Student A wants to learn Python.
→ The system identifies students who can teach Python.
→ It evaluates skill compatibility and availability.
→ It displays recommended peers.
→ Student A can send a learning request.

Core matching can use rule-based logic. AI is not required.

4. Peer Skill Exchange

Students can:

- Offer skills they can teach.
- Request skills they want to learn.
- Accept or reject learning requests.
- Establish peer-learning arrangements.
- Schedule learning sessions.
- Review session history and outcomes.

Skill exchange is focused on mutual learning and skill development rather than monetary transactions.

5. Gamified Learning Sessions — Core Learning Workflow

Learning sessions are structured, interactive, and gamified. They are not merely calendar appointments or records of meetings.

Each session follows a guided learning process with objectives, missions, activities, progress tracking, and completion results.

A. Session Creation and Scheduling

A student who can teach a skill and a student who wants to learn it agree on a learning session.

The session contains:

- Skill or topic
- Teacher and learner
- Scheduled date and time
- Duration
- Learning objectives
- Session description
- Learning activities or missions
- Session status

Google Calendar integration supports scheduling and reminders.

B. Session Start

When the scheduled session begins, the participants can start the learning session.

The system displays:

- Session overview
- Learning objectives
- Teacher and learner information
- Mission list
- Progress indicator
- Available learning activities

The session progresses through its defined learning stages. Scheduling a session alone does not count as completing its learning activities.

C. Missions and Learning Activities

Each session can contain one or more missions related to the skill being taught.

Examples for a Python session:

Mission 1: Understand the Concept

- Review the lesson or learning resource.
- Identify important concepts.
- Complete a short knowledge-check activity.

Mission 2: Guided Practice

- Follow the teacher's example.
- Complete a small coding exercise.
- Receive guidance from the teacher.

Mission 3: Independent Practice

- Solve a practical task independently.
- Submit an answer, code, or other required evidence.
- Receive feedback or review when required.

Each activity has its own completion status and may have a defined XP reward.

The system tracks activity states, such as:

- Not started
- In progress
- Submitted
- Reviewed
- Completed

The exact states must follow the existing database schema and business rules.

D. XP and Rewards

XP (experience points) rewards students for eligible learning activities and verified progress.

Examples of eligible activities include:

- Completing an assigned learning activity
- Submitting a required practice task
- Passing a knowledge check
- Completing a mission
- Finishing a learning session when its completion requirements are met

Important rules:

- XP rewards must follow predefined rules.
- Students must not be able to award XP to themselves by directly changing client-side values.
- XP must not be awarded repeatedly for the same eligible activity or review.
- The backend must validate eligibility before recording rewards.
- Failed or rejected work must follow the existing review rules and must not receive XP unless explicitly permitted.
- Session attendance alone must not automatically award all activity XP.
- XP, activity completion, and session completion must remain consistent with the database.

E. Teacher Review and Feedback

For activities that require review, the assigned teacher evaluates the learner's submission.

The teacher can:

- Review the submitted work.
- Provide feedback.
- Mark the work as passed or failed where supported.
- Assign a score if the existing schema supports it.
- Approve completion according to the established rules.

The system validates that the reviewer is authorized to review that learner's activity.

Only valid, eligible reviews can trigger associated rewards.

F. Session Completion

A session is completed only when its required completion conditions are satisfied.

Possible conditions include:

- Required activities are completed.
- Required submissions have been reviewed.
- The session meets the configured completion rules.
- Participants provide feedback when required.

After completion, the system records the session outcome and makes eligible progress available to the student's learning history and Skill Passport.

The application must not mark a session complete merely because the scheduled end time has passed.

G. Gamification Progress Display

During and after a session, students can view:

- Current session progress
- Completed and remaining missions
- Activity completion status
- XP earned from eligible activities
- Teacher feedback
- Session completion status
- Related learning achievements, when supported

Gamification should encourage consistent learning and practice. It must not replace actual learning evidence or verified activity completion.

6. Real-Time Chat

Students can communicate through:

- Student-to-student chat
- Session-related conversations
- Collaboration group chat
- Resource and link sharing

Chat supports communication during learning sessions and project collaboration.

7. Student Reports and Moderation

Students can report another student from Discover with a reason and optional details. Moderators can review open reports and resolve or dismiss them. Admins can permanently delete a reported account where necessary. Report submission and moderation are authorized by database RPCs. The current workflow covers student profiles only; reporting individual messages or other content is not included.

8. Skill Evidence / Portfolio

Students can submit or link evidence of their work, including:

- Projects
- Screenshots
- Certificates
- Documents
- Videos
- Project links

Evidence can demonstrate practical skill development and contribute to the student's Skill Passport.

9. Peer Endorsements

After eligible sessions or collaborations, students can:

- Endorse skills they have observed.
- Provide feedback.
- Build a record of peer recognition.

Endorsements should follow the platform's eligibility rules and must not be treated as automatic proof of proficiency.

10. Achievements and Badges

Achievements recognize meaningful learning milestones.

Examples:

- First Skill Shared
- First Learning Session Completed
- Practice Streak
- Challenge Master
- Helpful Peer
- Collaborator

Each skill also has a “[Skill] Master” badge, earned after passing three different reviewed Skill Challenges for that skill (for example, C# Master). New catalog skills receive a matching badge automatically. Achievements are granted according to verified database conditions, not arbitrary client-side actions.

11. Notifications

The system can notify students about:

- New skill matches
- Learning requests
- Session confirmations and changes
- Upcoming session reminders
- Assigned missions and activities
- Activity review results
- XP and achievement updates
- New messages
- Collaboration invitations

Firebase Cloud Messaging supports push notifications. Notifications must correspond to actual application events.

12. Collaboration Rooms

Students with complementary skills can form teams to work on actual projects.

Example team:

- UI/UX student
- Programmer
- Database student
- Documentation student

Features include:

- Group chat
- Tasks and assignments
- Milestones
- Shared files
- Project progress
- Collaboration history

13. Skill Analytics

Students can track:

- Skills learned
- Learning sessions completed
- Missions and activities completed
- Challenges completed
- XP earned
- Achievements and badges
- Skill progression
- Peer endorsements
- Projects and collaboration history

Analytics should be derived from actual recorded application data.

14. Admin / Moderator

Authorized administrators or moderators can:

- Manage students
- Manage skill categories
- Manage challenges
- Manage badges and achievements
- Review reports
- Review student reports and moderate user accounts
- View platform statistics

Administrative actions must follow role-based authorization.

---

3. Unique Features

1. Skill Challenge — Main Unique Feature

Skill Challenges allow students to demonstrate what they learned through practical tasks.

Workflow:

LEARN → PRACTICE → SUBMIT → REVIEW → PROVE

Example:

A student learns Python functions.
→ SkillForge presents a challenge: "Create a Python function that calculates the average of three numbers."
→ The student submits code or other required evidence.
→ The submission is evaluated according to the challenge's rules.
→ The system records the outcome.
→ Eligible completion can contribute to the student's XP, achievements, and Skill Passport.

Skill Challenges should measure practical ability, not simply whether a student attended a session.

The starter library includes three practical challenges at increasing difficulty for each catalog skill. Submissions use the existing moderator review workflow; passing three distinct challenges for a skill unlocks that skill's Master badge.

2. Skill Passport — Main Unique Feature

The Skill Passport is the student's evolving record of skill development.

It can contain:

- Skills and proficiency levels
- Completed learning sessions
- Completed challenges
- Verified activity history
- Peer endorsements
- Achievements and badges
- Projects and evidence
- Collaboration history

Example:

Python — Intermediate

- 4 completed learning sessions
- 3 completed challenges
- 2 peer endorsements
- 2 projects

The Skill Passport provides a structured view of a student's learning journey. Only supported, recorded, and eligible data should appear as verified accomplishments.

3. Skill Exchange Credits

A non-monetary credit system encourages students to both teach and learn.

Economy rules:

- Every student receives 20 welcome credits once.
- A learner pays 10 credits per 60-minute session requested, prorated by `duration_minutes` and rounded down to a whole credit.
- A teacher earns the same amount only when the session is completed.
- A declined request or a session cancelled before completion refunds the learner's spend.
- All credit changes go through authorized `SECURITY DEFINER` database RPCs. Direct inserts into `credit_transactions` are blocked.
- Unique indexes enforce at most one session spend, teaching reward, and refund per learning session.

Skill Credits and XP are separate concepts. Credit operations do not change XP.

- XP measures learning activity and progress.
- Skill Credits represent participation in the exchange economy.

Do not treat XP as spendable currency or automatically convert XP into Skill Credits unless a separate, explicit rule is established.

4. Skill-to-Project Matching

The system recommends students with complementary skills.

Example:

UI/UX + Programmer + Database + Documentation
→ Recommended collaboration team
→ Create a Collaboration Room
→ Work on an actual student project

This connects skill learning to real project experience.

---

4. Signature System Cycle

1. MATCH — Find compatible peers.
2. LEARN — Schedule and conduct gamified learning sessions.
3. PRACTICE — Complete missions and learning activities.
4. PROVE — Submit Skill Challenges and demonstrate ability.
5. BUILD — Record verified development in the Skill Passport.
6. COLLABORATE — Apply complementary skills to real projects.
7. IMPROVE — Use recorded learning history to support future recommendations.

Gamification supports this cycle by encouraging practice, tracking progress, and rewarding eligible learning activities.

---

5. Required Integrations

Integration 1 — Firebase Cloud Messaging

Purpose:

- Push notifications
- New skill matches
- Session reminders
- New messages
- Activity review results
- Challenge notifications
- Collaboration invitations
- Achievement notifications

Notifications must be triggered by valid application events and must respect authentication and user privacy.

The web app uses Firebase Cloud Messaging for opt-in browser push. Configure the `VITE_FIREBASE_*` client variables and `VITE_FIREBASE_VAPID_KEY` in the hosting environment. Deploy the `send-fcm-notification` and `send-session-reminders` Edge Functions. Set `FCM_SERVICE_ACCOUNT` (Firebase service-account JSON), `FCM_WEBHOOK_SECRET`, and `APP_PUBLIC_URL` as Supabase function secrets. Create a database webhook for `notifications` inserts and send the configured secret in the `x-webhook-secret` header. Push tokens are registered through authenticated RPCs and are not directly readable or writable by clients.

Schedule `send-session-reminders` to run hourly with the configured `SESSION_REMINDER_SECRET` in the `x-cron-secret` header. The function creates one in-app reminder per participant about 24 hours before an accepted session; the notifications webhook delivers the corresponding push. Native iOS and Android push are not included in this web deployment.

Vercel builds the Vite app with `npm run build`, serves `dist`, and uses the repository's `vercel.json` rewrite so nested app routes load on refresh. Set the Supabase URL/key and Firebase web client variables in Vercel; keep service-account and webhook/cron secrets in Supabase Function Secrets only.

Integration 2 — Google Calendar

Purpose:

- Add learning sessions to the calendar
- Schedule reminders
- Display session details
- Manage session date and time

Accepted sessions include an Add to Google Calendar action with the session title, time, duration, peer, and learning objectives prefilled. This is a user-owned calendar event, not an OAuth-linked synchronization: rescheduling or cancelling a session in SkillForge does not update or delete an event already added to Google Calendar.

Optional integrations:

- Google Meet — online learning sessions
- Google Maps — physical meeting locations

---

6. How to Explain SkillForge to Our Professor

"Ma'am, SkillForge is not simply a platform where students post skills and request services.

Our goal is to create a peer-learning ecosystem where students can find compatible peers, conduct structured and gamified learning sessions, complete missions and practical activities, and earn experience points for eligible learning progress.

After learning a skill, students can demonstrate what they learned through Skill Challenges. Their recorded learning activities, completed challenges, endorsements, and projects can contribute to their Skill Passport.

The system can also connect students with complementary skills so they can collaborate on actual projects.

Instead of focusing only on transactions, SkillForge focuses on learning, practice, skill development, verification, and collaboration."

If the professor asks, "What makes it unique?"

"Our main unique features are the Skill Challenge and Skill Passport, supported by gamified learning sessions.

After a student learns a skill from another student, they complete practical activities and can demonstrate their ability through a Skill Challenge. The system tracks eligible learning progress and XP, while verified accomplishments can contribute to their Skill Passport.

This means the system does not simply record that students exchanged a skill. It helps track their learning journey and practical skill development."

---

7. One-Sentence Description

SkillForge is a peer-learning ecosystem where students discover compatible peers, exchange skills, participate in gamified learning sessions, demonstrate their abilities through practical challenges, build a Skill Passport, and collaborate on real projects.

---

8. Implementation Rules for OpenCode

When implementing SkillForge features:

1. Inspect the existing database schema, Supabase TypeScript types, authentication flow, services, and UI before coding.
2. Reuse existing Ionic React components, the Supabase client, and established project conventions.
3. Treat the database schema and Row Level Security policies as authoritative.
4. Do not invent database fields, proficiency values, activity states, or reward rules.
5. Keep XP separate from Skill Credits.
6. Award XP only through validated, authorized, and eligible backend operations.
7. Prevent duplicate rewards for the same eligible activity.
8. Do not allow students to review their own submissions when the review workflow requires an assigned teacher.
9. Keep session scheduling, session completion, activity completion, challenge completion, and XP awarding as distinct operations.
10. Do not mark a learning session or challenge as completed without satisfying its configured requirements.
11. Preserve working authentication, navigation, and existing functionality.
12. Implement features in phases, validate each phase, and report actual build and test results.
13. Do not implement a feature outside the current task's scope.