---
name: app-preview
description: Use the IDE's internal App Preview tab for local web apps instead of opening external browsers or Playwright.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# App Preview

Use this skill whenever starting, previewing, testing, or visually checking a local web app in this IDE fork.

## Rule

Use the internal **App Preview** tab for local app preview. Do not open Chrome, Safari, Firefox, the system default browser, or Playwright for local preview unless the user explicitly approves an external browser first.

## Preferred Tools

The IDE provides an MCP server named `app_preview`. Use its tools before shell/browser alternatives:

- `run_preview_server` - start the deterministic preview server and open it in App Preview
- `get_app_preview_status` - inspect preview URL, branch, server state, health, page ID, and configuration state
- `restart_preview_server` - restart the preview server and reopen App Preview
- `navigate_app_preview` - open a known localhost URL in the pinned App Preview tab
- `read_app_preview` - inspect the current App Preview page before selecting elements
- `screenshot_app_preview` - capture the App Preview viewport or a specific element
- `click_app_preview` - click an element inside App Preview
- `type_in_app_preview` - type text or press keys inside App Preview

If the `app_preview` tools are missing or return “Parakit App Preview is not available”, do not invent replacements and do not open an external browser. Use the fallback below.

## Fallback Flow

1. Start the dev server with browser auto-open disabled.
2. Make sure the terminal output contains the exact local URL.
3. Let the IDE route the local URL into the pinned App Preview tab.

Examples:

```sh
BROWSER=none npm run dev
npm run dev -- --host 127.0.0.1
```

If the command does not print a URL, print one after the server starts:

```sh
echo "App Preview URL: http://localhost:3000/"
```

Do not run:

```sh
open http://localhost:3000/
npx playwright test
```

Do not use Playwright MCP, Chrome, Safari, Firefox, or default-browser tools for ordinary local preview.

## Project Preview URLs

When a repo or branch needs a stable default route, use `.designer/preview.json`:

```json
{
  "default": "http://localhost:3000/",
  "branches": {
    "feature/my-screen": "http://localhost:3000/my-screen?mode=design"
  }
}
```

Use a branch-specific URL when the designer needs to land on a specific screen for that branch.

## Deterministic Dev Server

When the dev command should be owned by the IDE preview flow, use `.designer/dev.json`:

```json
{
  "default": {
    "command": "npm run dev",
    "portEnv": "PORT",
    "url": "http://127.0.0.1:${PORT}/",
    "healthPath": "/"
  }
}
```

The preview system chooses a port, sets the configured port environment variable, starts the command, navigates App Preview, and checks health.

## If Preview Does Not Navigate

Report the exact localhost URL and ask the user to use **Configure URL** in App Preview. Do not silently fall back to an external browser.
