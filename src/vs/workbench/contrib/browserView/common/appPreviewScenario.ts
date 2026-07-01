/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const APP_PREVIEW_SCENARIOS_CONFIG_PATH = '.designer/scenarios.json';
export const APP_PREVIEW_SCENARIO_STORAGE_PREFIX = 'workbench.appPreview.scenario';
export const APP_PREVIEW_SCENARIO_CONFIG_VERSION = 1;

export type AppPreviewScenarioControlValue = string | boolean | readonly string[];
export type AppPreviewScenarioSupportStatus = 'supported' | 'unsupported' | 'unknown' | string;

export interface IAppPreviewScenarioChoice {
	readonly id: string;
	readonly label: string;
}

export interface IAppPreviewScenarioChoiceControl {
	readonly id: string;
	readonly label: string;
	readonly type: 'choice';
	readonly choices: readonly IAppPreviewScenarioChoice[];
}

export interface IAppPreviewScenarioMultiChoiceControl {
	readonly id: string;
	readonly label: string;
	readonly type: 'multiChoice';
	readonly choices: readonly IAppPreviewScenarioChoice[];
}

export interface IAppPreviewScenarioToggleControl {
	readonly id: string;
	readonly label: string;
	readonly type: 'toggle';
}

export type AppPreviewScenarioControl = IAppPreviewScenarioChoiceControl | IAppPreviewScenarioMultiChoiceControl | IAppPreviewScenarioToggleControl;
export type AppPreviewScenarioEditableControlType = AppPreviewScenarioControl['type'];

export interface IAppPreviewScenarioGroup {
	readonly id: string;
	readonly label: string;
	readonly controls: readonly AppPreviewScenarioControl[];
}

export interface IAppPreviewScenarioGeneratedFile {
	readonly path: string;
	readonly sha256: string;
}

export interface IAppPreviewScenarioImplementation {
	readonly designOnlyFiles?: readonly IAppPreviewScenarioGeneratedFile[];
}

export interface IAppPreviewScenarioConfig {
	readonly version: 1;
	readonly groups: readonly IAppPreviewScenarioGroup[];
	readonly defaultValues: Record<string, AppPreviewScenarioControlValue>;
	readonly implementation?: IAppPreviewScenarioImplementation;
}

export type AppPreviewScenarioValidationErrorCode =
	| 'invalidConfig'
	| 'invalidVersion'
	| 'invalidGroups'
	| 'invalidGroupId'
	| 'duplicateGroupId'
	| 'invalidGroupLabel'
	| 'invalidControls'
	| 'invalidControlId'
	| 'duplicateControlId'
	| 'invalidControlLabel'
	| 'invalidControlType'
	| 'invalidChoices'
	| 'invalidChoiceId'
	| 'duplicateChoiceId'
	| 'invalidChoiceLabel'
	| 'invalidDefaultValues'
	| 'unknownDefaultControl'
	| 'invalidChoiceDefault'
	| 'invalidToggleDefault';

export interface IAppPreviewScenarioValidationError {
	readonly code: AppPreviewScenarioValidationErrorCode;
	readonly path: string;
	readonly message: string;
}

export interface IAppPreviewScenarioParseResult {
	readonly config?: IAppPreviewScenarioConfig;
	readonly errors: readonly IAppPreviewScenarioValidationError[];
}

export interface IAppPreviewScenarioBridgePayload {
	readonly version: 1;
	readonly defaultValues: Record<string, AppPreviewScenarioControlValue>;
	readonly values: Record<string, AppPreviewScenarioControlValue>;
	readonly summary: string;
	readonly support: Record<string, AppPreviewScenarioSupportStatus>;
}

export interface IAppPreviewScenarioChatTabState {
	readonly tabId: string;
	readonly values: unknown;
}

export interface ICreateAppPreviewScenarioChatContextOptions {
	readonly config: IAppPreviewScenarioConfig;
	readonly activeTabId: string;
	readonly activeValues: unknown;
	readonly otherTabs?: readonly IAppPreviewScenarioChatTabState[];
}

export function getStarterAppPreviewScenarioGroups(): IAppPreviewScenarioGroup[] {
	return [
		{
			id: 'permissions',
			label: 'Permissions',
			controls: [
				{
					id: 'role',
					label: 'Role',
					type: 'choice',
					choices: [
						{ id: 'member', label: 'Member' },
						{ id: 'project-admin', label: 'Project admin' },
						{ id: 'account-admin', label: 'Account admin' },
						{ id: 'admin', label: 'Admin' },
					]
				},
			]
		},
		{
			id: 'ui',
			label: 'UI State',
			controls: [
				{ id: 'active', label: 'Active', type: 'toggle' },
				{ id: 'disabled', label: 'Disabled', type: 'toggle' },
				{ id: 'error', label: 'Error', type: 'toggle' },
				{ id: 'loading', label: 'Loading', type: 'toggle' },
			]
		},
		{
			id: 'content',
			label: 'Content Stress',
			controls: [
				{
					id: 'length',
					label: 'Length',
					type: 'choice',
					choices: [
						{ id: 'normal', label: 'Normal' },
						{ id: 'long', label: 'Long' },
						{ id: 'empty', label: 'Empty' },
					]
				},
			]
		},
		{
			id: 'concept',
			label: 'Concept Variant',
			controls: [
				{
					id: 'variant',
					label: 'Variant',
					type: 'choice',
					choices: [
						{ id: 'a', label: 'A' },
						{ id: 'b', label: 'B' },
						{ id: 'c', label: 'C' },
					]
				},
			]
		},
	];
}

export function getAppPreviewScenarioControlKey(groupId: string, controlId: string): string {
	return `${groupId}.${controlId}`;
}

export function getAppPreviewScenarioDefaultValues(groups: readonly IAppPreviewScenarioGroup[]): Record<string, AppPreviewScenarioControlValue> {
	const values: Record<string, AppPreviewScenarioControlValue> = {};

	for (const group of groups) {
		for (const control of group.controls) {
			const key = getAppPreviewScenarioControlKey(group.id, control.id);
			if (control.type === 'choice') {
				values[key] = control.choices[0]?.id ?? '';
			} else if (control.type === 'multiChoice') {
				values[key] = [];
			} else {
				values[key] = false;
			}
		}
	}

	return values;
}

export function createDefaultAppPreviewScenarioConfig(groups: readonly IAppPreviewScenarioGroup[] = getStarterAppPreviewScenarioGroups()): IAppPreviewScenarioConfig {
	return {
		version: APP_PREVIEW_SCENARIO_CONFIG_VERSION,
		groups: cloneScenarioGroups(groups),
		defaultValues: getAppPreviewScenarioDefaultValues(groups)
	};
}

export function getAppPreviewScenarioStorageKey(repositoryKey: string, branchName: string | undefined, tabId: string): string {
	return [
		APP_PREVIEW_SCENARIO_STORAGE_PREFIX,
		encodeURIComponent(repositoryKey),
		encodeURIComponent(branchName || '<detached>'),
		encodeURIComponent(tabId)
	].join('/');
}

export function createAppPreviewScenarioBridgePayload(config: IAppPreviewScenarioConfig, values: unknown, support?: Record<string, AppPreviewScenarioSupportStatus>): IAppPreviewScenarioBridgePayload {
	const normalized = normalizeAppPreviewScenarioState(config, values);
	const normalizedSupport: Record<string, AppPreviewScenarioSupportStatus> = {};

	for (const group of config.groups) {
		for (const control of group.controls) {
			const key = getAppPreviewScenarioControlKey(group.id, control.id);
			normalizedSupport[key] = support?.[key] ?? 'unknown';
		}
	}

	return {
		version: APP_PREVIEW_SCENARIO_CONFIG_VERSION,
		defaultValues: cloneScenarioValues(config.defaultValues),
		values: normalized,
		summary: summarizeAppPreviewScenarioState(config, normalized),
		support: normalizedSupport
	};
}

export function createAppPreviewScenarioChatContext(options: ICreateAppPreviewScenarioChatContextOptions): string {
	const activeSummary = summarizeAppPreviewScenarioState(options.config, options.activeValues);
	const lines = [
		`Active App Preview tab ${options.activeTabId} variant: ${activeSummary}.`,
		'Agent targeting rule: infer from conversation context; assume global/current UI unless the user clearly refers to a variant/control; ask when ambiguity remains.',
		'PR readiness: .designer/scenarios.json and recorded design-only helper files are design artifacts; the branch is not PR-ready until cleanup removes them or the behavior is intentionally promoted into production code.'
	];

	const differingTabs: string[] = [];
	for (const tab of options.otherTabs ?? []) {
		const summary = summarizeAppPreviewScenarioState(options.config, tab.values);
		if (summary !== activeSummary) {
			differingTabs.push(`${tab.tabId}: ${summary}`);
		}
	}

	if (differingTabs.length > 0) {
		lines.push(`Other App Preview tabs differ: ${differingTabs.join('; ')}.`);
	}

	return lines.join('\n');
}

export function parseAppPreviewScenarioConfig(raw: unknown): IAppPreviewScenarioParseResult {
	const errors: IAppPreviewScenarioValidationError[] = [];
	if (!isRecord(raw)) {
		return {
			errors: [{
				code: 'invalidConfig',
				path: '',
				message: 'Variant config must be an object.'
			}]
		};
	}

	if (raw.version !== APP_PREVIEW_SCENARIO_CONFIG_VERSION) {
		errors.push({
			code: 'invalidVersion',
			path: 'version',
			message: 'Variant config version must be 1.'
		});
	}

	if (!Array.isArray(raw.groups)) {
		errors.push({
			code: 'invalidGroups',
			path: 'groups',
			message: 'Variant groups must be an array.'
		});
	}

	if (!isRecord(raw.defaultValues)) {
		errors.push({
			code: 'invalidDefaultValues',
			path: 'defaultValues',
			message: 'Variant default values must be an object.'
		});
	}

	const groups = Array.isArray(raw.groups) ? parseScenarioGroups(raw.groups, errors) : [];
	const controls = getControlMap(groups);
	const defaultValues = getAppPreviewScenarioDefaultValues(groups);

	if (isRecord(raw.defaultValues)) {
		for (const [key, value] of Object.entries(raw.defaultValues)) {
			const control = controls.get(key);
			if (!control) {
				errors.push({
					code: 'unknownDefaultControl',
					path: `defaultValues.${key}`,
					message: `Default value references unknown control '${key}'.`
				});
				continue;
			}

			const errorCode = getInvalidValueErrorCode(control, value);
			if (errorCode) {
				errors.push({
					code: errorCode,
					path: `defaultValues.${key}`,
					message: `Default value for '${key}' is not valid for the control type.`
				});
				continue;
			}

			defaultValues[key] = cloneScenarioValue(value as AppPreviewScenarioControlValue);
		}
	}

	if (errors.length > 0) {
		return { errors };
	}

	return {
		config: {
			version: APP_PREVIEW_SCENARIO_CONFIG_VERSION,
			groups,
			defaultValues,
			implementation: parseImplementation(raw.implementation)
		},
		errors: []
	};
}

export function normalizeAppPreviewScenarioState(config: IAppPreviewScenarioConfig, values: unknown): Record<string, AppPreviewScenarioControlValue> {
	const controls = getControlMap(config.groups);
	const normalized: Record<string, AppPreviewScenarioControlValue> = cloneScenarioValues(config.defaultValues);

	if (!isRecord(values)) {
		return normalized;
	}

	for (const [key, value] of Object.entries(values)) {
		const control = controls.get(key);
		if (!control || getInvalidValueErrorCode(control, value)) {
			continue;
		}

		normalized[key] = cloneScenarioValue(value as AppPreviewScenarioControlValue);
	}

	return normalized;
}

export function summarizeAppPreviewScenarioState(config: IAppPreviewScenarioConfig, values: unknown): string {
	const state = normalizeAppPreviewScenarioState(config, values);
	const changes: string[] = [];

	for (const group of config.groups) {
		for (const control of group.controls) {
			const key = getAppPreviewScenarioControlKey(group.id, control.id);
			if (areAppPreviewScenarioValuesEqual(state[key], config.defaultValues[key])) {
				continue;
			}

			changes.push(`${control.label}: ${formatControlValue(control, state[key])}`);
		}
	}

	return changes.length === 0 ? 'Default' : changes.join(', ');
}

export function isAppPreviewScenarioCustomState(config: IAppPreviewScenarioConfig, values: unknown): boolean {
	return summarizeAppPreviewScenarioState(config, values) !== 'Default';
}

export function isAppPreviewScenarioDesignOnlyFilePath(path: string): boolean {
	const normalized = path.replace(/\\/g, '/');
	return !!normalized
		&& !normalized.startsWith('/')
		&& !normalized.includes('://')
		&& normalized.split('/').every(part => !!part && part !== '.' && part !== '..');
}

export function areAppPreviewScenarioValuesEqual(first: AppPreviewScenarioControlValue | undefined, second: AppPreviewScenarioControlValue | undefined): boolean {
	if (Array.isArray(first) || Array.isArray(second)) {
		return Array.isArray(first)
			&& Array.isArray(second)
			&& first.length === second.length
			&& first.every((value, index) => second[index] === value);
	}

	return first === second;
}

export function addAppPreviewScenarioGroup(config: IAppPreviewScenarioConfig, label: string): IAppPreviewScenarioConfig {
	const groupIds = new Set(config.groups.map(group => group.id));
	const group = {
		id: createUniqueScenarioId(label, groupIds, 'group'),
		label: label.trim() || 'Group',
		controls: []
	};

	return withScenarioGroups(config, [...config.groups, group]);
}

export function removeAppPreviewScenarioGroup(config: IAppPreviewScenarioConfig, groupId: string): IAppPreviewScenarioConfig {
	return withScenarioGroups(config, config.groups.filter(group => group.id !== groupId));
}

export function addAppPreviewScenarioControl(config: IAppPreviewScenarioConfig, groupId: string, type: AppPreviewScenarioEditableControlType, label: string): IAppPreviewScenarioConfig {
	const groups = cloneScenarioGroups(config.groups);
	const group = groups.find(group => group.id === groupId);
	if (!group) {
		return config;
	}

	const controlIds = new Set(group.controls.map(control => control.id));
	const controlId = createUniqueScenarioId(label, controlIds, 'property');
	const controlLabel = label.trim() || 'Property';
	const control = createScenarioControl(controlId, controlLabel, type);
	group.controls = [...group.controls, control];

	return withScenarioGroups(config, groups);
}

export function removeAppPreviewScenarioControl(config: IAppPreviewScenarioConfig, groupId: string, controlId: string): IAppPreviewScenarioConfig {
	const groups = cloneScenarioGroups(config.groups);
	const group = groups.find(group => group.id === groupId);
	if (!group) {
		return config;
	}

	group.controls = group.controls.filter(control => control.id !== controlId);
	return withScenarioGroups(config, groups);
}

export function addAppPreviewScenarioChoice(config: IAppPreviewScenarioConfig, groupId: string, controlId: string, label: string): IAppPreviewScenarioConfig {
	const groups = cloneScenarioGroups(config.groups);
	const control = findScenarioControl(groups, groupId, controlId);
	if (!control || control.type === 'toggle') {
		return config;
	}

	const choiceIds = new Set(control.choices.map(choice => choice.id));
	control.choices = [
		...control.choices,
		{
			id: createUniqueScenarioId(label, choiceIds, 'option'),
			label: label.trim() || 'Option'
		}
	];

	return withScenarioGroups(config, groups);
}

export function removeAppPreviewScenarioChoice(config: IAppPreviewScenarioConfig, groupId: string, controlId: string, choiceId: string): IAppPreviewScenarioConfig {
	const groups = cloneScenarioGroups(config.groups);
	const control = findScenarioControl(groups, groupId, controlId);
	if (!control || control.type === 'toggle' || control.choices.length <= 1) {
		return config;
	}

	const nextChoices = control.choices.filter(choice => choice.id !== choiceId);
	if (nextChoices.length === control.choices.length) {
		return config;
	}

	control.choices = nextChoices;
	const key = getAppPreviewScenarioControlKey(groupId, controlId);
	const defaultValue = config.defaultValues[key];
	const defaultOverrides: Record<string, AppPreviewScenarioControlValue> = {};
	if (control.type === 'choice' && defaultValue === choiceId) {
		defaultOverrides[key] = nextChoices[0].id;
	} else if (control.type === 'multiChoice' && Array.isArray(defaultValue)) {
		defaultOverrides[key] = defaultValue.filter(value => value !== choiceId);
	}

	return withScenarioGroups(config, groups, defaultOverrides);
}

export function updateAppPreviewScenarioChoiceLabel(config: IAppPreviewScenarioConfig, groupId: string, controlId: string, choiceId: string, label: string): IAppPreviewScenarioConfig {
	const nextLabel = label.trim();
	if (!nextLabel) {
		return config;
	}

	const groups = cloneScenarioGroups(config.groups);
	const control = findScenarioControl(groups, groupId, controlId);
	if (!control || control.type === 'toggle') {
		return config;
	}

	const choice = control.choices.find(choice => choice.id === choiceId);
	if (!choice || choice.label === nextLabel) {
		return config;
	}

	control.choices = control.choices.map(choice => choice.id === choiceId ? { ...choice, label: nextLabel } : choice);
	return withScenarioGroups(config, groups);
}

export function moveAppPreviewScenarioControl(config: IAppPreviewScenarioConfig, sourceGroupId: string, controlId: string, targetGroupId: string): IAppPreviewScenarioConfig {
	if (sourceGroupId === targetGroupId) {
		return config;
	}

	const groups = cloneScenarioGroups(config.groups);
	const sourceGroup = groups.find(group => group.id === sourceGroupId);
	const targetGroup = groups.find(group => group.id === targetGroupId);
	if (!sourceGroup || !targetGroup) {
		return config;
	}

	const control = sourceGroup.controls.find(control => control.id === controlId);
	if (!control) {
		return config;
	}

	sourceGroup.controls = sourceGroup.controls.filter(control => control.id !== controlId);
	const targetIds = new Set(targetGroup.controls.map(control => control.id));
	const movedControl = cloneScenarioControl(control);
	movedControl.id = createUniqueScenarioId(movedControl.id, targetIds, 'property');
	targetGroup.controls = [...targetGroup.controls, movedControl];

	const oldKey = getAppPreviewScenarioControlKey(sourceGroupId, controlId);
	const newKey = getAppPreviewScenarioControlKey(targetGroupId, movedControl.id);
	const defaultOverrides: Record<string, AppPreviewScenarioControlValue> = {};
	if (config.defaultValues[oldKey] !== undefined) {
		defaultOverrides[newKey] = cloneScenarioValue(config.defaultValues[oldKey]);
	}

	return withScenarioGroups(config, groups, defaultOverrides);
}

function parseScenarioGroups(rawGroups: readonly unknown[], errors: IAppPreviewScenarioValidationError[]): IAppPreviewScenarioGroup[] {
	const groups: IAppPreviewScenarioGroup[] = [];
	const groupIds = new Set<string>();
	const controlIds = new Set<string>();

	for (let groupIndex = 0; groupIndex < rawGroups.length; groupIndex++) {
		const rawGroup = rawGroups[groupIndex];
		if (!isRecord(rawGroup)) {
			errors.push({
				code: 'invalidGroups',
				path: `groups.${groupIndex}`,
				message: 'Variant group must be an object.'
			});
			continue;
		}

		const groupId = typeof rawGroup.id === 'string' ? rawGroup.id.trim() : '';
		if (!groupId) {
			errors.push({
				code: 'invalidGroupId',
				path: `groups.${groupIndex}.id`,
				message: 'Variant group id must be a non-empty string.'
			});
		} else if (groupIds.has(groupId)) {
			errors.push({
				code: 'duplicateGroupId',
				path: `groups.${groupIndex}.id`,
				message: `Variant group id '${groupId}' is duplicated.`
			});
		}
		groupIds.add(groupId);

		const groupLabel = typeof rawGroup.label === 'string' ? rawGroup.label.trim() : '';
		if (!groupLabel) {
			errors.push({
				code: 'invalidGroupLabel',
				path: `groups.${groupIndex}.label`,
				message: 'Variant group label must be a non-empty string.'
			});
		}

		if (!Array.isArray(rawGroup.controls)) {
			errors.push({
				code: 'invalidControls',
				path: `groups.${groupIndex}.controls`,
				message: 'Variant group controls must be an array.'
			});
			continue;
		}

		const controls = parseScenarioControls(groupId, groupIndex, rawGroup.controls, controlIds, errors);
		groups.push({
			id: groupId,
			label: groupLabel,
			controls
		});
	}

	return groups;
}

function parseScenarioControls(groupId: string, groupIndex: number, rawControls: readonly unknown[], controlIds: Set<string>, errors: IAppPreviewScenarioValidationError[]): AppPreviewScenarioControl[] {
	const controls: AppPreviewScenarioControl[] = [];
	const localControlIds = new Set<string>();

	for (let controlIndex = 0; controlIndex < rawControls.length; controlIndex++) {
		const rawControl = rawControls[controlIndex];
		if (!isRecord(rawControl)) {
			errors.push({
				code: 'invalidControls',
				path: `groups.${groupIndex}.controls.${controlIndex}`,
				message: 'Variant control must be an object.'
			});
			continue;
		}

		const controlId = typeof rawControl.id === 'string' ? rawControl.id.trim() : '';
		const controlKey = getAppPreviewScenarioControlKey(groupId, controlId);
		if (!controlId) {
			errors.push({
				code: 'invalidControlId',
				path: `groups.${groupIndex}.controls.${controlIndex}.id`,
				message: 'Variant control id must be a non-empty string.'
			});
		} else if (localControlIds.has(controlId) || controlIds.has(controlKey)) {
			errors.push({
				code: 'duplicateControlId',
				path: `groups.${groupIndex}.controls.${controlIndex}.id`,
				message: `Variant control id '${controlKey}' is duplicated.`
			});
		}
		localControlIds.add(controlId);
		controlIds.add(controlKey);

		const controlLabel = typeof rawControl.label === 'string' ? rawControl.label.trim() : '';
		if (!controlLabel) {
			errors.push({
				code: 'invalidControlLabel',
				path: `groups.${groupIndex}.controls.${controlIndex}.label`,
				message: 'Variant control label must be a non-empty string.'
			});
		}

		if (rawControl.type === 'choice' || rawControl.type === 'multiChoice') {
			const choices = parseScenarioChoices(groupIndex, controlIndex, rawControl.choices, errors);
			controls.push({
				id: controlId,
				label: controlLabel,
				type: rawControl.type,
				choices
			});
			continue;
		}

		if (rawControl.type === 'toggle') {
			controls.push({
				id: controlId,
				label: controlLabel,
				type: 'toggle'
			});
			continue;
		}

		errors.push({
			code: 'invalidControlType',
			path: `groups.${groupIndex}.controls.${controlIndex}.type`,
			message: 'Variant control type must be choice, multiChoice, or toggle.'
		});
	}

	return controls;
}

function parseScenarioChoices(groupIndex: number, controlIndex: number, rawChoices: unknown, errors: IAppPreviewScenarioValidationError[]): IAppPreviewScenarioChoice[] {
	const choices: IAppPreviewScenarioChoice[] = [];
	const choiceIds = new Set<string>();

	if (!Array.isArray(rawChoices) || rawChoices.length === 0) {
		errors.push({
			code: 'invalidChoices',
			path: `groups.${groupIndex}.controls.${controlIndex}.choices`,
			message: 'Choice controls must define at least one choice.'
		});
		return choices;
	}

	for (let choiceIndex = 0; choiceIndex < rawChoices.length; choiceIndex++) {
		const rawChoice = rawChoices[choiceIndex];
		if (!isRecord(rawChoice)) {
			errors.push({
				code: 'invalidChoices',
				path: `groups.${groupIndex}.controls.${controlIndex}.choices.${choiceIndex}`,
				message: 'Variant choice must be an object.'
			});
			continue;
		}

		const choiceId = typeof rawChoice.id === 'string' ? rawChoice.id.trim() : '';
		if (!choiceId) {
			errors.push({
				code: 'invalidChoiceId',
				path: `groups.${groupIndex}.controls.${controlIndex}.choices.${choiceIndex}.id`,
				message: 'Variant choice id must be a non-empty string.'
			});
		} else if (choiceIds.has(choiceId)) {
			errors.push({
				code: 'duplicateChoiceId',
				path: `groups.${groupIndex}.controls.${controlIndex}.choices.${choiceIndex}.id`,
				message: `Variant choice id '${choiceId}' is duplicated.`
			});
		}
		choiceIds.add(choiceId);

		const choiceLabel = typeof rawChoice.label === 'string' ? rawChoice.label.trim() : '';
		if (!choiceLabel) {
			errors.push({
				code: 'invalidChoiceLabel',
				path: `groups.${groupIndex}.controls.${controlIndex}.choices.${choiceIndex}.label`,
				message: 'Variant choice label must be a non-empty string.'
			});
		}

		choices.push({ id: choiceId, label: choiceLabel });
	}

	return choices;
}

function parseImplementation(rawImplementation: unknown): IAppPreviewScenarioImplementation | undefined {
	if (!isRecord(rawImplementation) || !Array.isArray(rawImplementation.designOnlyFiles)) {
		return undefined;
	}

	const designOnlyFiles: IAppPreviewScenarioGeneratedFile[] = [];
	for (const rawFile of rawImplementation.designOnlyFiles) {
		if (!isRecord(rawFile) || typeof rawFile.path !== 'string' || typeof rawFile.sha256 !== 'string') {
			continue;
		}

		designOnlyFiles.push({
			path: rawFile.path,
			sha256: rawFile.sha256
		});
	}

	return designOnlyFiles.length === 0 ? undefined : { designOnlyFiles };
}

function getControlMap(groups: readonly IAppPreviewScenarioGroup[]): Map<string, AppPreviewScenarioControl> {
	const controls = new Map<string, AppPreviewScenarioControl>();
	for (const group of groups) {
		for (const control of group.controls) {
			controls.set(getAppPreviewScenarioControlKey(group.id, control.id), control);
		}
	}

	return controls;
}

function getInvalidValueErrorCode(control: AppPreviewScenarioControl, value: unknown): 'invalidChoiceDefault' | 'invalidToggleDefault' | undefined {
	if (control.type === 'toggle') {
		return typeof value === 'boolean' ? undefined : 'invalidToggleDefault';
	}

	if (control.type === 'multiChoice') {
		return Array.isArray(value)
			&& value.every(item => typeof item === 'string' && control.choices.some(choice => choice.id === item))
			? undefined
			: 'invalidChoiceDefault';
	}

	return typeof value === 'string' && control.choices.some(choice => choice.id === value) ? undefined : 'invalidChoiceDefault';
}

function formatControlValue(control: AppPreviewScenarioControl, value: AppPreviewScenarioControlValue): string {
	if (control.type === 'toggle') {
		return value === true ? 'on' : 'off';
	}

	if (control.type === 'multiChoice') {
		if (!Array.isArray(value) || value.length === 0) {
			return 'none';
		}

		return value
			.map(value => control.choices.find(choice => choice.id === value)?.label ?? value)
			.join(', ');
	}

	if (typeof value !== 'string') {
		return '';
	}

	return control.choices.find(choice => choice.id === value)?.label ?? value;
}

type MutableScenarioControl =
	| { id: string; label: string; type: 'choice'; choices: IAppPreviewScenarioChoice[] }
	| { id: string; label: string; type: 'multiChoice'; choices: IAppPreviewScenarioChoice[] }
	| { id: string; label: string; type: 'toggle' };

interface IMutableScenarioGroup {
	id: string;
	label: string;
	controls: MutableScenarioControl[];
}

function cloneScenarioGroups(groups: readonly IAppPreviewScenarioGroup[]): IMutableScenarioGroup[] {
	return groups.map(group => ({
		id: group.id,
		label: group.label,
		controls: group.controls.map(control => {
			if (control.type === 'toggle') {
				return {
					id: control.id,
					label: control.label,
					type: control.type
				};
			}

			return {
				id: control.id,
				label: control.label,
				type: control.type,
				choices: control.choices.map(choice => ({ id: choice.id, label: choice.label }))
			};
		})
	}));
}

function cloneScenarioControl(control: AppPreviewScenarioControl): MutableScenarioControl {
	return cloneScenarioGroups([{ id: 'group', label: 'Group', controls: [control] }])[0].controls[0];
}

function cloneScenarioValue(value: AppPreviewScenarioControlValue): AppPreviewScenarioControlValue {
	return Array.isArray(value) ? [...value] : value;
}

function cloneScenarioValues(values: Record<string, AppPreviewScenarioControlValue>): Record<string, AppPreviewScenarioControlValue> {
	const clone: Record<string, AppPreviewScenarioControlValue> = {};
	for (const [key, value] of Object.entries(values)) {
		clone[key] = cloneScenarioValue(value);
	}
	return clone;
}

function withScenarioGroups(config: IAppPreviewScenarioConfig, groups: readonly IAppPreviewScenarioGroup[], defaultOverrides: Record<string, AppPreviewScenarioControlValue> = {}): IAppPreviewScenarioConfig {
	const defaultValues = getAppPreviewScenarioDefaultValues(groups);
	const controls = getControlMap(groups);

	for (const [key, value] of Object.entries(config.defaultValues)) {
		const control = controls.get(key);
		if (control && !getInvalidValueErrorCode(control, value)) {
			defaultValues[key] = cloneScenarioValue(value);
		}
	}

	for (const [key, value] of Object.entries(defaultOverrides)) {
		const control = controls.get(key);
		if (control && !getInvalidValueErrorCode(control, value)) {
			defaultValues[key] = cloneScenarioValue(value);
		}
	}

	return {
		...config,
		groups: cloneScenarioGroups(groups),
		defaultValues
	};
}

function createScenarioControl(id: string, label: string, type: AppPreviewScenarioEditableControlType): MutableScenarioControl {
	if (type === 'toggle') {
		return { id, label, type };
	}

	return {
		id,
		label,
		type,
		choices: [{ id: 'option-1', label: 'Option 1' }]
	};
}

function findScenarioControl(groups: readonly IMutableScenarioGroup[], groupId: string, controlId: string): MutableScenarioControl | undefined {
	return groups.find(group => group.id === groupId)?.controls.find(control => control.id === controlId);
}

function createUniqueScenarioId(label: string, existingIds: ReadonlySet<string>, fallback: string): string {
	const base = (label.trim() || fallback)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || fallback;

	if (!existingIds.has(base)) {
		return base;
	}

	let counter = 2;
	while (existingIds.has(`${base}-${counter}`)) {
		counter++;
	}

	return `${base}-${counter}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
