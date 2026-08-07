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
    Organizer: input.organizer || '',
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
