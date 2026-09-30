import { canAssignTicket, isAssignableRole } from "../modules/tickets/assignment.policy.js";

test.each([
  ["OWNER", true, true], ["ADMIN", true, true], ["AGENT", true, false],
  ["CUSTOMER", false, false], ["UNKNOWN", false, false]
])("%s has explicit assignee eligibility and assignment authority", (role, eligible, authority) => {
  expect(isAssignableRole(role as string)).toBe(eligible);
  expect(canAssignTicket(role as string)).toBe(authority);
});
