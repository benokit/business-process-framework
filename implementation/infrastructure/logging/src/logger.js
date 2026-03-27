export function log({ input: { message, level = 'info', context = {} } }) {
    const entry = {
        ...context,
        timestamp: new Date().toISOString(),
        level,
        message
    };
    const line = JSON.stringify(entry) + '\n';
    if (level === 'error' || level === 'fatal') {
        process.stderr.write(line);
    } else {
        process.stdout.write(line);
    }
    return null;
}
