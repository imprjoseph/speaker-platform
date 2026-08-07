/**
 * Module 6｜任務與期限
 * 計算每一項資料的完整生命週期狀態：未寄送→已寄送→已開啟→填寫中→已送出→需補件／已完成／逾期。
 * 這是規劃書「關鍵設計決策 1」的落實：追蹤單位細到每一項資料，而不是只有「已回覆／未回覆」。
 */

var ITEM_STATUS = {
  NOT_SENT: '未寄送', SENT: '已寄送', OPENED: '已開啟', FILLING: '填寫中',
  SUBMITTED: '已送出', NEEDS_REUPLOAD: '需補件', COMPLETED: '已完成', OVERDUE: '逾期'
};

function computeItemStatus(activitySpeakerId, fieldKey) {
  var response = findRowsBy_(SHEETS.RESPONSES, 'ActivitySpeakerId', activitySpeakerId)
    .filter(function (r) { return r.FieldKey === fieldKey; })[0];

  var base = computeBaseStatus_(activitySpeakerId, fieldKey, response);
  var deadline = resolveFieldDeadline(activitySpeakerId, fieldKey);
  var isDone = base === ITEM_STATUS.COMPLETED || base === ITEM_STATUS.SUBMITTED;
  if (!isDone && deadline && new Date() > new Date(deadline)) {
    return ITEM_STATUS.OVERDUE;
  }
  return base;
}

function computeBaseStatus_(activitySpeakerId, fieldKey, response) {
  if (response) {
    if (response.Status === STATUS.RESPONSE.APPROVED) return ITEM_STATUS.COMPLETED;
    if (response.Status === STATUS.RESPONSE.NEEDS_REUPLOAD) return ITEM_STATUS.NEEDS_REUPLOAD;
    if (response.Status === STATUS.RESPONSE.SUBMITTED) return ITEM_STATUS.SUBMITTED;
    if (response.Status === STATUS.RESPONSE.DRAFT) return ITEM_STATUS.FILLING;
  }
  if (hasOpenedForm_(activitySpeakerId)) return ITEM_STATUS.OPENED;
  if (hasSentInviteOrReminder_(activitySpeakerId)) return ITEM_STATUS.SENT;
  return ITEM_STATUS.NOT_SENT;
}

function hasOpenedForm_(activitySpeakerId) {
  return getAllRows_(SHEETS.AUDIT_LOG).some(function (log) {
    return log.Action === 'OPEN_FORM' && log.EntityId === activitySpeakerId;
  });
}

function hasSentInviteOrReminder_(activitySpeakerId) {
  return findRowsBy_(SHEETS.MAIL_QUEUE, 'ActivitySpeakerId', activitySpeakerId)
    .some(function (m) { return m.Status === STATUS.MAIL.SENT; });
}

/** 整場活動的逐項狀態總表（給儀表板與匯出使用）。 */
function getActivityTaskBoard(activityId) {
  var links = findRowsBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivityId', activityId);
  var reqs = listDataRequirements(activityId);

  return links.map(function (link) {
    var speaker = getSpeaker(link.SpeakerId);
    var items = reqs.map(function (req) {
      return {
        fieldKey: req.FieldKey,
        label: req.LabelZh,
        required: req.Required,
        status: computeItemStatus(link.ActivitySpeakerId, req.FieldKey),
        deadline: formatDate_(resolveFieldDeadline(link.ActivitySpeakerId, req.FieldKey))
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
