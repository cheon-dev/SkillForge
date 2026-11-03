// Arena UI coverage. The RPCs are stubbed so these tests exercise layout,
// navigation and modal behaviour without needing a live database.
const session = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'student@skillforge.test',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    phone: '',
    confirmed_at: '2026-01-01T00:00:00.000Z',
    last_sign_in_at: '2026-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: 'Test Student' },
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    is_anonymous: false,
  },
};

const arenaState = {
  rating: 1042,
  tier: 'Bronze',
  wins: 3,
  losses: 1,
  draws: 0,
  leaderboard_opt_out: false,
  current_streak: 4,
  longest_streak: 6,
  played_today: true,
  xp_today: 18,
  xp_cap: 40,
  open_duels: [
    {
      id: 'duel-1',
      skill_id: 'skill-python',
      skill_name: 'Python',
      skill_category: 'Programming',
      opponent_id: 'opp-1',
      opponent_name: 'Maya Reyes',
      my_role: 'challenger',
      i_played: false,
      opponent_played: false,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      created_at: new Date().toISOString(),
    },
  ],
  recent_duels: [],
};

const skills = [
  {
    id: 'skill-python',
    name: 'Python',
    category: 'Programming',
    question_count: 10,
    duel_question_count: 10,
    on_my_profile: true,
    i_teach: false,
  },
  {
    id: 'skill-js',
    name: 'JavaScript',
    category: 'Programming',
    question_count: 10,
    duel_question_count: 10,
    on_my_profile: true,
    i_teach: false,
  },
];

const bank = {
  skills: [{ id: 'skill-python', name: 'Python', category: 'Programming' }],
  questions: [],
};

const leaderboard = [
  {
    rank_no: 1,
    student_id: 'opp-1',
    full_name: 'Maya Reyes',
    tier: 'Silver',
    rating: 1180,
    points: 64,
    wins: 5,
    losses: 2,
    draws: 0,
    is_me: false,
  },
  {
    rank_no: 2,
    student_id: '11111111-1111-1111-1111-111111111111',
    full_name: 'Test Student',
    tier: 'Bronze',
    rating: 1042,
    points: 18,
    wins: 3,
    losses: 1,
    draws: 0,
    is_me: true,
  },
];

const round = {
  round_id: 'round-1',
  mode: 'solo',
  skill_id: 'skill-python',
  duel_id: null,
  question_limit_ms: 15000,
  questions: [
    {
      id: 'q1',
      prompt: 'What does len("hello") return?',
      options: ['4', '5', '6', 'Error'],
      difficulty: 'easy',
    },
    {
      id: 'q2',
      prompt: 'Which keyword defines a function?',
      options: ['def', 'func', 'function', 'lambda'],
      difficulty: 'easy',
    },
  ],
};

const answerResult = {
  is_correct: true,
  correct_index: 1,
  explanation: 'len counts characters, and hello has five.',
  points: 100,
  combo: 1,
  score: 100,
  answered_count: 1,
  total_questions: 2,
  question_limit_ms: 15000,
  elapsed_ms: 900,
};

const summary = {
  round_id: 'round-1',
  mode: 'solo',
  score: 100,
  correct_count: 1,
  answered_count: 1,
  total_questions: 2,
  xp_awarded: 1,
  total_xp: 41,
  level: 1,
  personal_best: true,
  streak: 5,
  xp_today: 19,
  xp_cap: 40,
  duel: null,
};

const opponent = {
  id: 'opp-1',
  full_name: 'Maya Reyes',
  course: 'BSIT',
  rating: 1180,
  tier: 'Silver',
};

const stubArena = () => {
  cy.intercept('POST', '**/auth/v1/token*', { statusCode: 200, body: session });
  cy.intercept('GET', '**/rest/v1/**', { statusCode: 200, body: [] });
  cy.intercept('POST', '**/rest/v1/rpc/get_arena_state', arenaState);
  cy.intercept('POST', '**/rest/v1/rpc/get_arena_skills', skills);
  cy.intercept('POST', '**/rest/v1/rpc/get_my_question_bank', bank);
  cy.intercept('POST', '**/rest/v1/rpc/get_arena_leaderboard', leaderboard);
};

const visitArena = (path = '/tabs/arena') => {
  stubArena();
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem(
        'sb-jawyygvrowpfwiyxasof-auth-token',
        JSON.stringify(session),
      );
    },
  });
};

const modal = () => cy.get('ion-modal.app-modal');
const modalClosed = () => cy.get('ion-modal.app-modal').should('not.be.visible');

describe('Skill Arena', () => {
  it('opens from the Home card', () => {
    visitArena('/tabs/home');
    cy.contains('Play. Duel. Climb.').should('be.visible');

    // The sticky header can overlap the card after Cypress scrolls it; force
    // the click because this test is about navigation, not hit-testing.
    cy.contains('ion-button', 'Enter Arena').click({ force: true });
    cy.location('pathname').should('eq', '/tabs/arena');
    cy.contains('YOUR RANK').should('be.visible');
    cy.contains('1042 rating').should('be.visible');
  });

  it('renders rank, streak, open duels and the leaderboard', () => {
    visitArena();
    cy.contains('YOUR RANK').should('be.visible');
    cy.contains('1042 rating').should('be.visible');
    cy.contains('Day streak').should('be.visible');
    cy.contains('18 / 40').should('be.visible');
    cy.contains('Maya Reyes').should('be.visible');
    cy.contains('64 XP').should('exist');
  });

  it('plays a solo round and shows answer feedback', () => {
    visitArena();
    cy.intercept('POST', '**/rest/v1/rpc/start_arena_round', round);
    cy.intercept('POST', '**/rest/v1/rpc/submit_arena_answer', answerResult);

    cy.contains('ion-button', 'Solo Rush').click();
    cy.contains('Question 1 of 2').should('be.visible');
    cy.contains('What does len("hello") return?').should('be.visible');

    cy.get('button.arena-option').eq(1).click();
    cy.contains('Correct').should('be.visible');
    cy.contains('+100').should('be.visible');
    cy.contains('len counts characters').should('be.visible');

    cy.contains('ion-button', 'Next question').click();
    cy.contains('Question 2 of 2').should('be.visible');
    cy.contains('Which keyword defines a function?').should('be.visible');
  });

  it('shows the round summary after the last question', () => {
    visitArena();
    cy.intercept('POST', '**/rest/v1/rpc/start_arena_round', round);
    cy.intercept('POST', '**/rest/v1/rpc/submit_arena_answer', answerResult);
    cy.intercept('POST', '**/rest/v1/rpc/finish_arena_round', summary);

    cy.contains('ion-button', 'Solo Rush').click();
    cy.get('button.arena-option').eq(1).click();
    cy.contains('ion-button', 'Next question').click();
    cy.get('button.arena-option').eq(0).click();
    cy.contains('ion-button', 'See results').click();

    cy.contains('100 points').should('be.visible');
    cy.contains('new personal best').should('be.visible');
    cy.contains('.arena-summary__grid', '+1').should('be.visible');
    cy.contains('ion-button', 'Rematch').should('be.visible');
  });

  it('opens and closes the duel challenge modal', () => {
    visitArena();
    cy.intercept('POST', '**/rest/v1/rpc/find_duel_opponent', opponent);

    cy.contains('ion-button', 'Find a Duel').click();
    modal().contains('Send a duel challenge').should('exist');
    modal().contains('Maya Reyes').should('exist');
    modal().contains('ion-button', 'Cancel').click();
    modalClosed();
  });

  it('opens and closes the question authoring modal', () => {
    visitArena();

    cy.contains('ion-button', 'Add question').click();
    modal().contains('Add a question').should('exist');
    cy.get('ion-modal.app-modal ion-textarea').should('have.length.at.least', 1);
    modal().contains('ion-button', 'Cancel').click();
    modalClosed();
  });

  it('starts a duel round from an open duel', () => {
    visitArena();
    cy.intercept('POST', '**/rest/v1/rpc/start_arena_round', {
      ...round,
      mode: 'duel',
      duel_id: 'duel-1',
    }).as('startDuel');

    cy.contains('ion-button', 'Play').click();
    cy.wait('@startDuel').its('request.body').should('deep.include', {
      p_mode: 'duel',
      p_duel_id: 'duel-1',
    });
    cy.contains('Question 1 of 2').should('be.visible');
  });

  it('saves the leaderboard opt-out preference', () => {
    visitArena();
    cy.intercept('POST', '**/rest/v1/rpc/set_arena_leaderboard_opt_out', {
      statusCode: 204,
      body: '',
    }).as('optOut');

    cy.get('.arena-leaderboard__optout ion-toggle').click();
    cy.wait('@optOut').its('request.body').should('deep.include', { p_opt_out: true });
  });
});
