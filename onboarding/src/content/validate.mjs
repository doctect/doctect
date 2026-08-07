// onboarding/src/content/validate.mjs
// Build-time + test-time guards. Not shipped into the page.
const push = (errors, cond, msg) => { if (cond) errors.push(msg); };

export const validateContent = (content, refs) => {
    const errors = [];
    const fileOk = (p) => refs.filePaths.has(p);
    const pathOk = (p) => refs.filePaths.has(p) || refs.dirPaths.has(p);
    const anchorIds = new Set((content.codeMap.anchors || []).map(a => a.id));

    // intro
    for (const [spec] of Object.entries(content.intro.roundLabels || {})) {
        push(errors, !refs.specFiles.has(spec), `intro.roundLabels: unknown spec "${spec}"`);
    }
    (content.intro.run || []).forEach((r, i) =>
        push(errors, !r.cmd || !r.note, `intro.run[${i}]: needs cmd + note`));

    // tours
    const tourIds = new Set();
    for (const tour of content.tours) {
        push(errors, tourIds.has(tour.id), `tours: duplicate id "${tour.id}"`);
        tourIds.add(tour.id);
        push(errors, !tour.title || !tour.blurb || !Array.isArray(tour.diagram),
            `tour ${tour.id}: title/blurb/diagram required`);
        const diagramText = (tour.diagram || []).join('\n');
        (tour.steps || []).forEach((step, i) => {
            push(errors, !step.text, `tour ${tour.id} step ${i}: empty text`);
            (step.files || []).forEach(f =>
                push(errors, !fileOk(f), `tour ${tour.id} step ${i}: missing file ${f}`));
            (step.highlight || []).forEach(h =>
                push(errors, !diagramText.includes(`{{${h}:`), `tour ${tour.id} step ${i}: highlight "${h}" not in diagram`));
            push(errors, step.anchorId && !anchorIds.has(step.anchorId),
                `tour ${tour.id} step ${i}: unknown anchor ${step.anchorId}`);
        });
        push(errors, (tour.steps || []).length < 4, `tour ${tour.id}: fewer than 4 steps`);
    }

    // code map
    for (const ann of content.codeMap.annotations) {
        push(errors, !pathOk(ann.path), `codeMap annotation: missing path ${ann.path}`);
        push(errors, !ann.note, `codeMap annotation ${ann.path}: empty note`);
    }
    for (const dive of content.codeMap.deepDives) {
        (dive.sections || []).forEach((s, i) => {
            push(errors, !s.text, `deep dive ${dive.id} section ${i}: empty text`);
            push(errors, s.anchorId && !anchorIds.has(s.anchorId),
                `deep dive ${dive.id} section ${i}: unknown anchor ${s.anchorId}`);
        });
    }
    for (const anchor of content.codeMap.anchors) {
        push(errors, !fileOk(anchor.file), `anchor ${anchor.id}: missing file ${anchor.file}`);
        push(errors, !anchor.start || (!anchor.lines && !anchor.end),
            `anchor ${anchor.id}: needs start and lines-or-end`);
    }

    // playground
    content.playground.quizLevels.forEach((level, li) => {
        (level.questions || []).forEach((q, qi) => {
            push(errors, (q.options || []).length !== 4, `quiz L${li} Q${qi}: needs 4 options`);
            push(errors, !(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3),
                `quiz L${li} Q${qi}: answer out of range`);
            push(errors, !q.why, `quiz L${li} Q${qi}: empty why`);
        });
    });
    const bugIds = new Set();
    for (const bug of content.playground.bugHunt) {
        push(errors, bugIds.has(bug.id), `bugHunt: duplicate id ${bug.id}`);
        bugIds.add(bug.id);
        const lineCount = (bug.code || '').split('\n').length;
        push(errors, !(Number.isInteger(bug.guiltyLine) && bug.guiltyLine >= 0 && bug.guiltyLine < lineCount),
            `bugHunt ${bug.id}: guiltyLine out of range`);
        push(errors, !bug.story, `bugHunt ${bug.id}: empty story`);
        push(errors, !fileOk(bug.fixedRef), `bugHunt ${bug.id}: missing fixedRef ${bug.fixedRef}`);
    }
    for (const s of content.playground.mergeScenarios) {
        push(errors, !s.name || !s.base || !s.fork || !s.upstream, `mergeScenario: incomplete ${s.name || '?'}`);
    }
    for (const w of content.playground.wdil) {
        push(errors, !w.prompt || !w.hint, `wdil ${w.id}: prompt+hint required`);
        push(errors, !(w.answers || []).length, `wdil ${w.id}: no answers`);
        (w.answers || []).forEach(a => push(errors, !fileOk(a), `wdil ${w.id}: missing answer path ${a}`));
    }
    return errors;
};
