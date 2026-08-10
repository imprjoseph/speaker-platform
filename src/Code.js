/**
 * Web App 進入點。
 *  - ?api=xxx（GET 或 POST）  → JSON API，見 handleApiCall_
 *  - 帶 ?token=xxx            → 講者填寫頁（免登入）
 *  - 其餘（需 Google 帳號登入）→ 內部管理後台
 *
 * 為什麼不用 google.script.run：
 * Apps Script 網頁應用程式內建的 google.script.run 橋接層，需要在一個隱藏 iframe 裡
 * 跳出 Google 自己的授權確認畫面（createOAuthDialog）。部分瀏覽器環境（第三方 Cookie
 * 政策、防毒/資安軟體、公司網路代理伺服器等）會讓那個畫面本身壞掉噴錯，且無法從我們
 * 這端修。改用單純的 fetch() 打 doGet/doPost，等同把這個網頁應用程式當一般 JSON API
 * 使用，完全繞開那個容易壞的授權彈窗機制。
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.api) {
    return handleApiCall_(e);
  }
  var token = e && e.parameter && e.parameter.token;
  if (token) {
    return renderSpeakerForm_(token);
  }
  return renderAdminApp_();
}

function doPost(e) {
  return handleApiCall_(e);
}

function renderSpeakerForm_(token) {
  var resolved = resolveInviteToken(token);
  var template = HtmlService.createTemplateFromFile('SpeakerForm');
  template.token = token;
  template.valid = resolved.valid;
  template.invalidReason = resolved.valid ? '' : resolved.reason;
  template.scriptUrl = ScriptApp.getService().getUrl();
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
  // 這裡是唯一 Session.getActiveUser() 保證可靠的地方（一般頁面載入，非 google.script.run）。
  // 把驗證過的 Email 嵌進頁面，之後每次呼叫 API 都由前端帶回來，見 SecurityService.setCallerEmailOverride_。
  template.callerEmail = email;
  template.scriptUrl = ScriptApp.getService().getUrl();
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

/**
 * 可透過 fetch() 呼叫的函式白名單。前端只能呼叫這裡列出的名字，避免任意呼叫任何全域函式。
 * callerEmail：由前端夾帶、頁面載入當下已用 Session 驗證過的 Email（講者端 API 不需要，傳 null 即可）。
 */
var API_WHITELIST_ = {
  currentUser: api_currentUser,
  listActivities: api_listActivities,
  createActivity: api_createActivity,
  updateActivity: api_updateActivity,
  archiveActivity: api_archiveActivity,
  deleteActivity: api_deleteActivity,
  listStandardFields: api_listStandardFields,
  addStandardFields: api_addStandardFields,
  listDataRequirements: api_listDataRequirements,
  addSpeaker: api_addSpeaker,
  updateSpeaker: api_updateSpeaker,
  removeSpeakerFromActivity: api_removeSpeakerFromActivity,
  getSpeakerDetail: api_getSpeakerDetail,
  setSpeakerApplicableFields: api_setSpeakerApplicableFields,
  getDashboard: api_getDashboard,
  getTaskBoard: api_getTaskBoard,
  composeInviteMail: api_composeInviteMail,
  importSpeakers: api_importSpeakers,
  listMailQueue: api_listMailQueue,
  approveMail: api_approveMail,
  rejectMail: api_rejectMail,
  testSendMail: api_testSendMail,
  exportRoster: api_exportRoster,
  exportMissing: api_exportMissing,
  listUsers: api_listUsers,
  addUser: api_addUser,
  updateUserRole: api_updateUserRole,
  removeUser: api_removeUser,
  // 講者端（免登入，用 token 驗證身分，不需要 callerEmail）
  getSpeakerFormData: getSpeakerFormData,
  submitInvitationResponse: submitInvitationResponse,
  submitField: submitField,
  submitFileUpload: submitFileUpload
};

/**
 * 實測發現：這個部署對 POST 請求會擋下（回 401），對 GET 請求完全正常（不論是否帶
 * ?token= 或 ?api=，一律通過）。原因不明（懷疑是 Google 平台層對「看起來會改資料」的
 * 跨網域請求做了比 GET 更嚴格的檢查），但既然 GET 穩定可用，前端一律改用 GET，
 * 把整個呼叫內容（args、callerEmail）序列化成 JSON 字串放進 ?payload= 參數。
 * doPost 路徑保留著，只是目前前端不會用到；日後若要做大型檔案上傳（GET 網址長度不夠放
 * base64 內容）需要另外設計分段上傳，屆時再處理。
 */
function handleApiCall_(e) {
  var action = '(unknown)';
  var callback = e && e.parameter && e.parameter.callback;
  try {
    var payload = parseApiPayload_(e);
    action = (e.parameter && e.parameter.api) || payload.action;
    var args = payload.args || [];
    var fn = API_WHITELIST_[action];
    if (!fn) throw new Error('未知的 API：' + action);

    setCallerEmailOverride_(payload.callerEmail || null);
    var result = fn.apply(null, args);
    setCallerEmailOverride_(null);
    return jsonOutput_({ ok: true, result: result }, callback);
  } catch (err) {
    setCallerEmailOverride_(null);
    return jsonOutput_({ ok: false, action: action, error: err.message }, callback);
  }
}

function parseApiPayload_(e) {
  if (e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
  if (e.postData && e.postData.contents) return JSON.parse(e.postData.contents);
  return {};
}

/**
 * callback 有帶的話，輸出成 JSONP（`callbackName(...)` 這種可執行的 JS），供前端用
 * <script src="..."> 動態載入呼叫——這個做法完全不受瀏覽器跨網域限制（CORS）管轄，
 * 因為載入 <script> 本來就不算「跨網域請求」。見 AdminDashboard.html / SpeakerForm.html
 * 的 callApi_()。沒帶 callback 時退回原本單純的 JSON 輸出，供其他直接呼叫方式使用。
 */
function jsonOutput_(obj, callback) {
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
