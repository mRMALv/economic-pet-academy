# Firebase Spark（免費方案）積分同步改造備忘

此分支是開發草稿，**尚未部署、尚未合併到 main，也不能當作已完成的功能使用**。

## 目標
- 保留 Firebase Authentication（匿名學生、指定老師 Email/Password）。
- 使用 Cloud Firestore 和 Security Rules，不使用 Cloud Functions，避免需要 Blaze 計費方案。
- 老師是唯一能建立學生帳戶、修改累計獲得分數及管理班級名單的人。
- 學生首次選名時，將匿名 Firebase UID 綁定到老師預先建立的 studentAccount；一個學生帳戶同時只綁定一個 UID。
- 學生消費時，透過 Firestore 原子批次同時增加 spentScore、更新 lastTransactionId、建立不可修改的交易紀錄。
- 可用餘額由 earnedScore - spentScore 計算。

## 重要限制
1. 首次選名綁定只代表「這部瀏覽器／裝置已綁定」，不能證明操作者真的是該學生。任何人若能在尚未綁定時搶先選中某位學生，仍可能先綁定錯誤帳戶。老師需能解除綁定。
2. 清除瀏覽器資料或更換瀏覽器／裝置，可能產生新的匿名 UID，須由老師協助解除舊綁定。
3. Firestore Rules 不是後端程式。它能拒絕不符合規則的資料寫入，但無法保證瀏覽器畫面或寵物狀態沒有被修改。
4. 舊版 spentScore/spendLogs 是本機資料，不能直接當作可信交易帳本匯入。正式切換前需決定如何處理舊餘額，並由老師核對。
5. 本規則中的寵物照護與心願金額是目前程式的固定金額清單。若日後改價，必須同步更新規則並測試。
6. 本規則是安全設計草稿，尚未經 Firebase Emulator Suite 規則測試；不得部署到正式 Firebase 專案。

## 後續必做
- 前端加入裝置綁定、雲端讀取餘額、原子消費批次、交易紀錄監聽。
- 老師新增學生時建立 studentAccounts；老師加減分時同步更新 earnedScore 和班級名單。
- 加入解除裝置綁定管理功能。
- 測試不足額、重複交易 ID、跨學生存取、偽造 earnedScore、非指定消費金額、教師權限與清空資料。
- 在 Emulator 測試全部通過並檢查資料遷移後，才考慮合併及部署。
