# 講者協作與會務追蹤平台（MVP）

Google Sheets + Google Apps Script + GitHub 版本控管。對應〈講者協作平台_分階段開發計劃書〉的**第 0＋第 1 階段（MVP）**範圍。

## 這個 MVP 目前實作了什麼

| 模組 | 狀態 |
|---|---|
| 1. 活動工作區 | 建立 / 列表 / 複製 / 封存（`ActivityService.js`） |
| 2. 講者主檔 | 建立 / 重複偵測 / 歷史活動（`SpeakerService.js`） |
| 3. 邀請與回覆 | 免登入專屬連結、接受／婉拒、可撤銷重發（`InvitationService.js`） |
| 4. 彈性資料表單 | 每活動自訂欄位、必填、期限（`FormService.js`） |
| 5. 檔案蒐集 | 上傳、版本、審核、最終版鎖定（`FileService.js`） |
| 6. 任務與期限 | 8 段狀態機（未寄送～逾期）（`TaskService.js`） |
| 7. 郵件與提醒 | **多語系範本、發送前一律待窗口確認才寄出**、D-14/7/3/逾期/升級、已提供則不提醒（`MailService.js`） |
| 11. 儀表板與統計 | 完成率、逾期、高風險、依負責人彙總（`DashboardService.js`） |
| 12. 匯出 | 講者總表／缺件表匯出成 Google Sheet（`ExportService.js`） |
| 15. 安全與稽核（基礎） | 角色欄位、操作稽核紀錄（`SecurityService.js`） |

第二／三／四階段（旅運接待、整合介面、AI 助理等）尚未實作，待 MVP 試點驗收後再開發，範圍請見計劃書。

## 已知限制（誠實揭露，非隱藏 bug）

- **檔案病毒掃描**未實作：Apps Script 沒有原生掃毒 API，正式上線前建議另接 Workspace DLP 或第三方掃描服務。
- **權限僅做角色欄位比對**，尚未做到「接待人員看不到 CV」等欄位級遮蔽，屬第一階段之後要補強的項目。
- **開信追蹤（已開啟）**目前用「講者是否曾打開填寫頁」的稽核紀錄近似，不是信件像素追蹤。
- 匯出目前產生的是 Google試算表（可再手動下載為 .xlsx），還沒有直接產出 PDF。

## 技術棧

- **資料庫**：Google Sheets（一個活頁簿 = 一個資料庫，見 `src/Config.js` 的 `SCHEMA`）
- **後端／排程／寄信**：Google Apps Script（`MailApp`、`DriveApp`、`ScriptApp` 時間觸發器）
- **前端**：Apps Script Web App（`HtmlService`），講者填寫頁與內部後台各一頁，無額外框架
- **版控**：Git + GitHub，用 [`clasp`](https://github.com/google/clasp) 把 `src/` 推送到 Apps Script

## 第一次設定步驟

1. **安裝依賴 ＆ 登入 Google（用你自己的帳號，不會由 AI 代為登入）**
   ```bash
   npm install
   npx clasp login
   ```
2. **建立 Apps Script 專案並綁定一個新的 Google Sheet**
   ```bash
   npx clasp create --type sheets --title "講者協作與會務追蹤平台" --rootDir src
   ```
   執行後會產生 `.clasp.json`（已被 `.gitignore` 排除，因為裡面的 `scriptId` 是你個人專案的識別碼）。
3. **推送程式碼**
   ```bash
   npm run push
   ```
4. **在 Apps Script 編輯器（`npm run open`）依序手動執行一次：**
   - `setupSpreadsheet` — 建立所有分頁與標題列、預設提醒規則與雙語範本
   - `bootstrapFirstAdmin` — 把你自己的 Google 帳號加入 `Users` 分頁、角色設為 `SystemAdmin`
   - `installDailyReminderTrigger` — 安裝每天 08:00 的提醒排程（只需執行一次）
5. **部署成 Web App**：Apps Script 編輯器右上角「部署」→「新增部署作業」→ 類型選「網頁應用程式」，執行身分選「我」，誰能存取選「知道連結的任何人」（講者端連結需要免登入存取）。
6. 把部署網址填回 Script Properties 的 `WEBAPP_BASE_URL`（Apps Script 編輯器 → 專案設定 → 指令碼屬性），供系統產生講者連結使用。

## 日常開發流程

```bash
# 改完 src/ 底下的檔案後
npm run push        # 推到 Apps Script
git add -A && git commit -m "..."   # 本機留存版本記錄
```

> 目前只做了本機 `git init`，**尚未建立或推送到 GitHub 遠端 repo** —— 需要你確認要用哪個 GitHub 帳號／組織建立 repository 後再執行 `git remote add` 與 `git push`。

## 郵件寄送與「窗口確認」機制

所有信件（不論是後台手動排入，或每日排程自動產生的提醒）都會先寫入 `MailQueue` 分頁，狀態為「待確認」。**只有在後台「郵件待審」頁籤按下「確認寄出」，系統才會呼叫 `MailApp.sendEmail` 真正寄出**（`MailService.js` 的 `approveMail` → `sendQueueItem_`）。這同時滿足：

- 每封信都要窗口過目才會外寄（不會被排程直接群發）
- 範本可選語言（`MailTemplates` 分頁的 `Language` 欄位）
- 若該項資料已送出／已核准，`runDailyReminderSweep` 掃描時會直接略過，不產生提醒信

寄送用量在一般 Google 帳號為每日 100 封、Workspace 帳號視方案可達 1,500 封，若活動規模較大建議申請 Workspace 或改接 SendGrid／Resend 等專業寄信服務。
