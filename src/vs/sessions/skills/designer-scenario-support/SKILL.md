---
name: designer-scenario-support
description: Add minimal local app support for App Preview variant controls when the user explicitly asks for variant-specific behavior.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Designer Variant Support

Use this skill only when the user explicitly asks to make app UI respond to an App Preview variant, variant control, permission state, error state, content stress case, or similar design-only state.

## Rules

- Do not add variant support just because `.designer/scenarios.json` exists.
- Do not add variant support when the user asks for a global/current UI edit and does not mention a variant.
- Infer from conversation context first. Assume global/current UI unless the user clearly refers to a variant/control. Ask when ambiguity remains.
- Keep support minimal and local to the affected UI surface.
- Follow existing app patterns. Do not add new libraries by default.
- Treat variant-only helper code as design-only. The branch is not PR-ready until cleanup removes it or the behavior is intentionally promoted into production code.

## Runtime Contract

Read the active variant from:

```js
window.__vscodeDesignerScenario
```

Listen for updates:

```js
window.addEventListener('vscode:designerScenarioChange', event => {
  const variant = event.detail;
});
```

The payload contains:

- `version`
- `defaultValues`
- `values`
- `summary`
- `support`

Control values are keyed as `<groupId>.<controlId>`, for example `permissions.role`, `ui.error`, `content.length`, or `concept.variant`.

## Support Feedback

When the app supports variant controls, dispatch feedback so the App Preview controller can show control status:

```js
window.dispatchEvent(new CustomEvent('vscode:designerScenarioSupport', {
  detail: {
    'permissions.role': 'supported',
    'ui.error': 'unsupported',
    'content.length': 'supported'
  }
}));
```

Use `supported`, `unsupported`, or a short diagnostic string. Missing feedback appears as `unknown`.

## Implementation Guidance

Prefer a tiny hook/helper close to the affected component:

1. Read `window.__vscodeDesignerScenario?.values`.
2. Subscribe to `vscode:designerScenarioChange`.
3. Map only the specific controls needed by the requested UI.
4. Keep defaults equivalent to normal production behavior.
5. Avoid persisting variant state in app data stores.
6. Avoid shipping variant-only files unless the user intentionally promotes the behavior.

Before finishing, mention any variant-only files that make the branch not PR-ready.
