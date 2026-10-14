const CleanRouteControlCapability = require("../../../core/capabilities/CleanRouteControlCapability");
const MapSegmentCleaningSettingsCapability = require("../../../core/capabilities/MapSegmentCleaningSettingsCapability");
const MideaRoomOrderManager = require("../MideaRoomOrderManager");
const stateAttrs = require("../../../entities/state/attributes");

const INTENSITY = stateAttrs.PresetSelectionStateAttribute.INTENSITY;
const MODE = stateAttrs.PresetSelectionStateAttribute.MODE;

/**
 * The robot's per-room settings from room_cfg, written with 0x2B through MideaRoomOrderManager.
 * The robot uses them in the "personalized" operation mode. The order is used for every room clean.
 *
 * @extends MapSegmentCleaningSettingsCapability<import("../MideaValetudoRobot")>
 */
class MideaMapSegmentCleaningSettingsCapability extends MapSegmentCleaningSettingsCapability {
    /**
     * @param {object} options
     * @param {import("../MideaValetudoRobot")} options.robot
     */
    constructor(options) {
        super(options);

        this.roomOrderManager = MideaRoomOrderManager.forRobot(this.robot);
    }

    /**
     * @returns {Promise<import("../../../core/capabilities/MapSegmentCleaningSettingsCapability").MapSegmentCleaningSettings>}
     */
    async getSettings() {
        const rooms = this.roomOrderManager.readRooms();

        return {
            order: this.roomOrderManager.getSavedOrder().filter(id => {
                return rooms[id] !== undefined;
            }).map(id => {
                return `${id}`;
            }),
            segments: Object.values(rooms).map(room => {
                return {
                    id: `${room.id}`,
                    iterations: room.cleanCount,
                    operationMode: findKey(OPERATION_MODES, room.vacuum_mop_mode) ?? `raw_${room.vacuum_mop_mode}`,
                    fanSpeed: findKey(FAN_SPEEDS, room.fanSpeed) ?? `raw_${room.fanSpeed}`,
                    waterGrade: findKey(this.robot.waterGrades, room.infinite_water_speed) ?? `raw_${room.infinite_water_speed}`,
                    cleanRoute: findKey(CLEAN_ROUTES, room.route_type) ?? `raw_${room.route_type}`
                };
            })
        };
    }

    /**
     * @param {import("../../../core/capabilities/MapSegmentCleaningSettingsCapability").MapSegmentCleaningSettings} settings
     * @returns {Promise<void>}
     */
    async setSettings(settings) {
        this.roomOrderManager.assertEnabled();

        const rooms = this.roomOrderManager.readRooms();
        const order = (settings.order ?? []).map(id => {
            return parseInt(id);
        });

        for (const id of order) {
            if (!rooms[id]) {
                throw new Error(`Unknown segment ${id}`);
            }
        }
        if (new Set(order).size !== order.length) {
            throw new Error("A segment can only appear once in the order");
        }

        const entries = {};
        for (const entry of settings.segments ?? []) {
            if (!rooms[entry.id]) {
                throw new Error(`Unknown segment ${entry.id}`);
            }

            entries[entry.id] = entry;
        }

        this.roomOrderManager.setSavedOrder(order);

        const changed = [];
        for (const room of Object.values(rooms)) {
            const entry = entries[room.id];
            const wanted = Object.assign({}, room);

            if (entry) {
                const iterationCount = this.getProperties().iterationCount;
                if (
                    !Number.isInteger(entry.iterations) ||
                    entry.iterations < iterationCount.min ||
                    entry.iterations > iterationCount.max
                ) {
                    throw new Error(`Invalid iteration count for segment ${room.id}: ${entry.iterations}`);
                }

                wanted.cleanCount = entry.iterations;
                wanted.vacuum_mop_mode = toStoredValue(OPERATION_MODES, entry.operationMode, room.vacuum_mop_mode);
                wanted.fanSpeed = toStoredValue(FAN_SPEEDS, entry.fanSpeed, room.fanSpeed);
                wanted.infinite_water_speed = toStoredValue(this.robot.waterGrades, entry.waterGrade, room.infinite_water_speed);
                wanted.route_type = toStoredValue(CLEAN_ROUTES, entry.cleanRoute, room.route_type);
            }

            // Rooms of a job with a custom order keep their temporary value. They get the saved one when the job is over
            if (!this.roomOrderManager.state.toReset.includes(room.id)) {
                wanted.cleanSeq = this.roomOrderManager.getSavedSeq(room.id);
            }

            if (RECORD_FIELDS.some(field => {
                return wanted[field] !== room[field];
            })) {
                changed.push(wanted);
            }
        }

        if (changed.length > 0) {
            await this.roomOrderManager.writeAndVerify(changed);
        }
    }

    /**
     * @returns {import("../../../core/capabilities/MapSegmentCleaningSettingsCapability").MapSegmentCleaningSettingsCapabilityProperties}
     */
    getProperties() {
        return {
            iterationCount: {
                min: 1,
                max: 3
            },
            operationModes: Object.keys(OPERATION_MODES),
            fanSpeeds: Object.keys(FAN_SPEEDS),
            waterGrades: Object.keys(this.robot.waterGrades),
            cleanRoutes: Object.keys(CLEAN_ROUTES)
        };
    }
}

/**
 * @param {object} table
 * @param {number} value
 * @returns {string|undefined}
 */
function findKey(table, value) {
    return Object.keys(table).find(key => {
        return table[key] === value;
    });
}

/**
 * A name from the table, or "raw_<n>" for a value the robot has stored that isn't in the table. The latter is only
 * accepted unchanged, so that an unknown value can be kept but not invented.
 *
 * @param {object} table
 * @param {string} name
 * @param {number} currentValue
 * @returns {number}
 */
function toStoredValue(table, name, currentValue) {
    if (table[name] !== undefined) {
        return table[name];
    }
    if (name === `raw_${currentValue}`) {
        return currentValue;
    }

    throw new Error(`Invalid value: ${name}`);
}

// Values as stored in room_cfg. MideaRoomOrderManager translates them for the wire where needed
const OPERATION_MODES = Object.freeze({
    [MODE.VACUUM_AND_MOP]: 0,
    [MODE.VACUUM]: 1,
    [MODE.MOP]: 2
});
// Same names as the global fan speed (MideaValetudoRobot.FAN_SPEEDS), but room_cfg stores them in order
const FAN_SPEEDS = Object.freeze({
    [INTENSITY.MIN]: 1,
    [INTENSITY.LOW]: 2,
    [INTENSITY.MEDIUM]: 3,
    [INTENSITY.HIGH]: 4
});
const CLEAN_ROUTES = Object.freeze({
    [CleanRouteControlCapability.ROUTE.QUICK]: 2,
    [CleanRouteControlCapability.ROUTE.NORMAL]: 1,
    [CleanRouteControlCapability.ROUTE.DEEP]: 3
});
const RECORD_FIELDS = ["cleanCount", "vacuum_mop_mode", "fanSpeed", "infinite_water_speed", "cleanSeq", "fluidType", "route_type"];

module.exports = MideaMapSegmentCleaningSettingsCapability;
