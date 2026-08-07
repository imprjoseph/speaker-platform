/**
 * 全域設定：試算表分頁名稱與欄位定義（單一資料來源，Setup.js 與各 Service 共用）。
 */

var SHEETS = {
  USERS: 'Users',
  ACTIVITIES: 'Activities',
  SESSIONS: 'Sessions',
  SPEAKERS: 'Speakers',
  ACTIVITY_SPEAKERS: 'ActivitySpeakers',
  DATA_REQUIREMENTS: 'DataRequirements',
  RESPONSES: 'Responses',
  FILES: 'Files',
  MAIL_TEMPLATES: 'MailTemplates',
  MAIL_QUEUE: 'MailQueue',
  REMINDER_RULES: 'ReminderRules',
  AUDIT_LOG: 'AuditLog'
};

// 每個分頁的欄位順序 = 試算表的欄位順序，新增欄位請加在陣列尾端以免錯位。
var SCHEMA = {};

SCHEMA[SHEETS.USERS] = [
  'UserId', 'Name', 'Email', 'Role', 'NotifyByEmail', 'CreatedAt'
];
// Role: SystemAdmin | ProjectLead | ProjectMember | OnsiteStaff | ClientReadOnly

SCHEMA[SHEETS.ACTIVITIES] = [
  'ActivityId', 'NameZh', 'NameEn', 'StartDate', 'EndDate', 'Timezone', 'Language',
  'Venue', 'Organizer', 'Status', 'DefaultDeadlineOffsets', 'ProjectLeadUserId',
  'CreatedBy', 'CreatedAt', 'ArchivedAt'
];
// Status: Draft | Active | Completed | Archived
// DefaultDeadlineOffsets: JSON，例如 {"cv":-45,"photo":-30,"deck":-7}（相對活動日的天數）

SCHEMA[SHEETS.SESSIONS] = [
  'SessionId', 'ActivityId', 'TopicZh', 'TopicEn', 'StartTime', 'Room', 'Format', 'ModeratorNote'
];

SCHEMA[SHEETS.SPEAKERS] = [
  'SpeakerId', 'NameZh', 'NameEn', 'Title', 'Organization', 'Email', 'Phone',
  'AssistantName', 'AssistantEmail', 'CountryTimezone',
  'ReusableCvDriveId', 'ReusablePhotoDriveId', 'DuplicateOfSpeakerId', 'CreatedAt'
];

SCHEMA[SHEETS.ACTIVITY_SPEAKERS] = [
  'ActivitySpeakerId', 'ActivityId', 'SpeakerId', 'SessionId', 'Role',
  'InviteStatus', 'RiskLevel', 'OwnerUserId', 'InviteToken', 'TokenExpiresAt',
  'CustomDeadlineOverrides', 'CreatedAt', 'UpdatedAt'
];
// InviteStatus: 未聯絡 | 邀請中 | 已接受 | 已婉拒 | 待確認 | 已完成 | 高風險

SCHEMA[SHEETS.DATA_REQUIREMENTS] = [
  'ReqId', 'ActivityId', 'FieldKey', 'LabelZh', 'LabelEn', 'FieldType',
  'Required', 'DeadlineOffsetDays', 'PublicUse', 'ReviewRequired', 'DisplayOrder'
];
// FieldType: text | textarea | file | select | date

SCHEMA[SHEETS.RESPONSES] = [
  'ResponseId', 'ActivitySpeakerId', 'FieldKey', 'Value', 'Status', 'UpdatedAt', 'UpdatedBy'
];
// Status: 未填 | 草稿 | 已送出 | 需補件 | 已核准 | 逾期

SCHEMA[SHEETS.FILES] = [
  'FileId', 'ActivitySpeakerId', 'FieldKey', 'FileType', 'DriveFileId', 'Version',
  'UploadedBy', 'UploadedAt', 'ReviewStatus', 'ReviewNote', 'IsFinal'
];
// FileType: CV | Photo | Deck | Release | Transcript | Other
// ReviewStatus: 待審核 | 已核准 | 需重傳

SCHEMA[SHEETS.MAIL_TEMPLATES] = [
  'TemplateId', 'Name', 'Category', 'Language', 'Subject', 'BodyHtml', 'UpdatedBy', 'UpdatedAt'
];
// Category: Invitation | Reminder | Overdue | Completion | Custom
// Language: zh | en

SCHEMA[SHEETS.MAIL_QUEUE] = [
  'QueueId', 'ActivityId', 'ActivitySpeakerId', 'TemplateId', 'Language',
  'ToEmail', 'CcEmails', 'BccEmails', 'ReplyTo', 'RenderedSubject', 'RenderedBody',
  'Status', 'RequestedBy', 'RequestedAt', 'ApprovedBy', 'ApprovedAt', 'SentAt',
  'BounceStatus', 'Notes'
];
// Status: 待確認 | 已核准待寄 | 已寄送 | 已取消 | 已拒絕
// 核心規則：只有 Status = 已核准待寄 的信件，排程才會真正寄出（見 MailService.sendApprovedQueue）。

SCHEMA[SHEETS.REMINDER_RULES] = [
  'RuleId', 'ActivityId', 'FieldKeyScope', 'OffsetDays', 'TemplateId', 'Active'
];
// ActivityId 空白 = 全域預設規則；FieldKeyScope 空白 = 套用所有欄位
// OffsetDays 相對截止日：-14/-7/-3 為提前提醒，0 為逾期當天，之後每 3 天再升級

SCHEMA[SHEETS.AUDIT_LOG] = [
  'LogId', 'Timestamp', 'ActorEmail', 'Action', 'EntityType', 'EntityId', 'Detail'
];

var PROP_KEYS = {
  WEBAPP_BASE_URL: 'WEBAPP_BASE_URL',
  DEFAULT_LANGUAGE: 'DEFAULT_LANGUAGE',
  FROM_NAME: 'FROM_NAME',
  FILES_ROOT_FOLDER_ID: 'FILES_ROOT_FOLDER_ID'
};

var STATUS = {
  RESPONSE: {
    EMPTY: '未填', DRAFT: '草稿', SUBMITTED: '已送出',
    NEEDS_REUPLOAD: '需補件', APPROVED: '已核准', OVERDUE: '逾期'
  },
  INVITE: {
    NOT_CONTACTED: '未聯絡', INVITED: '邀請中', ACCEPTED: '已接受',
    DECLINED: '已婉拒', COMPLETED: '已完成', AT_RISK: '高風險'
  },
  MAIL: {
    PENDING_REVIEW: '待確認', APPROVED: '已核准待寄', SENT: '已寄送',
    CANCELLED: '已取消', REJECTED: '已拒絕'
  },
  FILE_REVIEW: {
    PENDING: '待審核', APPROVED: '已核准', NEEDS_REUPLOAD: '需重傳'
  }
};
