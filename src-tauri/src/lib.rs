use std::fs;
use std::time::Duration;

/// Reads an arbitrary file from disk as raw bytes. Used for both PNG and JSON cards — the
/// frontend decides how to interpret the bytes (PNG chunk codec vs. UTF-8 JSON text).
/// Runs as a plain Tauri command (not a scoped plugin), so it isn't subject to the fs plugin's
/// path-allowlist: the path always comes from a native file-picker dialog the user just
/// interacted with, so an unrestricted read here doesn't grant anything the user didn't already
/// choose.
#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("File could not be read: {e}"))
}

/// Writes raw bytes to an arbitrary path on disk. Same trust rationale as `read_binary_file`:
/// the path is always one the user picked via a save dialog, or derived from one (e.g. the
/// `backups/` subfolder next to it) — never user-typed free text.
/// Creates the parent directory first: a no-op for normal saves (the dialog only offers
/// existing folders), but required for auto-backup writes into `backups/` on first use.
#[tauri::command]
fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    let target = std::path::Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Folder could not be created: {e}"))?;
    }
    fs::write(target, data).map_err(|e| format!("File could not be written: {e}"))
}

/// Lists the plain filenames (not full paths — the frontend joins them back onto `path` itself)
/// of every regular file directly inside `path` (non-recursive). Used to bulk-open every card in
/// a user-chosen folder as tabs; same trust rationale as `read_binary_file` — the folder always
/// comes from a native picker the user just interacted with.
#[tauri::command]
fn list_dir_files(path: String) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("Folder could not be read: {e}"))?;
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Folder entry could not be read: {e}"))?;
        if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            if let Some(name) = entry.file_name().to_str() {
                files.push(name.to_string());
            }
        }
    }
    Ok(files)
}

/// Deletes an arbitrary path on disk, treating "already gone" as success (idempotent). Same trust
/// rationale as `read_binary_file`/`write_binary_file`. Used to clear a character tab's autosave
/// snapshot once its tab is closed — the snapshot's job is done at that point, whether or not one
/// was ever written for it.
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("File could not be deleted: {e}")),
    }
}

#[derive(serde::Deserialize)]
struct ChatCompletionRequest {
    base_url: String,
    api_key: Option<String>,
    model: String,
    messages: Vec<serde_json::Value>,
    json_schema: serde_json::Value,
    #[serde(default)]
    temperature: Option<f64>,
    #[serde(default)]
    max_tokens: Option<u32>,
}

#[derive(serde::Serialize)]
struct ChatCompletionResult {
    content: String,
}

async fn post_chat_completion(
    client: &reqwest::Client,
    url: &str,
    req: &ChatCompletionRequest,
    response_format: serde_json::Value,
) -> Result<(reqwest::StatusCode, String), String> {
    let mut body = serde_json::json!({
        "model": req.model,
        "messages": req.messages,
        "response_format": response_format,
    });
    if let Some(t) = req.temperature {
        body["temperature"] = serde_json::json!(t);
    }
    if let Some(m) = req.max_tokens {
        body["max_tokens"] = serde_json::json!(m);
    }

    let mut builder = client.post(url).json(&body);
    if let Some(key) = req.api_key.as_deref().filter(|k| !k.is_empty()) {
        builder = builder.bearer_auth(key);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("Request to {url} failed: {e}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Response could not be read: {e}"))?;
    Ok((status, text))
}

fn extract_content(status: reqwest::StatusCode, text: &str) -> Result<String, String> {
    if !status.is_success() {
        let snippet: String = text.chars().take(500).collect();
        return Err(format!("Server responded with {status}: {snippet}"));
    }

    let parsed: serde_json::Value = serde_json::from_str(text)
        .map_err(|e| format!("Response was not valid JSON: {e}"))?;

    parsed
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .map(|c| c.to_string())
        .ok_or_else(|| {
            let snippet: String = text.chars().take(500).collect();
            format!("Unexpected response format: {snippet}")
        })
}

/// Calls an OpenAI-compatible `/v1/chat/completions` endpoint. Deliberately provider-agnostic:
/// this command doesn't know anything about character-card fields, it just forwards whatever
/// `messages`/`json_schema` the frontend built and hands back the raw assistant message text —
/// parsing that text against a Zod schema happens on the TS side.
///
/// A hand-rolled command (reqwest) instead of `tauri-plugin-http`: the base URL is a user-typed
/// runtime setting (local server or cloud), which doesn't fit the http plugin's static
/// capability-scoped URL allowlist. A Rust command's own outbound requests aren't subject to
/// Tauri's ACL/capabilities at all, so this needs no new capability entry (same trust rationale
/// as `read_binary_file`/`write_binary_file` above).
///
/// Tries strict schema-constrained decoding (`response_format: json_schema`) first, since local
/// llama.cpp-based servers can genuinely guarantee the shape that way. Verified against the real
/// DeepSeek API that not every OpenAI-compatible provider supports this yet — DeepSeek rejects it
/// with an error mentioning "response_format" — in which case this retries once with the older,
/// more widely supported `json_object` mode (valid JSON syntax guaranteed, but not the exact
/// field set), which the TS-side Zod validation in `aiClient.ts` checks regardless.
#[tauri::command]
async fn ai_chat_completion(req: ChatCompletionRequest) -> Result<ChatCompletionResult, String> {
    // A heavy local model with most layers on CPU can take several minutes for one reply (a real
    // Magnum-v4-72B run took ~360s for a two-field patch) — 120s cut those off mid-generation.
    // 900s comfortably covers observed local runs while still bounding a genuinely hung request.
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(900))
        .build()
        .map_err(|e| format!("HTTP client could not be created: {e}"))?;

    let url = format!("{}/v1/chat/completions", req.base_url.trim_end_matches('/'));

    let schema_format = serde_json::json!({
        "type": "json_schema",
        "json_schema": req.json_schema,
    });
    let (status, text) = post_chat_completion(&client, &url, &req, schema_format).await?;

    if !status.is_success() && text.to_lowercase().contains("response_format") {
        let (status, text) =
            post_chat_completion(&client, &url, &req, serde_json::json!({ "type": "json_object" })).await?;
        return Ok(ChatCompletionResult {
            content: extract_content(status, &text)?,
        });
    }

    Ok(ChatCompletionResult {
        content: extract_content(status, &text)?,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_binary_file,
            write_binary_file,
            list_dir_files,
            delete_file,
            ai_chat_completion
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
