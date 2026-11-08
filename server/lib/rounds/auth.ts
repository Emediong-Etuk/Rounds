import { fail } from "@agent-native/core/action";

export function requireUser(ctx: { userEmail?: string | undefined } | undefined): string {
  const email = ctx?.userEmail;
  if (!email) fail("Sign in to use Rounds.", { errorCode: "unauthorized", statusCode: 401 });
  return email;
}
