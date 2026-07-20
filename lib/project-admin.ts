import "server-only";

export function isProjectAdminEmail(email: string | null | undefined) {
  const configuredEmail = process.env.PROJECT_ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(configuredEmail && email?.trim().toLowerCase() === configuredEmail);
}
