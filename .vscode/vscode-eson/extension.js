const vscode = require('vscode');

/**
 * Serialize a value that lives *inside* an inline object — everything stays
 * on one line.
 */
function inlineValue(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        return '[' + value.map(inlineValue).join(', ') + ']';
    }
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return '{ ' + entries.map(([k, v]) => JSON.stringify(k) + ': ' + inlineValue(v)).join(', ') + ' }';
}

/**
 * Serialize a value at a given indentation depth.
 *
 * Rule: arrays expand (one item per line); objects stay inline.
 * Values nested inside an object are always serialized inline via inlineValue.
 */
function serialize(value, depth, tabSize) {
    const indent = ' '.repeat(tabSize * depth);
    const inner  = ' '.repeat(tabSize * (depth + 1));

    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value.map(item => inner + serialize(item, depth + 1, tabSize));
        return '[\n' + items.join(',\n') + '\n' + indent + ']';
    }
    // Object — inline
    return inlineValue(value);
}

function formatEson(text, tabSize) {
    const parsed = JSON.parse(text);
    return serialize(parsed, 0, tabSize) + '\n';
}

function activate(context) {
    const provider = vscode.languages.registerDocumentFormattingEditProvider('eson', {
        provideDocumentFormattingEdits(document, options) {
            const tabSize = typeof options.tabSize === 'number' ? options.tabSize : 4;
            const text = document.getText();

            let formatted;
            try {
                formatted = formatEson(text, tabSize);
            } catch (e) {
                vscode.window.showErrorMessage('ESON format failed: ' + e.message);
                return [];
            }

            if (formatted === text) return [];

            const full = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            );
            return [vscode.TextEdit.replace(full, formatted)];
        }
    });

    context.subscriptions.push(provider);
}

function deactivate() {}

module.exports = { activate, deactivate };
