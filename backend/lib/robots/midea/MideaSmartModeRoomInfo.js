const fs = require("node:fs");
const Logger = require("../../Logger");
const MideaRoomOrderManager = require("./MideaRoomOrderManager");

/**
 * Answers the robot's request for per-room settings in the Smart operation mode (raw mode 5).
 *
 * In that mode the robot washes the mop pads after every room. When a job starts, it posts a robot event asking for
 * the settings of each room and waits a few seconds for a "roomInfo" message, then falls back to fixed defaults
 * for every room. This sends that message with each room's own settings from room_cfg.
 *
 * Experimental: where the robot expects the "roomInfo" object is not known, so it is sent both in the data and at
 * the top level of the message.
 */
class MideaSmartModeRoomInfo {
    /**
     * @param {object} options
     * @param {import("./MideaValetudoRobot")} options.robot
     */
    constructor(options) {
        this.robot = options.robot;
        this.lastSent = 0;
    }

    /**
     * Called for every robot event the robot posts over HTTP
     *
     * @param {any} req
     */
    onRobotEvent(req) {
        Logger.debug(
            `Smart mode: robot event (${req.headers?.["content-type"]}, ${req.headers?.["content-length"]} bytes)` +
            ` in operation mode ${this.robot.lastRawOperationMode}`
        );

        if (this.robot.lastRawOperationMode !== SMART_MODE || Date.now() - this.lastSent < DEBOUNCE) {
            return;
        }
        this.lastSent = Date.now();

        this.send().catch(err => {
            Logger.warn("Smart mode: sending the room settings failed", err);
        });
    }

    /**
     * @private
     */
    async send() {
        const roomCfg = JSON.parse(fs.readFileSync(ROOM_CFG_PATH).toString());
        const roomCleanParam = (roomCfg.rooms ?? []).map(room => {
            return {
                roomId: room.id,
                vacuumLevel: MideaRoomOrderManager.FAN_SPEED_TO_WIRE[room.fanSpeed] ?? DEFAULT_FAN_SPEED,
                waterLevel: room.infinite_water_speed,
                routePreference: MideaRoomOrderManager.ROUTE_TYPE_TO_WIRE[room.route_type] ?? DEFAULT_ROUTE_TYPE,
                cleaningTimes: room.cleanCount,
                cleanSeq: room.cleanSeq
            };
        });
        const roomInfo = {
            mapId: roomCfg._mapId,
            roomCleanParam: roomCleanParam
        };

        Logger.debug(`Smart mode: sending room settings ${JSON.stringify(roomInfo)}`);

        await this.robot.sendCommand({roomInfo: roomInfo}, {
            protocol: "roomInfo",
            envelope: {roomInfo: roomInfo},
            fireAndForget: true
        });
    }
}

const SMART_MODE = 5;
// Same file MideaRoomOrderManager reads
const ROOM_CFG_PATH = "/oem/slam/room_cfg02.settings";
const DEBOUNCE = 30 * 1000;
// Wire values: fan 2 = medium, route 1 = standard
const DEFAULT_FAN_SPEED = 2;
const DEFAULT_ROUTE_TYPE = 1;

module.exports = MideaSmartModeRoomInfo;
