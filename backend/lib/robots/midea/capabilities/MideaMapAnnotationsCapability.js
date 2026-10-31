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
                ValetudoMapAnnotation.TYPE.CURTAIN
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

        for (const {setting, key, records, changed} of changes) {
            if (!changed) {
                continue;
            }

            await this.sendAnnotationFrame(setting, records);

            // Shown right away. The robot reports its own view of it shortly after
            this.robot.mapParser.annotations[key] = records;
        }

        this.robot.pollMap();
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
// A frame can't be longer than 255 bytes, which fits 12 records. A set replaces the whole list, so it can't be split
const MAX_PER_FRAME = 12;
const FIRST_USER_DEFINED_ID = 100; // Lower ids seem to be reserved for AI-detected ones
// cm. Curtains are drapes that move around, and the robot only treats them differently inside the rectangle,
// so they get a generous width
const ANNOTATION_WIDTH = Object.freeze({
    [ValetudoMapAnnotation.TYPE.CURTAIN]: 40,
    [ValetudoMapAnnotation.TYPE.THRESHOLD]: 10
});

// Action 2 (delete) only adds the records to a separate list of deleted ones and leaves them in place
const ACTION_SET = 1;

module.exports = MideaMapAnnotationsCapability;
