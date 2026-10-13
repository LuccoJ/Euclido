const MideaMapSegmentationCapabilityV2 = require("./MideaMapSegmentationCapabilityV2");
const MideaRoomOrderManager = require("../MideaRoomOrderManager");

/**
 * Room cleaning with a custom order, done by temporarily changing the rooms' stored cleaning order.
 * See MideaRoomOrderManager.
 */
class MideaCustomOrderMapSegmentationCapability extends MideaMapSegmentationCapabilityV2 {
    /**
     * @param {object} options
     * @param {import("../MideaValetudoRobot")} options.robot
     */
    constructor(options) {
        super(options);

        this.roomOrderManager = new MideaRoomOrderManager({robot: this.robot});
    }

    /**
     * @param {Array<import("../../../entities/core/ValetudoMapSegment")>} segments
     * @param {object} [options]
     * @param {number} [options.iterations]
     * @param {boolean} [options.customOrder]
     * @returns {Promise<void>}
     */
    async executeSegmentAction(segments, options) {
        if (options?.customOrder === true && segments.length > 1 && segments.length <= 10) {
            await this.roomOrderManager.applyOrder(segments.map(s => {
                return parseInt(s.id);
            }));
        }

        await super.executeSegmentAction(segments, options);
    }

    /**
     * @returns {import("../../../core/capabilities/MapSegmentationCapability").MapSegmentationCapabilityProperties}
     */
    getProperties() {
        return Object.assign({}, super.getProperties(), {
            customOrderSupport: true
        });
    }
}

module.exports = MideaCustomOrderMapSegmentationCapability;
