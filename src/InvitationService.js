/** Module 3｜邀請與回覆 —— 免登入專屬安全連結 */

var TOKEN_VALID_DAYS = 60;

/** 把講者加入某場活動：建立 ActivitySpeakers 關聯 + 產生專屬安全連結 token。 */
function addSpeakerToActivity(activityId, speakerId, opts, actorEmail) {
  getActivity(activityId); // 存在性檢查
  var existing = findRowsBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivityId', activityId)
    .filter(function (r) { return r.SpeakerId === speakerId; });
  if (existing.length) return existing[0];

  var link = insertRow_(SHEETS.ACTIVITY_SPEAKERS, {
    ActivitySpeakerId: newId_('AS'),
    ActivityId: activityId,
    SpeakerId: speakerId,
    SessionId: (opts && opts.sessionId) || '',
    Role: (opts && opts.role) || '講者',
    InviteStatus: STATUS.INVITE.NOT_CONTACTED,
    RiskLevel: '',
    OwnerUserId: (opts && opts.ownerUserId) || '',
    InviteToken: Utilities.getUuid().replace(/-/g, ''),
    TokenExpiresAt: addDays_(new Date(), TOKEN_VALID_DAYS),
    CustomDeadlineOverrides: '{}',
    CreatedAt: nowIso_(),
    UpdatedAt: nowIso_()
  });
  writeAudit_(actorEmail, 'ADD_SPEAKER_TO_ACTIVITY', SHEETS.ACTIVITY_SPEAKERS, link.ActivitySpeakerId, '');
  return link;
}

/** 把講者從這場活動移除（連帶清掉該活動下的回覆、檔案紀錄、郵件佇列），不影響講者主檔或其他活動。 */
function removeSpeakerFromActivity(activitySpeakerId, actorEmail) {
  deleteRowsBy_(SHEETS.RESPONSES, 'ActivitySpeakerId', activitySpeakerId);
  deleteRowsBy_(SHEETS.FILES, 'ActivitySpeakerId', activitySpeakerId);
  deleteRowsBy_(SHEETS.MAIL_QUEUE, 'ActivitySpeakerId', activitySpeakerId);
  deleteRowByKey_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId);
  writeAudit_(actorEmail, 'REMOVE_SPEAKER_FROM_ACTIVITY', SHEETS.ACTIVITY_SPEAKERS, activitySpeakerId, '');
}

function addDays_(date, days) {
  var d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** 講者專屬填寫連結，格式：{WebAppURL}?token=xxxx（免登入）。 */
function buildInviteLink(activitySpeakerId) {
  var link = findOneBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId);
  if (!link) throw new Error('找不到講者與活動的關聯：' + activitySpeakerId);
  var base = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.WEBAPP_BASE_URL) || ScriptApp.getService().getUrl();
  return base + '?token=' + link.InviteToken;
}

/** 依 token 解析講者身分（供 doGet 的講者填寫頁使用），並檢查是否失效／過期。 */
function resolveInviteToken(token) {
  var link = findOneBy_(SHEETS.ACTIVITY_SPEAKERS, 'InviteToken', token);
  if (!link) return { valid: false, reason: '連結不存在或已被撤銷' };
  if (new Date(link.TokenExpiresAt) < new Date()) return { valid: false, reason: '連結已過期，請聯繫窗口重新發送' };
  return { valid: true, link: link };
}

/** 撤銷並重發新連結（規劃書要求：連結須可失效、重發）。 */
function regenerateInviteToken(activitySpeakerId, actorEmail) {
  var updated = updateRowByKey_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId, {
    InviteToken: Utilities.getUuid().replace(/-/g, ''),
    TokenExpiresAt: addDays_(new Date(), TOKEN_VALID_DAYS),
    UpdatedAt: nowIso_()
  });
  writeAudit_(actorEmail, 'REGENERATE_TOKEN', SHEETS.ACTIVITY_SPEAKERS, activitySpeakerId, '');
  return updated;
}

function revokeInviteToken(activitySpeakerId, actorEmail) {
  var updated = updateRowByKey_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', activitySpeakerId, {
    TokenExpiresAt: new Date(0), UpdatedAt: nowIso_()
  });
  writeAudit_(actorEmail, 'REVOKE_TOKEN', SHEETS.ACTIVITY_SPEAKERS, activitySpeakerId, '');
  return updated;
}

/** 講者回覆邀請：接受／婉拒／待確認，可由助理代填。 */
function respondToInvitation(token, decision, actorLabel) {
  var resolved = resolveInviteToken(token);
  if (!resolved.valid) throw new Error(resolved.reason);

  var statusMap = {
    accept: STATUS.INVITE.ACCEPTED,
    decline: STATUS.INVITE.DECLINED,
    pending: STATUS.INVITE.INVITED
  };
  var newStatus = statusMap[decision];
  if (!newStatus) throw new Error('未知的回覆類型：' + decision);

  var updated = updateRowByKey_(SHEETS.ACTIVITY_SPEAKERS, 'ActivitySpeakerId', resolved.link.ActivitySpeakerId, {
    InviteStatus: newStatus, UpdatedAt: nowIso_()
  });
  writeAudit_(actorLabel || '(講者本人)', 'RESPOND_INVITATION', SHEETS.ACTIVITY_SPEAKERS, resolved.link.ActivitySpeakerId, decision);

  if (newStatus === STATUS.INVITE.DECLINED) {
    cancelPendingMailForActivitySpeaker_(resolved.link.ActivitySpeakerId);
  }
  return updated;
}
