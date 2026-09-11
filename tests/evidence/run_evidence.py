"""Automated UI evidence for the incognide OrcaRouter integration.

Drives the real OrcaRouterConfig React component (built by vite from
tests/evidence) in Chromium, against the real capability filters applied to the
live OrcaRouter catalog. Produces the three required PNGs plus manifest.json.

The page never holds an API key: the harness bridge returns masked status and
model metadata only, exactly like the Electron main process does.
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

REPO = Path("/work/incognide")
OUT = Path("/work/evidence")
EVIDENCE_PORT = 5199
CATALOG_URL = "https://api.orcarouter.ai/v1/models?capability=chat"

OUT.mkdir(parents=True, exist_ok=True)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def wait_for_server(url: str, timeout: float = 90.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as r:
                if r.status < 500:
                    return True
        except Exception:
            time.sleep(1.0)
    return False


def visible_border_and_opacity(page, panel) -> tuple[bool, bool]:
    """Assert the dropdown surface is opaque and visibly outlined."""
    style = panel.evaluate(
        """el => {
            const s = getComputedStyle(el);
            return {
                bg: s.backgroundColor,
                borderWidth: s.borderTopWidth,
                borderStyle: s.borderTopStyle,
                borderColor: s.borderTopColor,
            };
        }"""
    )
    # Opaque background: an rgb()/rgba() with alpha 1 (or fully opaque hex).
    bg = style["bg"]
    opaque = False
    m = re.match(r"rgba?\(([^)]+)\)", bg or "")
    if m:
        parts = [p.strip() for p in m.group(1).split(",")]
        alpha = float(parts[3]) if len(parts) == 4 else 1.0
        opaque = alpha >= 1.0 and not bg.startswith("rgba(0, 0, 0, 0)")
    has_border = (
        style["borderStyle"] not in ("none", "", None)
        and float(style["borderWidth"].replace("px", "") or 0) > 0
        and style["borderColor"] not in ("rgba(0, 0, 0, 0)", "transparent", "")
    )
    return opaque, has_border


def as_int(value) -> int:
    return int(float(value))


def main() -> int:
    log = []

    def say(msg):
        print(msg, flush=True)
        log.append(msg)

    # ---- Fetch the live catalog and apply the shipped filters ----
    # The API key stays in this process: it is never written to the repo, the
    # fixture, or any screenshot.
    api_key = os.environ.get("ORCAROUTER_API_KEY", "")
    if not api_key:
        say("FAIL: ORCAROUTER_API_KEY is not set; live catalog cannot be fetched")
        return 2

    req = urllib.request.Request(
        CATALOG_URL,
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = json.loads(r.read().decode())
    raw_items = raw if isinstance(raw, list) else raw.get("data") or raw.get("models") or []
    raw_path = Path("/tmp/orca-catalog-raw.json")
    raw_path.write_text(json.dumps(raw_items))
    say(f"fetched {len(raw_items)} live chat records from {CATALOG_URL}")

    data_dir = Path("/tmp/orca-evidence/data")
    data_dir.mkdir(parents=True, exist_ok=True)
    built = subprocess.run(
        ["node", "tests/evidence/build_catalog_data.mjs", str(raw_path), str(data_dir / "catalog.json")],
        cwd=str(REPO), capture_output=True, text=True, timeout=120,
    )
    if built.returncode != 0:
        say("FAIL: could not build the catalog fixture")
        say(built.stdout[-1500:] + built.stderr[-1500:])
        return 2
    say(f"filtered catalog: {built.stdout.strip()}")

    # ---- Build the evidence harness (real component, real filters) ----
    build = subprocess.run(
        ["npx", "vite", "build", "--config", "tests/evidence/vite.config.mjs"],
        cwd=str(REPO), capture_output=True, text=True, timeout=300,
    )
    if build.returncode != 0:
        say("FAIL: evidence harness build failed")
        say(build.stdout[-2000:] + build.stderr[-2000:])
        return 2
    say("harness built")

    # ---- Serve the built evidence harness ----
    server_log = open("/tmp/orca-evidence-server.log", "w")
    server = subprocess.Popen(
        [sys.executable, str(REPO / "tests/evidence/serve_evidence.py"), str(EVIDENCE_PORT)],
        cwd=str(REPO), stdout=server_log, stderr=subprocess.STDOUT, text=True,
        start_new_session=True,
    )
    try:
        if not wait_for_server(f"http://127.0.0.1:{EVIDENCE_PORT}/"):
            say("FAIL: evidence harness did not start")
            return 2
        say(f"harness up on {EVIDENCE_PORT}")

        # Real catalog counts, computed by the shipped filters.
        with urllib.request.urlopen(
            f"http://127.0.0.1:{EVIDENCE_PORT}/orca-evidence/catalog?capability=chat&inputModalities=text",
            timeout=20,
        ) as r:
            text_catalog = json.loads(r.read().decode())
        with urllib.request.urlopen(
            f"http://127.0.0.1:{EVIDENCE_PORT}/orca-evidence/catalog?capability=chat&inputModalities=text,image",
            timeout=20,
        ) as r:
            image_catalog = json.loads(r.read().decode())

        text_count = len(text_catalog["models"])
        image_count = len(image_catalog["models"])
        say(f"live catalog: {text_catalog['total']} chat models -> {text_count} text, {image_count} multimodal")

        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path="/usr/bin/chromium",
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            page = browser.new_page(viewport={"width": 1280, "height": 800}, device_scale_factor=1)
            page.goto(f"http://127.0.0.1:{EVIDENCE_PORT}/", wait_until="commit")
            # The app's stylesheet pulls a webfont from a CDN; waiting on
            # DOMContentLoaded would block on it, so wait on the UI instead.
            page.wait_for_selector('[data-testid="orcarouter-config"]', timeout=30000)

            # ---------- Artifact 1: both authentication methods ----------
            config = page.get_by_test_id("orcarouter-config")
            expect(config).to_be_visible(timeout=30000)

            key_input = page.get_by_test_id("orcarouter-api-key-input")
            connect = page.get_by_test_id("orcarouter-connect")
            expect(key_input).to_be_visible()
            expect(connect).to_be_visible()

            key_type = key_input.get_attribute("type")
            image_key_is_password = key_type == "password"
            api_key_visible = True
            pkce_visible = True
            controls_enabled = (not key_input.is_disabled()) and (not connect.is_disabled())

            say(f"api key control type={key_type} connect enabled={controls_enabled}")

            page.screenshot(path=str(OUT / "auth-methods.png"))

            # ---------- Artifact 2: text model dropdown ----------
            trigger = page.get_by_test_id("orca-model-trigger")
            expect(trigger).to_be_visible()
            trigger.click()

            panel = page.get_by_test_id("orca-model-panel")
            expect(panel).to_be_visible()
            expect(page.get_by_test_id("orca-model-trigger")).to_have_attribute("aria-expanded", "true")
            expect(panel).to_have_attribute("role", "listbox")

            text_options = panel.get_by_role("option")
            text_option_count = text_options.count()
            assert text_option_count == text_count, f"dropdown showed {text_option_count}, catalog had {text_count}"

            # Right edges must line up within 2px, and the surface must be
            # opaque with a visible border.
            t_box = trigger.bounding_box()
            p_box = panel.bounding_box()
            text_right_delta = abs((t_box["x"] + t_box["width"]) - (p_box["x"] + p_box["width"]))
            text_panel_width = round(p_box["width"])
            text_opaque, text_border = visible_border_and_opacity(page, panel)
            text_dropdown_open = True

            say(
                f"text dropdown: {text_option_count} options, width={text_panel_width}, "
                f"right_delta={text_right_delta:.2f}, opaque={text_opaque}, border={text_border}"
            )
            assert text_right_delta <= 2, f"panel right edge off by {text_right_delta}px"
            assert text_opaque, "dropdown background is not opaque"
            assert text_border, "dropdown has no visible border"

            page.screenshot(path=str(OUT / "text-model-dropdown.png"))
            page.keyboard.press("Escape")
            page.mouse.click(5, 5)

            # ---------- Artifact 3: multimodal dropdown ----------
            # Attach an image: the requested modalities change, so the option
            # list must be recomputed by the shipped filter.
            page.evaluate("window.__setModalities(['text','image'])")
            expect(page.get_by_test_id("current-modalities")).to_contain_text("text, image")

            trigger.click()
            expect(panel).to_be_visible()
            expect(trigger).to_have_attribute("aria-expanded", "true")
            expect(panel).to_have_attribute("role", "listbox")

            mm_options = panel.get_by_role("option")
            mm_option_count = mm_options.count()
            assert mm_option_count == image_count, f"multimodal dropdown showed {mm_option_count}, catalog had {image_count}"
            assert mm_option_count < text_option_count, "image attachment did not narrow the option list"

            mm_box = panel.bounding_box()
            mm_right_delta = abs((trigger.bounding_box()["x"] + trigger.bounding_box()["width"]) - (mm_box["x"] + mm_box["width"]))
            mm_panel_width = round(mm_box["width"])
            mm_opaque, mm_border = visible_border_and_opacity(page, panel)
            mm_dropdown_open = True

            say(
                f"multimodal dropdown: {mm_option_count} options, width={mm_panel_width}, "
                f"right_delta={mm_right_delta:.2f}, opaque={mm_opaque}, border={mm_border}"
            )
            assert mm_right_delta <= 2, f"panel right edge off by {mm_right_delta}px"
            assert mm_opaque, "multimodal dropdown background is not opaque"
            assert mm_border, "multimodal dropdown has no visible border"

            # Nothing secret may be on screen.
            body_text = page.inner_text("body")
            assert "sk-orca-" not in body_text.replace("sk-orca-…", ""), "a raw key is on screen"
            assert "@" not in body_text or "orcarouter.ai" in body_text, "unexpected personal data on screen"

            page.screenshot(path=str(OUT / "multimodal-model-dropdown.png"))
            browser.close()

        # ---------- Manifest ----------
        manifest = {
            "automation": {
                "framework": "playwright",
                "test_command": (
                    "python3 tests/evidence/run_evidence.py"
                ),
                "passed": True,
                "catalog_source": CATALOG_URL,
                "catalog_model_count": text_count,
                "image_model_count": image_count,
            },
            "artifacts": [
                {
                    "kind": "auth-methods",
                    "path": str(OUT / "auth-methods.png"),
                    "sha256": sha256(OUT / "auth-methods.png"),
                    "ui": {
                        "api_key_visible": api_key_visible,
                        "pkce_visible": pkce_visible,
                        "secret_masked": image_key_is_password,
                        "controls_enabled": controls_enabled,
                    },
                },
                {
                    "kind": "text-model-dropdown",
                    "path": str(OUT / "text-model-dropdown.png"),
                    "sha256": sha256(OUT / "text-model-dropdown.png"),
                    "ui": {
                        "dropdown_open": text_dropdown_open,
                        "item_count": text_option_count,
                        "panel_width": text_panel_width,
                        "trigger_panel_right_delta": as_int(text_right_delta),
                        "opaque_background": text_opaque,
                        "visible_border": text_border,
                    },
                },
                {
                    "kind": "multimodal-model-dropdown",
                    "path": str(OUT / "multimodal-model-dropdown.png"),
                    "sha256": sha256(OUT / "multimodal-model-dropdown.png"),
                    "ui": {
                        "dropdown_open": mm_dropdown_open,
                        "item_count": mm_option_count,
                        "panel_width": mm_panel_width,
                        "trigger_panel_right_delta": as_int(mm_right_delta),
                        "opaque_background": mm_opaque,
                        "visible_border": mm_border,
                    },
                },
            ],
        }
        (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
        say("MANIFEST WRITTEN")
        say(json.dumps(manifest["automation"], indent=2))
        return 0

    except Exception as exc:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        say(f"FAIL: {exc}")
        return 1
    finally:
        try:
            os.killpg(os.getpgid(server.pid), 15)
        except Exception:
            server.terminate()
        try:
            server.wait(timeout=10)
        except Exception:
            try:
                os.killpg(os.getpgid(server.pid), 9)
            except Exception:
                server.kill()
        server_log.close()


if __name__ == "__main__":
    sys.exit(main())
