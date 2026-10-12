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
                MSmartConst.SETTING.TRIGGER_STATION_ACTION,
                Buffer.from([
                    0x03, // Mode: Station self-cleaning
                    0x01  // Control: Start
                ])
            )
        });

        await this.robot.sendCommand(packet.toHexString());
    }

    /**
     * @returns {Promise<void>}
     */
    async stopCleaning() {
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
