import { EFFECTS } from './nodes/forms.js';
import { fail } from '../errors.js';
import { resolveKind } from '../kinds.js';

const unobserved = { skip: [], observe: () => null };

let interpreter = { stubs: {}, effects: EFFECTS, ...unobserved };

export const interpret = ({ stubs = {}, effects = EFFECTS } = {}) => {
    interpreter = { stubs, effects, ...unobserved };
};

export const observing = ({ skip, observe }) => {
    const previous = interpreter;
    interpreter = { ...previous, skip, observe };
    return () => {
        interpreter = previous;
    };
};

export const stubOf = (self, operation) => [self.id, ...resolveKind(self.kind).chain.map(kind => kind.id).reverse()]
    .map(id => interpreter.stubs[id]?.[operation])
    .find(Boolean);

export const checkEffects = ({ module, export: name, effects = EFFECTS }, self) => {
    const refused = effects.filter(effect => !interpreter.effects.includes(effect));
    if (refused.length > 0) {
        fail('stubbed-effect', `low ${name} of ${self?.id} has ${refused.join(', ')}, which this interpreter stubs: stub an operation that reaches it`,
            { element: self?.id, module, export: name, effects: refused });
    }
    const skipped = effects.some(effect => interpreter.skip.includes(effect));
    interpreter.observe({ name, module, element: self?.id, effects, skipped });
    return !skipped;
};
