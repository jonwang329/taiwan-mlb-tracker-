# Taiwan MLB Tracker 專案規範

## 語言規則

- 所有對話、文件、程式介面、通知、提交說明與測試文字，一律使用繁體中文。
- 不得使用簡體中文；英文技術名稱與球員官方英文姓名可保留。
- 發布前必須檢查使用者可見文字，避免繁簡混用。

## 核心原則

1. MLB／MiLB 官方 Stats API 是比賽、球員與統計資料的唯一事實來源。
2. 準確性第一，即時性第二；無法確認時必須顯示資料時間或失敗狀態，不得把舊資料偽裝成即時資料。
3. 中文姓名資料只負責姓名對照與顯示，不得取代 MLB 球員 ID 或官方比賽資料。
4. 網站、LINE 與中央 snapshot 必須採用相同的球員觀察名單與台灣比賽日判定。

## 更新架構

| 元件 | 責任 | 不負責的事項 |
|---|---|---|
| GitHub Pages | 提供網站介面與中央 snapshot | 不直接執行後端即時查詢 |
| GitHub Actions | 定時向 MLB／MiLB 取得資料並建立中央 snapshot，作為網站初次載入與備援資料 | 不適合承擔按鈕級、秒級即時更新 |
| Cloudflare MLB proxy | 只在瀏覽器需要即時查詢時，安全轉送 MLB 官方賽程、球員與 Gameday API，解決 Safari／瀏覽器跨來源連線問題 | 不產生、不修改、不判定棒球資料，也不發動 GitHub snapshot 更新 |
| Cloudflare observation Worker／KV | 保存共用觀察名單 | 不作為比賽統計的事實來源 |
| Cloudflare LINE Worker | 執行 LINE 正式時段通知與去重 | 不作為網站資料來源 |

## 更新優先順序

1. 頁面初次載入：先顯示 GitHub 中央 snapshot。
2. 自動或手動 Refresh：經 Cloudflare proxy 查詢 MLB／MiLB 官方 API。
3. 球隊資料可能延遲時：掃描當日各層級 Gameday，使用 MLB 球員 ID 配對。
4. 即時查詢失敗時：保留最後一次正確資料，但必須清楚顯示失敗與最後成功時間。

## 行動版摘要指標

- 打者：AVG、OPS、當日 BB、當日 K。
- 投手：ERA、WHIP、K/9、BB/9。

