'use strict';

const { Client } = require('ssh2');

const DEFAULT_TIMEOUT_MS = 10_000;

class SSHClient {
	/**
	 * @param {object} options
	 * @param {string} options.host
	 * @param {number} [options.port]
	 * @param {string} options.username
	 * @param {string | Buffer} options.privateKey
	 * @param {number} [options.timeout]
	 */
	constructor(options) {
		if (!options || typeof options !== 'object') {
			throw new TypeError('SSHClient options are required');
		}

		this.options = {
			port: 22,
			timeout: DEFAULT_TIMEOUT_MS,
			...options,
		};
		this.client = new Client();
		this.connected = false;
		this.connecting = null;
	}

	connect() {
		if (this.connected) {
			return Promise.resolve();
		}

		if (this.connecting) {
			return this.connecting;
		}

		this.connecting = new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				cleanup();
				this.client.end();
				reject(new Error('SSH connection timed out'));
			}, this.options.timeout);

			const cleanup = () => {
				clearTimeout(timeout);
				this.client.removeListener('ready', onReady);
				this.client.removeListener('error', onError);
				this.client.removeListener('close', onClose);
			};

			const onReady = () => {
				cleanup();
				this.connected = true;
				this.connecting = null;
				resolve();
			};

			const onError = error => {
				cleanup();
				this.connected = false;
				this.connecting = null;
				reject(error);
			};

			const onClose = () => {
				cleanup();
				this.connected = false;
				this.connecting = null;
				reject(new Error('SSH connection closed before it was ready'));
			};

			this.client.once('ready', onReady);
			this.client.once('error', onError);
			this.client.once('close', onClose);

			this.client.connect({
				host: this.options.host,
				port: this.options.port,
				username: this.options.username,
				privateKey: this.options.privateKey,
				readyTimeout: this.options.timeout,
			});
		});

		return this.connecting;
	}

	/**
	 * @param {string} command
	 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number | null }>}
	 */
	async exec(command) {
		if (!command || typeof command !== 'string') {
			throw new TypeError('SSH command must be a non-empty string');
		}

		await this.connect();

		return new Promise((resolve, reject) => {
			let stdout = '';
			let stderr = '';
			let exitCode = null;
			let settled = false;

			const timeout = setTimeout(() => {
				finish(new Error(`SSH command timed out after ${this.options.timeout} ms`));
			}, this.options.timeout);

			const finish = error => {
				if (settled) {
					return;
				}

				settled = true;
				clearTimeout(timeout);

				if (error) {
					reject(error);
					return;
				}

				resolve({ stdout, stderr, exitCode });
			};

			this.client.exec(command, (error, stream) => {
				if (error) {
					finish(error);
					return;
				}

				stream.on('close', code => {
					exitCode = typeof code === 'number' ? code : null;
					finish();
				});

				stream.on('data', data => {
					stdout += data.toString();
				});

				stream.stderr.on('data', data => {
					stderr += data.toString();
				});

				stream.on('error', finish);
			});
		});
	}

	disconnect() {
		this.connected = false;
		this.connecting = null;
		this.client.end();
	}
}

module.exports = SSHClient;
