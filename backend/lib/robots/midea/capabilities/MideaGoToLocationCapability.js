const GoToLocationCapability = require("../../../core/capabilities/GoToLocationCapability");
const Logger = require("../../../Logger");
const MSmartConst = require("../../../msmart/MSmartConst");
const MSmartPacket = require("../../../msmart/MSmartPacket");

/**
 * @extends GoToLocationCapability<import("../MideaValetudoRobot")>
 */
class MideaGoToLocationCapability extends GoToLocationCapability {
    /**
     * @param {import("../../../entities/core/ValetudoGoToLocation")} valetudoGoToLocation
     * @returns {Promise<void>}
     */
    async goTo(valetudoGoToLocation) {
        if (!this.robot.mapParser.mapInfoValid) {
            throw new Error("Can't go to a location before the map has been received from the robot.");
        }

        const point = this.robot.mapParser.convertToMideaCoordinates(
            valetudoGoToLocation.coordinates.x,
            valetudoGoToLocation.coordinates.y
        );

        const payload = Buffer.alloc(4);
        payload.writeUInt16LE(point.x, 0);
        payload.writeUInt16LE(point.y, 2);

        Logger.info(`Going to location ${point.x},${point.y} (robot coordinates)`);

        const packet = new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.SETTING,
            payload: MSmartPacket.buildPayload(MSmartConst.SETTING.START_GO_TO_LOCATION, payload)
        });

        const response = await this.robot.sendCommand(packet.toHexString());

        Logger.info(`Go to location response payload: ${response?.payload?.toString("hex")}`);
    }
}

module.exports = MideaGoToLocationCapability;
