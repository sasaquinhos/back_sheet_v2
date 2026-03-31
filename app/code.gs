// ========================================
// ProjectE 専用 Google Apps Script (セキュリティ強化版)
// ========================================

const PROJECTE_SPREADSHEET_ID = "1JAIeX8NipBaXWh4waRRoVzjDgXrZlfopF9G81mDh1-E";

// 初期管理者パスワード (初回のみ使用。管理者画面から変更可能)
const INITIAL_ADMIN_PASS = "admin1234";

/**
 * 初期設定: スクリプトプロパティの初期化
 */
function initProperties() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("ADMIN_PASS")) {
    props.setProperty("ADMIN_PASS", INITIAL_ADMIN_PASS);
  }
}

/**
 * GET リクエスト処理
 * 主に読み取り系アクション (データ取得、キー検証)
 */
function doGet(e) {
  initProperties();
  const action = e.parameter.action;
  const accessKey = e.parameter.accessKey;

  try {
    // 1. アクセスキーの検証アクション
    if (action === "verifyKey") {
      const props = PropertiesService.getScriptProperties();
      const keys = JSON.parse(props.getProperty("ACCESS_KEYS") || "{}");
      const now = new Date().getTime();
      
      // システム内に有効なキーが存在するかチェック
      let hasActiveKey = false;
      for (const k in keys) {
        if (keys[k] > now) {
          hasActiveKey = true;
          break;
        }
      }

      // システムにキーがない場合
      if (!hasActiveKey) {
        return createJsonResponse({ status: "error", message: "アクセスキーを入力してください" });
      }

      // キーが入力されていない、または間違っている/期限切れの場合
      if (!accessKey || !keys[accessKey] || keys[accessKey] <= now) {
        return createJsonResponse({ status: "error", message: "無効または期限切れのキーです" });
      }

      return createJsonResponse({ status: "success", message: "有効なキーです" });
    }

    // 2. 座席データの取得 (有効なキーが必要)
    if (action === "getSeatData") {
      if (!isValidAccessKey(accessKey)) {
        return createJsonResponse({ status: "error", message: "認証が必要です", authError: true });
      }
      const spreadsheet = SpreadsheetApp.openById(PROJECTE_SPREADSHEET_ID);
      const sheet = spreadsheet.getSheets()[0];
      const data = sheet.getRange(1, 1).getValue();
      return createJsonResponse({ status: "success", data: data ? JSON.parse(data) : {} });
    }

    return createJsonResponse({ status: "error", message: "不明なアクションです" });

  } catch (error) {
    return createJsonResponse({ status: "error", message: error.toString() });
  }
}

/**
 * POST リクエスト処理
 * 主に書き込み系アクション (データ保存、管理者ログイン、キー生成)
 */
function doPost(e) {
  initProperties();
  
  let rawData = e.postData.contents;
  if (!rawData) return createJsonResponse({ status: "error", message: "データが空です" });
  
  const payload = JSON.parse(rawData);
  const action = payload.action;

  try {
    // 1. 座席データの保存 (有効なキーが必要)
    if (action === "saveSeatData") {
      if (!isValidAccessKey(payload.accessKey)) {
        return createJsonResponse({ status: "error", message: "認証が必要です", authError: true });
      }
      const spreadsheet = SpreadsheetApp.openById(PROJECTE_SPREADSHEET_ID);
      const sheet = spreadsheet.getSheets()[0];
      sheet.getRange(1, 1).setValue(JSON.stringify(payload.data));
      return createJsonResponse({ status: "success", message: "保存しました" });
    }

    // 2. 管理者ログイン
    if (action === "adminLogin") {
      const props = PropertiesService.getScriptProperties();
      const isAdmin = (payload.adminPassword === props.getProperty("ADMIN_PASS"));
      return createJsonResponse({ status: isAdmin ? "success" : "error", message: isAdmin ? "ログイン成功" : "パスワードが違います" });
    }

    // 3. アクセスキー生成 (管理者パスワードが必要)
    if (action === "generateKey") {
      if (!isAdmin(payload.adminPassword)) return createJsonResponse({ status: "error", message: "権限がありません" });
      
      const newKey = Math.random().toString(36).substring(2, 10).toUpperCase(); // 8文字のランダムキー
      const hours = parseInt(payload.hours || 0);
      const mins = parseInt(payload.mins || 0);
      const expiry = new Date().getTime() + (hours * 60 * 60 * 1000) + (mins * 60 * 1000);
      
      saveAccessKey(newKey, expiry);
      return createJsonResponse({ status: "success", key: newKey, expiry: new Date(expiry).toLocaleString() });
    }

    // 4. 管理者パスワード変更
    if (action === "updateAdminPass") {
      if (!isAdmin(payload.oldPassword)) return createJsonResponse({ status: "error", message: "現在のパスワードが違います" });
      PropertiesService.getScriptProperties().setProperty("ADMIN_PASS", payload.newPassword);
      return createJsonResponse({ status: "success", message: "パスワードを更新しました" });
    }

    // 5. 現在有効なキーの取得 (管理者パスワードが必要)
    if (action === "getAccessKeys") {
      if (!isAdmin(payload.adminPassword)) return createJsonResponse({ status: "error", message: "権限がありません" });
      const props = PropertiesService.getScriptProperties();
      const keysJson = props.getProperty("ACCESS_KEYS");
      const keys = keysJson ? JSON.parse(keysJson) : {};
      
      // 有効なものだけ抽出
      const now = new Date().getTime();
      const activeKeys = {};
      for (const k in keys) {
        if (keys[k] > now) activeKeys[k] = keys[k];
      }
      return createJsonResponse({ status: "success", keys: activeKeys });
    }

    return createJsonResponse({ status: "error", message: "不明なアクションです" });

  } catch (error) {
    return createJsonResponse({ status: "error", message: error.toString() });
  }
}

/**
 * アクセスキーの有効性チェック
 */
function isValidAccessKey(key) {
  if (!key) return false;
  const props = PropertiesService.getScriptProperties();
  const keysJson = props.getProperty("ACCESS_KEYS");
  if (!keysJson) return false;
  
  const keys = JSON.parse(keysJson);
  const expiry = keys[key];
  if (!expiry) return false;
  
  // 期限チェック
  if (new Date().getTime() > expiry) {
    delete keys[key];
    props.setProperty("ACCESS_KEYS", JSON.stringify(keys));
    return false;
  }
  return true;
}

/**
 * 管理者チェック
 */
function isAdmin(pass) {
  return pass === PropertiesService.getScriptProperties().getProperty("ADMIN_PASS");
}

/**
 * アクセスキーの保存
 */
function saveAccessKey(key, expiry) {
  const props = PropertiesService.getScriptProperties();
  // 常に最新1件にするため、空のオブジェクトから開始
  let keys = {}; 
  keys[key] = expiry;
  props.setProperty("ACCESS_KEYS", JSON.stringify(keys));
}

/**
 * JSON レスポンスの生成
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
