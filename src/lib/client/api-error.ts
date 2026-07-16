export type ApiErrorPayload = { error?: string | { code?: string; message?: string } };

/** 兼容旧接口，同时让新接口统一使用 error.code + error.message。 */
export async function getApiErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as ApiErrorPayload | null;
  if (typeof body?.error === "string") return body.error;
  return body?.error?.message || fallback;
}
