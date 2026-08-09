/** 內部管理後台呼叫的 API（需 Google 帳號登入，對應 Users 分頁角色）。 */

function api_currentUser() {
  var email = currentUserEmail_();
  var user = getUserByEmail_(email);
  var base = user ? { email: email, name: user.Name, role: user.Role } : { email: email, name: email, role: null };
  base.companyName = COMPANY_NAME;
  return base;
}

function api_listActivities() {
  return listActivities();
}

function api_createActivity(input) {
  return createActivity(input, currentUserEmail_());
}

function api_addDataRequirement(activityId, field) {
  return addDataRequirement(activityId, field, currentUserEmail_());
}

function api_listDataRequirements(activityId) {
  return listDataRequirements(activityId);
}

function api_addSpeaker(activityId, speakerInput, linkOpts) {
  var created = createSpeaker(speakerInput, currentUserEmail_());
  var link = addSpeakerToActivity(activityId, created.speaker.SpeakerId, linkOpts, currentUserEmail_());
  return { speaker: created.speaker, link: link, duplicateWarning: created.duplicateWarning };
}

function api_getTaskBoard(activityId) {
  return getActivityTaskBoard(activityId);
}

function api_getDashboard(activityId) {
  return getActivityDashboard(activityId);
}

function api_getExecutiveSummary() {
  return getExecutiveSummary();
}

/** 語言預設依講者的 PreferredLanguage 自動挑範本，也可由後台明確指定 templateId 覆蓋。 */
function api_composeInviteMail(activitySpeakerId, templateId) {
  var link = findOneBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId);
  if (!templateId) {
    var speaker = getSpeaker(link.SpeakerId);
    templateId = speaker.PreferredLanguage === 'en' ? 'TPL_INVITE_EN' : 'TPL_INVITE_ZH';
  }
  return composeMail(link.ActivityId, activitySpeakerId, templateId, {}, currentUserEmail_());
}

function api_listMailQueue(activityId, status) {
  return listMailQueue({ activityId: activityId, status: status });
}

function api_approveMail(queueId) {
  return approveMail(queueId, currentUserEmail_());
}

function api_rejectMail(queueId, reason) {
  return rejectMail(queueId, currentUserEmail_(), reason);
}

function api_testSendMail(queueId, testEmail) {
  return testSendMail(queueId, testEmail, currentUserEmail_());
}

function api_reviewFile(fileId, decision, note, markFinal) {
  return reviewFile(fileId, decision, note, markFinal, currentUserEmail_());
}

function api_reviewResponse(responseId, decision, note, newDeadline) {
  return reviewResponse(responseId, decision, note, newDeadline, currentUserEmail_());
}

function api_exportRoster(activityId) {
  return exportSpeakerRoster(activityId, currentUserEmail_());
}

function api_exportMissing(activityId) {
  return exportMissingItemsReport(activityId, currentUserEmail_());
}

function api_regenerateInviteLink(activitySpeakerId) {
  var updated = regenerateInviteToken(activitySpeakerId, currentUserEmail_());
  return buildInviteLink(activitySpeakerId);
}

// ---- 活動／講者 編輯與刪除 ----

function api_updateActivity(activityId, patch) {
  return updateActivity(activityId, patch, currentUserEmail_());
}

function api_archiveActivity(activityId) {
  return archiveActivity(activityId, currentUserEmail_());
}

function api_deleteActivity(activityId) {
  return deleteActivityHard(activityId, currentUserEmail_());
}

function api_updateSpeaker(speakerId, patch) {
  return updateSpeaker(speakerId, patch, currentUserEmail_());
}

function api_removeSpeakerFromActivity(activitySpeakerId) {
  return removeSpeakerFromActivity(activitySpeakerId, currentUserEmail_());
}

function api_getSpeakerDetail(activitySpeakerId) {
  var link = findOneBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId);
  return { link: link, speaker: getSpeaker(link.SpeakerId) };
}

// ---- 常用欄位快速設定 ----

function api_listStandardFields() {
  return STANDARD_FIELDS;
}

function api_addStandardFields(activityId, fieldKeys) {
  return addStandardFields(activityId, fieldKeys, currentUserEmail_());
}

// ---- 批次匯入講者 ----

function api_importSpeakers(activityId, rows) {
  return importSpeakersToActivity(activityId, rows, currentUserEmail_());
}

// ---- 帳號管理 ----

function api_listUsers() {
  return listUsers();
}

function api_addUser(name, email, role) {
  return addUser(name, email, role, currentUserEmail_());
}

function api_updateUserRole(userId, role) {
  return updateUserRole(userId, role, currentUserEmail_());
}

function api_removeUser(userId) {
  return removeUser(userId, currentUserEmail_());
}

function api_listRoles() {
  return ROLES;
}
