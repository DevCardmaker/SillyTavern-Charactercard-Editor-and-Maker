//! Talking to a SillyTavern server: list, fetch, send and delete characters, groups and personas.
//!
//! SillyTavern protects every API call with a CSRF token tied to a session cookie. Each call here
//! starts a fresh session (GET /csrf-token, cookie kept by the client) and then sends the real
//! request with the token. Two requests instead of one, but nothing to expire or keep in sync, and
//! on a LAN that costs a few milliseconds. Done in Rust because the webview would block these
//! cross-origin requests (CORS) and can't hold SillyTavern's session cookie.

use std::collections::HashMap;
use std::time::Duration;

#[derive(serde::Deserialize)]
pub struct StFile {
    /// Original file name SillyTavern sees (only its extension matters there).
    file_name: String,
    bytes: Vec<u8>,
}

#[derive(serde::Deserialize)]
pub struct StRequest {
    base_url: String,
    /// Path including any query, e.g. "/api/characters/all" or "/thumbnail?type=avatar&file=a.png".
    path: String,
    /// "GET" or "POST".
    method: String,
    /// JSON body for a POST.
    json: Option<serde_json::Value>,
    /// Multipart upload instead of JSON: the file goes into the "avatar" field (the only file field
    /// SillyTavern's upload middleware reads), the rest as text fields.
    file: Option<StFile>,
    fields: Option<HashMap<String, String>>,
    /// For a SillyTavern with basicAuthMode.
    basic_user: Option<String>,
    basic_password: Option<String>,
}

#[derive(serde::Serialize)]
pub struct StResponse {
    status: u16,
    content_type: String,
    body: Vec<u8>,
}

fn with_auth(builder: reqwest::RequestBuilder, req: &StRequest) -> reqwest::RequestBuilder {
    match req.basic_user.as_deref().filter(|u| !u.is_empty()) {
        Some(user) => builder.basic_auth(user, req.basic_password.clone()),
        None => builder,
    }
}

#[tauri::command]
pub async fn st_request(req: StRequest) -> Result<StResponse, String> {
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP client could not be created: {e}"))?;
    let base = req.base_url.trim().trim_end_matches('/').to_string();
    if base.is_empty() {
        return Err("No SillyTavern address set — enter it under Settings → SillyTavern.".into());
    }

    let token_response = with_auth(client.get(format!("{base}/csrf-token")), &req)
        .send()
        .await
        .map_err(|e| format!("SillyTavern at {base} could not be reached: {e}"))?;
    let token_status = token_response.status();
    if token_status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("SillyTavern asks for a login — enter the user name and password under Settings → SillyTavern.".into());
    }
    if token_status == reqwest::StatusCode::FORBIDDEN {
        return Err("SillyTavern refused the connection — this computer is probably not on its whitelist (whitelist in SillyTavern's config.yaml).".into());
    }
    let token_json: serde_json::Value = token_response
        .json()
        .await
        .map_err(|_| format!("{base} doesn't look like SillyTavern (no CSRF token answer)."))?;
    let token = token_json.get("token").and_then(|t| t.as_str()).unwrap_or("disabled").to_string();

    let url = format!("{base}{}", req.path);
    let mut builder = if req.method.eq_ignore_ascii_case("GET") {
        client.get(&url)
    } else {
        client.post(&url)
    };
    builder = with_auth(builder, &req).header("x-csrf-token", token);

    if let Some(file) = &req.file {
        let mut form = reqwest::multipart::Form::new().part(
            "avatar",
            reqwest::multipart::Part::bytes(file.bytes.clone()).file_name(file.file_name.clone()),
        );
        if let Some(fields) = &req.fields {
            for (key, value) in fields {
                form = form.text(key.clone(), value.clone());
            }
        }
        builder = builder.multipart(form);
    } else if let Some(json) = &req.json {
        builder = builder.json(json);
    }

    let response = builder.send().await.map_err(|e| format!("Request to SillyTavern failed: {e}"))?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response
        .bytes()
        .await
        .map_err(|e| format!("Reading SillyTavern's answer failed: {e}"))?
        .to_vec();
    Ok(StResponse { status, content_type, body })
}
