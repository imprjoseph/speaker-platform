/**
 * Module 7｜郵件與提醒
 *
 * 核心規則（使用者明確要求）：
 *   1. 任何一封信（不論人工寄送或系統自動提醒）一律先進入待審佇列，
 *      必須由專案窗口按下「確認」才會真正寄出 —— 見 approveMail()。
 *   2. 每則範本可選語言（zh / en）。
 *   3. 提醒時程（D-14/D-7/D-3/逾期/升級）由 ReminderRules 分頁設定，管理者可自行調整。
 *   4. 若該項資料已送出／已核准，掃描時直接略過，不產生提醒。
 *   5. 講者整體完成、婉拒，或 PM 暫停催收時，尚未寄出的待審／已核准信件會被自動取消。
 */

/** 用活動與講者資料組出範本變數，供 {{變數}} 替換。 */
function buildMailVariables_(activityId, activitySpeakerId, missingItems) {
  var activity = getActivity(activityId);
  var link = findOneBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId);
  var speaker = getSpeaker(link.SpeakerId);
  var lead = link.OwnerUserId ? findOneBy_(SHEETS.USERS, 'UserId', link.OwnerUserId) : null;

  var missingLabels = (missingItems || []).map(function (i) { return i.label + '（' + i.deadline + ' 前）'; }).join('、');
  var nearestDeadline = (missingItems || []).length
    ? missingItems.reduce(function (min, i) { return i.deadline < min ? i.deadline : min; }, missingItems[0].deadline)
    : '';

  return {
    '講者稱謂': speaker.NameZh || speaker.NameEn,
    '活動名稱': activity.NameZh,
    '活動日期': formatDate_(activity.StartDate),
    '尚缺項目': missingLabels || '（無，僅供測試預覽）',
    '截止日': nearestDeadline,
    '各項截止日': missingLabels,
    '填寫連結': buildInviteLink(activitySpeakerId),
    '專案窗口姓名': lead ? lead.Name : '',
    '窗口電話': '',
    '場次名稱': '',
    '講者職稱': speaker.Title || '',
    'SpeakerTitle': speaker.NameEn || speaker.NameZh,
    'ActivityName': activity.NameEn || activity.NameZh,
    'ActivityDate': formatDate_(activity.StartDate),
    'FormLink': buildInviteLink(activitySpeakerId),
    'ContactName': lead ? lead.Name : '',
    'ContactPhone': ''
  };
}

function renderTemplate_(templateId, variables) {
  var tpl = findOneBy_(SHEETS.MAIL_TEMPLATES, 'TemplateId', templateId);
  if (!tpl) throw new Error('找不到郵件範本：' + templateId);
  return {
    language: tpl.Language,
    subject: substituteVariables_(tpl.Subject, variables),
    body: substituteVariables_(tpl.BodyHtml, variables)
  };
}

function substituteVariables_(text, variables) {
  return String(text).replace(/\{\{(.+?)\}\}/g, function (match, key) {
    return (variables[key.trim()] !== undefined) ? variables[key.trim()] : match;
  });
}

/**
 * 建立一封待審信件（不會馬上寄出）。
 * category: Invitation | Reminder | Overdue | Completion | Custom
 */
function composeMail(activityId, activitySpeakerId, templateId, extraVariables, actorEmail) {
  var link = findOneBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId);
  var speaker = getSpeaker(link.SpeakerId);
  var missing = getMissingRequiredItems_(activitySpeakerId);
  var variables = Object.assign(buildMailVariables_(activityId, activitySpeakerId, missing), extraVariables || {});
  var rendered = renderTemplate_(templateId, variables);

  var recipientEmail = missing.escalateToLead ? '' : speaker.Email;
  var queueRow = insertRow_(SHEETS.MAIL_QUEUE, {
    QueueId: newId_('MAIL'),
    ActivityId: activityId,
    ActivitySpeakerId: activitySpeakerId,
    TemplateId: templateId,
    Language: rendered.language,
    ToEmail: (extraVariables && extraVariables.__toEmail) || recipientEmail,
    CcEmails: (extraVariables && extraVariables.__cc) || (speaker.AssistantEmail || ''),
    BccEmails: (extraVariables && extraVariables.__bcc) || '',
    ReplyTo: (extraVariables && extraVariables.__replyTo) || '',
    RenderedSubject: rendered.subject,
    RenderedBody: rendered.body,
    Status: STATUS.MAIL.PENDING_REVIEW,
    RequestedBy: actorEmail || 'system',
    RequestedAt: nowIso_(),
    ApprovedBy: '', ApprovedAt: '', SentAt: '', BounceStatus: '', Notes: ''
  });
  writeAudit_(actorEmail || 'system', 'COMPOSE_MAIL', SHEETS.MAIL_QUEUE, queueRow.QueueId, templateId);
  return queueRow;
}

function getMissingRequiredItems_(activitySpeakerId) {
  var link = findOneBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId);
  var reqs = listDataRequirements(link.ActivityId).filter(function (r) { return r.Required; });
  return reqs
    .map(function (r) {
      return { fieldKey: r.FieldKey, label: r.LabelZh, deadline: formatDate_(resolveFieldDeadline(activitySpeakerId, r.FieldKey)) };
    })
    .filter(function (item) {
      var status = computeItemStatus(activitySpeakerId, item.fieldKey);
      return status !== ITEM_STATUS.COMPLETED && status !== ITEM_STATUS.SUBMITTED; // 已提供的項目直接跳過
    });
}

/** 窗口按下「確認」：此為使用者要求的唯一寄出入口，確認後立即真正寄出。 */
function approveMail(queueId, approverEmail) {
  var queued = findOneBy_(SHEETS.MAIL_QUEUE, 'QueueId', queueId);
  if (!queued) throw new Error('找不到待審信件：' + queueId);
  if (queued.Status !== STATUS.MAIL.PENDING_REVIEW) throw new Error('此信件目前狀態為「' + queued.Status + '」，無法重複確認。');

  updateRowByKey_(SHEETS.MAIL_QUEUE, 'QueueId', queueId, {
    Status: STATUS.MAIL.APPROVED, ApprovedBy: approverEmail, ApprovedAt: nowIso_()
  });
  writeAudit_(approverEmail, 'APPROVE_MAIL', SHEETS.MAIL_QUEUE, queueId, '');
  return sendQueueItem_(queueId, approverEmail);
}

function rejectMail(queueId, approverEmail, reason) {
  var updated = updateRowByKey_(SHEETS.MAIL_QUEUE, 'QueueId', queueId, {
    Status: STATUS.MAIL.REJECTED, ApprovedBy: approverEmail, ApprovedAt: nowIso_(), Notes: reason || ''
  });
  writeAudit_(approverEmail, 'REJECT_MAIL', SHEETS.MAIL_QUEUE, queueId, reason || '');
  return updated;
}

function sendQueueItem_(queueId, actorEmail) {
  var queued = findOneBy_(SHEETS.MAIL_QUEUE, 'QueueId', queueId);
  if (queued.Status !== STATUS.MAIL.APPROVED) throw new Error('信件尚未經窗口確認，不能寄出。');
  if (!queued.ToEmail) throw new Error('收件人為空，無法寄出：' + queueId);

  MailApp.sendEmail({
    to: queued.ToEmail,
    cc: queued.CcEmails || undefined,
    bcc: queued.BccEmails || undefined,
    replyTo: queued.ReplyTo || undefined,
    subject: queued.RenderedSubject,
    htmlBody: queued.RenderedBody,
    name: buildSenderName_(queued.ActivityId)
  });

  var updated = updateRowByKey_(SHEETS.MAIL_QUEUE, 'QueueId', queueId, { Status: STATUS.MAIL.SENT, SentAt: nowIso_() });
  writeAudit_(actorEmail, 'SEND_MAIL', SHEETS.MAIL_QUEUE, queueId, queued.ToEmail);
  return updated;
}

/** 寄測試信給指定收件人，不影響佇列狀態、不算正式寄出。 */
function testSendMail(queueId, testRecipientEmail, actorEmail) {
  var queued = findOneBy_(SHEETS.MAIL_QUEUE, 'QueueId', queueId);
  MailApp.sendEmail({
    to: testRecipientEmail,
    subject: '[測試信] ' + queued.RenderedSubject,
    htmlBody: '<p style="color:#c00">這是測試信，不會計入正式寄送紀錄。</p>' + queued.RenderedBody,
    name: buildSenderName_(queued.ActivityId)
  });
  writeAudit_(actorEmail, 'TEST_SEND_MAIL', SHEETS.MAIL_QUEUE, queueId, testRecipientEmail);
}

/** 寄件者顯示名稱＝活動名稱＋「執行團隊」，讓講者一看就知道是哪場活動的通知。 */
function buildSenderName_(activityId) {
  var activity = activityId ? findOneBy_(SHEETS.ACTIVITIES, 'ActivityId', activityId) : null;
  return activity ? (activity.NameZh + ' 執行團隊') : COMPANY_NAME;
}

/** 講者婉拒、或某項資料完成後，取消尚未寄出的催收信（規劃書關鍵決策 4）。 */
function cancelPendingMailForActivitySpeaker_(activitySpeakerId) {
  var rows = findRowsBy_(SHEETS.MAIL_QUEUE, 'ActivitySpeakerId', activitySpeakerId)
    .filter(function (m) { return m.Status === STATUS.MAIL.PENDING_REVIEW || m.Status === STATUS.MAIL.APPROVED; });
  rows.forEach(function (m) {
    updateRowByKey_(SHEETS.MAIL_QUEUE, 'QueueId', m.QueueId, { Status: STATUS.MAIL.CANCELLED, Notes: '講者已完成/婉拒，自動停止催收' });
  });
}

function maybeStopRemindersIfComplete_(activitySpeakerId) {
  if (isActivitySpeakerComplete_(activitySpeakerId)) {
    cancelPendingMailForActivitySpeaker_(activitySpeakerId);
    updateRowByKey_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId, {
      InviteStatus: STATUS.INVITE.COMPLETED, UpdatedAt: nowIso_()
    });
  }
}

/**
 * 每日排程進入點（見 Triggers.js）。依 ReminderRules 掃描所有未完成講者，
 * 到點就「產生待審信件」——絕不自動寄出，一律等窗口確認。
 */
function runDailyReminderSweep() {
  var today = new Date();
  var activities = listActivities({ status: 'Active' });
  var created = 0;

  activities.forEach(function (activity) {
    var links = findRowsBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivityId', activity.ActivityId)
      .filter(function (l) { return l.InviteStatus !== STATUS.INVITE.DECLINED && l.InviteStatus !== STATUS.INVITE.COMPLETED; });

    links.forEach(function (link) {
      var missing = getMissingRequiredItems_(link.ActivitySpeakerId);
      if (!missing.length) return; // 若已提供則不發提醒

      var nearestDeadline = missing.reduce(function (min, i) { return new Date(i.deadline) < new Date(min) ? i.deadline : min; }, missing[0].deadline);
      var diffDays = Math.round((new Date(nearestDeadline) - stripTime_(today)) / 86400000);
      var daysOverdue = -diffDays;

      var rule = pickReminderRule_(activity.ActivityId, diffDays, daysOverdue);
      if (!rule) return;
      if (alreadyQueuedToday_(link.ActivitySpeakerId, rule.TemplateId)) return;

      var isEscalation = rule.TemplateId === 'TPL_OVERDUE_ESCALATE';
      var extra = isEscalation ? { __toEmail: getOwnerEmail_(link.OwnerUserId), __cc: '' } : {};
      composeMail(activity.ActivityId, link.ActivitySpeakerId, rule.TemplateId, extra, 'system-reminder');
      created++;
    });
  });

  Logger.log('runDailyReminderSweep: 產生 ' + created + ' 封待審信件（尚未寄出，待窗口確認）。');
  return created;
}

function pickReminderRule_(activityId, diffDays, daysOverdue) {
  var rules = getAllRows_(SHEETS.REMINDER_RULES).filter(function (r) { return r.Active; });
  var scoped = rules.filter(function (r) { return r.ActivityId === activityId; });
  var pool = scoped.length ? scoped : rules.filter(function (r) { return !r.ActivityId; });

  var match = pool.filter(function (r) {
    var offset = Number(r.OffsetDays);
    if (offset < 0) return diffDays === -offset;      // 提前 N 天提醒
    if (offset === 0) return daysOverdue === 1;        // 逾期第 1 天
    return daysOverdue === offset;                     // 逾期 N 天以上 -> 升級通知
  });
  return match.length ? match[0] : null;
}

function alreadyQueuedToday_(activitySpeakerId, templateId) {
  var todayStr = formatDate_(new Date());
  return findRowsBy_(SHEETS.MAIL_QUEUE, 'ActivitySpeakerId', activitySpeakerId)
    .some(function (m) { return m.TemplateId === templateId && formatDate_(m.RequestedAt) === todayStr && m.Status !== STATUS.MAIL.CANCELLED; });
}

function getOwnerEmail_(userId) {
  var user = userId ? findOneBy_(SHEETS.USERS, 'UserId', userId) : null;
  return user ? user.Email : '';
}

function stripTime_(d) {
  var x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function listMailQueue(filter) {
  var rows = getAllRows_(SHEETS.MAIL_QUEUE);
  if (filter && filter.status) rows = rows.filter(function (r) { return r.Status === filter.status; });
  if (filter && filter.activityId) rows = rows.filter(function (r) { return r.ActivityId === filter.activityId; });
  return rows.sort(function (a, b) { return new Date(b.RequestedAt) - new Date(a.RequestedAt); });
}
