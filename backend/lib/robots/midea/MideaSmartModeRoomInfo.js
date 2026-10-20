const fs = require("node:fs");
const Logger = require("../../Logger");
const MideaRoomOrderManager = require("./MideaRoomOrderManager");

/**
 * Answers the robot's request for per-room settings in the Smart operation mode (raw mode 5).
 *
 * In that mode the robot washes the mop pads after every room. When a job starts, it asks for the settings of each
 * room with a map part get for "worry_free_mode_config", and passes the "data" of the answer on to its cleaning
 * logic. If that holds a "roomInfo" object, the robot uses it; otherwise it falls back to fixed defaults for every
 * room. This answers with each room's own settings from room_cfg.
 *
 * Experimental: the scale the robot expects for the values is not known. They are sent on the scales of 0x2B.
 * The settings have no mode field, so rooms set to vacuum only are sent with water level 0.
 */
class MideaSmartModeRoomInfo {
    /**
     * @param {object} options
     * @param {import("./MideaValetudoRobot")} options.robot
     */
    constructor(options) {
        this.robot = options.robot;
    }

    /**
     * @param {any} body the request body of a map part get
     * @returns {object|undefined} the data to answer with, if this is the room settings request
     */
    onPartGet(body) {
        if (body?.mapPart !== WORRY_FREE_MODE_CONFIG) {
            return undefined;
        }

        try {
            const roomInfo = this.buildRoomInfo(body.mapId);

            Logger.debug(`Smart mode: answering the room settings request with ${JSON.stringify(roomInfo)}`);

            return {roomInfo: roomInfo};
        } catch (e) {
            Logger.warn("Smart mode: could not build the room settings", e);

            return undefined;
        }
    }

    /**
     * @private
     * @param {number} [mapId] the map id the robot asked for, only logged
     * @returns {object}
     */
    buildRoomInfo(mapId) {
        const roomCfg = JSON.parse(fs.readFileSync(ROOM_CFG_PATH).toString());
        const roomCleanParam = (roomCfg.rooms ?? []).map(room => {
            return {
                roomId: room.id,
                vacuumLevel: MideaRoomOrderManager.FAN_SPEED_TO_WIRE[room.fanSpeed] ?? DEFAULT_FAN_SPEED,
                waterLevel: room.vacuum_mop_mode === VACUUM_ONLY ? 0 : room.infinite_water_speed,
                routePreference: MideaRoomOrderManager.ROUTE_TYPE_TO_WIRE[room.route_type] ?? DEFAULT_ROUTE_TYPE,
                cleaningTimes: room.cleanCount,
                cleanSeq: room.cleanSeq
            };
        });

        if (mapId !== roomCfg._mapId) {
            Logger.debug(`Smart mode: the request names map ${mapId}, room_cfg map ${roomCfg._mapId}. Using room_cfg's.`);
        }

        return {
            // The robot looks the settings up by the map id in room_cfg, not the one in its request.
            // It reads the map id as a string, and every other value as a number.
            mapId: String(roomCfg._mapId),
            roomCleanParam: roomCleanParam
        };
    }
}

const WORRY_FREE_MODE_CONFIG = "worry_free_mode_config";
// Same file MideaRoomOrderManager reads
const ROOM_CFG_PATH = "/oem/slam/room_cfg02.settings";
// room_cfg vacuum_mop_mode of a room set to vacuum only
const VACUUM_ONLY = 1;
// Wire values: fan 2 = medium, route 1 = standard
const DEFAULT_FAN_SPEED = 2;
const DEFAULT_ROUTE_TYPE = 1;

module.exports = MideaSmartModeRoomInfo;
