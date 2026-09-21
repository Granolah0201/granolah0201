export interface Env {
  GEMINI_API_KEY?: string;
  PEXELS_API_KEY?: string;
  PIXABAY_API_KEY?: string;
  APP_TOKEN?: string;
  GEMINI_FLASH_MODEL?: string;
  GEMINI_FLASH_LITE_MODEL?: string;
  ALLOWED_ORIGINS?: string;
}

export const flashModel = (env: Env) => env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash';
export const flashLiteModel = (env: Env) => env.GEMINI_FLASH_LITE_MODEL || 'gemini-2.5-flash-lite';
