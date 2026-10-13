const Logger = require("../../../Logger");
const MapAnnotationsCapability = require("../../../core/capabilities/MapAnnotationsCapability");
const mapEntities = require("../../../entities/map");
const MideaPersistentStore = require("../MideaPersistentStore");
const MSmartConst = require("../../../msmart/MSmartConst");
const MSmartPacket = require("../../../msmart/MSmartPacket");
const path = require("node:path");
const ValetudoMapAnnotation = require("../../../entities/core/ValetudoMapAnnotation");

/**
 * Curtains (0x34) and thresholds/door sills (0x33).
 *
 * Both take records of 20 bytes: id, a type byte, state (1 = set, 2 = delete), an is_ai flag and the four corners
 * of a thin rectangle as eight u16 LE values in robot map coordinates. Valetudo annotations are lines, so each line
 * becomes a rectangle of a fixed width around it.
 *
 * The robot doesn't report user-defined curtains or thresholds back, so Valetudo keeps its own list,
 * persisted in the configuration file, and replaces whatever it set before on every change.
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

        /** @type {Array<ValetudoMapAnnotation>} */
        this.mapAnnotations = [];

        if (this.robot.config.get("embedded") === true) {
            this.store = new MideaPersistentStore({
                config: this.robot.config,
                key: "mapAnnotations",
                legacyFilePath: path.join(path.dirname(this.robot.config.location), LEGACY_STORAGE_FILENAME)
            });
            this.mapAnnotations = this.load();
        }

        this.updateMapEntities();
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

        for (const [type, setting] of [
            [ValetudoMapAnnotation.TYPE.CURTAIN, MSmartConst.SETTING.SET_CURTAINS],
            [ValetudoMapAnnotation.TYPE.THRESHOLD, MSmartConst.SETTING.SET_DOOR_SILLS]
        ]) {
            const previous = this.mapAnnotations.filter(a => a.type === type);
            const next = mapAnnotations.filter(a => a.type === type);

            if (previous.length > 0) {
                await this.sendAnnotations(setting, ACTION.DELETE, previous);
            }
            if (next.length > 0) {
                await this.sendAnnotations(setting, ACTION.SET, next);
            }
        }

        this.mapAnnotations = mapAnnotations.filter(a => this.supportedAnnotationTypes.includes(a.type));
        this.persist();
        this.updateMapEntities();

        this.robot.pollMap();
    }

    /**
     * @private
     * @param {number} setting
     * @param {number} action
     * @param {Array<ValetudoMapAnnotation>} annotations
     * @returns {Promise<void>}
     */
    async sendAnnotations(setting, action, annotations) {
        const payload = Buffer.alloc(2 + annotations.length * RECORD_LENGTH);

        payload[0] = action;
        payload[1] = annotations.length;

        annotations.forEach((annotation, i) => {
            const offset = 2 + i * RECORD_LENGTH;
            const [c0, c1, c2, c3] = this.getCorners(annotation);

            payload[offset] = FIRST_USER_DEFINED_ID + i;
            payload[offset + 1] = 0; // Threshold: 0 = passable. Unused for curtains
            payload[offset + 2] = action; // State, mirrors the action
            payload[offset + 3] = 0; // Not AI-detected

            // The robot takes the corners in cyclic order and calls them left bottom, right bottom, right top, left top
            [c0, c1, c2, c3].forEach((corner, j) => {
                payload.writeUInt16LE(corner.x, offset + 4 + j * 4);
                payload.writeUInt16LE(corner.y, offset + 6 + j * 4);
            });
        });

        Logger.info(
            `Sending ${annotations.length} ${setting === MSmartConst.SETTING.SET_CURTAINS ? "curtain" : "threshold"}(s), ` +
            `action ${action === ACTION.SET ? "set" : "delete"}. Payload: ${payload.toString("hex")}`
        );

        const packet = new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.SETTING,
            payload: MSmartPacket.buildPayload(setting, payload)
        });

        const response = await this.robot.sendCommand(packet.toHexString());

        Logger.info(`Map annotation response payload: ${response?.payload?.toString("hex")}`);
    }

    /**
     * Turns the annotation's line into a rectangle of the type's width around it, in robot map coordinates.
     * The corners are in cyclic order.
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

    /**
     * @private
     */
    updateMapEntities() {
        this.robot.mapParser.setAnnotationEntities(this.mapAnnotations.map(annotation => {
            return new mapEntities.LineMapEntity({
                points: [
                    annotation.points[0].x,
                    annotation.points[0].y,
                    annotation.points[1].x,
                    annotation.points[1].y
                ],
                type: annotation.type === ValetudoMapAnnotation.TYPE.CURTAIN ?
                    mapEntities.LineMapEntity.TYPE.CURTAIN :
                    mapEntities.LineMapEntity.TYPE.THRESHOLD
            });
        }));
    }

    /**
     * @private
     * @returns {Array<ValetudoMapAnnotation>}
     */
    load() {
        try {
            return (this.store.get() ?? []).map(a => {
                return new ValetudoMapAnnotation({type: a.type, points: a.points});
            });
        } catch (e) {
            Logger.warn("Error while loading the map annotations", e);

            return [];
        }
    }

    /**
     * @private
     */
    persist() {
        if (!this.store) {
            return;
        }

        this.store.set(this.mapAnnotations.map(a => {
            return {type: a.type, points: a.points};
        }));
    }
}

const LEGACY_STORAGE_FILENAME = "valetudo_midea_map_annotations.json";
const RECORD_LENGTH = 20;
const MAX_PER_TYPE = 32;
const FIRST_USER_DEFINED_ID = 100; // Lower ids seem to be reserved for AI-detected ones
// cm. Curtains are drapes that move around, so they get a generous width. TODO: compare with the robot's own widths
const ANNOTATION_WIDTH = Object.freeze({
    [ValetudoMapAnnotation.TYPE.CURTAIN]: 30,
    [ValetudoMapAnnotation.TYPE.THRESHOLD]: 10
});

const ACTION = Object.freeze({
    SET: 1,
    DELETE: 2
});

module.exports = MideaMapAnnotationsCapability;
