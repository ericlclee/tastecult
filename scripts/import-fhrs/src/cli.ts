import path from 'node:path';
import { parseArgs } from 'node:util';
import { getPrisma } from '@tastecult/db';
import { config as loadEnv } from 'dotenv';
import { createFhrsClient } from './fhrs-client';
import { runImport } from './import';

// Local runs read the monorepo .env; in CI the env vars are set directly.
loadEnv({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

const { values } = parseArgs({
  options: {
    authority: { type: 'string', multiple: true },
    'dry-run': { type: 'boolean', default: false },
  },
});

const dryRun = values['dry-run'] ?? false;
const prisma = dryRun ? undefined : getPrisma();
const startedAt = Date.now();

try {
  const summary = await runImport({
    client: createFhrsClient(),
    prisma,
    authorities: values.authority,
    dryRun,
  });

  const totals = summary.results.reduce(
    (acc, r) => ({
      relevant: acc.relevant + r.relevant,
      written: acc.written + r.written,
      closed: acc.closed + r.closed,
    }),
    { relevant: 0, written: 0, closed: 0 },
  );
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(
    `\n${dryRun ? '[dry run] ' : ''}${summary.results.length} authorities, ` +
      `${totals.relevant} restaurants, ${totals.written} written, ${totals.closed} closed in ${seconds}s`,
  );

  if (summary.failed.length > 0) {
    console.error(`Failed authorities: ${summary.failed.map((f) => f.authority).join(', ')}`);
    process.exitCode = 1;
  }
} finally {
  await prisma?.$disconnect();
}
