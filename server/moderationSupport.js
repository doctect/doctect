import { dbType } from './db.js';

export const MAX_PROJECTS_TO_UNPUBLISH = 20;

const EXPIRY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/;

const asIso = value => value == null ? null : new Date(value).toISOString();
const isBanned = value => value === true || value === 1 || value === '1';
const effectiveRole = role => role === 'owner' || role === 'admin' ? role : 'user';

export const suspensionStatus = (row, now = Date.now()) => {
    if (!isBanned(row.banned)) return 'none';
    if (row.banExpires == null) return 'active';
    return new Date(row.banExpires).getTime() > now ? 'active' : 'expired';
};

export const validateVersion = value => Number.isInteger(value) && value >= 0;

export const validateIsoTimestamp = (raw, { future = false } = {}) => {
    if (typeof raw !== 'string') return { ok: false };
    const match = EXPIRY_PATTERN.exec(raw);
    if (!match) return { ok: false };
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone, zoneHourText, zoneMinuteText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
        || hour > 23 || minute > 59 || second > 59) return { ok: false };
    if (zone !== 'Z') {
        const zoneHour = Number(zoneHourText);
        const zoneMinute = Number(zoneMinuteText);
        if (zoneHour > 14 || zoneMinute > 59 || (zoneHour === 14 && zoneMinute !== 0)) return { ok: false };
    }
    const timestamp = Date.parse(raw);
    if (!Number.isFinite(timestamp) || (future && timestamp <= Date.now())) return { ok: false };
    return { ok: true, value: new Date(timestamp).toISOString() };
};

export const validateExpiry = raw => raw === null
    ? { ok: true, value: null }
    : validateIsoTimestamp(raw, { future: true });

export const validateProjectIds = raw => {
    if (!Array.isArray(raw) || raw.length > MAX_PROJECTS_TO_UNPUBLISH
        || raw.some(id => typeof id !== 'string' || id.length > 200)) return null;
    const ids = raw.map(id => id.trim());
    if (ids.some(id => !id)) return null;
    return new Set(ids).size === ids.length ? ids : null;
};

export const lockUser = async (id, txQuery) => {
    const suffix = dbType === 'postgres' ? ' FOR UPDATE' : '';
    const rows = await txQuery(
        `SELECT id, email, username, role, "createdAt", banned, "banReason", "banExpires", "moderationVersion"
         FROM "user" WHERE id = $1${suffix}`,
        [id],
    );
    return rows[0] ?? null;
};

export const accountDto = row => ({
    id: row.id,
    email: row.email,
    username: row.username ?? null,
    role: effectiveRole(row.role),
    createdAt: asIso(row.createdAt),
    suspensionStatus: suspensionStatus(row),
    banExpires: asIso(row.banExpires),
    moderationVersion: Number(row.moderationVersion),
    banReason: row.banReason ?? null,
});
