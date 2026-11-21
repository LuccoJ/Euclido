const Logger = require("../../../Logger");
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

        this.roomOrderManager = MideaRoomOrderManager.forRobot(this.robot);
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
     * In the personalized mode, the robot takes the number of passes from the start command, not from its
     * per-room settings. Send the larger of the stored count and the requested one, so that each room keeps its
     * own count and a job can still ask for more passes everywhere.
     *
     * @protected
     * @param {import("../../../entities/core/ValetudoMapSegment")} segment
     * @param {number} operationMode
     * @param {object} [options]
     * @param {number} [options.iterations]
     * @returns {number}
     */
    getSegmentIterations(segment, operationMode, options) {
        const requested = super.getSegmentIterations(segment, operationMode, options);

        if (operationMode === PERSONALIZED_OPERATION_MODE) {
            try {
                const cleanCount = this.roomOrderManager.readRooms()[segment.id]?.cleanCount;

                if (Number.isInteger(cleanCount) && cleanCount >= 1 && cleanCount <= 3) {
                    return Math.max(cleanCount, requested);
                }
            } catch (e) {
                Logger.warn("Could not read the room settings for the number of passes", e);
            }
        }

        return requested;
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

const PERSONALIZED_OPERATION_MODE = 6;

module.exports = MideaCustomOrderMapSegmentationCapability;
