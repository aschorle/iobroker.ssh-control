'use strict';

const SSHClient = require('./sshClient');
const { createHostStates } = require('./states');

const HOSTNAME_COMMAND = 'hostname';

class HostManager {
	/**
	 * @param {ioBroker.Adapter} adapter
	 */
	constructor(adapter) {
		if (!adapter) {
			throw new TypeError('adapter is required');
		}

		this.adapter = adapter;
		this.hosts = [];
	}

	async start() {
		this.hosts = this.readHosts();

		for (const host of this.hosts) {
			await createHostStates(this.adapter, host.stateId);
			await this.updateHostInfo(host);
		}
	}

	async stop() {
		this.hosts = [];
	}

	readHosts() {
		const configuredHosts = this.adapter.config?.hosts;

		if (!configuredHosts) {
			this.adapter.log.debug('No SSH hosts configured');
			return [];
		}

		const hosts = Array.isArray(configuredHosts) ? configuredHosts : Object.values(configuredHosts);

		return hosts.map((host, index) => this.normalizeHost(host, index)).filter(Boolean);
	}

	normalizeHost(host, index) {
		if (!host || typeof host !== 'object') {
			this.adapter.log.warn(`Ignoring invalid SSH host configuration at index ${index}`);
			return null;
		}

		const id = String(host.id || host.name || host.host || `host${index + 1}`).trim();
		const normalizedHost = {
			id,
			stateId: `hosts.${sanitizeStateId(id)}`,
			host: host.host,
			port: Number(host.port) || 22,
			username: host.username,
			privateKey: host.privateKey,
		};

		if (!normalizedHost.host || !normalizedHost.username || !normalizedHost.privateKey) {
			this.adapter.log.warn(`Ignoring incomplete SSH host configuration "${id}"`);
			return null;
		}

		return normalizedHost;
	}

	async updateHostInfo(host) {
		const client = new SSHClient({
			host: host.host,
			port: host.port,
			username: host.username,
			privateKey: host.privateKey,
		});

		try {
			const result = await client.exec(HOSTNAME_COMMAND);
			const hostname = result.stdout.trim();

			await this.adapter.setStateAsync(`${host.stateId}.info.online`, { val: true, ack: true });
			await this.adapter.setStateAsync(`${host.stateId}.info.hostname`, { val: hostname, ack: true });
			await this.adapter.setStateAsync(`${host.stateId}.info.lastSeen`, { val: new Date().toISOString(), ack: true });
		} catch (error) {
			await this.adapter.setStateAsync(`${host.stateId}.info.online`, { val: false, ack: true });
			this.adapter.log.warn(`Could not update SSH host "${host.id}": ${error.message}`);
		} finally {
			client.disconnect();
		}
	}
}

function sanitizeStateId(value) {
	return String(value)
		.trim()
		.replace(/[^a-zA-Z0-9_-]/g, '_');
}

module.exports = HostManager;
