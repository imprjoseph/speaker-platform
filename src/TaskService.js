/**
 * Module 6｜任務與期限
 * 計算每一項資料的完整生命週期狀態：未寄送→已寄送→已開啟→填寫中→已送出→需補件／已完成／逾期。
 * 這是規劃書「關鍵設計決策 1」的落實：追蹤單位細到每一項資料，而不是只有「已回覆／未回覆」。
 */

var ITEM_STATUS = {
  NOT_SENT: '未寄送', SENT: '已寄送', OPENED: '已開啟', FILLING: '填寫中',
  SUBMITTED: '已送出', NEEDS_REUPLOAD: '需補件', COMPLETED: '已完成', OVERDUE: '逾期'
};

/**
 * ctx（選填）：由 buildStatusContext_ 一次性讀好整張表再重複使用的查詢結果，
 * 避免像 getActivityTaskBoard 這種「N 位講者 × M 個欄位」的迴圈，
 * 每算一格狀態就重新整張 Sheet 掃一次（那樣是 5 * N * M 次全表掃描，資料一多就明顯變慢）。
 * 不傳 ctx 時退回原本「當場查」的行為，供只算單一講者單一欄位的情境（如講者填寫頁）使用。
 */
function computeItemStatus(activitySpeakerId, fieldKey, ctx, precomputedDeadline) {
  var response = ctx
    ? ctx.responsesByKey[activitySpeakerId + '|' + fieldKey]
    : findRowsBy_(SHEETS.RESPONSES, 'ActivitySpeakerId', activitySpeakerId).filter(function (r) { return r.FieldKey === fieldKey; })[0];

  var base = computeBaseStatus_(activitySpeakerId, response, ctx);
  var deadline = precomputedDeadline || resolveFieldDeadline(activitySpeakerId, fieldKey);
  var isDone = base === ITEM_STATUS.COMPLETED || base === ITEM_STATUS.SUBMITTED;
  if (!isDone && deadline && new Date() > new Date(deadline)) {
    return ITEM_STATUS.OVERDUE;
  }
  return base;
}

function computeBaseStatus_(activitySpeakerId, response, ctx) {
  if (response) {
    if (response.Status === STATUS.RESPONSE.APPROVED) return ITEM_STATUS.COMPLETED;
    if (response.Status === STATUS.RESPONSE.NEEDS_REUPLOAD) return ITEM_STATUS.NEEDS_REUPLOAD;
    if (response.Status === STATUS.RESPONSE.SUBMITTED) return ITEM_STATUS.SUBMITTED;
    if (response.Status === STATUS.RESPONSE.DRAFT) return ITEM_STATUS.FILLING;
  }
  if (hasOpenedForm_(activitySpeakerId, ctx)) return ITEM_STATUS.OPENED;
  if (hasSentInviteOrReminder_(activitySpeakerId, ctx)) return ITEM_STATUS.SENT;
  return ITEM_STATUS.NOT_SENT;
}

function hasOpenedForm_(activitySpeakerId, ctx) {
  if (ctx) return !!ctx.openedSet[activitySpeakerId];
  return getAllRows_(SHEETS.AUDIT_LOG).some(function (log) {
    return log.Action === 'OPEN_FORM' && log.EntityId === activitySpeakerId;
  });
}

function hasSentInviteOrReminder_(activitySpeakerId, ctx) {
  if (ctx) return !!ctx.sentSet[activitySpeakerId];
  return findRowsBy_(SHEETS.MAIL_QUEUE, 'ActivitySpeakerId', activitySpeakerId)
    .some(function (m) { return m.Status === STATUS.MAIL.SENT; });
}

/** 一次讀好 AuditLog／MailQueue／Responses 三張表，讓 getActivityTaskBoard 的迴圈用查表代替重複掃描全表。 */
function buildStatusContext_() {
  var openedSet = {};
  getAllRows_(SHEETS.AUDIT_LOG).forEach(function (log) {
    if (log.Action === 'OPEN_FORM') openedSet[log.EntityId] = true;
  });

  var sentSet = {};
  getAllRows_(SHEETS.MAIL_QUEUE).forEach(function (m) {
    if (m.Status === STATUS.MAIL.SENT) sentSet[m.ActivitySpeakerId] = true;
  });

  var responsesByKey = {};
  getAllRows_(SHEETS.RESPONSES).forEach(function (r) {
    responsesByKey[r.ActivitySpeakerId + '|' + r.FieldKey] = r;
  });

  return { openedSet: openedSet, sentSet: sentSet, responsesByKey: responsesByKey };
}

/** 整場活動的逐項狀態總表（給儀表板與匯出使用）。每位講者的追蹤項目可能不同，見 getApplicableRequirements_。 */
function getActivityTaskBoard(activityId) {
  var links = findRowsBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivityId', activityId);
  var ctx = buildStatusContext_();
  var allRequirements = listDataRequirements(activityId);

  return links.map(function (link) {
    var speaker = getSpeaker(link.SpeakerId);
    var reqs = getApplicableRequirements_(link.ActivitySpeakerId, allRequirements);
    var items = reqs.map(function (req) {
      var deadline = resolveFieldDeadline(link.ActivitySpeakerId, req.FieldKey);
      return {
        fieldKey: req.FieldKey,
        label: req.LabelZh,
        required: req.Required,
        status: computeItemStatus(link.ActivitySpeakerId, req.FieldKey, ctx, deadline),
        deadline: formatDate_(deadline)
      };
    });
    return {
      activitySpeakerId: link.ActivitySpeakerId,
      speakerName: speaker.NameZh,
      inviteStatus: link.InviteStatus,
      items: items,
      missingCount: items.filter(function (i) { return i.required && i.status !== ITEM_STATUS.COMPLETED && i.status !== ITEM_STATUS.SUBMITTED; }).length
    };
  });
}
