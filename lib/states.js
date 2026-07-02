'use strict';

async function createHostStates(adapter, hostId) {
	if (!adapter) {
		throw new TypeError('adapter is required');
	}

	if (!hostId || typeof hostId !== 'string') {
		throw new TypeError('hostId must be a non-empty string');
	}

	const states = getHostStateDefinitions(hostId);

	for (const [id, object] of Object.entries(states)) {
		await adapter.setObjectNotExistsAsync(id, object);
	}
}

function getHostStateDefinitions(hostId) {
	return {
		[`${hostId}.info.online`]: createStateObject('Online', 'boolean', 'indicator.reachable', true, false),
		[`${hostId}.info.hostname`]: createStateObject('Hostname', 'string', 'info.name', true, false),
		[`${hostId}.info.lastSeen`]: createStateObject('Last seen', 'string', 'date', true, false),

		[`${hostId}.command.command`]: createStateObject('Command', 'string', 'text', true, true),
		[`${hostId}.command.execute`]: createStateObject('Execute command', 'boolean', 'button', false, true),
		[`${hostId}.command.response`]: createStateObject('Command response', 'string', 'text', true, false),
		[`${hostId}.command.error`]: createStateObject('Command error', 'string', 'text', true, false),
		[`${hostId}.command.exitCode`]: createStateObject('Command exit code', 'number', 'value', true, false),

		[`${hostId}.actions.display`]: createStateObject('Display action', 'boolean', 'button', false, true),
	};
}

function createStateObject(name, type, role, read, write) {
	return {
		type: 'state',
		common: {
			name,
			type,
			role,
			read,
			write,
		},
		native: {},
	};
}

module.exports = {
	createHostStates,
	getHostStateDefinitions,
};
