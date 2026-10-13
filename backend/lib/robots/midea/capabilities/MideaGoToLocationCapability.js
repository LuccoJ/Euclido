const GoToLocationCapability = require("../../../core/capabilities/GoToLocationCapability");
const Logger = require("../../../Logger");
const MSmartConst = require("../../../msmart/MSmartConst");
const MSmartPacket = require("../../../msmart/MSmartPacket");

/**
 * Uses the cruise command with a single point: the robot drives there, turns towards the point and takes a photo.
 *
 * Opcode 0x04 looks like a go-to, but the firmware only logs and records the point, so the robot doesn't move.
 *
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

        // Point count, then [index, x u16 LE, y u16 LE] per point
        const payload = Buffer.alloc(1 + 5);
        payload[0] = 1;
        payload[1] = 0;
        payload.writeUInt16LE(point.x, 2);
        payload.writeUInt16LE(point.y, 4);

        Logger.info(`Going to location ${point.x},${point.y} (robot coordinates). Payload: ${payload.toString("hex")}`);

        const packet = new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.SETTING,
            payload: MSmartPacket.buildPayload(MSmartConst.SETTING.START_CRUISE, payload)
        });

        const response = await this.robot.sendCommand(packet.toHexString());

        Logger.info(`Go to location response payload: ${response?.payload?.toString("hex")}`);
    }
}

module.exports = MideaGoToLocationCapability;
