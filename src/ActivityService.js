/** Module 1｜活動工作區 */

function createActivity(input, actorEmail) {
  var id = newId_('ACT');
  var activity = insertRow_(SHEETS.ACTIVITIES, {
    ActivityId: id,
    NameZh: input.nameZh,
    NameEn: input.nameEn || '',
    StartDate: input.startDate,
    EndDate: input.endDate || input.startDate,
    Timezone: input.timezone || 'Asia/Taipei',
    Language: input.language || 'zh',
    Venue: input.venue || '',
    Organizer: input.organizer || COMPANY_NAME,
    Status: 'Active',
    DefaultDeadlineOffsets: JSON.stringify(input.deadlineOffsets || { cv: -45, photo: -30, deck: -7 }),
    ProjectLeadUserId: input.projectLeadUserId || '',
    CreatedBy: actorEmail,
    CreatedAt: nowIso_(),
    ArchivedAt: ''
  });
  writeAudit_(actorEmail, 'CREATE_ACTIVITY', SHEETS.ACTIVITIES, id, input.nameZh);
  return activity;
}

/** 複製既有活動：帶走活動設定與資料需求範本，不帶講者名單（依規劃書：活動封存與複製）。 */
function duplicateActivity(activityId, overrides, actorEmail) {
  var source = findOneBy_(SHEETS.ACTIVITIES, 'ActivityId', activityId);
  if (!source) throw new Error('找不到活動：' + activityId);

  var copy = createActivity({
    nameZh: (overrides && overrides.nameZh) || (source.NameZh + '（複製）'),
    nameEn: (overrides && overrides.nameEn) || source.NameEn,
    startDate: (overrides && overrides.startDate) || source.StartDate,
    endDate: (overrides && overrides.endDate) || source.EndDate,
    timezone: source.Timezone,
    language: source.Language,
    venue: source.Venue,
    organizer: source.Organizer,
    deadlineOffsets: JSON.parse(source.DefaultDeadlineOffsets || '{}'),
    projectLeadUserId: source.ProjectLeadUserId
  }, actorEmail);

  var reqs = findRowsBy_(SHEETS.DATA_REQUIREMENTS, 'ActivityId', activityId);
  reqs.forEach(function (r) {
    insertRow_(SHEETS.DATA_REQUIREMENTS, {
      ReqId: newId_('REQ'), ActivityId: copy.ActivityId, FieldKey: r.FieldKey,
      LabelZh: r.LabelZh, LabelEn: r.LabelEn, FieldType: r.FieldType,
      Required: r.Required, DeadlineOffsetDays: r.DeadlineOffsetDays,
      PublicUse: r.PublicUse, ReviewRequired: r.ReviewRequired, DisplayOrder: r.DisplayOrder
    });
  });

  return copy;
}

function updateActivity(activityId, patch, actorEmail) {
  var allowed = ['NameZh', 'NameEn', 'StartDate', 'EndDate', 'Timezone', 'Language', 'Venue', 'Organizer', 'ProjectLeadUserId'];
  var safePatch = {};
  Object.keys(patch).forEach(function (k) { if (allowed.indexOf(k) !== -1) safePatch[k] = patch[k]; });
  var updated = updateRowByKey_(SHEETS.ACTIVITIES, 'ActivityId', activityId, safePatch);
  writeAudit_(actorEmail, 'UPDATE_ACTIVITY', SHEETS.ACTIVITIES, activityId, JSON.stringify(safePatch));
  return updated;
}

/**
 * 永久刪除活動與其所有子資料（講者關聯、資料需求、回覆、檔案紀錄、郵件佇列、場次）。
 * 僅用於清除測試/誤建的活動；正式活動請用 archiveActivity 封存，不要硬刪。
 * 注意：不會連動刪除 Google Drive 裡已上傳的檔案本體，只清除試算表紀錄。
 */
function deleteActivityHard(activityId, actorEmail) {
  var links = findRowsBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivityId', activityId);
  links.forEach(function (link) {
    deleteRowsBy_(SHEETS.RESPONSES, 'ActivitySpeakerId', link.ActivitySpeakerId);
    deleteRowsBy_(SHEETS.FILES, 'ActivitySpeakerId', link.ActivitySpeakerId);
    deleteRowsBy_(SHEETS.MAIL_QUEUE, 'ActivitySpeakerId', link.ActivitySpeakerId);
  });
  deleteRowsBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivityId', activityId);
  deleteRowsBy_(SHEETS.DATA_REQUIREMENTS, 'ActivityId', activityId);
  deleteRowsBy_(SHEETS.SESSIONS, 'ActivityId', activityId);
  deleteRowsBy_(SHEETS.MAIL_QUEUE, 'ActivityId', activityId);
  deleteRowByKey_(SHEETS.ACTIVITIES, 'ActivityId', activityId);
  writeAudit_(actorEmail, 'DELETE_ACTIVITY', SHEETS.ACTIVITIES, activityId, '永久刪除（含所有子資料）');
}

function archiveActivity(activityId, actorEmail) {
  var updated = updateRowByKey_(SHEETS.ACTIVITIES, 'ActivityId', activityId, {
    Status: 'Archived', ArchivedAt: nowIso_()
  });
  writeAudit_(actorEmail, 'ARCHIVE_ACTIVITY', SHEETS.ACTIVITIES, activityId, '');
  return updated;
}

function listActivities(filter) {
  var rows = getAllRows_(SHEETS.ACTIVITIES);
  if (filter && filter.status) rows = rows.filter(function (r) { return r.Status === filter.status; });
  return rows.sort(function (a, b) { return new Date(b.StartDate) - new Date(a.StartDate); });
}

function getActivity(activityId) {
  var a = findOneBy_(SHEETS.ACTIVITIES, 'ActivityId', activityId);
  if (!a) throw new Error('找不到活動：' + activityId);
  return a;
}
