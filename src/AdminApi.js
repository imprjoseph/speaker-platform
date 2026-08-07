/** 內部管理後台呼叫的 API（需 Google 帳號登入，對應 Users 分頁角色）。 */

function api_currentUser() {
  var email = currentUserEmail_();
  var user = getUserByEmail_(email);
  return user ? { email: email, name: user.Name, role: user.Role } : { email: email, name: email, role: null };
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

function api_composeInviteMail(activitySpeakerId, templateId) {
  var link = findOneBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId);
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
