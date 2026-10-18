const toStderr = new Set(['error', 'fatal']);

export const log = ({ input: { message, level = 'info', context = {} } }) => {
    const line = `${JSON.stringify({ ...context, timestamp: new Date().toISOString(), level, message })}\n`;
    (toStderr.has(level) ? process.stderr : process.stdout).write(line);
    return null;
};
