-- Add a practical challenge set for every skill in the starter catalog.
-- These platform challenges have no individual author; moderators review
-- submissions through the existing challenge review queue.

insert into public.skill_challenges (
  skill_id, title, description, difficulty, instructions
)
select
  s.id,
  v.title,
  v.description,
  v.difficulty,
  v.instructions
from (values
  ('Python', 'Python: CSV grade report', 'Read structured data, validate it, and calculate useful results.', 'beginner',
   'Write a Python program that reads rows containing a student name and three scores. Validate that scores are between 0 and 100, calculate each average, and print the highest average. Submit the code and sample input/output.'),
  ('Python', 'Python: Expense summary', 'Practice dictionaries, functions, and aggregation.', 'intermediate',
   'Write a function that accepts expense records with category and amount, rejects negative amounts, and returns totals by category plus the overall total. Submit the code, at least four sample records, and the expected result.'),
  ('Python', 'Python: Tested text analyzer', 'Build a small reusable utility and prove its behavior with tests.', 'advanced',
   'Create a text-analysis function that counts words, unique words, and the most frequent word while ignoring letter case and punctuation. Include tests for empty text, repeated words, and punctuation. Submit code and test results.'),

  ('JavaScript', 'JavaScript: Searchable catalog', 'Transform a collection of records based on user input.', 'beginner',
   'Write a JavaScript function that filters a list of products by a case-insensitive query across name and category. Return an empty list for a blank query only if you document that choice. Submit the function and examples with expected results.'),
  ('JavaScript', 'JavaScript: Form validation helper', 'Use clear validation rules and useful error results.', 'intermediate',
   'Implement a function that validates a signup object with name, email, and password fields. Return field-specific errors rather than a single boolean. State the validation rules and submit examples for valid and invalid inputs.'),
  ('JavaScript', 'JavaScript: Async data-state demo', 'Handle asynchronous success, empty results, and failure explicitly.', 'advanced',
   'Create a small demo that loads a list from an asynchronous function and presents loading, success, empty, and error states. Submit the code or a working link and explain how each state is reached.'),

  ('Java', 'Java: Book borrowing model', 'Model a small domain using classes and encapsulated state.', 'beginner',
   'Create Java classes for Book and Library. Support adding a book, borrowing an available book, and returning a borrowed book. Submit the classes and a short demonstration showing an unavailable book cannot be borrowed twice.'),
  ('Java', 'Java: Inventory restock report', 'Use collections and object-oriented methods to summarize inventory.', 'intermediate',
   'Represent inventory items with a name, quantity, and reorder threshold. Implement a method that returns items needing restock, ordered by lowest quantity first. Submit code and sample output for at least five items.'),
  ('Java', 'Java: Robust transaction parser', 'Parse input safely and test both valid and malformed cases.', 'advanced',
   'Write a Java parser for transaction lines formatted as date,category,amount. Validate the date and numeric amount, report malformed lines without terminating the full import, and summarize valid amounts by category. Submit code and test cases.'),

  ('C#', 'C#: Grade analysis', 'Use typed data and LINQ to answer a concrete question.', 'beginner',
   'Write a C# program that accepts a collection of student names and scores, validates scores from 0 to 100, and reports the class average and highest-scoring student. Submit code and sample output.'),
  ('C#', 'C#: Inventory service', 'Separate business rules from the application entry point.', 'intermediate',
   'Create a C# inventory service that can add stock and fulfill an order only when enough units are available. Reject invalid quantities, keep stock from becoming negative, and demonstrate the behavior with a few calls. Submit code and output.'),
  ('C#', 'C#: Async file summary', 'Use asynchronous APIs and handle expected failures.', 'advanced',
   'Create a C# method that asynchronously reads a text file and returns its line count and non-empty line count. Handle a missing file with a clear result or exception policy. Submit code and a test or run demonstrating both a readable file and a missing file.'),

  ('HTML', 'HTML: Accessible event form', 'Use semantic form markup and programmatic labels.', 'beginner',
   'Create an event registration form with name, email, attendance choice, and submit button. Use appropriate input types, visible labels associated with controls, and required fields. Submit the HTML and briefly describe how a keyboard user completes it.'),
  ('HTML', 'HTML: Semantic article page', 'Structure content so its meaning is clear without visual styling.', 'intermediate',
   'Build an article page with a header, navigation, main content, article title, author/date metadata, sections, and footer. Use semantic elements appropriately and avoid using headings only for their default visual size. Submit the markup.'),
  ('HTML', 'HTML: Accessible data table', 'Present tabular information with useful relationships for assistive technology.', 'advanced',
   'Create a schedule table with a caption, column headers, and at least three data rows. Mark headers with the correct scope and include a row header if appropriate. Submit the HTML and explain how the headers identify each cell.'),

  ('CSS', 'CSS: Responsive profile cards', 'Create a layout that adapts to narrow and wide screens.', 'beginner',
   'Style a set of profile cards that displays one column on small screens and at least three columns on wide screens. Use CSS Grid or Flexbox, keep text readable, and submit the CSS with a screenshot or working link at both widths.'),
  ('CSS', 'CSS: Keyboard focus system', 'Make interactive controls visibly usable without a mouse.', 'intermediate',
   'Create styles for links, buttons, and form fields with clear hover and keyboard-focus states. Do not remove the browser outline without a visible replacement. Submit the CSS and screenshots showing focus on at least two controls.'),
  ('CSS', 'CSS: Theme with design tokens', 'Use maintainable custom properties and verify contrast-conscious states.', 'advanced',
   'Build a small component theme using CSS custom properties for colors, spacing, and typography. Include light and dark themes and visible disabled/focus states. Submit the CSS or a working link and explain how the tokens make a theme change manageable.'),

  ('React', 'React: Reusable task list', 'Split UI into components and render data from state.', 'beginner',
   'Build a React task list that displays tasks from an array and marks a task complete when its control is used. Use stable keys and a reusable task item component. Submit the relevant code or a working link.'),
  ('React', 'React: Filterable directory', 'Keep UI state and derived results predictable.', 'intermediate',
   'Create a directory with a search field and category filter. Results must update as either control changes, and show a useful empty state when nothing matches. Submit code or a working link plus examples of matching and empty results.'),
  ('React', 'React: Async dashboard panel', 'Handle effect lifecycle and asynchronous UI states.', 'advanced',
   'Create a dashboard panel that loads data asynchronously and displays loading, success, empty, and error states. Ensure stale results do not overwrite newer requests when the query changes quickly. Submit code and describe how you tested the state transitions.'),

  ('Node.js', 'Node.js: Input-safe JSON endpoint', 'Validate request data and return predictable responses.', 'beginner',
   'Create a Node.js HTTP endpoint that accepts a JSON request to add a task with a non-empty title. Return a success response for valid input and a 400 response for invalid input. Submit code and example requests/responses.'),
  ('Node.js', 'Node.js: Paginated collection route', 'Implement consistent pagination and boundary handling.', 'intermediate',
   'Build a route that returns a collection using page and limit parameters. Validate bounds, return the requested slice and total count, and use a consistent response shape. Submit code and examples for the first page and an invalid parameter.'),
  ('Node.js', 'Node.js: Reliable file import', 'Process input with clear validation and resource cleanup.', 'advanced',
   'Implement a small CSV import using Node.js streams or a documented parser. Validate required columns, count accepted and rejected rows, and handle read errors without reporting a false success. Submit code and a sample import report.'),

  ('UI/UX Design', 'UI/UX Design: Student onboarding flow', 'Design a clear first-use experience for a student learning app.', 'beginner',
   'Create a three-screen onboarding flow that helps a student choose skills to teach, skills to learn, and availability. Submit wireframes or a prototype and annotate the primary action and one accessibility decision on each screen.'),
  ('UI/UX Design', 'UI/UX Design: Session request usability review', 'Identify friction and propose testable design improvements.', 'intermediate',
   'Review or design a session-request flow. Identify three usability risks, then show an improved flow that makes skill, duration, credit cost, and schedule clear before submission. Submit before/after screens or a prototype with rationale.'),
  ('UI/UX Design', 'UI/UX Design: Accessible dashboard study', 'Apply hierarchy, responsive behavior, and inclusive interaction patterns.', 'advanced',
   'Design a learning dashboard for mobile and desktop with progress, upcoming sessions, and a clear next action. Include empty and error states, note keyboard/focus behavior, and explain one usability test you would run. Submit screens or a prototype.'),

  ('Figma', 'Figma: Learning-session wireframe', 'Organize session objectives, activities, and progress into a usable screen.', 'beginner',
   'Create a low-fidelity learning-session screen showing participants, objectives, a mission list, and progress. Use clear hierarchy and submit a Figma link or screenshots with a short explanation of the primary user action.'),
  ('Figma', 'Figma: Reusable component set', 'Use components and variants to keep interface elements consistent.', 'intermediate',
   'Create a small component set for buttons, fields, and status badges with useful variants such as default, disabled, and error. Demonstrate at least one instance update propagating from its component. Submit a Figma link or screenshots.'),
  ('Figma', 'Figma: Interactive booking prototype', 'Prototype a multi-step flow and make its feedback states visible.', 'advanced',
   'Build a clickable session-booking prototype from skill selection through confirmation. Include duration, credit cost, scheduling, validation feedback, and a confirmation state. Submit the prototype link and list the main paths a reviewer should try.'),

  ('Networking', 'Networking: Subnet plan', 'Apply IPv4 subnetting to a small documented requirement.', 'beginner',
   'Given the private network 192.168.10.0/24, divide it into four equal subnets. Submit each network address, usable host range, and broadcast address, and explain how you checked that the ranges do not overlap.'),
  ('Networking', 'Networking: Connectivity troubleshooting', 'Use a repeatable diagnostic sequence to isolate a network issue.', 'intermediate',
   'Write a troubleshooting runbook for a workstation that has link but cannot reach a website. Include at least five ordered checks, the command or observation for each, and what each possible result would indicate.'),
  ('Networking', 'Networking: Small-office topology', 'Design a segmented network and explain its traffic paths.', 'advanced',
   'Create a diagram for a small office with staff, guest Wi-Fi, and a shared server network. Label subnets, gateways, and the allowed communication needed between segments. Explain how the design limits unnecessary access.'),

  ('Cisco', 'Cisco: VLAN port plan', 'Map switch ports to clearly separated user groups.', 'beginner',
   'Create a Cisco-style configuration plan for two VLANs, Staff and Guest, and assign example access ports to each. Include the verification commands you would run and the expected VLAN membership. Submit the config and explanation.'),
  ('Cisco', 'Cisco: Inter-VLAN routing plan', 'Describe how hosts in separate VLANs reach an approved service.', 'intermediate',
   'Design a router-on-a-stick or Layer 3 switch plan for Staff and Guest VLANs. Provide example interface/VLAN addressing and a traffic policy that permits Guest internet access but blocks Guest access to Staff. Submit the diagram/config and explain the intended paths.'),
  ('Cisco', 'Cisco: Diagnose a routing fault', 'Use show-command evidence to reason about a routing failure.', 'advanced',
   'A host can reach its gateway but not a remote subnet. Provide an ordered diagnosis using at least four Cisco show commands, the evidence each command checks, and one likely fault with a safe corrective action. Submit a concise runbook.'),

  ('MySQL', 'MySQL: Join a course report', 'Use relational joins and aggregation to answer a reporting question.', 'beginner',
   'Assume students(id,name) and enrollments(student_id,course_id,score). Write a query that returns each course_id and its average score, including only courses with at least two scores. Explain the join and grouping.'),
  ('MySQL', 'MySQL: Normalize a registration sheet', 'Reduce duplication while preserving relationships and constraints.', 'intermediate',
   'Normalize a flat table containing student, course, instructor, and enrollment date into relational tables. Submit the proposed columns, primary/foreign keys, and one example query that reconstructs a student’s course list.'),
  ('MySQL', 'MySQL: Safe seat reservation', 'Use a transaction to keep a limited resource consistent.', 'advanced',
   'Describe or implement a transaction that reserves one seat only when a course still has capacity. Include the locking or atomic update strategy, rollback behavior, and how a second concurrent request avoids overselling. Submit SQL and a short explanation.'),

  ('PostgreSQL', 'PostgreSQL: Learning progress query', 'Use filtering and aggregation to summarize verified records.', 'beginner',
   'Assume sessions(student_id,skill_id,status) and challenges(student_id,skill_id,status). Write a query that returns completed session and passed challenge counts per student and skill. Submit the SQL and explain which statuses are included.'),
  ('PostgreSQL', 'PostgreSQL: Constrained project schema', 'Use database constraints to protect project data quality.', 'intermediate',
   'Design project_tasks with a project reference, non-empty title, valid status, and completion timestamp rules. Submit a CREATE TABLE statement with appropriate keys/check constraints and explain two invalid rows it rejects.'),
  ('PostgreSQL', 'PostgreSQL: Query plan investigation', 'Use an index only when evidence supports the change.', 'advanced',
   'Given a slow query filtering a large activity table by student_id and created_at, propose a measurement plan using EXPLAIN (ANALYZE, BUFFERS), an appropriate candidate index, and a way to compare before/after results. Do not claim performance without measurements.'),

  ('Video Editing', 'Video Editing: 30-second skill tip', 'Communicate one useful idea with a clear beginning, middle, and end.', 'beginner',
   'Edit a 30-second tutorial that teaches one small skill. Include a clear opening, at least two purposeful cuts, readable title text, and a closing takeaway. Submit a viewable link and briefly describe your edit choices.'),
  ('Video Editing', 'Video Editing: Clean dialogue sequence', 'Improve dialogue clarity while maintaining natural pacing.', 'intermediate',
   'Edit a short dialogue clip by removing distracting pauses, balancing audio levels, and adding captions synchronized to speech. Submit the video and describe the audio and caption checks you performed.'),
  ('Video Editing', 'Video Editing: Consistent multi-scene story', 'Maintain continuity and intentional visual rhythm across scenes.', 'advanced',
   'Create a 45–60 second story from at least three scenes. Use consistent color treatment, purposeful transitions, balanced audio, and an ending that resolves the opening idea. Submit a viewable link and a short edit breakdown.'),

  ('Graphic Design', 'Graphic Design: Event poster', 'Build a readable composition with clear information hierarchy.', 'beginner',
   'Design a poster for a student workshop containing event name, date, time, location, and registration action. Make the most important information easy to find at a glance. Submit the design and identify its type hierarchy.'),
  ('Graphic Design', 'Graphic Design: Social post variations', 'Adapt a visual system to multiple sizes without losing clarity.', 'intermediate',
   'Create square and portrait social-media versions of the same event announcement. Preserve key information, maintain consistent typography/colors, and adjust layout for each crop. Submit both exports and explain the adaptations.'),
  ('Graphic Design', 'Graphic Design: Mini visual identity', 'Create a cohesive, reusable visual direction for a student project.', 'advanced',
   'Develop a mini identity with a logo or wordmark, a color palette, and a type pairing. Show it applied to two different assets and explain legibility, contrast, and how the assets remain visually related. Submit the files or a viewable link.')
) as v(skill_name, title, description, difficulty, instructions)
join public.skills s on s.name = v.skill_name
where not exists (
  select 1
  from public.skill_challenges existing
  where existing.skill_id = s.id
    and existing.title = v.title
);
