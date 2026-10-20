const EmergencyLightControlCapability = require("../../../core/capabilities/EmergencyLightControlCapability");

/**
 * Turns on the camera's fill light when the dock seems to have lost power (see MideaValetudoRobot)
 *
 * @extends EmergencyLightControlCapability<import("../MideaValetudoRobot")>
 */
class MideaEmergencyLightControlCapability extends EmergencyLightControlCapability {
    async getLevel() {
        return this.robot.getEmergencyLightLevel();
    }

    /**
     * @param {number} level
     */
    async setLevel(level) {
        if (!Number.isInteger(level) || level < 0 || level > 100) {
            throw new Error("The level has to be a whole number between 0 and 100");
        }

        this.robot.setEmergencyLightLevel(level);
    }
}

module.exports = MideaEmergencyLightControlCapability;
