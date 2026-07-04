import { Router } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { requireAuth } from '../middleware/guards.js';
import { getProjectRow, loadProject, insertCommit } from './projects.js';
import { threeWayDiff, applyChangeSet } from '../../shared/diff.js';
import { validateAppState } from '../validateAppState.js';

const router = Router();

const getCommitState = async (commitId) => {
    const rows = await query('SELECT state_json, schema_version FROM commits WHERE id = $1', [commitId]);
    if (!rows[0]) return null;
    return { state: JSON.parse(rows[0].state_json), schemaVersion: rows[0].schema_version };
};

const mrDto = async (row) => {
    const src = await getProjectRow(row.source_project_id);
    const tgt = await getProjectRow(row.target_project_id);
    const users = await query('SELECT username FROM "user" WHERE id = $1', [row.created_by]);
    return {
        id: row.id,
        sourceProjectId: row.source_project_id,
        sourceProjectName: src?.name ?? '(deleted)',
        sourceCommitId: row.source_commit_id,
        targetProjectId: row.target_project_id,
        targetProjectName: tgt?.name ?? '(deleted)',
        baseCommitId: row.base_commit_id,
        title: row.title,
        description: row.description,
        status: row.status,
        createdBy: row.created_by,
        authorUsername: users[0]?.username ?? null,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at
    };
};

export const getMrRow = async (id) => {
    const rows = await query('SELECT * FROM merge_requests WHERE id = $1', [id]);
    return rows[0];
};

// Recomputes the diff vs the target's CURRENT head. Returns { diff, sourceState, targetState } or { error }.
export const computeMrDiff = async (mr) => {
    const base = await getCommitState(mr.base_commit_id);
    const source = await getCommitState(mr.source_commit_id);
    const target = await getProjectRow(mr.target_project_id);
    if (!base || !source || !target?.head_commit_id) return { error: 'Missing commits' };
    const targetHead = await getCommitState(target.head_commit_id);
    if (!targetHead) return { error: 'Missing target head' };
    if (source.schemaVersion !== targetHead.schemaVersion) {
        return { error: 'Schema versions differ between fork and upstream — the fork author must re-save with the latest app version' };
    }
    return {
        diff: threeWayDiff(base.state, source.state, targetHead.state),
        sourceState: source.state,
        targetState: targetHead.state,
        targetHeadCommitId: target.head_commit_id
    };
};

router.post('/api/merge-requests', requireAuth, async (req, res) => {
    const { sourceProjectId, title, description } = req.body || {};
    const t = typeof title === 'string' ? title.trim().slice(0, 200) : '';
    if (!t) return res.status(400).json({ error: 'title is required' });

    const source = await getProjectRow(sourceProjectId);
    if (!source || source.owner_id !== req.user.id) return res.status(404).json({ error: 'Source project not found' });
    if (!source.forked_from_project_id) return res.status(400).json({ error: 'Source project is not a fork' });
    const target = await getProjectRow(source.forked_from_project_id);
    if (!target || target.visibility !== 'public') return res.status(400).json({ error: 'Upstream project is not available' });
    if (source.head_commit_id === null) return res.status(400).json({ error: 'Source project has no commits' });

    const mr = {
        id: randomUUID(),
        source_project_id: source.id,
        source_commit_id: source.head_commit_id,
        target_project_id: target.id,
        base_commit_id: source.forked_from_commit_id,
        title: t,
        description: String(description ?? '').slice(0, 2000),
        created_by: req.user.id
    };
    const computed = await computeMrDiff(mr);
    if (computed.error) return res.status(400).json({ error: computed.error });
    const { diff } = computed;
    const hasChanges = diff.source.nodesChanged
        || diff.source.variantsAdded.length || diff.source.variantsRemoved.length
        || Object.keys(diff.source.variantsRenamed).length
        || Object.keys(diff.source.templatesAdded).length
        || Object.keys(diff.source.templatesModified).length
        || Object.keys(diff.source.templatesRemoved).length;
    if (!hasChanges) return res.status(400).json({ error: 'No changes to propose — save your edits to the cloud first' });

    const status = diff.conflicts.length > 0 ? 'conflicted' : 'open';
    await query(
        `INSERT INTO merge_requests (id, source_project_id, source_commit_id, target_project_id, base_commit_id, title, description, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [mr.id, mr.source_project_id, mr.source_commit_id, mr.target_project_id, mr.base_commit_id, mr.title, mr.description, status, mr.created_by]
    );
    res.status(201).json({ mergeRequest: await mrDto(await getMrRow(mr.id)) });
});

router.get('/api/projects/:id/merge-requests', requireAuth, loadProject(true), async (req, res) => {
    const rows = await query(
        `SELECT * FROM merge_requests WHERE target_project_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [req.project.id]);
    res.json({ mergeRequests: await Promise.all(rows.map(mrDto)) });
});

router.get('/api/merge-requests/mine', requireAuth, async (req, res) => {
    const rows = await query(
        `SELECT * FROM merge_requests WHERE created_by = $1 ORDER BY created_at DESC LIMIT 100`,
        [req.user.id]);
    res.json({ mergeRequests: await Promise.all(rows.map(mrDto)) });
});

const loadMrForParticipant = async (req, res, next) => {
    const mr = await getMrRow(req.params.id);
    if (!mr) return res.status(404).json({ error: 'Merge request not found' });
    const target = await getProjectRow(mr.target_project_id);
    const isAuthor = mr.created_by === req.user.id;
    const isTargetOwner = target && target.owner_id === req.user.id;
    if (!isAuthor && !isTargetOwner) return res.status(404).json({ error: 'Merge request not found' });
    req.mr = mr;
    req.isTargetOwner = !!isTargetOwner;
    next();
};

router.get('/api/merge-requests/:id', requireAuth, loadMrForParticipant, async (req, res) => {
    const mr = req.mr;
    if (mr.status === 'merged' || mr.status === 'closed') {
        return res.json({ mergeRequest: await mrDto(mr), diff: null, sourceState: null, targetState: null });
    }
    const computed = await computeMrDiff(mr);
    if (computed.error) return res.status(409).json({ error: computed.error });
    // keep stored status in sync with live conflict state
    const liveStatus = computed.diff.conflicts.length > 0 ? 'conflicted' : 'open';
    if (liveStatus !== mr.status) {
        await query('UPDATE merge_requests SET status = $1 WHERE id = $2', [liveStatus, mr.id]);
        mr.status = liveStatus;
    }
    res.json({
        mergeRequest: await mrDto(mr),
        diff: computed.diff,
        sourceState: computed.sourceState,
        targetState: computed.targetState
    });
});

router.post('/api/merge-requests/:id/merge', requireAuth, loadMrForParticipant, async (req, res) => {
    const mr = req.mr;
    if (!req.isTargetOwner) return res.status(403).json({ error: 'Only the upstream owner can merge' });
    if (mr.status === 'merged' || mr.status === 'closed') {
        return res.status(409).json({ error: `Merge request is already ${mr.status}` });
    }
    const computed = await computeMrDiff(mr);
    if (computed.error) return res.status(409).json({ error: computed.error });
    if (computed.diff.conflicts.length > 0) {
        await query(`UPDATE merge_requests SET status = 'conflicted' WHERE id = $1`, [mr.id]);
        return res.status(409).json({ error: 'Merge request has conflicts', conflicts: computed.diff.conflicts });
    }
    const base = await getCommitState(mr.base_commit_id);
    const merged = applyChangeSet(base.state, computed.sourceState, computed.targetState);
    const v = validateAppState(merged);
    if (!v.ok) return res.status(409).json({ error: `Merged state failed validation: ${v.error}` });

    const users = await query('SELECT username FROM "user" WHERE id = $1', [mr.created_by]);
    const target = await getProjectRow(mr.target_project_id);
    const commitId = await insertCommit({
        projectId: target.id,
        parentCommitId: target.head_commit_id,
        message: `Merge: ${mr.title} (from @${users[0]?.username ?? 'unknown'})`,
        state: merged,
        userId: req.user.id
    });
    await query(
        `UPDATE merge_requests SET status = 'merged', resolved_by = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [req.user.id, mr.id]);
    res.json({ mergeRequest: await mrDto(await getMrRow(mr.id)), commit: { id: commitId } });
});

router.post('/api/merge-requests/:id/close', requireAuth, loadMrForParticipant, async (req, res) => {
    const mr = req.mr;
    if (mr.status === 'merged') return res.status(409).json({ error: 'Already merged' });
    await query(
        `UPDATE merge_requests SET status = 'closed', resolved_by = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [req.user.id, mr.id]);
    res.json({ mergeRequest: await mrDto(await getMrRow(mr.id)) });
});

export default router;
