---
name: app-variants
description: Use when creating, editing, testing, comparing, or managing App Preview variants, UI states, roles, permissions, active/disabled/loading/error states, content stress cases, option sets, or variant-specific design behavior.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# App Variants

Use Parakit's App Preview variants controller. Do not invent a separate variant system.

## Controller Contract

Variants are declared in `.designer/scenarios.json`:

```json
{
	"version": 1,
	"groups": [
		{
			"id": "ui",
			"label": "UI State",
			"controls": [
				{
					"id": "button-state",
					"label": "Button state",
					"type": "choice",
					"choices": [
						{ "id": "regular", "label": "Regular" },
						{ "id": "active", "label": "Active" },
						{ "id": "disabled", "label": "Disabled" }
					]
				}
			]
		}
	],
	"defaultValues": {
		"ui.button-state": "regular"
	}
}
```

Rules:

- Create or update `.designer/scenarios.json` before wiring app behavior.
- Preserve existing groups and controls unless the user asks to replace them.
- Use stable lowercase ids with hyphens; labels can be human-readable.
- Control keys are `<groupId>.<controlId>`.
- Supported control types are `choice`, `multiChoice`, and `toggle`.
- `choice` defaults are one choice id; `multiChoice` defaults are an array of choice ids; `toggle` defaults are boolean.
- Keep JSON valid and deterministic.

## App Runtime Contract

Read active values from:

```js
window.__vscodeDesignerScenario?.values
```

Listen for updates:

```js
window.addEventListener('vscode:designerScenarioChange', event => {
	const scenario = event.detail;
});
```

The payload contains `version`, `defaultValues`, `values`, `summary`, and `support`.

Map only the controls needed by the requested UI. Defaults must match normal production behavior. Do not persist variant state into app data stores.

## Support Feedback

When the app supports controls, report status so the variants panel can show it:

```js
window.dispatchEvent(new CustomEvent('vscode:designerScenarioSupport', {
	detail: {
		'ui.button-state': 'supported'
	}
}));
```

Use `supported`, `unsupported`, or a short diagnostic string. Missing feedback appears as `unknown`.

## Design-Only Cleanup

Variant scaffolding is design-only unless the user explicitly promotes it into production behavior.

- Prefer small helper files for variant-only runtime glue.
- If creating design-only helper files, record them in `.designer/scenarios.json` under `implementation.designOnlyFiles` with relative path and SHA-256.
- Do not record edited production source files as cleanup-safe.
- Before finishing, say whether variant-only artifacts remain and whether cleanup or promotion is needed before PR readiness.

## Common Mistakes

- Do not edit Parakit source from an app repo.
- Do not create another config file for variants.
- Do not hard-code a one-off state without adding the controller control.
- Do not assume a current visual change is variant-specific unless the user mentions variants, states, roles, permissions, or option sets.
