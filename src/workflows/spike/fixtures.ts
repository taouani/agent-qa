/**
 * Synthetic tickets for the Copilot spike (T10). The text is already masked:
 * tokens such as <PERSON_1> stand where the masking gateway (T7/slice 1) will
 * put them, so no real or seeded personal value ever reaches the host model.
 */
export const SPIKE_TICKETS = {
  "SPIKE-1": {
    title: "Login with email and password",
    body: [
      "As a registered user I want to log in with my email and password so that I can see my cases.",
      "Acceptance criteria:",
      "1. Valid email and password open the Cases home page.",
      "2. A wrong password shows 'Invalid credentials' and does not reveal whether the email exists.",
      "3. After 5 failed attempts the account is locked for 15 minutes.",
      "4. The email field accepts at most 254 characters.",
    ].join("\n"),
  },
  "SPIKE-2": {
    title: "Create a support case from the contact page",
    body: [
      "Reported by <PERSON_1> (<EMAIL_1>, phone <PHONE_1>).",
      "As a service agent I want to create a case from a contact record so that the case is linked to the customer.",
      "Acceptance criteria:",
      "1. The 'New Case' button on a contact opens the case form with Contact and Account pre-filled.",
      "2. Subject and Priority are required; saving without them shows field errors.",
      "3. Priority values are Low, Medium, High and Critical.",
      "4. A saved case appears in the contact's Cases related list.",
      "Example customer: <PERSON_2>, account <ORG_1>, IBAN <IBAN_1>.",
    ].join("\n"),
  },
  "SPIKE-3": {
    title: "Escalate overdue high-priority cases",
    body: [
      "As a service manager I want high-priority cases that are open for more than 24 hours to be escalated.",
      "Acceptance criteria:",
      "1. A High or Critical case open for more than 24 business hours gets status 'Escalated'.",
      "2. The case owner's manager is notified by email.",
      "3. Cases on hold are not escalated.",
      "4. Escalation runs every hour; a case is escalated only once.",
    ].join("\n"),
  },
} as const;

export type SpikeTicketKey = keyof typeof SPIKE_TICKETS;
