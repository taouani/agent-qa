---
type: risk-register
generated: 2025-06-15 11:45
source_requirements:
  - DEMO-42
language: en
version: "1.0"
---

# Risk Register — DEMO-42: User Login

## Risk Matrix

| ID | Risk | Category | Likelihood | Impact | Score | Mitigation | Owner |
|----|------|----------|------------|--------|-------|------------|-------|
| R-001 | Authentication bypass via SQL injection | Security | Low | Critical | High | Input sanitization, parameterized queries, security test cases TC-DEMO-42-002/003 | Dev Team |
| R-002 | Account lockout mechanism fails | Security | Medium | High | High | Dedicated lockout test TC-DEMO-42-006, monitoring alerts | QA + DevOps |
| R-003 | Password exposed in plaintext | Security | Low | Critical | High | Masking test TC-DEMO-42-005, HTTPS enforcement, httpOnly JWT cookie | Dev Team |
| R-004 | Session fixation/hijacking | Security | Low | Critical | Medium | JWT rotation, secure cookie flags, session test in charter | Dev Team |
| R-005 | Login form not accessible | Compliance | Medium | Medium | Medium | WCAG 2.1 AA testing, screen reader validation | QA Team |
| R-006 | Rate limiting insufficient | Performance | Medium | High | Medium | Load test login endpoint, verify 10 req/min limit | QA + DevOps |
| R-007 | Error messages reveal system info | Security | Medium | Medium | Medium | Verify generic error messages in TC-DEMO-42-002/003 | Dev Team |

## Scoring Legend

| Likelihood × Impact | Low Impact | Medium Impact | High Impact | Critical Impact |
|---------------------|-----------|---------------|-------------|-----------------|
| **High** | Medium | High | Critical | Critical |
| **Medium** | Low | Medium | High | High |
| **Low** | Low | Low | Medium | Medium |

## Summary

- **Total Risks**: 7
- **Critical**: 0
- **High**: 3 (R-001, R-002, R-003)
- **Medium**: 4 (R-004, R-005, R-006, R-007)
- **Low**: 0
