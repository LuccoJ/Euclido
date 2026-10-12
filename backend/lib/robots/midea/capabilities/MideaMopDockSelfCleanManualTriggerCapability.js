const MopDockSelfCleanManualTriggerCapability = require("../../../core/capabilities/MopDockSelfCleanManualTriggerCapability");
const MSmartConst = require("../../../msmart/MSmartConst");
const MSmartPacket = require("../../../msmart/MSmartPacket");

/**
 * @extends MopDockSelfCleanManualTriggerCapability<import("../MideaValetudoRobot")>
 */
class MideaMopDockSelfCleanManualTriggerCapability extends MopDockSelfCleanManualTriggerCapability {
    /**
     * @returns {Promise<void>}
     */
    async startCleaning() {
        const packet = new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.SETTING,
            payload: MSmartPacket.buildPayload(
                MSmartConst.SETTING.TRIGGER_STATION_SELF_CLEANING,
                Buffer.from([
                    0x01  // Start
                ])
            )
        });

        await this.robot.sendCommand(packet.toHexString());
    }

    /**
     * @returns {Promise<void>}
     */
    async stopCleaning() {
        // The station action stop also stops the self-cleaning
        const packet = new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.SETTING,
            payload: MSmartPacket.buildPayload(
                MSmartConst.SETTING.TRIGGER_STATION_ACTION,
                Buffer.from([
                    0x00, // Mode: Ignored when stopping
                    0x00  // Control: Stop
                ])
            )
        });

        await this.robot.sendCommand(packet.toHexString());
    }
}

module.exports = MideaMopDockSelfCleanManualTriggerCapability;
