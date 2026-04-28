# language: en
@DEMO-42 @login @auth
Feature: User Login with Email and Password
  As a registered user
  I want to log in to the application using my email and password
  So that I can access my personalized dashboard

  Background:
    Given the application is accessible
    And the user is on the login page

  @TC-DEMO-42-001 @happy-path @regression @P1
  Scenario: Successful login with valid credentials
    Given a registered user with email "test@example.com" and password "SecurePass1"
    When the user enters "test@example.com" in the email field
    And the user enters "SecurePass1" in the password field
    And the user clicks the "Sign In" button
    Then the user is redirected to the dashboard page
    And the dashboard displays personalized content

  @TC-DEMO-42-002 @negative @P1
  Scenario: Error message with invalid password
    Given a registered user with email "test@example.com"
    When the user enters "test@example.com" in the email field
    And the user enters "WrongPassword" in the password field
    And the user clicks the "Sign In" button
    Then the error message "Invalid email or password" is displayed
    And the user remains on the login page

  @TC-DEMO-42-003 @negative @P1
  Scenario: Error message with unregistered email
    When the user enters "unknown@example.com" in the email field
    And the user enters "AnyPassword1" in the password field
    And the user clicks the "Sign In" button
    Then the error message "Invalid email or password" is displayed

  @TC-DEMO-42-004 @negative @validation @P2
  Scenario: Email format validation
    When the user enters "not-an-email" in the email field
    And the user clicks the "Sign In" button
    Then the validation error "Please enter a valid email address" is displayed

  @TC-DEMO-42-006 @security @lockout @P1
  Scenario: Account lockout after 5 failed attempts
    Given a registered user with email "test@example.com"
    And the account is not currently locked
    When the user attempts login 5 times with incorrect password "Wrong1"
    And the user attempts a 6th login
    Then the lockout message is displayed
    And the account is temporarily locked for 15 minutes

  @TC-DEMO-42-007 @edge-case @P3
  Scenario: Login with empty email field
    When the user leaves the email field empty
    And the user enters "SecurePass1" in the password field
    And the user clicks the "Sign In" button
    Then a validation error is displayed for the email field

  @TC-DEMO-42-008 @edge-case @P3
  Scenario: Login with empty password field
    When the user enters "test@example.com" in the email field
    And the user leaves the password field empty
    And the user clicks the "Sign In" button
    Then a validation error is displayed for the password field
