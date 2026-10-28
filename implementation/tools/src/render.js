import { renderExplanation } from './explain.js';
import { renderList } from './list.js';
import { renderRefs } from './refs.js';
import { renderTrace } from './trace.js';
import { renderVocabulary } from './vocabulary.js';
import { report } from './validate.js';

const isError = problem => problem.data?.severity !== 'warning';

export const failed = problems => problems.some(isError);

const renderProblems = problems => [report(problems), failed(problems) ? '' : 'valid'].filter(Boolean).join('\n');

export const renderers = {
    validate: renderProblems,
    explain: renderExplanation,
    refs: renderRefs,
    list: renderList,
    vocabulary: renderVocabulary,
    trace: renderTrace
};
