import requests
import json
import time

BASE_URL = "http://localhost:3000"
results = {
    "passed": 0,
    "failed": 0,
    "details": []
}

def log_test(name, passed, detail):
    status = "PASS" if passed else "FAIL"
    if passed:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"name": name, "status": status, "detail": detail})
    print(f"[{status}] {name}: {detail}")

print("=== STARTING RUANG-SAKU SECURITY TESTING SUITE ===")

# 1. Security Headers
try:
    r = requests.get(f"{BASE_URL}/", timeout=5)
    headers = r.headers
    x_frame = headers.get("X-Frame-Options")
    x_content = headers.get("X-Content-Type-Options")
    csp = headers.get("Content-Security-Policy")
    
    sec_headers_ok = (x_content == "nosniff")
    log_test(
        "Security Headers: X-Content-Type-Options", 
        sec_headers_ok, 
        f"Value: {x_content}"
    )
    log_test(
        "Security Headers: X-Frame-Options", 
        bool(x_frame), 
        f"Value: {x_frame}"
    )
    log_test(
        "Security Headers: Content-Security-Policy", 
        bool(csp), 
        f"Present: {bool(csp)}"
    )
except Exception as e:
    log_test("Security Headers", False, str(e))

# 2. Auth Boundaries (Protected routes must return 401 or redirect)
protected_endpoints = [
    ("/api/admin/health", [401, 403, 302, 307]),
    ("/api/admin/users", [401, 403, 302, 307]),
    ("/api/admin/migrate", [401, 403, 405, 302, 307]),
    ("/api/transactions", [401, 403, 302, 307]),
    ("/api/accounts", [401, 403, 302, 307]),
    ("/api/transfers", [401, 403, 405, 302, 307]),
    ("/api/debts", [401, 403, 302, 307]),
    ("/api/bills", [401, 403, 302, 307]),
    ("/app", [302, 307, 200]) # if 302/307 to login or client-auth gate
]

for ep, valid_codes in protected_endpoints:
    try:
        r = requests.get(f"{BASE_URL}{ep}", allow_redirects=False, timeout=5)
        passed = r.status_code in valid_codes
        log_test(f"Auth Boundary: GET {ep}", passed, f"Status: {r.status_code} (Expected: {valid_codes})")
    except Exception as e:
        log_test(f"Auth Boundary: GET {ep}", False, str(e))

# 3. Error Leakage on Malformed Input (Admin Health & Transactions)
try:
    r = requests.post(f"{BASE_URL}/api/transfers", json={"invalid": "payload"}, timeout=5)
    body = r.text
    has_leak = any(k in body.lower() for k in ["sql", "tidb", "mysql", "syntax error", "stack", "traceback"])
    log_test("Error Leakage: POST /api/transfers malformed", not has_leak and r.status_code in [400, 401, 403], f"Status: {r.status_code}, DB leak: {has_leak}")
except Exception as e:
    log_test("Error Leakage: POST /api/transfers", False, str(e))

# 4. Anti-SSRF & Payload Size Cap in /api/scan-receipt
try:
    # Test internal IP SSRF attempt
    r = requests.post(
        f"{BASE_URL}/api/scan-receipt", 
        json={"imageUrl": "http://127.0.0.1:3000/internal-secret"}, 
        timeout=5
    )
    ssrf_blocked = r.status_code in [400, 401, 403]
    log_test("Anti-SSRF: Internal IP URL rejection", ssrf_blocked, f"Status: {r.status_code}, Body: {r.text[:80]}")
except Exception as e:
    log_test("Anti-SSRF: Internal IP URL rejection", False, str(e))

try:
    # Test oversized payload (> 6.7M chars)
    giant_string = "data:image/png;base64," + ("A" * (7 * 1024 * 1024))
    r = requests.post(
        f"{BASE_URL}/api/scan-receipt", 
        json={"imageBase64": giant_string}, 
        timeout=10
    )
    size_capped = r.status_code in [400, 401, 413]
    log_test("Payload Cap: Oversized image payload rejection", size_capped, f"Status: {r.status_code}, Body: {r.text[:80]}")
except Exception as e:
    log_test("Payload Cap: Oversized image payload rejection", False, str(e))

# 5. Rate Limiting Check on Webhook (/api/webhooks/bank)
try:
    # Send rapid requests with fake token
    rate_limited = False
    status_codes = []
    for i in range(15):
        r = requests.post(
            f"{BASE_URL}/api/webhooks/bank", 
            json={"sms": f"TEST {i}", "token": "invalid_token_123"},
            timeout=3
        )
        status_codes.append(r.status_code)
        if r.status_code == 429:
            rate_limited = True
            break
        time.sleep(0.05)
    
    # 401/403 or 429 means protected
    properly_handled = all(s in [401, 403, 429] for s in status_codes)
    log_test("Rate Limiting & Auth: Webhook endpoint protection", properly_handled, f"Status codes seen: {set(status_codes)}")
except Exception as e:
    log_test("Rate Limiting & Auth: Webhook endpoint protection", False, str(e))

# 6. CORS Origin Check
try:
    headers = {"Origin": "https://malicious-attacker.com"}
    r = requests.get(f"{BASE_URL}/api/transactions", headers=headers, timeout=5)
    acao = r.headers.get("Access-Control-Allow-Origin")
    cors_safe = acao != "*" and acao != "https://malicious-attacker.com"
    log_test("CORS Policy: Untrusted Origin Reflection", cors_safe, f"ACAO Header: {acao}")
except Exception as e:
    log_test("CORS Policy: Untrusted Origin Reflection", False, str(e))

print(f"\n=== SUMMARY: {results['passed']} PASSED, {results['failed']} FAILED ===")
