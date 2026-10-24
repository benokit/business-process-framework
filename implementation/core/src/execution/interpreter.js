import { EFFECTS } from './nodes/forms.js';
import { fail } from '../errors.js';
import { resolveKind } from '../kinds.js';

let interpreter = { stubs: {}, effects: EFFECTS };

export const interpret = ({ stubs = {}, effects = EFFECTS } = {}) => {
    interpreter = { stubs, effects };
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
};
