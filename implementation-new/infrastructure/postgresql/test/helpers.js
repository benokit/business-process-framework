import pg from 'pg';

export const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';

export const skipWithoutPostgres = async context => {
    const probe = new pg.Pool({ connectionString: POSTGRES_URL, max: 1 });
    try {
        (await probe.connect()).release();
    } catch {
        console.warn('\n  WARNING: PostgreSQL not reachable — tests skipped\n');
        context.skip();
    } finally {
        await probe.end();
    }
};
