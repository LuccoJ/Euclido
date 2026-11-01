const Logger = require("../../../Logger");
const MapAnnotationsCapability = require("../../../core/capabilities/MapAnnotationsCapability");
const MSmartConst = require("../../../msmart/MSmartConst");
const MSmartPacket = require("../../../msmart/MSmartPacket");
const ValetudoMapAnnotation = require("../../../entities/core/ValetudoMapAnnotation");

/**
 * Curtains (0x34) and thresholds/door sills (0x33).
 *
 * Both take records of 20 bytes: id, a type byte, state (0 when setting, 2 = delete), an is_ai flag and the four corners
 * of a thin rectangle as eight u16 LE values in robot map coordinates. Valetudo annotations are lines, so each line
 * becomes a rectangle of a fixed width around it.
 *
 * The robot reports what it has stored back as map updates (see MideaMapParser), and that is what the map shows.
 * Setting replaces the robot's whole list of that kind, so every change sends the full list in one frame: the
 * AI-detected ones the robot reported, unchanged, and the user-defined ones. Deleting doesn't remove anything from
 * that list (it goes to a separate list of deleted ones), so it isn't used.
 *
 * @extends MapAnnotationsCapability<import("../MideaValetudoRobot")>
 */
class MideaMapAnnotationsCapability extends MapAnnotationsCapability {
    /**
     * @param {object} options
     * @param {import("../MideaValetudoRobot")} options.robot
     */
    constructor(options) {
        super(Object.assign({}, options, {
            supportedAnnotationTypes: [
                ValetudoMapAnnotation.TYPE.THRESHOLD,
                ValetudoMapAnnotation.TYPE.CURTAIN,
                ValetudoMapAnnotation.TYPE.RAMP
            ]
        }));
    }

    /**
     * @param {Array<ValetudoMapAnnotation>} mapAnnotations
     * @returns {Promise<void>}
     */
    async setMapAnnotations(mapAnnotations) {
        if (!this.robot.mapParser.mapInfoValid) {
            throw new Error("Can't place map annotations before the map has been received from the robot.");
        }

        /** @type {Array<{type: string, setting: number, key: "curtains"|"doorSills"}>} */
        const kinds = [
            {type: ValetudoMapAnnotation.TYPE.CURTAIN, setting: MSmartConst.SETTING.SET_CURTAINS, key: "curtains"},
            {type: ValetudoMapAnnotation.TYPE.THRESHOLD, setting: MSmartConst.SETTING.SET_DOOR_SILLS, key: "doorSills"}
        ];

        const changes = kinds.map(({type, setting, key}) => {
            const stored = this.robot.mapParser.annotations[key];
            const aiDetected = stored.filter(r => r.isAi);
            const userDefined = mapAnnotations.filter(a => a.type === type).map((annotation, i) => {
                return {
                    id: FIRST_USER_DEFINED_ID + i,
                    type: 0, // Door sills: 0 = passable
                    state: 0,
                    isAi: false,
                    corners: this.getCorners(annotation)
                };
            });

            if (aiDetected.length + userDefined.length > MAX_PER_FRAME) {
                throw new Error(
                    `Can't store more than ${MAX_PER_FRAME - aiDetected.length} annotations of type ${type}` +
                    (aiDetected.length > 0 ? ` (the robot detected ${aiDetected.length} itself).` : ".")
                );
            }

            return {
                setting: setting,
                key: key,
                records: [...aiDetected, ...userDefined],
                changed: userDefined.length > 0 || stored.some(r => !r.isAi)
            };
        });

        const ramps = mapAnnotations.filter(a => a.type === ValetudoMapAnnotation.TYPE.RAMP);
        if (ramps.length > MAX_BRIDGES) {
            throw new Error(`Can't store more than ${MAX_BRIDGES} annotations of type ${ValetudoMapAnnotation.TYPE.RAMP}.`);
        }

        for (const {setting, key, records, changed} of changes) {
            if (!changed) {
                continue;
            }

            await this.sendAnnotationFrame(setting, records);

            // Shown right away. The robot reports its own view of it shortly after
            this.robot.mapParser.annotations[key] = records;
        }

        await this.setBridges(ramps);

        this.robot.pollMap();
    }

    /**
     * Experimental: ramps are sent as the robot's bridges (0x2F), which it detects with its camera, checks by driving
     * to them and crosses with a guided run. A bridge is a line; the line sent is the ramp's centre line along its
     * longer side. They're sent unconfirmed, which makes the robot go and check them right away, so they're only sent
     * when the ramps changed.
     *
     * @private
     * @param {Array<ValetudoMapAnnotation>} ramps
     * @returns {Promise<void>}
     */
    async setBridges(ramps) {
        const corners = ramps.map(ramp => {
            return ramp.points.map(p => {
                return {x: p.x, y: p.y};
            });
        });

        if (JSON.stringify(corners) === JSON.stringify(this.robot.mapParser.bridges)) {
            return;
        }

        const payload = Buffer.alloc(2 + corners.length * BRIDGE_RECORD_LENGTH);
        payload[0] = 0; // Index of the bridge to check first
        payload[1] = corners.length;

        corners.forEach((c, i) => {
            const offset = 2 + i * BRIDGE_RECORD_LENGTH;
            const [pA, pB] = this.getBridgeLine(c).map(p => {
                return this.robot.mapParser.convertToMideaCoordinates(p.x, p.y);
            });

            payload[offset] = FIRST_BRIDGE_ID + i;
            payload[offset + 1] = 0; // Type
            payload[offset + 2] = BRIDGE_UNCONFIRMED;
            payload.writeUInt16LE(pA.x, offset + 3);
            payload.writeUInt16LE(pA.y, offset + 5);
            payload.writeUInt16LE(pB.x, offset + 7);
            payload.writeUInt16LE(pB.y, offset + 9);
        });

        Logger.debug(`Setting ${corners.length} bridge(s). Payload: ${payload.toString("hex")}`);

        const packet = new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.SETTING,
            payload: MSmartPacket.buildPayload(MSmartConst.SETTING.SET_BRIDGES, payload)
        });
        const response = await this.robot.sendCommand(packet.toHexString());

        Logger.debug(`Bridge response payload: ${response?.payload?.toString("hex")}`);

        this.robot.mapParser.bridges = corners;
    }

    /**
     * The centre line of a ramp's rectangle, along its longer side
     *
     * @private
     * @param {Array<{x: number, y: number}>} c the 4 corners, in order
     * @returns {Array<{x: number, y: number}>}
     */
    getBridgeLine(c) {
        const middle = (a, b) => {
            return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
        };

        if (Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y) >= Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y)) {
            return [middle(c[0], c[3]), middle(c[1], c[2])];
        } else {
            return [middle(c[0], c[1]), middle(c[3], c[2])];
        }
    }

    /**
     * Replaces the robot's list of one kind with the records
     *
     * @private
     * @param {number} setting
     * @param {Array<import("../MideaMapParser").MideaAnnotationRecord>} records
     * @returns {Promise<void>}
     */
    async sendAnnotationFrame(setting, records) {
        const payload = Buffer.alloc(2 + records.length * RECORD_LENGTH);

        payload[0] = ACTION_SET;
        payload[1] = records.length;

        records.forEach((record, i) => {
            const offset = 2 + i * RECORD_LENGTH;

            payload[offset] = record.id;
            payload[offset + 1] = record.type;
            // State. The robot only passes a set on to the planner when this is 0
            payload[offset + 2] = 0;
            payload[offset + 3] = record.isAi ? 1 : 0;

            // The robot takes the corners in cyclic order and calls them left bottom, right bottom, right top, left top
            record.corners.forEach((corner, j) => {
                payload.writeUInt16LE(corner.x, offset + 4 + j * 4);
                payload.writeUInt16LE(corner.y, offset + 6 + j * 4);
            });
        });

        Logger.debug(
            `Setting ${records.length} ${setting === MSmartConst.SETTING.SET_CURTAINS ? "curtain" : "threshold"}(s). ` +
            `Payload: ${payload.toString("hex")}`
        );

        const packet = new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.SETTING,
            payload: MSmartPacket.buildPayload(setting, payload)
        });

        const response = await this.robot.sendCommand(packet.toHexString());

        Logger.debug(`Map annotation response payload: ${response?.payload?.toString("hex")}`);
    }

    /**
     * Turns the annotation's line into a rectangle of the type's width around it, in robot map coordinates.
     * The corners are in cyclic order, starting with the two on one side of the line (MideaMapParser relies on that).
     *
     * @private
     * @param {ValetudoMapAnnotation} annotation
     * @returns {Array<{x: number, y: number}>}
     */
    getCorners(annotation) {
        const [pA, pB] = annotation.points;
        const length = Math.hypot(pB.x - pA.x, pB.y - pA.y) || 1;
        const halfWidth = ANNOTATION_WIDTH[annotation.type] / 2;
        const offset = {
            x: -(pB.y - pA.y) / length * halfWidth,
            y: (pB.x - pA.x) / length * halfWidth
        };

        return [
            {x: pA.x + offset.x, y: pA.y + offset.y},
            {x: pB.x + offset.x, y: pB.y + offset.y},
            {x: pB.x - offset.x, y: pB.y - offset.y},
            {x: pA.x - offset.x, y: pA.y - offset.y},
        ].map(p => {
            return this.robot.mapParser.convertToMideaCoordinates(p.x, p.y);
        });
    }
}

const RECORD_LENGTH = 20;
const BRIDGE_RECORD_LENGTH = 11;
// A frame can't be longer than 255 bytes
const MAX_BRIDGES = 21;
const FIRST_BRIDGE_ID = 1;
// Confirm status: 1 is confirmed; anything else makes the robot drive to the bridges to check them
const BRIDGE_UNCONFIRMED = 0;
// A frame can't be longer than 255 bytes, which fits 12 records. A set replaces the whole list, so it can't be split
const MAX_PER_FRAME = 12;
// The planner keeps ids up to 100 for the ones it detects itself (it tracks which of those are taken)
const FIRST_USER_DEFINED_ID = 101;
// cm. Curtains are drapes that move around, and the robot only treats them differently inside the rectangle,
// so they get a generous width
const ANNOTATION_WIDTH = Object.freeze({
    [ValetudoMapAnnotation.TYPE.CURTAIN]: 40,
    [ValetudoMapAnnotation.TYPE.THRESHOLD]: 10
});

// Action 2 (delete) only adds the records to a separate list of deleted ones and leaves them in place
const ACTION_SET = 1;

module.exports = MideaMapAnnotationsCapability;
