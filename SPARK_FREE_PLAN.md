# Firebase Spark（免費方案）開發與部署狀態

最後驗證：2026-11-15。內容位於 `feature/secure-student-points`；正式網站尚未合併／更新。

## 已完成實作
- 使用 Firebase Authentication（匿名學生、指定老師 Email/Password）及 Cloud Firestore，不使用 Cloud Functions，符合 Spark 架構。
- 學生登入頁不再顯示全班名單。未登入訪客不能讀取班級資料。
- 老師新增學生時，雲端帳戶以 0 分建立，並產生 128-bit 隨機、一次性學生登入碼。只儲存登入碼的 SHA-256 雜湊；原始碼只在老師建立／重新發放時顯示一次，須私下交給該學生。
- 學生輸入專屬碼後，Firestore Rules 驗證邀請文件並原子地完成裝置綁定及刪除邀請；同一碼不能重複使用。學生裝置綁定後才可讀取班級資料。
- 老師可為未綁定的學生重新發放登入碼；若裝置已綁定，需先由老師解除裝置並撤銷舊 UID，再發新碼。
- 撫摸 1、餵食 5、洗澡 10、玩耍 15、心願 6/8/12/18/22/25 分，使用 Firestore transaction 同步更新雲端消費餘額及交易帳本。
- 老師加減分更新雲端累計獲得分數；管理後台顯示累計獲得、累計消費及可用分數。
- Firestore Rules 限制只有老師及已綁定學生可讀取班級名單；邀請碼文件禁止學生列出，只能以持有的隨機碼雜湊讀取單一文件。
- 清空班級使用維護標記及分批清理；中斷時保留維護狀態，避免部分刪除後自動重建帳戶。

## 最新自動化測試
- 最新 head：`5ddee1b9a3b075fbc73911da97e6ee04fdc2c0a2`。
- JavaScript 語法檢查：通過。
- Firestore Emulator：**24/24 測試通過**，包括匿名訪客不能讀取名單、學生不能列出邀請、無老師邀請碼不能綁定、未核對帳戶阻擋、原子綁定、積分消費、偽造防護、重播防護、並行消費及撤銷重綁。
- `npm audit`：14 項中等風險、0 項高風險、0 項嚴重風險；警告在開發／CLI 間接相依樹，仍應定期檢查更新。
- Emulator 測試不是完整真實瀏覽器端到端驗收。

## 資料初始化方式
- 專案管理者確認目前沒有學生名單及舊消費紀錄，因此不需要匯入歷史餘額，也不需要逐位核對舊積分。
- 正式發布後，老師逐位新增學生；每個新帳戶由 0 分開始，並取得個別的一次性登入碼。
- 現有寵物養成資料主要仍保存在學生裝置本機；積分和消費帳本由 Firestore 管理。

## 正式部署前最後步驟
1. **重新發布最新版 Firestore Rules。** 專案管理者之前已在 Firebase Console 成功發布舊版規則；但本次為了加入私密名單和一次性登入碼，`firestore.rules` 又有更新，因此必須再發布一次最新版本。直接複製目前分支檔案：
   `https://github.com/mRMALv/economic-pet-academy/blob/feature/secure-student-points/firestore.rules`
2. 在 Firebase Console 的 Firestore Database → Rules，貼上這份完整檔案並按 Publish。
3. 確認顯示 Published 後，才合併 PR #1 到 `main` 並更新 GitHub Pages。
4. 發布後先由老師建立一位測試學生，確認收到一次性登入碼、學生能登入、消費後餘額同步，再刪除測試資料或改為正式名單。

## 部署現況
- GitHub Actions 已具備測試後嘗試部署 Firestore Rules 的步驟；但目前沒有設定 Firebase 服務帳戶／CLI Token Secret，故自動部署跳過。可由 Firebase Console 手動發布。
- 最新版 Firestore Rules 尚待專案管理者再次手動發布；之前的成功發布是舊規則版本，不能視為此版本已部署。
- PR #1 仍為 Draft，尚未合併；正式 `main` 網站仍是舊版。
- 真實瀏覽器登入、發碼、首登、消費、教師加減分、解除／重綁仍需在發布後使用測試學生實際驗收。

**目前狀態：程式更新完成、24 項模擬器測試通過；等待最新版 Firestore Rules 再次發布，之後才可合併並正式更新網址。**