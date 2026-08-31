/** Turnstile / Clerk bot-protection fields for server-side card login on *.reave.app. */
export type CardLoginCaptcha = {
  captchaToken?: string;
  captchaWidgetType?: string;
  captchaError?: string;
};

export function captchaFieldsForFapi(captcha?: CardLoginCaptcha): Record<string, string> {
  const token = captcha?.captchaToken?.trim();
  if (!token) return {};
  const body: Record<string, string> = { captcha_token: token };
  const widgetType = captcha?.captchaWidgetType?.trim();
  if (widgetType) body.captcha_widget_type = widgetType;
  const captchaError = captcha?.captchaError?.trim();
  if (captchaError) body.captcha_error = captchaError;
  return body;
}

export async function parseCardLoginCaptchaRequest(request: Request): Promise<CardLoginCaptcha> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body || typeof body !== 'object') return {};
    const captchaToken =
      (typeof body.captchaToken === 'string' && body.captchaToken) ||
      (typeof body.captcha_token === 'string' && body.captcha_token) ||
      undefined;
    const captchaWidgetType =
      (typeof body.captchaWidgetType === 'string' && body.captchaWidgetType) ||
      (typeof body.captcha_widget_type === 'string' && body.captcha_widget_type) ||
      undefined;
    const captchaError =
      (typeof body.captchaError === 'string' && body.captchaError) ||
      (typeof body.captcha_error === 'string' && body.captcha_error) ||
      undefined;
    return { captchaToken, captchaWidgetType, captchaError };
  } catch {
    return {};
  }
}
