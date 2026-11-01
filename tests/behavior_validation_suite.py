import requests
import json
import time
import concurrent.futures

BASE_URL = "http://localhost:3000"

print("=== RUNNING BEHAVIOR VALIDATION SUITE (TAHAP 3) ===")

results = []

def record(clause_id, name, passed, detail):
    status = "PASS" if passed else "FAIL"
    results.append({"clause": clause_id, "name": name, "status": status, "detail": detail})
    print(f"[{status}] Clause {clause_id} - {name}: {detail}")

# --- CLAUSE 1: PWA & Metadata Contract ---
try:
    r = requests.get(f"{BASE_URL}/manifest.webmanifest", timeout=3)
    if r.status_code == 200:
        data = r.json()
        has_pwa = "name" in data and "start_url" in data and data.get("display") == "standalone"
        record("1.1", "PWA Manifest Specification", has_pwa, f"HTTP 200, display: {data.get('display')}, name: {data.get('name')}")
    else:
        record("1.1", "PWA Manifest Specification", False, f"Status: {r.status_code}")
except Exception as e:
    record("1.1", "PWA Manifest Specification", False, str(e))

try:
    r = requests.get(f"{BASE_URL}/robots.txt", timeout=3)
    record("1.2", "Robots.txt Presence", r.status_code == 200, f"HTTP {r.status_code}, Length: {len(r.text)} chars")
except Exception as e:
    record("1.2", "Robots.txt Presence", False, str(e))

# --- CLAUSE 2: Route Dispatching & HTTP Method Adherence ---
try:
    r = requests.get(f"{BASE_URL}/api/nonexistent_route_987", timeout=3)
    record("2.1", "404 Not Found Handling (Non-existent API)", r.status_code == 404, f"HTTP {r.status_code}")
except Exception as e:
    record("2.1", "404 Not Found Handling", False, str(e))

try:
    r = requests.delete(f"{BASE_URL}/api/admin/health", timeout=3)
    record("2.2", "HTTP Method Disallowance (DELETE /api/admin/health)", r.status_code in [401, 403, 405], f"HTTP {r.status_code}")
except Exception as e:
    record("2.2", "HTTP Method Disallowance", False, str(e))

# --- CLAUSE 3: Input Boundary & Anti-Crash Probes ---
try:
    # Send broken JSON syntax to endpoint
    headers = {"Content-Type": "application/json"}
    r = requests.post(f"{BASE_URL}/api/webhooks/bank", data="{ bad json string --- ", headers=headers, timeout=3)
    not_crashed = r.status_code in [400, 401, 403, 429, 500] and r.status_code != 0
    record("3.1", "Malformed JSON Resilience", not_crashed, f"HTTP {r.status_code} (Gracefully rejected without process exit)")
except Exception as e:
    record("3.1", "Malformed JSON Resilience", False, str(e))

try:
    # Send empty body on POST endpoint
    r = requests.post(f"{BASE_URL}/api/transactions", headers={"Content-Type": "application/json"}, data="", timeout=3)
    record("3.2", "Empty POST Body Rejection", r.status_code in [400, 401, 403], f"HTTP {r.status_code}")
except Exception as e:
    record("3.2", "Empty POST Body Rejection", False, str(e))

# --- CLAUSE 4: Concurrency & Stress Resilience (50 concurrent requests) ---
urls = [f"{BASE_URL}/" for _ in range(25)] + [f"{BASE_URL}/login" for _ in range(25)]
start_time = time.time()
status_counter = {}

def fetch(url):
    try:
        res = requests.get(url, timeout=5)
        return res.status_code
    except Exception as err:
        return str(err)

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
    futures = [executor.submit(fetch, u) for u in urls]
    for f in concurrent.futures.as_completed(futures):
        c = f.result()
        status_counter[c] = status_counter.get(c, 0) + 1

elapsed = time.time() - start_time
avg_latency_ms = (elapsed / len(urls)) * 1000

passed_concurrency = all(isinstance(c, int) and c in [200, 307] for c in status_counter.keys())
record(
    "4.1", 
    "Concurrency & Burst Handling (50 parallel requests)", 
    passed_concurrency, 
    f"StatusCodes: {status_counter}, Total: {elapsed:.2f}s, Avg: {avg_latency_ms:.1f}ms/req"
)

# --- CLAUSE 5: Server Health Check Post-Stress ---
try:
    r = requests.get(f"{BASE_URL}/", timeout=3)
    record("5.1", "Server Daemon Availability Post-Stress", r.status_code == 200, f"HTTP {r.status_code} - Server alive and healthy")
except Exception as e:
    record("5.1", "Server Daemon Availability Post-Stress", False, str(e))

print("\n=== BEHAVIOR VALIDATION COMPLETE ===")
passed_count = sum(1 for r in results if r["status"] == "PASS")
failed_count = sum(1 for r in results if r["status"] == "FAIL")
print(f"Total Clauses: {len(results)} | Passed: {passed_count} | Failed: {failed_count}")
