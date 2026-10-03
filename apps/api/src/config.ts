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
    /** Directory of the built SPA; when set, the API serves it. */
    WEB_DIST_DIR: z.string().optional(),
    CORS_ORIGIN: z.string().optional(),
  })
  .superRefine((c, ctx) => {
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
