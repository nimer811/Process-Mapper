import { z } from 'zod';

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: z.string().min(1),
    AUTH_MODE: z.enum(['dev', 'entra']).default('dev'),
    /** Escape hatch for running the production image locally before Entra is wired (Phase 6). */
    ALLOW_DEV_AUTH: z.stringbool().default(false),
    /** Run DB migrations on startup (used by the Docker image). */
    MIGRATE_ON_START: z.stringbool().default(false),
    MIGRATIONS_DIR: z.string().optional(),
    /** Seed pilot department and dev users on startup (dev/local Docker only). */
    SEED_ON_START: z.stringbool().default(false),
    /** Also seed demo processes (Vendor Onboarding etc.). Never for the real pilot database. */
    SEED_DEMO_ON_START: z.stringbool().default(false),
    /** Directory of the built SPA; when set, the API serves it. */
    WEB_DIST_DIR: z.string().optional(),
    /** Tokens the organisation may use per calendar month across all AI features (0 = no limit). */
    AI_MONTHLY_TOKEN_BUDGET: z.coerce.number().int().min(0).default(0),
    /** Prices in USD per million tokens, for the AI usage page (0 = not configured). */
    LLM_PRICE_INPUT_PER_MTOK: z.coerce.number().min(0).default(0),
    LLM_PRICE_OUTPUT_PER_MTOK: z.coerce.number().min(0).default(0),
    LLM_PRICE_EMBEDDING_PER_MTOK: z.coerce.number().min(0).default(0),
    /** Interview transcripts are removed this many months after an interview is completed (0 = keep). */
    TRANSCRIPT_RETENTION_MONTHS: z.coerce.number().int().min(0).default(24),
    /** Organisation code at the start of document IDs, e.g. 7X → 7X-PRC-SOP-001. */
    ORG_CODE: z
      .string()
      .regex(/^[A-Z0-9]{1,6}$/)
      .default('ORG'),
    CORS_ORIGIN: z.string().optional(),
    /** Demo protection: every API call needs this code (entered once on the sign-in page). */
    DEMO_ACCESS_CODE: z.string().min(6).optional(),
    /** Entra ID sign-in (AUTH_MODE=entra): the tenant and the app registration used by the SPA and API. */
    ENTRA_TENANT_ID: z.string().optional(),
    ENTRA_CLIENT_ID: z.string().optional(),
    /** Scope the SPA asks for; defaults to api://<client id>/access_as_user. */
    ENTRA_API_SCOPE: z.string().optional(),
    /** Members of this Entra group are admins (object id), and/or users with this app role. */
    ENTRA_ADMIN_GROUP_ID: z.string().optional(),
    ENTRA_ADMIN_ROLE: z.string().default('Admin'),
    LLM_PROVIDER: z.enum(['openai', 'azure']).default('openai'),
    LLM_API_KEY: z.string().optional(),
    LLM_CHAT_MODEL: z.string().default('gpt-5.4-mini'),
    /** Optional separate model for structured extraction (defaults to the chat model). */
    LLM_EXTRACTION_MODEL: z.string().optional(),
    AZURE_OPENAI_RESOURCE_NAME: z.string().optional(),
    AZURE_OPENAI_API_VERSION: z.string().optional(),
    LLM_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
    /** Where uploaded documents are stored (a Docker volume in production). */
    STORAGE_DIR: z.string().default('./storage'),
  })
  .superRefine((c, ctx) => {
    if (c.AUTH_MODE === 'entra' && (!c.ENTRA_TENANT_ID || !c.ENTRA_CLIENT_ID)) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'AUTH_MODE=entra needs ENTRA_TENANT_ID and ENTRA_CLIENT_ID.',
      });
    }
    if (c.NODE_ENV === 'production' && c.AUTH_MODE === 'dev' && !c.ALLOW_DEV_AUTH) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message:
          'AUTH_MODE=dev is not allowed in production. Set ALLOW_DEV_AUTH=true only for a local Docker run.',
      });
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  return parsed.data;
}
