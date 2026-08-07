/**
 * Web App 進入點。
 *  - 帶 ?token=xxx           → 講者填寫頁（免登入）
 *  - 其餘（需 Google 帳號登入）→ 內部管理後台
 */
function doGet(e) {
  var token = e && e.parameter && e.parameter.token;
  if (token) {
    return renderSpeakerForm_(token);
  }
  return renderAdminApp_();
}

function renderSpeakerForm_(token) {
  var resolved = resolveInviteToken(token);
  var template = HtmlService.createTemplateFromFile('SpeakerForm');
  template.token = token;
  template.valid = resolved.valid;
  template.invalidReason = resolved.valid ? '' : resolved.reason;
  return template.evaluate()
    .setTitle('講者資料填寫')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function renderAdminApp_() {
  var email = currentUserEmail_();
  if (!getUserByEmail_(email)) {
    return HtmlService.createHtmlOutput(
      '<p style="font-family:sans-serif;padding:2rem">此 Google 帳號（' + email + '）尚未被加入系統使用者名單，請聯繫系統管理員以 ' +
      '<code>bootstrapFirstAdmin()</code> 或在 Users 分頁手動新增。</p>'
    );
  }
  var template = HtmlService.createTemplateFromFile('AdminDashboard');
  return template.evaluate()
    .setTitle('講者協作與會務追蹤平台')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 供講者頁記錄「已開啟」事件（首次成功解析 token 時呼叫一次）。 */
function logFormOpened(activitySpeakerId) {
  if (!hasOpenedForm_(activitySpeakerId)) {
    writeAudit_('(講者本人)', 'OPEN_FORM', SHEETS.ACTIVITY_SPEAKERS, activitySpeakerId, '');
  }
}
