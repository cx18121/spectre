---
phase: 04-lobby-ux
reviewed: 2026-05-05T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - DESIGN.md
  - engine/engine-core/Cargo.toml
  - engine/engine-core/src/main.rs
  - engine/engine-core/src/room_manager.rs
findings:
  blocker: 2
  warning: 6
  total: 8
status: fixed
---

# Phase 04: Code Review Report

**Reviewed:** 2026-05-05
**Depth:** standard
**Files Reviewed:** 4
**Status:** fixed

## Summary

The phase adds a lobby + per-room landing page with QR-card sharing. The Rust code is generally clean and the test coverage of `POST /rooms` and `GET /rooms/{code}` is solid. However, the room-page HTML generator interpolates the `Host`-header-derived `base_url` (and the URLs derived from it) directly into HTML attributes and JavaScript string literals without any escaping. Combined with the fact that `public_base_url` consults the unvalidated `Host` header whenever `PUBLIC_URL` is unset, this constitutes a reflected-XSS vector during local-dev or any deployment where the `Host` header is not pinned by the proxy. There are also several robustness gaps (panic on QR overflow, malformed `ws://` when `PUBLIC_URL` lacks a scheme, inconsistent join URL between lobby and QR cards) that should be tightened.

## Blockers

### BLK-01: Reflected XSS in room page via unescaped `base_url` (Host header injection)

**Files:**
- `engine/engine-core/src/main.rs:45-58` (`public_base_url`)
- `engine/engine-core/src/main.rs:84-205` (`room_page_html` — interpolation sites)
- `engine/engine-core/src/main.rs:166-167, 172-173, 178-179` (interpolations into `href`, link text, and `onclick` JS string)

**Issue:**
`public_base_url` builds the page's base URL from the request `Host` header when `PUBLIC_URL` is not set. The returned string is concatenated into `p1_url`, `p2_url`, `overlay_url`, and `ws_url`, which are then interpolated raw into:

1. An `href` attribute: `<a href="{p1_url}" target="_blank" class="url-link">`
2. The visible link text: `>{p1_url}</a>`
3. A single-quoted JavaScript string literal inside an HTML `onclick` attribute: `onclick="copyLink(this, '{p1_url}')"`

None of these interpolations escape HTML metacharacters or JS string-terminating characters. The `Host` header is fully attacker-controlled (a victim can be sent a link with a custom `Host` via a misconfigured proxy, or an attacker can craft requests directly in any environment without a strict reverse proxy in front of the engine). A `Host` value such as
```
evil.com'),alert(document.cookie),copyLink(this,'x
```
turns into `https://evil.com'),alert(document.cookie),copyLink(this,'x` and breaks out of the JS string literal in the `onclick` handler, executing arbitrary JS in the origin of the SPECTRE app whenever the operator opens the room page.

The injection also works through the visible link text and `href` for HTML-context payloads: a `Host` containing `"><script>...` escapes the `href` attribute and injects script tags. The room-page handler returns 200 only for valid rooms, so the operator-facing page is the realistic target — but that page is exactly the one the host opens to share QR links, i.e. the highest-privilege user.

The mitigation noted in the plan ("Host header injection mitigated by PUBLIC_URL env var") only holds in production where the operator remembers to set `PUBLIC_URL`. The default code path (no env var) is wide open.

**Fix:**
Two layers — both should be applied:

1. HTML-escape every interpolated value before placing it into the template:
```rust
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
     .replace('\'', "&#39;")
}

// in room_page_html:
let p1_url_attr  = html_escape(&p1_url);
let p1_url_text  = html_escape(&p1_url);
// ...interpolate the *_attr/_text variants instead of raw URL strings.
```
For the `onclick` JS-string interpolation, prefer moving the URL into a `data-url` attribute and reading it from JS, which removes the dual HTML+JS escaping problem entirely:
```html
<button class="copy-btn" data-url="{p1_url_attr}">Copy Link</button>
<script>
  document.querySelectorAll('.copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      navigator.clipboard.writeText(btn.dataset.url).then(function() { /* ... */ });
    });
  });
</script>
```

2. Validate `Host` (or simply refuse to render a base URL from an unvetted Host header) — at minimum reject Host values that contain anything other than `[A-Za-z0-9.\-:]`:
```rust
fn public_base_url(headers: &HeaderMap) -> String {
    if let Ok(url) = std::env::var("PUBLIC_URL") {
        return url.trim_end_matches('/').to_string();
    }
    let host = headers.get("host").and_then(|v| v.to_str().ok()).unwrap_or("localhost:8000");
    let host_ok = !host.is_empty()
        && host.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b':');
    let host = if host_ok { host } else { "localhost:8000" };
    if host.starts_with("localhost") || host.starts_with("127.0.0.1") {
        format!("http://{}", host)
    } else {
        format!("https://{}", host)
    }
}
```

### BLK-02: `ws_url_from_http` silently produces a malformed URL when `PUBLIC_URL` lacks a scheme

**File:** `engine/engine-core/src/main.rs:61-67`

**Issue:**
`PUBLIC_URL` is treated as if it always carried a scheme:
```rust
fn ws_url_from_http(http_url: &str) -> String {
    if http_url.starts_with("https://") {
        http_url.replacen("https://", "wss://", 1)
    } else {
        http_url.replacen("http://", "ws://", 1)
    }
}
```
If an operator sets `PUBLIC_URL=spectre.example.com` (a very natural thing to do — the variable name does not say "include scheme"), `ws_url_from_http` returns the input unchanged. The QR-encoded URL becomes `spectre.example.com/mobile?server=spectre.example.com&room=ABCDEF&slot=1`, which mobile clients will fail to connect to. There is no validation, no warning, no error — the room page silently produces broken QR codes. Given that `PUBLIC_URL` is operator-supplied at deploy time and is not exercised in tests, this fails open: the production build "works" in CI but breaks on first deploy with a slightly-off env var.

**Fix:**
Validate the scheme at startup or inside `public_base_url`:
```rust
fn public_base_url(headers: &HeaderMap) -> String {
    if let Ok(url) = std::env::var("PUBLIC_URL") {
        let url = url.trim_end_matches('/').to_string();
        if !url.starts_with("http://") && !url.starts_with("https://") {
            tracing::error!("PUBLIC_URL must include scheme (http:// or https://): {}", url);
            // Fail fast or assume https — pick one and document it
            return format!("https://{}", url);
        }
        return url;
    }
    // ... fallback ...
}
```
Consider also asserting the scheme at server boot (`fn main`) so misconfiguration is caught immediately rather than on the first room page load.

## Warnings

### WR-01: `generate_qr_svg` panics if the fallback QR also fails to encode

**File:** `engine/engine-core/src/main.rs:71-81`

**Issue:**
```rust
let code = QrCode::new(url.as_bytes()).unwrap_or_else(|_| QrCode::new(b"error").unwrap());
```
The outer `unwrap_or_else` handles a too-large URL by falling back to encoding the literal bytes `b"error"`. The fallback is itself `unwrap()`-ed. While `QrCode::new(b"error")` is unlikely to fail, the failure mode here is "panic in an HTTP handler" — a single bad request can take the whole task down (axum will recover, but the user-facing failure is opaque). More importantly, the user gets a QR code that encodes the string `error` and silently points to nothing useful, with no log entry to indicate why.

**Fix:**
Return `Result<String, ...>` (or an `Option`) and have the caller render a placeholder card with an error message instead of a misleading QR code:
```rust
fn generate_qr_svg(url: &str) -> Result<String, qrcode::types::QrError> {
    use qrcode::QrCode;
    use qrcode::render::svg;
    let code = QrCode::new(url.as_bytes())?;
    Ok(code.render::<svg::Color>()
        .dark_color(svg::Color("#0c0809"))
        .light_color(svg::Color("#f5efe4"))
        .min_dimensions(160, 160)
        .max_dimensions(160, 160)
        .build())
}
```
At call sites, log the URL length and substitute a "QR unavailable" placeholder.

### WR-02: `qrcode` SVG output includes an `<?xml ?>` prolog inside HTML body

**File:** `engine/engine-core/src/main.rs:71-81` (renderer) and `:165, 171, 177` (embed sites)

**Issue:**
`qrcode` v0.14's `svg::Color` renderer emits `<?xml version="1.0" standalone="yes"?><svg ...>...</svg>`. Embedding an XML processing instruction inside an HTML body is non-standard. Browsers tolerate it today, but the prolog also prevents the SVG from being a valid HTML5 inline-SVG fragment. If a tool or a future Axum middleware ever sanitizes/parses the body, the prolog can break parsing.

**Fix:**
Strip the prolog before embedding:
```rust
let svg = generate_qr_svg(&p1_url);
let svg_inline = svg.split_once("?>").map(|(_, rest)| rest.trim_start()).unwrap_or(&svg).to_string();
```
Or use `qrcode`'s `to_image_builder` / custom renderer to build an `<svg>` element directly without the prolog.

### WR-03: Inconsistent server-param semantics between lobby join flow and QR card URLs

**File:** `engine/engine-core/src/main.rs:721-726` (lobby `joinRoom`) vs. `:86-88` (QR URL builder)

**Issue:**
The room page encodes `?server=<ws_url>` (e.g. `wss://host`) into the QR codes. The lobby's `joinRoom()` redirects to `/mobile?room=...&server=...` where `server` is `window.location.origin` — i.e. an `http(s)` origin, not a `ws(s)` URL. If the mobile client expects a WS-scheme `server` value (as the QR cards provide), the two entry points hand it different formats. Either the mobile code parses both, or one of these flows is broken. There is no test exercising the lobby's join redirect end-to-end.

**Fix:**
Pick one canonical format and use it everywhere. If `server` should always be a WS URL, transform it in the lobby JS:
```js
function joinRoom() {
  var code = document.getElementById('join-input').value.trim();
  if (!code) return;
  var origin = window.location.origin;
  var wsServer = origin.replace(/^https/, 'wss').replace(/^http/, 'ws');
  window.location.href = '/mobile?room=' + encodeURIComponent(code)
    + '&server=' + encodeURIComponent(wsServer)
    + '&slot=1';
}
```
Also note the QR cards include `&slot=1` / `&slot=2` while the lobby join does not include any slot — confirm the mobile client handles a missing slot or fix the lobby.

### WR-04: `to_ascii_uppercase()` on the room-code path does not validate length or charset

**File:** `engine/engine-core/src/main.rs:248-265` (`get_room_page`)

**Issue:**
`Path<String>` accepts arbitrary path content (URL-decoded). The handler only normalizes case before lookup. While the DashMap lookup will fail for any non-stored code (so it will not collide with a real room), the upper-cased code is still echoed into `<title>Room {code} — SPECTRE</title>` and the body when a room *does* exist. Today the only path to insert a key into the map is `create_room`, which generates 6-char alphanumeric codes server-side, so practically the `code` reflected onto the page is bounded. But that invariant lives in `create_room`, not at the read site; if anyone later adds a code-injection path (e.g. accepting a client-chosen vanity code), this becomes a stored XSS sink. Same applies to `game_type`, which is taken from the query param at create time and stored verbatim — `?game=boxing` is currently the only working value, but the path still flows unescaped into the HTML.

**Fix:**
HTML-escape `code` and `game_type_upper` before formatting (same `html_escape` helper from BLK-01):
```rust
let html = room_page_html(&html_escape(&code_upper), &html_escape(&game_type), &base_url);
```
And/or validate at the read boundary:
```rust
if code_upper.len() != 6 || !code_upper.chars().all(|c| c.is_ascii_alphanumeric()) {
    let html = room_not_found_html();
    return (StatusCode::NOT_FOUND, axum::response::Html(html));
}
```

### WR-05: `room_page_html` interpolates `p*_url` as both `code = code` and inside an `onclick` JS string — fragile escaping coupling

**File:** `engine/engine-core/src/main.rs:93-205`

**Issue:**
Even after BLK-01 is fixed by HTML-escaping, the `onclick="copyLink(this, '{p1_url}')"` site still requires *both* HTML-attribute escaping *and* JS-string escaping. A correctly HTML-escaped string can still terminate a JS single-quoted string if it contains `&#39;` decoded back to `'`. Mixing two escaping contexts in one expression is a known foot-gun — even if it's safe today (URLs from base-url + alphanumeric codes), it is not robust against future changes (someone adding a "vanity slug" or adding a fragment with apostrophes). The `data-url` attribute approach (BLK-01 fix sketch) avoids this entire class of bug.

**Fix:**
Move per-card URLs into `data-` attributes and look them up from JS instead of inlining them inside `onclick`:
```html
<button class="copy-btn" data-copy-url="{p1_url_attr}">Copy Link</button>
```
Wire a single `addEventListener('click', ...)` on `document` that reads `e.target.dataset.copyUrl`. This eliminates the JS-in-HTML-attribute escaping requirement entirely.

### WR-06: `expiry_task` calls `is_expired()` while holding a `dashmap::iter()` shard lock

**File:** `engine/engine-core/src/room_manager.rs:200-216`

**Issue:**
```rust
let expired_codes: Vec<String> = rooms
    .iter()
    .filter(|entry| entry.value().is_expired())
    .map(|entry| entry.key().clone())
    .collect();
```
`is_expired()` acquires `self.last_player_disconnected_at.lock().unwrap()` (a `std::sync::Mutex`). The `dashmap::iter()` holds a read lock on each shard while the iterator's current entry is alive, so for the duration of the `.filter()` predicate this task is holding both a DashMap shard read-lock *and* a per-room `std::sync::Mutex`. Any caller that takes those locks in the opposite order risks a deadlock. Today nothing else takes both, but this is an unstable invariant. A panic inside `is_expired()` while the mutex is held will also poison it (`.lock().unwrap()` then panics for every subsequent room).

**Fix:**
Snapshot the codes first, then test expiry without holding shard locks:
```rust
let candidates: Vec<String> = rooms.iter().map(|e| e.key().clone()).collect();
let expired_codes: Vec<String> = candidates
    .into_iter()
    .filter(|code| rooms.get(code).map(|h| h.is_expired()).unwrap_or(false))
    .collect();
```
This releases each shard lock before grabbing the per-room mutex. Also consider `Mutex::lock().ok()` to avoid panics propagating from a poisoned lock.

## Notes

- `engine/engine-core/Cargo.toml:29` — `qrcode = { version = "0.14", default-features = false, features = ["svg"] }` is correctly minimized; the `image` default feature is not pulled in.
- `engine/engine-core/src/main.rs:752-758` — pre-generating the random initial code instead of passing `""` into `create_room` is the correct fix and is well-tested by `post_rooms_never_returns_empty_code`.
- The room-not-found page (`room_not_found_html`) is a static `&'static str` returned from `String::from`; consider returning the `&'static str` directly via `Html(&'static str)` to avoid the allocation, but this is purely cosmetic.
- DESIGN.md `## Lobby` is documentation only; the existing typo `rgba(accen-rgb, 0.35)` on line 68 is pre-existing and out of scope for this phase.

---

_Reviewed: 2026-05-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
