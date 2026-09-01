"""
Vittoria HR — PythonAnywhere (Flask) port of the cloud bridge.

Serves BOTH the API and the built frontend from one free web app:
    GET  /                 → dist/index.html (static app)
    POST /api/ops          → database bridge (same wire protocol as Netlify/CF/Vercel)
    POST /api/mail         → Gmail SMTP via smtplib (native TCP — works on PA)

Config (either env vars or server/pa_config.py):
    DATABASE_URL   required — postgres://user:pass@host/db?sslmode=require
    SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM_NAME  (optional)

PythonAnywhere free tier note: outbound connections are whitelist-only.
Neon/Netlify-DB hosts are NOT whitelisted, so the free tier can serve the
app + SMTP but the DB needs the $5 tier (or a whitelisted Postgres).
"""
import json
import os
import smtplib
import ssl
import time
from email.message import EmailMessage

from flask import Flask, jsonify, request, send_from_directory

try:
    import psycopg2
except ImportError:  # pragma: no cover
    psycopg2 = None

try:
    from pa_config import *  # noqa: F401,F403  — optional local overrides
except ImportError:
    pass

DATABASE_URL = (
    os.environ.get("DATABASE_URL")
    or globals().get("DATABASE_URL")
    or os.environ.get("POSTGRES_URL")
    or globals().get("POSTGRES_URL")
)
SMTP_HOST = os.environ.get("SMTP_HOST", globals().get("SMTP_HOST", "smtp.gmail.com"))
SMTP_PORT = int(os.environ.get("SMTP_PORT", globals().get("SMTP_PORT", 465)))
SMTP_USER = os.environ.get("SMTP_USER", globals().get("SMTP_USER", ""))
SMTP_PASS = os.environ.get("SMTP_PASS", globals().get("SMTP_PASS", ""))
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", globals().get("SMTP_FROM_NAME", "Vittoria HR"))

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.environ.get("VITTORIA_DIST", os.path.join(os.path.dirname(HERE), "dist"))
SCHEMA_VERSION = "4"
PRESENCE_WINDOW_MS = 3 * 60 * 1000

# key → (table, pk, [(prop, column, kind), ...])  — mirrors src/lib/sql/bridge.ts
T = "t"; I = "i"; R = "r"; J = "j"; B = "b"
SPECS = {
    "company": ("companies", "id", [
        ("id", "id", T), ("name", "name", T), ("shortName", "short_name", T), ("address", "address", T),
        ("appName", "app_name", T), ("appTagline", "app_tagline", T), ("logo", "logo", T), ("brand", "brand", T),
        ("maintenance", "maintenance", B), ("deviceBinding", "device_binding", B),
        ("announcement", "announcement", J), ("holidays", "holidays", J)]),
    "sites": ("sites", "id", [
        ("id", "id", T), ("name", "name", T), ("shortName", "short_name", T), ("address", "address", T),
        ("hqLat", "hq_lat", R), ("hqLon", "hq_lon", R), ("radiusM", "radius_m", I), ("color", "color", T)]),
    "employees": ("employees", "staff_id", [
        ("staffId", "staff_id", T), ("nik", "nik", T), ("name", "name", T), ("email", "email", T),
        ("password", "password", T), ("phone", "phone", T), ("address", "address", T),
        ("emergencyName", "emergency_name", T), ("emergencyPhone", "emergency_phone", T),
        ("department", "department", T), ("position", "position", T), ("role", "role", T),
        ("shiftId", "shift_id", T), ("status", "status", T), ("salary", "salary", J), ("siteId", "site_id", T),
        ("photo", "photo", T), ("descriptor", "descriptor", J), ("hash", "hash", T),
        ("deviceId", "device_id", T), ("deviceBoundAt", "device_bound_at", I), ("createdAt", "created_at", I)]),
    "logs": ("attendance_logs", "id", [
        ("id", "id", T), ("ts", "ts", I), ("staffId", "staff_id", T), ("name", "name", T),
        ("department", "department", T), ("siteId", "site_id", T), ("type", "type", T),
        ("lat", "lat", R), ("lon", "lon", R), ("distanceM", "distance_m", R), ("faceDist", "face_dist", R),
        ("method", "method", T), ("source", "source", T), ("status", "status", T), ("reason", "reason", T),
        ("lateMin", "late_min", I), ("overtimeMin", "overtime_min", I), ("workMin", "work_min", I), ("photo", "photo", T)]),
    "leaves": ("leaves", "id", [
        ("id", "id", T), ("staffId", "staff_id", T), ("name", "name", T), ("type", "type", T),
        ("date", "date", T), ("days", "days", I), ("reason", "reason", T), ("attachment", "attachment", J),
        ("status", "status", T), ("managerDecision", "manager_decision", J), ("hrDecision", "hr_decision", J),
        ("createdAt", "created_at", I)]),
    "shifts": ("shifts", "id", [
        ("id", "id", T), ("name", "name", T), ("start", "start", T), ("end", "end", T),
        ("graceMin", "grace_min", I), ("color", "color", T)]),
    "org": ("org_nodes", "id", [
        ("id", "id", T), ("parentId", "parent_id", T), ("siteId", "site_id", T), ("title", "title", T),
        ("staffId", "staff_id", T), ("name", "name", T), ("note", "note", T), ("createdAt", "created_at", I)]),
    "board": ("board_posts", "id", [
        ("id", "id", T), ("siteId", "site_id", T), ("title", "title", T), ("body", "body", T),
        ("tone", "tone", T), ("createdBy", "created_by", T), ("createdAt", "created_at", I), ("acks", "acks", J)]),
    "departments": ("departments", "name", [("name", "name", T)]),
    "quotas": ("leave_quotas", "type", [("type", "type", T), ("days", "days", I)]),
    "salarydefaults": ("salary_defaults", "role", [
        ("role", "role", T), ("basic", "basic", I), ("transport", "transport", I), ("meal", "meal", I), ("otPerHour", "ot_per_hour", I)]),
    "audits": ("audit_logs", "id", [
        ("id", "id", T), ("ts", "ts", I), ("actorId", "actor_id", T), ("actorName", "actor_name", T),
        ("role", "role", T), ("action", "action", T), ("target", "target", T), ("detail", "detail", T)]),
    "notifs": ("notifications", "id", [
        ("id", "id", T), ("staffId", "staff_id", T), ("title", "title", T), ("body", "body", T),
        ("tone", "tone", T), ("ts", "ts", I), ("read", "read", B)]),
    "breaks": ("breaks", "id", [
        ("id", "id", T), ("staffId", "staff_id", T), ("day", "day", T), ("start", "start", I), ("end", "end", I)]),
    "resets": ("resets", "token", [
        ("token", "token", T), ("staffId", "staff_id", T), ("email", "email", T), ("exp", "exp", I), ("used", "used", B)]),
}
KIND_SQL = {T: "TEXT", I: "BIGINT", R: "DOUBLE PRECISION", J: "JSONB", B: "BOOLEAN"}

app = Flask(__name__, static_folder=None)


def q(ident):
    return '"%s"' % str(ident).replace('"', "")


def to_db(v, kind):
    if v is None:
        return None
    if kind == J:
        return json.dumps(v, ensure_ascii=False)
    if kind == B:
        return bool(v)
    if kind in (I, R):
        return float(v) if kind == R else int(v)
    return str(v)


def to_prop(v, kind):
    if v is None:
        return None
    if kind == J:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return None
        return v
    if kind == B:
        return bool(v)
    if kind in (I, R):
        return float(v)
    return str(v)


def conn():
    return psycopg2.connect(DATABASE_URL)


def run(sql, params=()):
    with conn() as c:
        with c.cursor() as cur:
            cur.execute(sql, params)
            c.commit()


def fetch(sql, params=()):
    with conn() as c:
        with c.cursor() as cur:
            cur.execute(sql, params)
            cols = [d[0] for d in cur.description] if cur.description else []
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def table_exists(name):
    rows = fetch("SELECT to_regclass(%s) AS r", (name,))
    return bool(rows and rows[0]["r"])


def bump_rev(key):
    run('INSERT INTO "meta" ("k","v") VALUES (%s,%s) ON CONFLICT ("k") DO UPDATE SET "v" = EXCLUDED."v"',
        ("rev:" + key, str(int(time.time() * 1000))))


def presence_rows():
    rows = fetch('SELECT * FROM "device_presence" WHERE "ts" > %s ORDER BY "ts" DESC',
                 (int(time.time() * 1000) - PRESENCE_WINDOW_MS,))
    return [{
        "deviceId": str(r.get("device_id") or ""), "staffId": r.get("staff_id"),
        "name": str(r.get("staff_name") or ""), "role": str(r.get("role") or ""),
        "siteId": r.get("site_id"), "siteName": r.get("site_name"), "lastSeen": int(r.get("ts") or 0),
    } for r in rows]


# ------------------------------- API routes --------------------------------
@app.post("/api/ops")
def ops():
    if not request.headers.get("x-vittoria-session"):
        return jsonify(ok=False, error="Sesi tidak ditemukan."), 401
    if not DATABASE_URL:
        return jsonify(ok=False, error="DATABASE_URL belum ada — set di pa_config.py atau env."), 500
    body = request.get_json(silent=True) or {}
    op = body.get("op")
    try:
        if op in ("stats", "presence", "ping"):
            run('CREATE TABLE IF NOT EXISTS "meta" ("k" TEXT PRIMARY KEY, "v" TEXT)')
            run('CREATE TABLE IF NOT EXISTS "device_presence" ("device_id" TEXT PRIMARY KEY, "staff_id" TEXT, '
                '"staff_name" TEXT, "role" TEXT, "site_id" TEXT, "site_name" TEXT, "ts" BIGINT)')

        if op == "init":
            run('CREATE TABLE IF NOT EXISTS "meta" ("k" TEXT PRIMARY KEY, "v" TEXT)')
            run('CREATE TABLE IF NOT EXISTS "device_presence" ("device_id" TEXT PRIMARY KEY, "staff_id" TEXT, '
                '"staff_name" TEXT, "role" TEXT, "site_id" TEXT, "site_name" TEXT, "ts" BIGINT)')
            for key, (table, pk, cols) in SPECS.items():
                ddl = ", ".join('%s %s' % (q(c), KIND_SQL[k]) for _, c, k in cols)
                run('CREATE TABLE IF NOT EXISTS %s (%s, PRIMARY KEY (%s))' % (q(table), ddl, q(pk)))
            run('INSERT INTO "meta" ("k","v") VALUES (%s,%s),(%s,%s) ON CONFLICT ("k") DO UPDATE SET "v" = EXCLUDED."v"',
                ("schema_version", SCHEMA_VERSION, "created_at", str(int(time.time() * 1000))))
            return jsonify(ok=True, schema_version=SCHEMA_VERSION, tables=len(SPECS))

        if op == "pull":
            keys = body.get("keys") or list(SPECS.keys())
            data, counts, total, ready = {}, {}, 0, True
            for key in keys:
                if key not in SPECS:
                    continue
                table, _, cols = SPECS[key]
                if not table_exists(table):
                    ready = False
                    counts[key] = 0
                    data[key] = []
                    continue
                rows = fetch("SELECT * FROM %s" % q(table))
                data[key] = [{p: to_prop(r.get(c), k) for p, c, k in cols} for r in rows]
                counts[key] = len(data[key])
                total += counts[key]
            version = None
            try:
                v = fetch('SELECT "v" FROM "meta" WHERE "k"=%s', ("schema_version",))
                version = v[0]["v"] if v else None
            except Exception:
                pass
            return jsonify(ok=True, ready=ready, hasData=total > 0, rows=total, counts=counts, data=data, version=version)

        if op in ("sync", "remove", "clear"):
            key = body.get("key")
            if key not in SPECS:
                return jsonify(ok=False, error='Tabel "%s" tidak dikenal.' % key), 400
            table, pk, cols = SPECS[key]
            if not table_exists(table):
                return jsonify(ok=False, error="Skema belum dibuat — jalankan op:init dulu."), 409
            if op == "sync":
                rows = body.get("rows")
                if not isinstance(rows, list):
                    return jsonify(ok=False, error="rows harus array."), 400
                if not rows:
                    bump_rev(key)
                    return jsonify(ok=True, affected=0)
                col_sql = ", ".join(q(c) for _, c, _ in cols)
                set_sql = ", ".join('%s = EXCLUDED.%s' % (q(c), q(c)) for _, c, _ in cols if c != pk) or '%s = EXCLUDED.%s' % (q(pk), q(pk))
                width = len(cols)
                chunk = max(1, 60000 // width)
                affected = 0
                for i in range(0, len(rows), chunk):
                    batch = rows[i:i + chunk]
                    params = []
                    tuples = []
                    for row in batch:
                        marks = []
                        for p, _, k in cols:
                            params.append(to_db(row.get(p), k))
                            marks.append("%s" if False else "%s")
                        placeholders = ", ".join(["%s"] * width)
                        tuples.append("(" + placeholders + ")")
                    sql = ('INSERT INTO %s (%s) VALUES %s ON CONFLICT (%s) DO UPDATE SET %s'
                           % (q(table), col_sql, ", ".join(tuples), q(pk), set_sql))
                    run(sql, params)
                    affected += len(batch)
                bump_rev(key)
                return jsonify(ok=True, affected=affected)
            if op == "remove":
                ids = body.get("ids") or []
                if not ids:
                    return jsonify(ok=True, affected=0)
                run('DELETE FROM %s WHERE %s = ANY(%s)' % (q(table), q(pk), "%s"), ([str(i) for i in ids],))
                bump_rev(key)
                return jsonify(ok=True, affected=len(ids))
            run('DELETE FROM %s' % q(table))
            bump_rev(key)
            return jsonify(ok=True)

        if op == "stats":
            total, tables, counts = 0, 0, {}
            for key, (table, _, _) in SPECS.items():
                if not table_exists(table):
                    counts[key] = 0
                    continue
                tables += 1
                c = fetch('SELECT COUNT(*)::int AS c FROM %s' % q(table))
                counts[key] = int(c[0]["c"])
                total += counts[key]
            revs = {str(r["k"])[4:]: str(r["v"]) for r in fetch('SELECT "k","v" FROM "meta" WHERE "k" LIKE %s', ("rev:%",))}
            version = None
            try:
                v = fetch('SELECT "v" FROM "meta" WHERE "k"=%s', ("schema_version",))
                version = v[0]["v"] if v else None
            except Exception:
                pass
            ver = fetch("SELECT version() AS v")[0]["v"].split(", compiled")[0].split(" on ")[0]
            return jsonify(ok=True, rows=total, tables=tables, version=version, revs=revs,
                           counts=counts, server_version=ver, presence_active=presence_rows())

        if op == "presence":
            if body.get("deviceId"):
                run('INSERT INTO "device_presence" ("device_id","staff_id","staff_name","role","site_id","site_name","ts") '
                    'VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT ("device_id") DO UPDATE SET "staff_id"=EXCLUDED."staff_id",'
                    '"staff_name"=EXCLUDED."staff_name","role"=EXCLUDED."role","site_id"=EXCLUDED."site_id",'
                    '"site_name"=EXCLUDED."site_name","ts"=EXCLUDED."ts"',
                    (str(body.get("deviceId")), body.get("staffId"), str(body.get("name") or ""),
                     str(body.get("role") or ""), body.get("siteId"), body.get("siteName"), int(time.time() * 1000)))
            return jsonify(ok=True, presence_active=presence_rows())

        if op == "ping":
            t0 = time.time()
            ver = fetch("SELECT version() AS v")[0]["v"].split(", compiled")[0].split(" on ")[0]
            tables, rows_total, missing = 0, 0, []
            for key, (table, _, _) in SPECS.items():
                if table_exists(table):
                    tables += 1
                    c = fetch('SELECT COUNT(*)::int AS c FROM %s' % q(table))
                    rows_total += int(c[0]["c"])
                else:
                    missing.append(table)
            return jsonify(ok=True, server_version=ver, schema_ready=not missing, tables=tables,
                           missing=missing[:5], rows=rows_total, server_ms=int((time.time() - t0) * 1000))

        return jsonify(ok=False, error='Op "%s" tidak dikenal.' % op), 400
    except Exception as e:  # noqa: BLE001
        return jsonify(ok=False, error=str(e)[:300]), 500


@app.post("/api/mail")
def mail():
    if not request.headers.get("x-vittoria-session"):
        return jsonify(ok=False, error="Sesi tidak ditemukan."), 401
    body = request.get_json(silent=True) or {}
    to, subject = body.get("to"), body.get("subject")
    if not to or not subject:
        return jsonify(ok=False, error="Field 'to' dan 'subject' wajib."), 400
    cfg = body.get("config") or {}
    host = SMTP_HOST or cfg.get("host") or "smtp.gmail.com"
    port = int(SMTP_PORT or cfg.get("port") or 465)
    user = SMTP_USER or cfg.get("user")
    pw = SMTP_PASS or cfg.get("pass")
    from_name = SMTP_FROM_NAME or cfg.get("fromName") or "Vittoria HR"
    if not user or not pw:
        return jsonify(ok=False, error="SMTP belum dikonfigurasi (pa_config.py atau Master Data → Email & SMTP)."), 400
    msg = EmailMessage()
    msg["From"] = "%s <%s>" % (from_name, user)
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body.get("text") or subject)
    if body.get("html"):
        msg.add_alternative(body["html"], subtype="html")
    try:
        ctx = ssl.create_default_context()
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as s:
                s.login(user, pw)
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as s:
                s.starttls(context=ctx)
                s.login(user, pw)
                s.send_message(msg)
        return jsonify(ok=True)
    except Exception as e:  # noqa: BLE001
        return jsonify(ok=False, error=str(e)[:250]), 502


# ---------------------------- static frontend ------------------------------
@app.get("/")
@app.get("/<path:path>")
def static_files(path="index.html"):
    # SPA fallback: unknown paths serve index.html; real assets serve themselves
    full = os.path.join(DIST, path)
    if path != "index.html" and os.path.isfile(full):
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(debug=True)
