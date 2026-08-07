/**
 * Module 12｜匯出與現場包
 * Apps Script 原生做法：產生一份新的 Google試算表（活動同仁可直接開啟，或用「檔案／下載／Microsoft Excel」另存成 .xlsx）。
 */

function exportSpeakerRoster(activityId, actorEmail) {
  var activity = getActivity(activityId);
  var board = getActivityTaskBoard(activityId);
  var links = findRowsBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivityId', activityId);

  var headers = ['姓名', '單位', '職稱', '場次角色', '負責人', '邀請狀態', '缺件數', '缺件明細'];
  var rows = board.map(function (b) {
    var link = links.filter(function (l) { return l.ActivitySpeakerId === b.activitySpeakerId; })[0];
    var speaker = getSpeaker(link.SpeakerId);
    var owner = link.OwnerUserId ? findOneBy_(SHEETS.USERS, 'UserId', link.OwnerUserId) : null;
    var missingLabels = b.items.filter(function (i) { return i.required && i.status !== ITEM_STATUS.COMPLETED && i.status !== ITEM_STATUS.SUBMITTED; })
      .map(function (i) { return i.label; }).join('、');
    return [speaker.NameZh, speaker.Organization, speaker.Title, link.Role, owner ? owner.Name : '', link.InviteStatus, b.missingCount, missingLabels];
  });

  return buildExportSheet_('講者總表_' + activity.NameZh, headers, rows, actorEmail);
}

function exportMissingItemsReport(activityId, actorEmail) {
  var board = getActivityTaskBoard(activityId);
  var links = findRowsBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivityId', activityId);
  var activity = getActivity(activityId);

  var headers = ['姓名', '缺件項目', '截止日', '狀態', '負責人'];
  var rows = [];
  board.forEach(function (b) {
    var link = links.filter(function (l) { return l.ActivitySpeakerId === b.activitySpeakerId; })[0];
    var speaker = getSpeaker(link.SpeakerId);
    var owner = link.OwnerUserId ? findOneBy_(SHEETS.USERS, 'UserId', link.OwnerUserId) : null;
    b.items.filter(function (i) { return i.required && i.status !== ITEM_STATUS.COMPLETED && i.status !== ITEM_STATUS.SUBMITTED; })
      .forEach(function (i) {
        rows.push([speaker.NameZh, i.label, i.deadline, i.status, owner ? owner.Name : '']);
      });
  });

  return buildExportSheet_('缺件表_' + activity.NameZh, headers, rows, actorEmail);
}

function buildExportSheet_(title, headers, rows, actorEmail) {
  var ss = SpreadsheetApp.create(title + '_' + formatDate_(new Date()));
  var sheet = ss.getSheets()[0];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF');
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);

  writeAudit_(actorEmail, 'EXPORT', 'Export', ss.getId(), title);
  return { url: ss.getUrl(), spreadsheetId: ss.getId(), generatedAt: nowIso_() };
}
