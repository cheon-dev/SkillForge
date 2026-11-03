// Skill evidence / portfolio UI and the earned badges under the Profile name.
// RPCs are stubbed so these tests cover layout, the shared modal, and the
// add/delete flow without a live database.
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

const passport = {
  profile: {
    full_name: 'Test Student',
    course: 'BSIT',
    year_level: 2,
    bio: null,
    avatar_url: null,
  },
  xp: { total_xp: 120, level: 2 },
  totals: {
    skills: 1,
    completed_sessions: 2,
    sessions_taught: 0,
    verified_activities: 1,
    challenges_passed: 1,
    endorsements_received: 0,
  },
  skills: [
    {
      skill_id: 'skill-python',
      name: 'Python',
      category: 'Programming',
      proficiency_level: 'intermediate',
      years_experience: 1,
      is_teachable: false,
      completed_sessions: 2,
      sessions_taught: 0,
      verified_activities: 1,
      challenges_passed: 1,
      endorsements_received: 0,
      xp_earned: 120,
    },
  ],
  endorsements: [],
  achievements: [
    {
      id: 'achievement-earned',
      name: 'First Skill Shared',
      description: 'Added your first skill to your profile.',
      icon: '🌱',
      criteria: 'Add a skill',
      earned: true,
      earned_at: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'achievement-locked',
      name: 'Practice Streak',
      description: 'Practise three days in a row.',
      icon: '🔥',
      criteria: '3 day streak',
      earned: false,
      earned_at: null,
    },
  ],
};

const linkEvidence = {
  id: 'evidence-1',
  skill_id: 'skill-python',
  skill_name: 'Python',
  skill_category: 'Programming',
  title: 'My project',
  description: 'A small Python project.',
  evidence_type: 'link',
  file_path: null,
  external_url: 'https://example.com/my-project',
  mime_type: null,
  file_size: null,
  created_at: '2026-11-03T00:00:00.000Z',
};

let evidenceRows: Array<typeof linkEvidence> = [];

const stubPassport = () => {
  cy.intercept('POST', '**/auth/v1/token*', { statusCode: 200, body: session });
  cy.intercept('GET', '**/rest/v1/**', { statusCode: 200, body: [] });
  cy.intercept('POST', '**/rest/v1/rpc/sync_my_achievements', {
    count: 0,
    achievements: [],
  });
  cy.intercept('POST', '**/rest/v1/rpc/get_skill_passport', passport);
  cy.intercept('POST', '**/rest/v1/rpc/get_my_projects', []);
  cy.intercept('POST', '**/rest/v1/rpc/get_my_evidence', (req) => {
    req.reply(evidenceRows);
  });
  cy.intercept('POST', '**/rest/v1/rpc/add_skill_evidence', (req) => {
    const body = req.body as Record<string, string | null>;
    evidenceRows = [{
      ...linkEvidence,
      title: String(body.p_title),
      description: body.p_description ? String(body.p_description) : null,
      evidence_type: String(body.p_evidence_type) as typeof linkEvidence.evidence_type,
      file_path: body.p_file_path ? String(body.p_file_path) : null,
      external_url: body.p_external_url ? String(body.p_external_url) : null,
      mime_type: body.p_mime_type ? String(body.p_mime_type) : null,
      file_size: body.p_file_size ? Number(body.p_file_size) : null,
    }];
    req.reply(evidenceRows[0]);
  }).as('addEvidence');
  cy.intercept('POST', '**/rest/v1/rpc/delete_skill_evidence', (req) => {
    evidenceRows = [];
    req.reply({ id: (req.body as { p_id: string }).p_id, file_path: null });
  }).as('deleteEvidence');
};

const visitPassport = () => {
  stubPassport();
  cy.visit('/tabs/skill-passport', {
    onBeforeLoad(win) {
      win.localStorage.setItem(
        'sb-jawyygvrowpfwiyxasof-auth-token',
        JSON.stringify(session),
      );
    },
  });
  cy.contains('YOUR VERIFIED RECORD', { timeout: 10000 }).should('be.visible');
  // The passport is long and Ionic content is position: fixed, so the card
  // may be below the fold. Assert it exists, then scroll when interacting.
  // Keep the timeout generous so a cold Vite start cannot flake the suite.
  cy.contains('Evidence and portfolio', { timeout: 10000 }).should('exist');
};

const visitProfile = () => {
  stubPassport();
  cy.visit('/tabs/profile', {
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

// Ionic's controlled ion-input re-renders on each keystroke, which can make
// Cypress lose the host element mid-type. Type into the native input instead.
const typeInIonInput = (index: number, value: string) => {
  cy.get('ion-modal.app-modal ion-input').eq(index).then(($el) => {
    const host = $el[0] as HTMLElement & { shadowRoot: ShadowRoot | null };
    const native = host.shadowRoot?.querySelector('input') ?? host.querySelector('input');
    if (!native) {
      throw new Error('Could not find the native input inside ion-input');
    }
    cy.wrap(native).type(value, { delay: 0 });
  });
};

const chooseEvidenceType = (label: string) => {
  cy.get('ion-modal.app-modal ion-select').eq(1).click();
  cy.get('ion-alert').should('be.visible');
  cy.get('ion-alert .alert-radio-button').contains(label).click();
  cy.get('ion-alert button').contains('OK').click();
  cy.get('ion-alert').should('not.be.visible');
};

describe('Skill evidence and portfolio', () => {
  beforeEach(() => {
    evidenceRows = [];
  });

  it('shows the evidence card with an empty state and opens the shared modal', () => {
    visitPassport();

    cy.contains('No evidence yet.').should('exist');
    cy.contains('ion-button', 'Add evidence').click({ force: true });

    modal().should('be.visible');
    modal().contains('Add evidence').should('exist');
    modal().contains('ion-label', 'Skill').should('exist');
    modal().contains('ion-label', 'Title').should('exist');
    modal().contains('ion-label', 'Type').should('exist');
    modal().contains('label', 'File').should('exist');
    modal().contains('ion-label', 'Description (optional)').should('exist');
    modal().contains('ion-button', 'Cancel').click();
    modalClosed();
  });

  it('adds a link evidence item through the modal', () => {
    visitPassport();

    cy.contains('ion-button', 'Add evidence').click({ force: true });
    modal().should('be.visible');

    chooseEvidenceType('Link');
    typeInIonInput(0, 'My project');
    typeInIonInput(1, 'https://example.com/my-project');

    modal().contains('ion-button', 'Add evidence').click();
    cy.wait('@addEvidence').its('request.body').should((body) => {
      expect(body.p_skill_id).to.eq('skill-python');
      expect(body.p_title).to.eq('My project');
      expect(body.p_evidence_type).to.eq('link');
      expect(body.p_external_url).to.eq('https://example.com/my-project');
      expect(body.p_file_path).to.eq(null);
    });

    modalClosed();
    cy.contains('My project').should('exist');
    cy.contains('Link').should('exist');
    cy.contains('Evidence added to your passport.').should('exist');
  });

  it('uploads a file when crypto.randomUUID is unavailable', () => {
    // A phone opening the dev server over a LAN IP is not a secure context,
    // so crypto.randomUUID() is missing there. The upload must fall back to
    // getRandomValues() instead of failing with "not a function".
    stubPassport();
    cy.intercept('POST', '**/storage/v1/object/skill-evidence/**', {
      statusCode: 200,
      body: { Key: 'uploaded' },
    }).as('uploadFile');

    cy.visit('/tabs/skill-passport', {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          'sb-jawyygvrowpfwiyxasof-auth-token',
          JSON.stringify(session),
        );
        Object.defineProperty(win.crypto, 'randomUUID', {
          configurable: true,
          value: undefined,
        });
      },
    });
    cy.contains('YOUR VERIFIED RECORD', { timeout: 10000 }).should('be.visible');

    cy.contains('ion-button', 'Add evidence').click({ force: true });
    modal().should('be.visible');
    typeInIonInput(0, 'Python certificate');
    cy.get('ion-modal.app-modal input[type=file]').selectFile({
      contents: Cypress.Buffer.from('fake jpg bytes'),
      fileName: 'proof.jpg',
      mimeType: 'image/jpeg',
    });

    modal().contains('ion-button', 'Add evidence').click();
    cy.wait('@uploadFile');
    cy.wait('@addEvidence').its('request.body').should((body) => {
      expect(body.p_evidence_type).to.eq('screenshot');
      expect(body.p_file_path).to.match(
        /^11111111-1111-1111-1111-111111111111\/[0-9a-f-]+\.jpg$/,
      );
      expect(body.p_mime_type).to.eq('image/jpeg');
    });

    modalClosed();
    cy.contains('Python certificate').should('exist');
  });

  it('removes an evidence item after confirmation', () => {
    evidenceRows = [linkEvidence];
    visitPassport();

    cy.contains('My project').should('exist');
    cy.get('.passport-page__evidence-item')
      .contains('ion-button', 'Remove')
      .click({ force: true });

    cy.get('ion-alert').should('be.visible');
    cy.get('ion-alert').contains('Remove evidence?').should('be.visible');
    cy.get('ion-alert button').contains('Remove').click();

    cy.wait('@deleteEvidence').its('request.body').should('deep.include', { p_id: 'evidence-1' });
    cy.contains('No evidence yet.').should('exist');
  });

  it('shows earned badges under the student name on the Profile page', () => {
    visitProfile();

    cy.contains('Test Student', { timeout: 10000 }).should('be.visible');
    cy.get('.profile-page__badges').should('be.visible');
    cy.get('.profile-page__badge').should('have.length', 1);
    cy.contains('First Skill Shared').should('be.visible');
    cy.contains('Practice Streak').should('not.exist');
  });
});
