/** Module 4｜彈性資料表單 —— 每場活動可自訂要蒐集的欄位 */

function addDataRequirement(activityId, field, actorEmail) {
  var req = insertRow_(SHEETS.DATA_REQUIREMENTS, {
    ReqId: newId_('REQ'),
    ActivityId: activityId,
    FieldKey: field.fieldKey,
    LabelZh: field.labelZh,
    LabelEn: field.labelEn || '',
    FieldType: field.fieldType || 'text', // text | textarea | file | select | date
    Required: !!field.required,
    DeadlineOffsetDays: field.deadlineOffsetDays != null ? field.deadlineOffsetDays : -7,
    PublicUse: field.publicUse || '',
    ReviewRequired: !!field.reviewRequired,
    DisplayOrder: field.displayOrder != null ? field.displayOrder : 999
  });
  writeAudit_(actorEmail, 'ADD_DATA_REQUIREMENT', SHEETS.DATA_REQUIREMENTS, req.ReqId, field.fieldKey);
  return req;
}

function listDataRequirements(activityId) {
  return findRowsBy_(SHEETS.DATA_REQUIREMENTS, 'ActivityId', activityId)
    .sort(function (a, b) { return a.DisplayOrder - b.DisplayOrder; });
}

/** 依活動預設期限 + 個別例外，計算某講者、某欄位的實際截止日（規劃書關鍵決策 2）。 */
function resolveFieldDeadline(activitySpeakerId, fieldKey) {
  var link = findOneBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId);
  if (!link) throw new Error('找不到講者活動關聯：' + activitySpeakerId);

  var overrides = JSON.parse(link.CustomDeadlineOverrides || '{}');
  if (overrides[fieldKey]) return new Date(overrides[fieldKey]);

  var activity = getActivity(link.ActivityId);
  var req = findOneBy_(SHEETS.DATA_REQUIREMENTS, 'ReqId', findReqId_(link.ActivityId, fieldKey));
  var offset = req ? Number(req.DeadlineOffsetDays) : -7;
  return addDays_(new Date(activity.StartDate), offset);
}

function findReqId_(activityId, fieldKey) {
  var req = findRowsBy_(SHEETS.DATA_REQUIREMENTS, 'ActivityId', activityId)
    .filter(function (r) { return r.FieldKey === fieldKey; })[0];
  return req ? req.ReqId : null;
}

/** 個別講者例外期限（保留原期限、調整後期限、調整人與原因 —— 寫入稽核紀錄）。 */
function overrideSpeakerDeadline(activitySpeakerId, fieldKey, newDeadline, reason, actorEmail) {
  var link = findOneBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId);
  var overrides = JSON.parse(link.CustomDeadlineOverrides || '{}');
  var originalDeadline = resolveFieldDeadline(activitySpeakerId, fieldKey);
  overrides[fieldKey] = newDeadline;
  updateRowByKey_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId, {
    CustomDeadlineOverrides: JSON.stringify(overrides), UpdatedAt: nowIso_()
  });
  writeAudit_(actorEmail, 'OVERRIDE_DEADLINE', SHEETS.ACTIVITY_SPEAKERS, activitySpeakerId,
    fieldKey + ': ' + formatDate_(originalDeadline) + ' -> ' + formatDate_(new Date(newDeadline)) + '（原因：' + reason + '）');
}

function formatDate_(d) {
  return Utilities.formatDate(new Date(d), 'Asia/Taipei', 'yyyy-MM-dd');
}

/** 講者存草稿或送出資料（可由助理代填）。 */
function saveResponse(activitySpeakerId, fieldKey, value, isSubmit, actorLabel) {
  var existing = findRowsBy_(SHEETS.RESPONSES, 'ActivitySpeakerId', activitySpeakerId)
    .filter(function (r) { return r.FieldKey === fieldKey; })[0];

  var status = isSubmit ? STATUS.RESPONSE.SUBMITTED : STATUS.RESPONSE.DRAFT;
  var payload = { Value: value, Status: status, UpdatedAt: nowIso_(), UpdatedBy: actorLabel || '(講者本人)' };

  var result;
  if (existing) {
    var sh = sheet_(SHEETS.RESPONSES);
    var headers = headers_(SHEETS.RESPONSES);
    Object.keys(payload).forEach(function (f) {
      sh.getRange(existing._row, headers.indexOf(f) + 1).setValue(payload[f]);
    });
    result = Object.assign({}, existing, payload);
  } else {
    result = insertRow_(SHEETS.RESPONSES, Object.assign({
      ResponseId: newId_('RESP'), ActivitySpeakerId: activitySpeakerId, FieldKey: fieldKey
    }, payload));
  }

  writeAudit_(actorLabel, isSubmit ? 'SUBMIT_RESPONSE' : 'SAVE_DRAFT', SHEETS.RESPONSES, result.ResponseId, fieldKey);
  maybeStopRemindersIfComplete_(activitySpeakerId);
  return result;
}

function getResponses(activitySpeakerId) {
  return findRowsBy_(SHEETS.RESPONSES, 'ActivitySpeakerId', activitySpeakerId);
}

/** 內部審核：核准 / 需補件（附原因與新期限）。 */
function reviewResponse(responseId, decision, note, newDeadline, actorEmail) {
  var patch = { Status: decision === 'approve' ? STATUS.RESPONSE.APPROVED : STATUS.RESPONSE.NEEDS_REUPLOAD, UpdatedAt: nowIso_() };
  var updated = updateRowByKey_(SHEETS.RESPONSES, 'ResponseId', responseId, patch);
  writeAudit_(actorEmail, 'REVIEW_RESPONSE', SHEETS.RESPONSES, responseId, decision + (note ? '：' + note : ''));

  if (decision === 'need_reupload' && newDeadline) {
    overrideSpeakerDeadline(updated.ActivitySpeakerId, updated.FieldKey, newDeadline, '審核退件：' + note, actorEmail);
  }
  maybeStopRemindersIfComplete_(updated.ActivitySpeakerId);
  return updated;
}

/** 講者整體是否已收齊所有必填項目 —— 決定是否顯示為「已完成」並停止催收。 */
function isActivitySpeakerComplete_(activitySpeakerId) {
  var link = findOneBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId);
  var requiredFields = listDataRequirements(link.ActivityId).filter(function (r) { return r.Required; });
  var responses = getResponses(activitySpeakerId);
  return requiredFields.every(function (req) {
    var resp = responses.filter(function (r) { return r.FieldKey === req.FieldKey; })[0];
    return resp && (resp.Status === STATUS.RESPONSE.SUBMITTED || resp.Status === STATUS.RESPONSE.APPROVED);
  });
}
