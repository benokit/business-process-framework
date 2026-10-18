export const MEILISEARCH_URL = process.env.MEILISEARCH_URL ?? 'http://localhost:7700';

export const skipWithoutMeilisearch = async context => {
    const healthy = await fetch(`${MEILISEARCH_URL}/health`).then(response => response.ok, () => false);
    if (!healthy) {
        console.warn('\n  WARNING: Meilisearch not reachable — tests skipped\n');
        context.skip();
    }
};
