describe('SkillForge authentication gate', () => {
  it('redirects unauthenticated users to login', () => {
    cy.visit('/')
    cy.location('pathname').should('eq', '/login')
    cy.contains('h1', 'SkillForge')
    cy.contains('a', 'Create an account')
  })

  it('exposes the registration route', () => {
    cy.visit('/register')
    cy.contains('h1', 'Join SkillForge')
    cy.contains('a', 'Sign in')
  })
})
