const Capability = require("./Capability");
const NotImplementedError = require("../NotImplementedError");

/**
 * Starts or stops the self-cleaning of the dock itself (e.g. rinsing its wash tray),
 * as opposed to the MopDockCleanManualTriggerCapability, which cleans the mop pads
 *
 * @template {import("../ValetudoRobot")} T
 * @extends Capability<T>
 */
class MopDockSelfCleanManualTriggerCapability extends Capability {
    /**
     * @abstract
     * @returns {Promise<void>}
     */
    async startCleaning() {
        throw new NotImplementedError();
    }

    /**
     * @abstract
     * @returns {Promise<void>}
     */
    async stopCleaning() {
        throw new NotImplementedError();
    }

    getType() {
        return MopDockSelfCleanManualTriggerCapability.TYPE;
    }
}

MopDockSelfCleanManualTriggerCapability.TYPE = "MopDockSelfCleanManualTriggerCapability";

module.exports = MopDockSelfCleanManualTriggerCapability;
