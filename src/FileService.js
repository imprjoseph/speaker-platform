/** Module 5｜檔案蒐集 —— CV／大頭照／簡報等分類上傳、版本紀錄、審核狀態 */

var MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB，超過建議走續傳/背景上傳（非功能需求：大型檔案）
var ALLOWED_EXT = {
  CV: ['pdf', 'doc', 'docx'],
  Photo: ['jpg', 'jpeg', 'png'],
  Deck: ['pdf', 'ppt', 'pptx'],
  Release: ['pdf'],
  Transcript: ['pdf', 'doc', 'docx'],
  Other: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'ppt', 'pptx']
};

/**
 * 上傳一份檔案（base64），存進「不可猜測路徑」的講者專屬 Drive 資料夾，並建立版本紀錄。
 * fileBlob: { fileName, mimeType, base64Data, fileType, fieldKey }
 */
function uploadFile(activitySpeakerId, fileBlob, actorLabel) {
  validateFile_(fileBlob);

  var folder = getOrCreateSpeakerFolder_(activitySpeakerId);
  var decoded = Utilities.base64Decode(fileBlob.base64Data);
  var blob = Utilities.newBlob(decoded, fileBlob.mimeType, fileBlob.fileName);
  var driveFile = folder.createFile(blob);
  driveFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  var priorVersions = findRowsBy_(SHEETS.FILES, 'ActivitySpeakerId', activitySpeakerId)
    .filter(function (f) { return f.FieldKey === fileBlob.fieldKey; });
  var nextVersion = priorVersions.length + 1;

  var record = insertRow_(SHEETS.FILES, {
    FileId: newId_('FILE'),
    ActivitySpeakerId: activitySpeakerId,
    FieldKey: fileBlob.fieldKey,
    FileType: fileBlob.fileType,
    DriveFileId: driveFile.getId(),
    Version: nextVersion,
    UploadedBy: actorLabel || '(講者本人)',
    UploadedAt: nowIso_(),
    ReviewStatus: STATUS.FILE_REVIEW.PENDING,
    ReviewNote: '',
    IsFinal: false
  });

  writeAudit_(actorLabel, 'UPLOAD_FILE', SHEETS.FILES, record.FileId, fileBlob.fieldKey + ' v' + nextVersion);
  saveResponse(activitySpeakerId, fileBlob.fieldKey, driveFile.getId(), true, actorLabel);
  return record;
}

function validateFile_(fileBlob) {
  var ext = (fileBlob.fileName.split('.').pop() || '').toLowerCase();
  var allowed = ALLOWED_EXT[fileBlob.fileType] || ALLOWED_EXT.Other;
  if (allowed.indexOf(ext) === -1) {
    throw new Error('不支援的檔案格式：.' + ext + '（' + fileBlob.fileType + ' 僅接受：' + allowed.join(', ') + '）');
  }
  var approxBytes = fileBlob.base64Data.length * 0.75;
  if (approxBytes > MAX_FILE_BYTES) {
    throw new Error('檔案超過 25MB 上限，請壓縮後再上傳。');
  }
}

/** 每位講者一個不可猜測（以內部 ID 而非姓名命名）的私有資料夾。 */
function getOrCreateSpeakerFolder_(activitySpeakerId) {
  var rootId = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.FILES_ROOT_FOLDER_ID);
  var root = rootId ? DriveApp.getFolderById(rootId) : createFilesRootFolder_();

  var existing = root.getFoldersByName(activitySpeakerId);
  if (existing.hasNext()) return existing.next();
  return root.createFolder(activitySpeakerId);
}

function createFilesRootFolder_() {
  var folder = DriveApp.createFolder('SpeakerPlatform_Files_' + newId_());
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.FILES_ROOT_FOLDER_ID, folder.getId());
  return folder;
}

function listFiles(activitySpeakerId, fieldKey) {
  var rows = findRowsBy_(SHEETS.FILES, 'ActivitySpeakerId', activitySpeakerId);
  if (fieldKey) rows = rows.filter(function (f) { return f.FieldKey === fieldKey; });
  return rows.sort(function (a, b) { return b.Version - a.Version; });
}

/** 審核通過／需重傳；核准時可標記為最終版並鎖定（避免現場誤用舊版）。 */
function reviewFile(fileId, decision, note, markFinal, actorEmail) {
  var patch = {
    ReviewStatus: decision === 'approve' ? STATUS.FILE_REVIEW.APPROVED : STATUS.FILE_REVIEW.NEEDS_REUPLOAD,
    ReviewNote: note || '',
    IsFinal: decision === 'approve' && !!markFinal
  };
  var updated = updateRowByKey_(SHEETS.FILES, 'FileId', fileId, patch);
  writeAudit_(actorEmail, 'REVIEW_FILE', SHEETS.FILES, fileId, decision + (markFinal ? '（標記最終版）' : ''));
  return updated;
}

function getFinalFile(activitySpeakerId, fieldKey) {
  return findRowsBy_(SHEETS.FILES, 'ActivitySpeakerId', activitySpeakerId)
    .filter(function (f) { return f.FieldKey === fieldKey && f.IsFinal; })[0] || null;
}
