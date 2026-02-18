"""
Incognide MCP Server - UI Tools for Incognide IDE

This MCP server provides tools for manipulating the Incognide UI:
- Pane management (open, close, focus, list)
- Browser navigation
- Diff viewing
- User approval dialogs
- Notifications

Tools are designed to be called by agents via the MCP protocol and
communicate with the Incognide frontend via the Flask backend.
"""

import os
import sys
import json
import asyncio
import aiohttp
from typing import Optional, Dict, Any, List

from mcp.server.fastmcp import FastMCP

# Initialize MCP server
mcp = FastMCP("incognide_mcp")

# Incognide backend URL - connects to the same backend that serves the frontend
# Dev: 5437, Prod: 5337. Auto-detect if not explicitly set.
def _detect_backend_url():
    explicit = os.environ.get("INCOGNIDE_BACKEND_URL", "")
    if explicit:
        return explicit
    import socket
    for port in [5337, 5437]:  # Prefer prod
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.5)
            s.connect(("127.0.0.1", port))
            s.close()
            return f"http://127.0.0.1:{port}"
        except:
            pass
    return "http://127.0.0.1:5437"  # Fallback to dev

INCOGNIDE_BACKEND_URL = _detect_backend_url()

# Target window for actions (set via set_target_window tool)
_target_window_id = ""


async def call_incognide_action(action: str, args: Dict[str, Any], window_id: str = "") -> Dict[str, Any]:
    """
    Call an Incognide studio action via the backend API.

    Args:
        action: The action name (e.g., 'open_pane', 'navigate')
        args: Arguments for the action
        window_id: Optional window ID to target. Falls back to _target_window_id.

    Returns:
        Result dictionary from the action
    """
    effective_window_id = window_id or _target_window_id
    # CRITICAL: Logging to stderr so it doesn't break MCP stdout JSON pipe
    sys.stderr.write(f"[MCP SERVER] call_incognide_action: {action} window={effective_window_id}\n")
    try:
        payload = {"action": action, "args": args}
        if effective_window_id:
            payload["window_id"] = effective_window_id
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{INCOGNIDE_BACKEND_URL}/api/studio/action",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    return result
                else:
                    error_text = await response.text()
                    sys.stderr.write(f"[MCP SERVER] Error: HTTP {response.status}: {error_text}\n")
                    return {"success": False, "error": f"HTTP {response.status}: {error_text}"}
    except aiohttp.ClientError as e:
        sys.stderr.write(f"[MCP SERVER] Connection error: {e}\n")
        return {"success": False, "error": f"Connection error: {str(e)}"}
    except Exception as e:
        sys.stderr.write(f"[MCP SERVER] Exception: {e}\n")
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {"success": False, "error": f"Error: {str(e)}"}


# ═══════════════════════════════════════════════════════════════════════════════
# WINDOW MANAGEMENT TOOLS
# ═══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
async def list_windows() -> str:
    """
    List all connected Incognide windows with their IDs, folder paths, and titles.
    Use this to discover which windows are open before targeting actions.

    Returns:
        JSON array of windows with id, folder, title
    """
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{INCOGNIDE_BACKEND_URL}/api/studio/windows",
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    return json.dumps(result, indent=2)
                else:
                    error_text = await response.text()
                    return json.dumps({"success": False, "error": f"HTTP {response.status}: {error_text}"})
    except Exception as e:
        sys.stderr.write(f"[MCP SERVER] list_windows error: {e}\n")
        return json.dumps({"success": False, "error": str(e)})


@mcp.tool()
async def set_target_window(window_id: str) -> str:
    """
    Set the default target window for all subsequent actions.
    After calling this, all tools will route to this window unless overridden.
    Use list_windows() first to find the right window ID.

    Args:
        window_id: The window ID to target (from list_windows), or empty string to clear

    Returns:
        JSON confirmation with the set window ID
    """
    global _target_window_id
    _target_window_id = window_id
    return json.dumps({
        "success": True,
        "target_window_id": window_id,
        "message": f"Target window set to: {window_id}" if window_id else "Target window cleared (broadcast mode)"
    })


@mcp.tool()
async def get_target_window() -> str:
    """
    Get the currently set target window ID.

    Returns:
        JSON with the current target window ID
    """
    return json.dumps({
        "success": True,
        "target_window_id": _target_window_id,
        "is_set": bool(_target_window_id)
    })


# ═══════════════════════════════════════════════════════════════════════════════
# PANE MANAGEMENT TOOLS
# ═══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
async def open_pane(
    pane_type: str,
    content_id: str = "",
    position: str = "right",
    shell_type: str = ""
) -> str:
    """
    Open a new pane in Incognide.

    Args:
        pane_type: Type of pane to open. Tool panes (no path needed): chat, terminal,
            graph-viewer, datadash, dbtool, memory-manager, photoviewer, scherzo,
            npcteam, jinx, teammanagement, search, library, diskusage, help,
            settings, cron-daemon, projectenv, browsergraph, data-labeler, git.
            File panes (path required): editor, pdf, csv, docx, pptx, latex,
            notebook, exp, mindmap, zip, image, folder.
            URL panes: browser.
        content_id: Content ID - URL for browser, file path for file panes. Not needed for tool panes.
        position: Where to open the pane (right, left, top, bottom)
        shell_type: For terminal panes: system, npcsh, or guac

    Returns:
        JSON result with pane ID and status
    """
    args = {
        "type": pane_type,
        "position": position
    }
    if content_id:
        if pane_type == "browser":
            args["url"] = content_id
        else:
            args["path"] = content_id
    if shell_type:
        args["shellType"] = shell_type
    result = await call_incognide_action("open_pane", args)
    return json.dumps(result, indent=2)


@mcp.tool()
async def close_pane(pane_id: str = "active") -> str:
    """
    Close a pane in Incognide.

    Args:
        pane_id: ID of the pane to close, or "active" for the current pane

    Returns:
        JSON result with status
    """
    result = await call_incognide_action("close_pane", {"paneId": pane_id})
    return json.dumps(result, indent=2)


@mcp.tool()
async def focus_pane(pane_id: str) -> str:
    """
    Focus/activate a specific pane in Incognide.

    Args:
        pane_id: ID of the pane to focus

    Returns:
        JSON result with status
    """
    result = await call_incognide_action("focus_pane", {"paneId": pane_id})
    return json.dumps(result, indent=2)


@mcp.tool()
async def list_panes() -> str:
    """
    List all open panes in Incognide.

    Returns:
        JSON array of panes with their IDs, types, titles, and status
    """
    result = await call_incognide_action("list_panes", {})
    return json.dumps(result, indent=2)


@mcp.tool()
async def list_pane_types() -> str:
    """
    List all available pane types that can be opened in Incognide.

    Returns:
        JSON array of pane types with their names, descriptions, and whether they require a path or URL
    """
    result = await call_incognide_action("list_pane_types", {})
    return json.dumps(result, indent=2)


@mcp.tool()
async def list_actions() -> str:
    """
    List all available studio actions that can be performed in Incognide, organized by category.

    Returns:
        JSON with all action names and categories (pane management, content, browser, tabs, data, UI, window)
    """
    result = await call_incognide_action("list_actions", {})
    return json.dumps(result, indent=2)


@mcp.tool()
async def navigate_browser(url: str, pane_id: str = "active") -> str:
    """
    Navigate a browser pane to a specific URL.

    Args:
        url: The URL to navigate to
        pane_id: ID of the browser pane, or "active" for the current browser pane

    Returns:
        JSON result with status
    """
    result = await call_incognide_action("navigate", {
        "paneId": pane_id,
        "url": url
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def show_diff(
    original: str,
    modified: str,
    title: str = "Diff View"
) -> str:
    """
    Show a diff view comparing two versions of content.

    Args:
        original: The original content or file path
        modified: The modified content or file path
        title: Title for the diff view

    Returns:
        JSON result with pane ID and status
    """
    result = await call_incognide_action("open_pane", {
        "type": "diff",
        "original": original,
        "modified": modified,
        "title": title
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def request_approval(
    message: str,
    title: str = "Approval Required"
) -> str:
    """
    Request user approval before performing an action.

    Args:
        message: Description of what needs approval
        title: Title for the approval dialog

    Returns:
        JSON result with 'confirmed' boolean
    """
    result = await call_incognide_action("confirm", {
        "message": message,
        "title": title
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def notify(
    message: str,
    notification_type: str = "info",
    duration: int = 3000
) -> str:
    """
    Show a notification toast to the user.

    Args:
        message: The notification message
        notification_type: Type of notification (info, success, warning, error)
        duration: How long to show the notification in milliseconds

    Returns:
        JSON result with status
    """
    result = await call_incognide_action("notify", {
        "message": message,
        "type": notification_type,
        "duration": duration
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def get_browser_info(pane_id: str = "active") -> str:
    """
    Get information about a browser pane (URL, title, etc.).

    Args:
        pane_id: ID of the browser pane, or "active" for the current browser pane

    Returns:
        JSON with browser URL, title, and other info
    """
    result = await call_incognide_action("get_browser_info", {"paneId": pane_id})
    return json.dumps(result, indent=2)


@mcp.tool()
async def split_pane(
    direction: str,
    pane_type: str,
    content_id: str = "",
    pane_id: str = "active"
) -> str:
    """
    Split an existing pane to create a new pane next to it.

    Args:
        direction: Split direction (right, left, up, down)
        pane_type: Type of pane to create (browser, editor, terminal, chat)
        content_id: Content ID for the new pane
        pane_id: ID of the pane to split, or "active" for the current pane

    Returns:
        JSON result with new pane ID and status
    """
    result = await call_incognide_action("split_pane", {
        "paneId": pane_id,
        "direction": direction,
        "type": pane_type,
        "path": content_id
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def zen_mode(pane_id: str = "active") -> str:
    """
    Toggle zen mode (fullscreen) for a pane.

    Args:
        pane_id: ID of the pane, or "active" for the current pane

    Returns:
        JSON result with status
    """
    result = await call_incognide_action("zen_mode", {"paneId": pane_id})
    return json.dumps(result, indent=2)


@mcp.tool()
async def run_terminal(command: str, pane_id: str = "active") -> str:
    """
    Run a command in a terminal pane.

    Args:
        command: The command to execute in the terminal
        pane_id: ID of the terminal pane, or "active" for the current terminal pane

    Returns:
        JSON result with status
    """
    result = await call_incognide_action("run_terminal", {
        "command": command,
        "paneId": pane_id
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def browser_click(
    selector: str = "",
    text: str = "",
    index: int = 0,
    pane_id: str = "active"
) -> str:
    """
    Click on an element in a browser pane.

    Args:
        selector: CSS selector for the element (e.g., "button.submit", "#login-btn")
        text: Text content to match (e.g., "English", "Sign In") - searches clickable elements
        index: Which matching element to click if multiple found (0-indexed, default 0)
        pane_id: ID of the browser pane, or "active" for the current browser pane

    Returns:
        JSON result with clicked element info
    """
    result = await call_incognide_action("browser_click", {
        "paneId": pane_id,
        "selector": selector,
        "text": text,
        "index": index
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def browser_type(
    selector: str,
    text: str,
    clear: bool = True,
    submit: bool = False,
    pane_id: str = "active"
) -> str:
    """
    Type text into an input field in a browser pane.

    Args:
        selector: CSS selector, placeholder text, input name, or aria-label to find the input
        text: The text to type into the input
        clear: Whether to clear existing content before typing (default True)
        submit: Whether to submit the form after typing (default False)
        pane_id: ID of the browser pane, or "active" for the current browser pane

    Returns:
        JSON result with status
    """
    result = await call_incognide_action("browser_type", {
        "paneId": pane_id,
        "selector": selector,
        "text": text,
        "clear": clear,
        "submit": submit
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def get_browser_content(pane_id: str = "active") -> str:
    """
    Get the text content of a webpage in a browser pane.

    Args:
        pane_id: ID of the browser pane, or "active" for the current browser pane

    Returns:
        JSON with page content, URL, and title
    """
    result = await call_incognide_action("get_browser_content", {"paneId": pane_id})
    return json.dumps(result, indent=2)


@mcp.tool()
async def browser_screenshot(pane_id: str = "active") -> str:
    """
    Take a screenshot of a browser pane.

    Args:
        pane_id: ID of the browser pane, or "active" for the current browser pane

    Returns:
        JSON with screenshot as base64 data URL, current URL, and title
    """
    result = await call_incognide_action("browser_screenshot", {"paneId": pane_id})
    return json.dumps(result, indent=2)


@mcp.tool()
async def browser_eval(code: str, pane_id: str = "active") -> str:
    """
    Execute JavaScript code in a browser pane.

    Args:
        code: JavaScript code to execute in the page context
        pane_id: ID of the browser pane, or "active" for the current browser pane

    Returns:
        JSON with the result of the JavaScript execution
    """
    result = await call_incognide_action("browser_eval", {
        "paneId": pane_id,
        "code": code
    })
    return json.dumps(result, indent=2)


# ═══════════════════════════════════════════════════════════════════════════════
# SPREADSHEET TOOLS (CSV/XLSX)
# ═══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
async def spreadsheet_read(
    pane_id: str = "active",
    max_rows: int = 200,
    include_stats: bool = False
) -> str:
    """
    Read data from a CSV/XLSX spreadsheet pane.

    Args:
        pane_id: ID of the spreadsheet pane, or "active" for the current pane
        max_rows: Maximum number of data rows to return (default 200)
        include_stats: Whether to include column statistics (count, sum, avg, min, max, unique)

    Returns:
        JSON with headers, data rows, row/column counts, sheet info, and optionally column stats
    """
    result = await call_incognide_action("spreadsheet_read", {
        "paneId": pane_id,
        "maxRows": max_rows,
        "includeStats": include_stats
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def spreadsheet_eval(code: str, pane_id: str = "active") -> str:
    """
    Execute arbitrary JavaScript code to transform spreadsheet data. The code receives
    a `ctx` object with {headers: string[], data: any[][], XLSX: library} and should
    return {headers?, data?} to update the spreadsheet.

    Examples:
    - Deduplicate: "const seen = new Set(); ctx.data = ctx.data.filter(r => { const k = r[0]; if (seen.has(k)) return false; seen.add(k); return true; }); return ctx;"
    - Add computed column: "ctx.headers.push('Full Name'); ctx.data.forEach(r => r.push(r[0] + ' ' + r[1])); return ctx;"
    - Pivot/groupby: "const g = {}; ctx.data.forEach(r => { (g[r[0]] = g[r[0]] || []).push(r); }); return { headers: ['Category', 'Count'], data: Object.entries(g).map(([k,v]) => [k, v.length]) };"
    - Filter rows: "ctx.data = ctx.data.filter(r => parseFloat(r[2]) > 100); return ctx;"
    - Regex transform: "ctx.data.forEach(r => { r[1] = r[1].replace(/[^a-zA-Z0-9]/g, ''); }); return ctx;"

    Args:
        code: JavaScript code to execute. Receives `ctx` with {headers, data, XLSX}. Must return {headers?, data?}.
        pane_id: ID of the spreadsheet pane, or "active"

    Returns:
        JSON with success status, new row/column counts
    """
    result = await call_incognide_action("spreadsheet_eval", {
        "paneId": pane_id,
        "code": code
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def spreadsheet_update_cell(
    row: int,
    col: int,
    value: str,
    pane_id: str = "active"
) -> str:
    """
    Update a single cell in a spreadsheet.

    Args:
        row: Row index (0-based)
        col: Column index (0-based)
        value: New cell value
        pane_id: ID of the spreadsheet pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("spreadsheet_update_cell", {
        "paneId": pane_id,
        "row": row,
        "col": col,
        "value": value
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def spreadsheet_update_cells(
    updates: List[Dict[str, Any]],
    pane_id: str = "active"
) -> str:
    """
    Batch update multiple cells in a spreadsheet efficiently.

    Args:
        updates: List of updates, each with {"row": int, "col": int, "value": str}
        pane_id: ID of the spreadsheet pane, or "active"

    Returns:
        JSON with success status and count of updated cells
    """
    result = await call_incognide_action("spreadsheet_update_cells", {
        "paneId": pane_id,
        "updates": updates
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def spreadsheet_add_row(index: int = -1, pane_id: str = "active") -> str:
    """
    Add a row to the spreadsheet.

    Args:
        index: Position to insert the row (-1 = append at end)
        pane_id: ID of the spreadsheet pane, or "active"

    Returns:
        JSON with success status and new row count
    """
    result = await call_incognide_action("spreadsheet_add_row", {
        "paneId": pane_id,
        "index": index if index >= 0 else None
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def spreadsheet_delete_row(index: int, pane_id: str = "active") -> str:
    """
    Delete a row from the spreadsheet.

    Args:
        index: Row index to delete (0-based)
        pane_id: ID of the spreadsheet pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("spreadsheet_delete_row", {
        "paneId": pane_id,
        "index": index
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def spreadsheet_add_column(name: str = "", pane_id: str = "active") -> str:
    """
    Add a column to the spreadsheet.

    Args:
        name: Name for the new column header (optional)
        pane_id: ID of the spreadsheet pane, or "active"

    Returns:
        JSON with success status and new column count
    """
    result = await call_incognide_action("spreadsheet_add_column", {
        "paneId": pane_id,
        "name": name
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def spreadsheet_delete_column(col: int, pane_id: str = "active") -> str:
    """
    Delete a column from the spreadsheet.

    Args:
        col: Column index to delete (0-based)
        pane_id: ID of the spreadsheet pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("spreadsheet_delete_column", {
        "paneId": pane_id,
        "col": col
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def spreadsheet_sort(
    col: int,
    direction: str = "asc",
    pane_id: str = "active"
) -> str:
    """
    Sort spreadsheet by a column.

    Args:
        col: Column index to sort by (0-based)
        direction: Sort direction - "asc" or "desc"
        pane_id: ID of the spreadsheet pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("spreadsheet_sort", {
        "paneId": pane_id,
        "col": col,
        "direction": direction
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def spreadsheet_stats(col: int, pane_id: str = "active") -> str:
    """
    Get statistics for a spreadsheet column.

    Args:
        col: Column index (0-based)
        pane_id: ID of the spreadsheet pane, or "active"

    Returns:
        JSON with count, unique, sum, avg, min, max for the column
    """
    result = await call_incognide_action("spreadsheet_stats", {
        "paneId": pane_id,
        "col": col
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def spreadsheet_save(pane_id: str = "active") -> str:
    """
    Save spreadsheet changes to disk.

    Args:
        pane_id: ID of the spreadsheet pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("spreadsheet_save", {"paneId": pane_id})
    return json.dumps(result, indent=2)


@mcp.tool()
async def spreadsheet_export(
    format: str = "csv",
    pane_id: str = "active"
) -> str:
    """
    Export spreadsheet to a different format.

    Args:
        format: Export format - "csv", "json", or "xlsx"
        pane_id: ID of the spreadsheet pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("spreadsheet_export", {
        "paneId": pane_id,
        "format": format
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def spreadsheet_switch_sheet(
    sheet_name: str,
    pane_id: str = "active"
) -> str:
    """
    Switch to a different sheet in an XLSX workbook.

    Args:
        sheet_name: Name of the sheet to switch to
        pane_id: ID of the spreadsheet pane, or "active"

    Returns:
        JSON with success status and active sheet name
    """
    result = await call_incognide_action("spreadsheet_switch_sheet", {
        "paneId": pane_id,
        "sheetName": sheet_name
    })
    return json.dumps(result, indent=2)


# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENT TOOLS (DOCX)
# ═══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
async def document_read(
    format: str = "text",
    pane_id: str = "active"
) -> str:
    """
    Read content from a DOCX document pane.

    Args:
        format: Output format - "text" (plain text) or "html" (HTML markup)
        pane_id: ID of the document pane, or "active"

    Returns:
        JSON with document content, format, stats (word count, etc.), and file path
    """
    result = await call_incognide_action("document_read", {
        "paneId": pane_id,
        "format": format
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def document_eval(code: str, pane_id: str = "active") -> str:
    """
    Execute arbitrary JavaScript to transform document content. The code receives
    a `ctx` object with {html: string, text: string, editorEl: HTMLElement} and
    should return {html: string} to update the document.

    Examples:
    - Uppercase all text: "return { html: ctx.html.replace(/([^<>]+)(?=<|$)/g, m => m.toUpperCase()) };"
    - Wrap paragraphs in divs: "return { html: ctx.text.split('\\n').filter(Boolean).map(p => '<p>' + p + '</p>').join('') };"
    - Add table of contents: "const headings = ctx.editorEl.querySelectorAll('h1,h2,h3'); let toc = '<h2>Contents</h2><ul>'; headings.forEach(h => { toc += '<li>' + h.textContent + '</li>'; }); toc += '</ul><hr>'; return { html: toc + ctx.html };"

    Args:
        code: JavaScript code. Receives `ctx` with {html, text, editorEl}. Return {html} to update.
        pane_id: ID of the document pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("document_eval", {
        "paneId": pane_id,
        "code": code
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def document_write(
    content: str,
    position: str = "replace",
    pane_id: str = "active"
) -> str:
    """
    Write HTML content to a DOCX document pane.

    Args:
        content: HTML content to write
        position: Where to place content - "replace" (replace all), "end" (append), "start" (prepend), "cursor" (at cursor)
        pane_id: ID of the document pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("document_write", {
        "paneId": pane_id,
        "content": content,
        "position": position
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def document_find_replace(
    search: str,
    replace: str = "",
    replace_all: bool = True,
    pane_id: str = "active"
) -> str:
    """
    Find and optionally replace text in a DOCX document.

    Args:
        search: Text to search for
        replace: Replacement text (if empty, just counts matches)
        replace_all: Whether to replace all occurrences or just the first
        pane_id: ID of the document pane, or "active"

    Returns:
        JSON with match count or replacement status
    """
    result = await call_incognide_action("document_find_replace", {
        "paneId": pane_id,
        "search": search,
        "replace": replace,
        "replaceAll": replace_all
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def document_format(
    command: str,
    value: str = "",
    pane_id: str = "active"
) -> str:
    """
    Apply formatting to the document. Uses document.execCommand commands.

    Common commands: bold, italic, underline, strikeThrough, justifyLeft, justifyCenter,
    justifyRight, justifyFull, insertUnorderedList, insertOrderedList, indent, outdent,
    fontName (value=font), fontSize (value=1-7), foreColor (value=#hex), hiliteColor (value=#hex)

    Args:
        command: The formatting command to execute
        value: Optional value for the command (e.g., font name, color)
        pane_id: ID of the document pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("document_format", {
        "paneId": pane_id,
        "command": command,
        "value": value
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def document_insert_table(
    rows: int,
    cols: int,
    pane_id: str = "active"
) -> str:
    """
    Insert a table into the document at the cursor position.

    Args:
        rows: Number of rows
        cols: Number of columns
        pane_id: ID of the document pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("document_insert_table", {
        "paneId": pane_id,
        "rows": rows,
        "cols": cols
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def document_save(pane_id: str = "active") -> str:
    """
    Save document changes to disk.

    Args:
        pane_id: ID of the document pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("document_save", {"paneId": pane_id})
    return json.dumps(result, indent=2)


@mcp.tool()
async def document_stats(pane_id: str = "active") -> str:
    """
    Get document statistics (word count, character count, estimated page count).

    Args:
        pane_id: ID of the document pane, or "active"

    Returns:
        JSON with wordCount, charCount, pageCount, filePath
    """
    result = await call_incognide_action("document_stats", {"paneId": pane_id})
    return json.dumps(result, indent=2)


# ═══════════════════════════════════════════════════════════════════════════════
# PRESENTATION TOOLS (PPTX)
# ═══════════════════════════════════════════════════════════════════════════════

@mcp.tool()
async def presentation_read(pane_id: str = "active") -> str:
    """
    Read overview of a PPTX presentation: slide count, text content of each slide.

    Args:
        pane_id: ID of the presentation pane, or "active"

    Returns:
        JSON with slide count, current index, and array of slide summaries (text content, shape count, background)
    """
    result = await call_incognide_action("presentation_read", {"paneId": pane_id})
    return json.dumps(result, indent=2)


@mcp.tool()
async def presentation_read_slide(
    slide_index: int = -1,
    pane_id: str = "active"
) -> str:
    """
    Read detailed info about a specific slide including all shapes, text, positions, and colors.

    Args:
        slide_index: Slide index (0-based), -1 for current slide
        pane_id: ID of the presentation pane, or "active"

    Returns:
        JSON with shapes array (type, position, text, fillColor, shapeType, name)
    """
    result = await call_incognide_action("presentation_read_slide", {
        "paneId": pane_id,
        "slideIndex": slide_index if slide_index >= 0 else None
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def presentation_eval(code: str, pane_id: str = "active") -> str:
    """
    Execute arbitrary JavaScript to transform presentation data. The code receives
    a `ctx` object with {slides: Slide[], currentIndex: number} and should return
    {slides?, currentIndex?} to update.

    Each slide has: {name, shapes: [{type, xfrm: {x,y,cx,cy}, paras: [{html, align}], fillColor, shapeType}], background}

    Args:
        code: JavaScript code. Receives `ctx` with {slides, currentIndex}. Return {slides?, currentIndex?}.
        pane_id: ID of the presentation pane, or "active"

    Returns:
        JSON with success status and slide count
    """
    result = await call_incognide_action("presentation_eval", {
        "paneId": pane_id,
        "code": code
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def presentation_update_text(
    shape_index: int,
    text: str,
    slide_index: int = -1,
    pane_id: str = "active"
) -> str:
    """
    Update the text content of a shape on a slide.

    Args:
        shape_index: Index of the shape to update (0-based, use presentation_read_slide to find indices)
        text: New text content for the shape
        slide_index: Slide index (0-based), -1 for current slide
        pane_id: ID of the presentation pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("presentation_update_text", {
        "paneId": pane_id,
        "shapeIndex": shape_index,
        "text": text,
        "slideIndex": slide_index if slide_index >= 0 else None
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def presentation_add_slide(pane_id: str = "active") -> str:
    """
    Add a new slide after the current one.

    Args:
        pane_id: ID of the presentation pane, or "active"

    Returns:
        JSON with success status and new slide count
    """
    result = await call_incognide_action("presentation_add_slide", {"paneId": pane_id})
    return json.dumps(result, indent=2)


@mcp.tool()
async def presentation_delete_slide(
    slide_index: int = -1,
    pane_id: str = "active"
) -> str:
    """
    Delete a slide from the presentation.

    Args:
        slide_index: Slide index to delete (0-based), -1 for current slide
        pane_id: ID of the presentation pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("presentation_delete_slide", {
        "paneId": pane_id,
        "slideIndex": slide_index if slide_index >= 0 else None
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def presentation_duplicate_slide(
    slide_index: int = -1,
    pane_id: str = "active"
) -> str:
    """
    Duplicate a slide in the presentation.

    Args:
        slide_index: Slide index to duplicate (0-based), -1 for current slide
        pane_id: ID of the presentation pane, or "active"

    Returns:
        JSON with success status and new slide count
    """
    result = await call_incognide_action("presentation_duplicate_slide", {
        "paneId": pane_id,
        "slideIndex": slide_index if slide_index >= 0 else None
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def presentation_set_background(
    color: str,
    pane_id: str = "active"
) -> str:
    """
    Set the background color for the current slide.

    Args:
        color: Hex color code (e.g., "#ffffff", "#1a1a2e")
        pane_id: ID of the presentation pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("presentation_set_background", {
        "paneId": pane_id,
        "color": color
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def presentation_add_shape(
    shape_type: str,
    color: str = "#4285f4",
    pane_id: str = "active"
) -> str:
    """
    Add a shape to the current slide.

    Args:
        shape_type: Shape type - rect, roundRect, ellipse, triangle, diamond, hexagon, star, arrow, line
        color: Fill color as hex code (default blue)
        pane_id: ID of the presentation pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("presentation_add_shape", {
        "paneId": pane_id,
        "shapeType": shape_type,
        "color": color
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def presentation_save(pane_id: str = "active") -> str:
    """
    Save presentation changes to disk.

    Args:
        pane_id: ID of the presentation pane, or "active"

    Returns:
        JSON with success status
    """
    result = await call_incognide_action("presentation_save", {"paneId": pane_id})
    return json.dumps(result, indent=2)


if __name__ == "__main__":
    # CRITICAL: Using stderr for all debug messages so stdout remains pure JSON-RPC
    sys.stderr.write(f"Starting Incognide MCP server...\n")
    sys.stderr.write(f"Backend URL: {INCOGNIDE_BACKEND_URL}\n")
    sys.stderr.write(f"Available tools: list_windows, set_target_window, get_target_window,\n")
    sys.stderr.write(f"                 open_pane, close_pane, focus_pane, list_panes, list_pane_types,\n")
    sys.stderr.write(f"                 navigate_browser, show_diff, request_approval,\n")
    sys.stderr.write(f"                 notify, get_browser_info, split_pane, zen_mode, list_actions,\n")
    sys.stderr.write(f"                 run_terminal, browser_click, browser_type,\n")
    sys.stderr.write(f"                 get_browser_content, browser_screenshot, browser_eval,\n")
    sys.stderr.write(f"                 spreadsheet_read, spreadsheet_eval, spreadsheet_update_cell,\n")
    sys.stderr.write(f"                 spreadsheet_update_cells, spreadsheet_add_row, spreadsheet_delete_row,\n")
    sys.stderr.write(f"                 spreadsheet_add_column, spreadsheet_delete_column, spreadsheet_sort,\n")
    sys.stderr.write(f"                 spreadsheet_stats, spreadsheet_save, spreadsheet_export,\n")
    sys.stderr.write(f"                 spreadsheet_switch_sheet,\n")
    sys.stderr.write(f"                 document_read, document_eval, document_write,\n")
    sys.stderr.write(f"                 document_find_replace, document_format, document_insert_table,\n")
    sys.stderr.write(f"                 document_save, document_stats,\n")
    sys.stderr.write(f"                 presentation_read, presentation_read_slide, presentation_eval,\n")
    sys.stderr.write(f"                 presentation_update_text, presentation_add_slide,\n")
    sys.stderr.write(f"                 presentation_delete_slide, presentation_duplicate_slide,\n")
    sys.stderr.write(f"                 presentation_set_background, presentation_add_shape,\n")
    sys.stderr.write(f"                 presentation_save\n")

    mcp.run(transport="stdio")