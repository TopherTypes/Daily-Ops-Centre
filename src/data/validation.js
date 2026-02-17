const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const STATUS_ENUMS = {
  today: ['not started', 'in progress', 'waiting', 'blocked', 'complete', 'cancelled', 'deferred', 'archived'],
  followUpRecipient: ['pending', 'complete']
};

function createError(code, message, details = {}) {
  return { code, message, details };
}

export function ok(value = {}) {
  return { ok: true, ...value };
}

export function fail(code, message, details = {}) {
  return { ok: false, error: createError(code, message, details) };
}

export function validateId(id, fieldName = 'id') {
  if (typeof id !== 'string' || !id.trim()) {
    return fail('VALIDATION_ID_REQUIRED', `${fieldName} is required.`, { field: fieldName });
  }

  if (!ID_PATTERN.test(id.trim())) {
    return fail('VALIDATION_ID_INVALID', `${fieldName} must contain only letters, numbers, underscores, or dashes.`, { field: fieldName, value: id });
  }

  return ok({ value: id.trim() });
}

export function validateStatusEnum(status, allowed, fieldName = 'status') {
  if (typeof status !== 'string') {
    return fail('VALIDATION_STATUS_REQUIRED', `${fieldName} is required.`, { field: fieldName, allowed });
  }

  const normalized = status.trim();
  if (!allowed.includes(normalized)) {
    return fail('VALIDATION_STATUS_INVALID', `${fieldName} must be one of the allowed values.`, { field: fieldName, value: status, allowed });
  }

  return ok({ value: normalized });
}

export function normalizeIsoDate(value, fieldName) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return ok({ value: '' });

  // Date-only fields are normalized to YYYY-MM-DD to keep sort/filter behavior deterministic.
  if (!ISO_DATE_PATTERN.test(normalized)) {
    return fail('VALIDATION_DATE_INVALID', `${fieldName} must be in ISO date format YYYY-MM-DD.`, { field: fieldName, value });
  }

  return ok({ value: normalized });
}

export function validateIsoDateTime(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    return fail('VALIDATION_DATETIME_REQUIRED', `${fieldName} is required.`, { field: fieldName });
  }

  const normalized = value.trim();
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return fail('VALIDATION_DATETIME_INVALID', `${fieldName} must be a valid ISO datetime string.`, { field: fieldName, value });
  }

  return ok({ value: normalized });
}

export function normalizeRequiredText(value, fieldName, fallback = '') {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized) return ok({ value: normalized });

  if (fallback && fallback.trim()) {
    // Safe fallback allows writes to continue when source text is present but explicit title/name is missing.
    return ok({ value: fallback.trim() });
  }

  return fail('VALIDATION_REQUIRED_TEXT_MISSING', `${fieldName} is required.`, { field: fieldName });
}

export function normalizeFollowUpRecipients(recipients) {
  if (!Array.isArray(recipients)) {
    return fail('VALIDATION_RECIPIENTS_REQUIRED', 'follow-up recipients must be an array.', { field: 'recipients' });
  }

  const normalized = [];
  for (const recipient of recipients) {
    if (!recipient || typeof recipient !== 'object') {
      return fail('VALIDATION_RECIPIENT_SHAPE_INVALID', 'Each recipient must be an object with personId and status.', { recipient });
    }

    const personIdResult = validateId(recipient.personId, 'personId');
    if (!personIdResult.ok) return personIdResult;

    const statusResult = validateStatusEnum(recipient.status || 'pending', STATUS_ENUMS.followUpRecipient, 'recipient.status');
    if (!statusResult.ok) return statusResult;

    normalized.push({ personId: personIdResult.value, status: statusResult.value });
  }

  return ok({ value: normalized });
}
