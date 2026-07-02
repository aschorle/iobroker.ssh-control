'use strict';

/*
 * Created with @iobroker/create-adapter v3.1.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const HostManager = require('./lib/hostManager');

class SshControl extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	constructor(options) {
		super({
			...options,
			name: 'ssh-control',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));

		this.hostManager = null;
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		this.hostManager = new HostManager(this);
		await this.hostManager.start();

		this.subscribeStates('hosts.*.command.execute');
		this.subscribeStates('hosts.*.actions.display');
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 *
	 * @param {() => void} callback - Callback function
	 */
	onUnload(callback) {
		try {
			if (this.hostManager) {
				this.hostManager.stop();
				this.hostManager = null;
			}
			callback();
		} catch (error) {
			this.log.error(`Error during unloading: ${error.message}`);
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes.
	 *
	 * @param {string} id - State ID.
	 * @param {ioBroker.State | null | undefined} state - State object.
	 */
	async onStateChange(id, state) {
		if (!state || state.ack || state.val !== true || !this.hostManager) {
			return;
		}

		if (id.endsWith('.command.execute')) {
			await this.hostManager.executeCommand(id);
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	module.exports = options => new SshControl(options);
} else {
	// otherwise start the instance directly
	new SshControl();
}
