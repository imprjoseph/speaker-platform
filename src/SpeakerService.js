/** Module 2｜講者主檔 */

function createSpeaker(input, actorEmail) {
  var dup = findDuplicateSpeaker_(input.email, input.nameZh);
  var id = newId_('SPK');
  var speaker = insertRow_(SHEETS.SPEAKERS, {
    SpeakerId: id,
    NameZh: input.nameZh || '',
    NameEn: input.nameEn || '',
    Title: input.title || '',
    Organization: input.organization || '',
    Email: input.email || '',
    Phone: input.phone || '',
    AssistantName: input.assistantName || '',
    AssistantEmail: input.assistantEmail || '',
    CountryTimezone: input.countryTimezone || '',
    ReusableCvDriveId: '',
    ReusablePhotoDriveId: '',
    DuplicateOfSpeakerId: dup ? dup.SpeakerId : '',
    CreatedAt: nowIso_(),
    PreferredLanguage: input.preferredLanguage || 'zh'
  });
  writeAudit_(actorEmail, 'CREATE_SPEAKER', SHEETS.SPEAKERS, id, input.nameZh);
  return { speaker: speaker, duplicateWarning: dup ? ('系統偵測到可能重複的講者：' + dup.NameZh + '（' + dup.Email + '）') : null };
}

/** 依 Email 或中文姓名比對既有講者，作為新增時的重複提示。 */
function findDuplicateSpeaker_(email, nameZh) {
  var all = getAllRows_(SHEETS.SPEAKERS);
  if (email) {
    var byEmail = all.filter(function (s) { return s.Email && s.Email.toLowerCase() === email.toLowerCase(); });
    if (byEmail.length) return byEmail[0];
  }
  if (nameZh) {
    var byName = all.filter(function (s) { return s.NameZh === nameZh; });
    if (byName.length) return byName[0];
  }
  return null;
}

function listSpeakers() {
  return getAllRows_(SHEETS.SPEAKERS);
}

function getSpeaker(speakerId) {
  var s = findOneBy_(SHEETS.SPEAKERS, 'SpeakerId', speakerId);
  if (!s) throw new Error('找不到講者：' + speakerId);
  return s;
}

/** 講者在跨活動下的歷史合作紀錄（供主檔頁「歷史活動」顯示）。 */
function getSpeakerHistory(speakerId) {
  var links = findRowsBy_(SHEETS.ACTIVITY_SPEAKERS, 'SpeakerId', speakerId);
  return links.map(function (link) {
    var activity = findOneBy_(SHEETS.ACTIVITIES, 'ActivityId', link.ActivityId);
    return {
      activityId: link.ActivityId,
      activityName: activity ? activity.NameZh : '(已刪除活動)',
      inviteStatus: link.InviteStatus,
      role: link.Role
    };
  });
}

function updateSpeaker(speakerId, patch, actorEmail) {
  var updated = updateRowByKey_(SHEETS.SPEAKERS, 'SpeakerId', speakerId, patch);
  writeAudit_(actorEmail, 'UPDATE_SPEAKER', SHEETS.SPEAKERS, speakerId, JSON.stringify(patch));
  return updated;
}

/** 刪除講者主檔——僅允許在該講者未連結任何活動時執行，避免留下孤兒資料。 */
function deleteSpeakerRecord(speakerId, actorEmail) {
  var links = findRowsBy_(SHEETS.ACTIVITY_SPEAKERS, 'SpeakerId', speakerId);
  if (links.length) {
    throw new Error('這位講者仍連結 ' + links.length + ' 場活動，請先從各活動移除，才能刪除主檔。');
  }
  deleteRowByKey_(SHEETS.SPEAKERS, 'SpeakerId', speakerId);
  writeAudit_(actorEmail, 'DELETE_SPEAKER', SHEETS.SPEAKERS, speakerId, '');
}

/** 批次由 Excel/CSV 資料匯入講者並加入活動（對應「匯入既有講者名單」驗收項目）。 */
function importSpeakersToActivity(activityId, rows, actorEmail) {
  var results = [];
  rows.forEach(function (row) {
    var created = createSpeaker({
      nameZh: row.nameZh, nameEn: row.nameEn, title: row.title, organization: row.organization,
      email: row.email, phone: row.phone, assistantName: row.assistantName, assistantEmail: row.assistantEmail
    }, actorEmail);
    var link = addSpeakerToActivity(activityId, created.speaker.SpeakerId, {
      role: row.role, ownerUserId: row.ownerUserId
    }, actorEmail);
    results.push({ speaker: created.speaker, link: link, duplicateWarning: created.duplicateWarning });
  });
  return results;
}
