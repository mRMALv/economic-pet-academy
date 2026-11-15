# Firebase Spark（免費方案）開發與部署狀態

最後驗證：2026-11-15。此內容位於 `feature/secure-student-points` 開發分支；**尚未合併到 main，也尚未部署到正式 Firebase／GitHub Pages。**

## 已完成的實作
- 使用 Firebase Authentication（匿名學生、指定老師 Email/Password）及 Cloud Firestore；不使用 Cloud Functions，符合 Spark 方案架構。
- 老師登入時建立／遷移 `studentAccounts/{studentId}`，保存累計獲得、累計消費、裝置 UID、遷移版本及舊額核對狀態。
- 學生首次選名時會確認姓名及裝置鎖定，再把匿名 UID 綁到學生帳戶；同一 UID 不能自行換學生，同一學生不能被第二個 UID 搶綁。
- 撫摸 1、餵食 5、洗澡 10、玩耍 15、心願 6/8/12/18/22/25 分，使用 Firestore transaction 同步更新消費餘額及交易帳本。
- 老師加減分會更新雲端累計獲得分數；老師畫面顯示累計獲得、累計消費及可用分數。
- 老師可解除裝置綁定；舊 UID 會被撤銷，不能再次綁定。
- 舊消費資料只會匯入老師目前瀏覽器／雲端文件能讀取到的內容。若無法確認，帳戶會被標記待核對，學生登入及消費會被 Firestore Rules 阻擋；老師核對後才開放。
- 清空班級採維護標記及分批清理；中途失敗會保留維護狀態，避免部分刪除後自動重建帳戶。
- GitHub Actions 會檢查前端內嵌 JavaScript 語法及 Firestore Emulator 規則測試；通過後才嘗試部署 Firestore Rules。

## 最新驗證結果
- 最新 CI commit：`2badb9562afe72e0920f60d30d9d4ac329eb0b1f`。
- 前端 JavaScript 語法檢查：通過。
- Firestore Emulator 測試：22/22 通過，包含首次綁定、舊帳戶遷移狀態、未核對餘額禁止登入／消費、跨學生讀寫、偽造積分、重複交易、並行消費、撤銷及重新綁定。
- `npm audit`：14 項中等風險、0 項高風險、0 項嚴重風險；目前是 Firebase CLI／開發鏈的間接相依警告，仍應定期更新檢查。
- Emulator 測試不等於真實瀏覽器端到端測試或正式 Firebase 專案驗收。

## 上線限制及資料注意
1. 首次選名綁定只代表裝置綁定，不是身分驗證。其他人仍可能在學生之前選取該姓名；確認對話框只能減少誤選。
2. 清除瀏覽器資料或換瀏覽器／裝置可能產生新 UID；需由老師解除舊裝置後再重新綁定。
3. 其他學生裝置 localStorage 內的舊消費紀錄無法被老師瀏覽器遠端讀取。對於標記待核對的學生，老師必須逐一確認餘額；核對前系統會禁止登入及消費。
4. 寵物外觀、狀態及領養資訊仍主要儲存在學生原本瀏覽器的本機資料；此改造的雲端同步核心是積分與消費帳本。
5. 學生只能讀取自己綁定的積分帳戶及交易紀錄；累計獲得分數只由老師修改。

## Firebase 部署狀態
- 已加入部署流程：測試成功後，GitHub Actions 會檢查服務帳戶或 Firebase CLI Token，然後執行 `firebase deploy --only firestore:rules --project econ-pet`。
- 最新部署工作已執行，但跳過實際部署，因 GitHub Repository Secrets 沒有設定授權憑證。沒有 Firebase 規則實際部署成功的紀錄。
- 需要在 GitHub Repository Settings → Secrets and variables → Actions 設定有 Firestore Rules 部署權限的 Firebase service-account JSON secret `FIREBASE_SERVICE_ACCOUNT_ECON_PET`（建議）；舊式 CLI Token 只作相容備用。不要把密鑰貼到聊天或提交到 Git。
- 設定授權後，向 `feature/secure-student-points` 推送新提交會重新執行測試並嘗試部署。部署成功後才應合併 PR，令 GitHub Pages 更新。
- 真實瀏覽器操作（老師登入、學生綁定、消費、教師加減分、解除／重新綁定）尚未在本次工具連線中執行；正式切換前仍需由老師實際驗收。

**目前狀態：開發及自動化測試完成；Firebase 授權、資料餘額核對、真實瀏覽器驗收及正式發布未完成。**