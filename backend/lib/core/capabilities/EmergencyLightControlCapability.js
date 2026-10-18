const Capability = require("./Capability");
const NotImplementedError = require("../NotImplementedError");

/**
 * A light the robot turns on by itself in an emergency, for example when its dock loses power
 *
 * @template {import("../ValetudoRobot")} T
 * @extends Capability<T>
 */
class EmergencyLightControlCapability extends Capability {
    /**
     * @abstract
     * @returns {Promise<number>} brightness in percent, 0 = off
     */
    async getLevel() {
        throw new NotImplementedError();
    }

    /**
     * @abstract
     * @param {number} level brightness in percent, 0 = off
     * @returns {Promise<void>}
     */
    async setLevel(level) {
        throw new NotImplementedError();
    }

    getType() {
        return EmergencyLightControlCapability.TYPE;
    }
}

EmergencyLightControlCapability.TYPE = "EmergencyLightControlCapability";

module.exports = EmergencyLightControlCapability;
