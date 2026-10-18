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
 * On every change, the user-defined ones it reported are deleted and the new list is sent.
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

        for (const type of this.supportedAnnotationTypes) {
            if (mapAnnotations.filter(a => a.type === type).length > MAX_PER_TYPE) {
                throw new Error(`Can't store more than ${MAX_PER_TYPE} annotations of type ${type}.`);
            }
        }

        /** @type {Array<{type: string, setting: number, key: "curtains"|"doorSills"}>} */
        const kinds = [
            {type: ValetudoMapAnnotation.TYPE.CURTAIN, setting: MSmartConst.SETTING.SET_CURTAINS, key: "curtains"},
            {type: ValetudoMapAnnotation.TYPE.THRESHOLD, setting: MSmartConst.SETTING.SET_DOOR_SILLS, key: "doorSills"}
        ];

        for (const {type, setting, key} of kinds) {
            const previous = this.robot.mapParser.annotations[key].filter(r => !r.isAi);
            const next = mapAnnotations.filter(a => a.type === type).map((annotation, i) => {
                return {
                    id: FIRST_USER_DEFINED_ID + i,
                    type: 0, // Door sills: 0 = passable
                    state: 0,
                    isAi: false,
                    corners: this.getCorners(annotation)
                };
            });

            if (previous.length > 0) {
                await this.sendAnnotations(setting, ACTION.DELETE, previous);
            }
            if (next.length > 0) {
                await this.sendAnnotations(setting, ACTION.SET, next);
            }

            // Shown right away. The robot reports its own view of it shortly after
            this.robot.mapParser.annotations[key] = [
                ...this.robot.mapParser.annotations[key].filter(r => r.isAi),
                ...next
            ];
        }

        this.robot.pollMap();
    }

    /**
     * @private
     * @param {number} setting
     * @param {number} action
     * @param {Array<import("../MideaMapParser").MideaAnnotationRecord>} records
     * @returns {Promise<void>}
     */
    async sendAnnotations(setting, action, records) {
        // One frame can't be longer than 255 bytes, which fits 12 records. The robot adds or deletes by id,
        // so a longer list goes out in several frames
        for (let i = 0; i < records.length; i += RECORDS_PER_FRAME) {
            await this.sendAnnotationFrame(setting, action, records.slice(i, i + RECORDS_PER_FRAME));
        }
    }

    /**
     * @private
     * @param {number} setting
     * @param {number} action
     * @param {Array<import("../MideaMapParser").MideaAnnotationRecord>} records
     * @returns {Promise<void>}
     */
    async sendAnnotationFrame(setting, action, records) {
        const payload = Buffer.alloc(2 + records.length * RECORD_LENGTH);

        payload[0] = action;
        payload[1] = records.length;

        records.forEach((record, i) => {
            const offset = 2 + i * RECORD_LENGTH;

            payload[offset] = record.id;
            payload[offset + 1] = record.type;
            // State. The robot only passes a set on to the planner when this is 0
            payload[offset + 2] = action === ACTION.SET ? 0 : action;
            payload[offset + 3] = record.isAi ? 1 : 0;

            // The robot takes the corners in cyclic order and calls them left bottom, right bottom, right top, left top
            record.corners.forEach((corner, j) => {
                payload.writeUInt16LE(corner.x, offset + 4 + j * 4);
                payload.writeUInt16LE(corner.y, offset + 6 + j * 4);
            });
        });

        Logger.debug(
            `Sending ${records.length} ${setting === MSmartConst.SETTING.SET_CURTAINS ? "curtain" : "threshold"}(s), ` +
            `action ${action === ACTION.SET ? "set" : "delete"}. Payload: ${payload.toString("hex")}`
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
const RECORDS_PER_FRAME = 10;
const MAX_PER_TYPE = 32;
const FIRST_USER_DEFINED_ID = 100; // Lower ids seem to be reserved for AI-detected ones
// cm. Curtains are drapes that move around, and the robot only treats them differently inside the rectangle,
// so they get a generous width
const ANNOTATION_WIDTH = Object.freeze({
    [ValetudoMapAnnotation.TYPE.CURTAIN]: 40,
    [ValetudoMapAnnotation.TYPE.THRESHOLD]: 10
});

const ACTION = Object.freeze({
    SET: 1,
    DELETE: 2
});

module.exports = MideaMapAnnotationsCapability;
