/**
 * 一次性初始化：在目前綁定的 Google Sheet 中，依 Config.SCHEMA 建立所有分頁與標題列。
 * 使用方式：在 Apps Script 編輯器選擇 setupSpreadsheet 函式並執行一次即可。
 * 重複執行是安全的 —— 已存在的分頁只會補齊缺少的標題欄，不會清空既有資料。
 */
function setupSpreadsheet() {
  var ss = getOrCreateBoundSpreadsheet_();

  Object.keys(SCHEMA).forEach(function (sheetName) {
    var headers = SCHEMA[sheetName];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    ensureHeaders_(sheet, headers);
  });

  // 移除 Apps Script 預設的「工作表1」空白分頁（若存在且未被使用）。
  var defaultSheet = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  seedDefaultData_(ss);
  seedScriptProperties_();
  Logger.log('Setup complete. Spreadsheet URL: ' + ss.getUrl());
}

function seedScriptProperties_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP_KEYS.DEFAULT_LANGUAGE)) {
    props.setProperty(PROP_KEYS.DEFAULT_LANGUAGE, 'zh');
  }
}

function getOrCreateBoundSpreadsheet_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('請先將此 Apps Script 專案綁定到一個 Google Sheet（用 clasp create 時選 --type sheets，或在 Sheet 的擴充功能選單開啟 Apps Script）。');
}

function ensureHeaders_(sheet, headers) {
  var existing = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn() || 1)).getValues()[0];
  var needsWrite = false;
  for (var i = 0; i < headers.length; i++) {
    if (existing[i] !== headers[i]) { needsWrite = true; break; }
  }
  if (needsWrite) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF');
  }
}

/** 建立跑最小可用流程所需的預設資料：管理員帳號、提醒規則、雙語郵件範本。 */
function seedDefaultData_(ss) {
  seedReminderRulesIfEmpty_(ss);
  seedMailTemplatesIfEmpty_(ss);
}

/**
 * TemplateId 這裡存的是「範本類別」（TPL_REMINDER／TPL_OVERDUE），不是實際範本 ID——
 * 實際寄送時會依講者語言自動接上 _ZH／_EN，見 MailService.js 的 resolveTemplateIdForSpeaker_。
 * TPL_OVERDUE_ESCALATE 例外：那是寄給內部負責人的通知，固定中文，不用接語言後綴。
 */
function seedReminderRulesIfEmpty_(ss) {
  var sheet = ss.getSheetByName(SHEETS.REMINDER_RULES);
  if (sheet.getLastRow() > 1) return; // 已有資料就不覆蓋

  var rows = [
    [Utilities.getUuid(), '', '', -14, 'TPL_REMINDER', true],
    [Utilities.getUuid(), '', '', -7, 'TPL_REMINDER', true],
    [Utilities.getUuid(), '', '', -3, 'TPL_REMINDER', true],
    [Utilities.getUuid(), '', '', 0, 'TPL_OVERDUE', true],
    [Utilities.getUuid(), '', '', 3, 'TPL_OVERDUE_ESCALATE', true]
  ];
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/**
 * 每一類信件都準備中／英文版本（除了「逾期升級通知」是寄給內部負責人，固定中文）。
 * 實際寄送時依講者的 PreferredLanguage 自動選對應語言版本，
 * 見 MailService.js 的 resolveTemplateIdForSpeaker_。
 */
function seedMailTemplatesIfEmpty_(ss) {
  var sheet = ss.getSheetByName(SHEETS.MAIL_TEMPLATES);
  if (sheet.getLastRow() > 1) return;
  sheet.getRange(2, 1, defaultMailTemplateRows_().length, headers_(SHEETS.MAIL_TEMPLATES).length).setValues(defaultMailTemplateRows_());
}

/**
 * 補上新版才有的雙語範本（TPL_REMINDER_ZH/EN、TPL_OVERDUE_ZH/EN、TPL_COMPLETION_ZH/EN），
 * 只新增「目前分頁裡還沒有的 TemplateId」，不會動到已存在的資料。
 * 適用情境：這個活頁簿是舊版 setupSpreadsheet() 建立的，MailTemplates 分頁已經有資料，
 * 所以 seedMailTemplatesIfEmpty_ 不會自動補新範本——在 Apps Script 編輯器手動執行這個函式一次即可。
 * 執行完可以自行刪掉分頁裡舊的 TPL_REMINDER／TPL_OVERDUE／TPL_COMPLETION（沒有語言後綴的）三列，
 * 現在程式碼已經不會再用到它們了。
 */
function upgradeMailTemplatesToBilingual() {
  var ss = getOrCreateBoundSpreadsheet_();
  var sheet = ss.getSheetByName(SHEETS.MAIL_TEMPLATES);
  var existingIds = getAllRows_(SHEETS.MAIL_TEMPLATES).map(function (r) { return r.TemplateId; });
  var missing = defaultMailTemplateRows_().filter(function (row) { return existingIds.indexOf(row[0]) === -1; });
  if (!missing.length) { Logger.log('沒有缺少的範本，不需要新增。'); return; }
  sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, missing[0].length).setValues(missing);
  Logger.log('已新增 ' + missing.length + ' 個範本：' + missing.map(function (r) { return r[0]; }).join('、'));
}

function defaultMailTemplateRows_() {
  var now = new Date();
  return [
    ['TPL_INVITE_ZH', '邀請函（中文）', 'Invitation', 'zh',
      '【{{活動名稱}}】敬邀 {{講者稱謂}} 撥冗出席',
      '<p>{{講者稱謂}} 您好，</p><p>誠摯邀請您出席「{{活動名稱}}」（{{活動日期}}），請透過以下專屬連結確認出席並填寫相關資料：</p><p><a href="{{填寫連結}}">{{填寫連結}}</a></p><p>如有任何問題，請聯繫 {{專案窗口姓名}}（{{窗口電話}}）。</p>',
      'system', now],
    ['TPL_INVITE_EN', 'Invitation (English)', 'Invitation', 'en',
      '[{{ActivityName}}] Speaker Invitation',
      '<p>Dear {{SpeakerTitle}},</p><p>We would be honored to have you speak at {{ActivityName}} ({{ActivityDate}}). Please confirm via your personal link:</p><p><a href="{{FormLink}}">{{FormLink}}</a></p><p>Questions? Contact {{ContactName}} ({{ContactPhone}}).</p>',
      'system', now],
    ['TPL_REMINDER_ZH', '資料催收提醒（中文）', 'Reminder', 'zh',
      '【{{活動名稱}}】提醒尚有資料待補：{{尚缺項目}}',
      '<p>{{講者稱謂}} 您好，距離活動還有 {{剩餘天數}} 天，尚缺以下項目：{{尚缺項目}}，截止日為 {{截止日}}。請透過原連結補齊：<a href="{{填寫連結}}">{{填寫連結}}</a></p>',
      'system', now],
    ['TPL_REMINDER_EN', 'Reminder (English)', 'Reminder', 'en',
      '[{{ActivityName}}] Reminder: outstanding items - {{尚缺項目}}',
      '<p>Dear {{SpeakerTitle}},</p><p>Just a friendly reminder that the following items are still outstanding: {{尚缺項目}} (due {{截止日}}). Please complete them via your personal link: <a href="{{FormLink}}">{{FormLink}}</a></p>',
      'system', now],
    ['TPL_OVERDUE_ZH', '逾期提醒（中文）', 'Overdue', 'zh',
      '【{{活動名稱}}】{{尚缺項目}} 已逾期，請儘速補件',
      '<p>{{講者稱謂}} 您好，以下項目已逾期：{{尚缺項目}}，敬請儘速透過連結補齊：<a href="{{填寫連結}}">{{填寫連結}}</a></p>',
      'system', now],
    ['TPL_OVERDUE_EN', 'Overdue (English)', 'Overdue', 'en',
      '[{{ActivityName}}] Overdue: {{尚缺項目}}',
      '<p>Dear {{SpeakerTitle}},</p><p>The following items are now overdue: {{尚缺項目}}. Please complete them as soon as possible via: <a href="{{FormLink}}">{{FormLink}}</a></p>',
      'system', now],
    ['TPL_OVERDUE_ESCALATE', '逾期升級通知（給內部負責人，固定中文）', 'Overdue', 'zh',
      '【內部通知】{{講者稱謂}}（{{活動名稱}}）逾期 3 天以上，建議改人工聯繫',
      '<p>講者 {{講者稱謂}} 尚缺 {{尚缺項目}}，已逾期超過 3 天，系統將暫停自動催收，請改以人工聯繫。</p>',
      'system', now],
    ['TPL_COMPLETION_ZH', '完成確認信（中文）', 'Completion', 'zh',
      '【{{活動名稱}}】資料已收齊，感謝您的配合',
      '<p>{{講者稱謂}} 您好，您所提供的資料已全數收齊，感謝配合！如有異動請隨時透過原連結更新。</p>',
      'system', now],
    ['TPL_COMPLETION_EN', 'Completion (English)', 'Completion', 'en',
      '[{{ActivityName}}] All set — thank you!',
      '<p>Dear {{SpeakerTitle}},</p><p>All your materials have been received. Thank you for your cooperation! If anything changes, you can still update it via your original link.</p>',
      'system', now]
  ];
}
