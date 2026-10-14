const fs = require("node:fs");
const Logger = require("../../Logger");
const MideaPersistentStore = require("./MideaPersistentStore");
const MSmartConst = require("../../msmart/MSmartConst");
const MSmartPacket = require("../../msmart/MSmartPacket");
const path = require("node:path");
const stateAttrs = require("../../entities/state/attributes");

/**
 * Per-job room order for the J15.
 *
 * The robot ignores the order of the rooms in a room clean (0x03) and sorts them by each room's stored `cleanSeq`
 * instead, with 0 meaning that the robot decides. So, for a job with a custom order, the selected rooms get
 * cleanSeq 1, 2, 3, ... in the clicked order before the job is started, and 0 again once the job is over.
 * That leaves the robot in a known state after every job, even if Valetudo is restarted in between: the rooms still
 * to be reset are remembered and reset as soon as the robot is at rest.
 *
 * `cleanSeq` is written with 0x2B (record version 2), which overwrites every field of the room, so each record carries
 * the room's current values from room_cfg for everything else. The robot saves room_cfg itself; nothing here writes it.
 *
 * Because the robot-side decoding of those fields is not fully known, every write is read back from room_cfg.
 * If anything doesn't match, the feature switches itself off until that is looked into.
 */
class MideaRoomOrderManager {
    /**
     * @param {object} options
     * @param {import("./MideaValetudoRobot")} options.robot
     */
    constructor(options) {
        this.robot = options.robot;
        this.enabled = this.robot.config.get("embedded") === true;

        /** @type {{disabled: string|null, toReset: Array<number>}} */
        this.state = {disabled: null, toReset: []};
        this.awaitingJobStart = false;
        this.awaitingJobStartTimeout = undefined;
        this.resetInProgress = false;

        if (this.enabled) {
            this.store = new MideaPersistentStore({
                config: this.robot.config,
                key: STORE_KEY
            });
            this.state = Object.assign(this.state, this.store.get());

            if (this.state.toReset.length > 0) {
                Logger.info(`Room order: rooms [${this.state.toReset.join(", ")}] still need their cleanSeq reset to 0`);
            }

            this.robot.onStateAttributesUpdated(() => {
                this.onStateChanged();
            });
        }
    }

    /**
     * Makes the robot clean the given rooms in the given order.
     *
     * @param {Array<number>} roomIds in the order they should be cleaned
     * @returns {Promise<void>}
     */
    async applyOrder(roomIds) {
        if (!this.enabled || roomIds.length < 2) {
            return;
        }
        if (this.state.disabled) {
            Logger.warn(`Room order: switched off (${this.state.disabled}). Rooms will be cleaned in the robot's order.`);

            return;
        }

        const rooms = this.readRooms();
        for (const id of roomIds) {
            if (!rooms[id]) {
                throw new Error(`Room ${id} is not in room_cfg`);
            }
        }

        // The selected rooms in clicked order, and rooms left over from an earlier job back to 0
        const desired = {};
        for (const id of this.state.toReset) {
            desired[id] = 0;
        }
        roomIds.forEach((id, i) => {
            desired[id] = i + 1;
        });

        const changes = Object.keys(desired).map(id => {
            return parseInt(id);
        }).filter(id => {
            return rooms[id] && rooms[id].cleanSeq !== desired[id];
        });

        Logger.info(
            `Room order: wanted [${roomIds.join(", ")}]. Rooms to change: ` +
            (changes.map(id => {
                return `${id} ${rooms[id].cleanSeq}->${desired[id]}`;
            }).join(", ") || "none")
        );

        this.updateState({toReset: [...new Set([...this.state.toReset, ...roomIds])]});

        if (changes.length > 0) {
            await this.writeAndVerify(changes.map(id => {
                return Object.assign({}, rooms[id], {cleanSeq: desired[id]});
            }));
        }

        this.updateState({toReset: roomIds});

        this.awaitingJobStart = true;
        clearTimeout(this.awaitingJobStartTimeout);
        this.awaitingJobStartTimeout = setTimeout(() => {
            // In case the job never started, don't wait for it forever
            this.awaitingJobStart = false;
            this.onStateChanged();
        }, JOB_START_TIMEOUT);
    }

    /**
     * Sets cleanSeq back to 0 for the rooms an earlier job changed
     *
     * @returns {Promise<void>}
     */
    async reset() {
        if (this.state.toReset.length === 0 || this.resetInProgress) {
            return;
        }

        this.resetInProgress = true;
        try {
            const rooms = this.readRooms();
            const changes = this.state.toReset.filter(id => {
                return rooms[id] && rooms[id].cleanSeq !== 0;
            });

            Logger.info(`Room order: job over, resetting cleanSeq to 0 for rooms [${changes.join(", ")}]`);

            if (changes.length > 0) {
                await this.writeAndVerify(changes.map(id => {
                    return Object.assign({}, rooms[id], {cleanSeq: 0});
                }));
            }

            this.updateState({toReset: []});
        } catch (e) {
            Logger.error("Room order: resetting cleanSeq failed", e);
        } finally {
            this.resetInProgress = false;
        }
    }

    /**
     * @private
     */
    onStateChanged() {
        if (this.state.toReset.length === 0 || this.state.disabled) {
            return;
        }

        const status = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);
        if (!status) {
            return;
        }

        const atRest = [
            stateAttrs.StatusStateAttribute.VALUE.DOCKED,
            stateAttrs.StatusStateAttribute.VALUE.IDLE
        ].includes(status.value);

        if (!atRest) {
            this.awaitingJobStart = false;
            clearTimeout(this.awaitingJobStartTimeout);

            return;
        }

        // A job that can still be resumed isn't over yet
        if (!this.awaitingJobStart && status.flag !== stateAttrs.StatusStateAttribute.FLAG.RESUMABLE) {
            this.reset().catch(() => {
                /* logged in reset() */
            });
        }
    }

    /**
     * @private
     * @param {Array<object>} wanted room_cfg room entries with the values they should end up with
     * @returns {Promise<void>}
     */
    async writeAndVerify(wanted) {
        const before = fs.statSync(ROOM_CFG_PATH).mtimeMs;

        await this.sendRoomInfo(wanted);

        const deadline = Date.now() + SAVE_TIMEOUT;
        while (Date.now() < deadline && fs.statSync(ROOM_CFG_PATH).mtimeMs === before) {
            await new Promise(resolve => {
                setTimeout(resolve, 250);
            });
        }

        const after = this.readRooms();
        const otherFile = this.readRooms(ROOM_CFG_OTHER_PATH);
        const mismatches = [];

        for (const room of wanted) {
            const stored = after[room.id];

            Logger.info(
                `Room order: room ${room.id} after the write: ${describe(stored)}` +
                ` (${path.basename(ROOM_CFG_OTHER_PATH)}: ${describe(otherFile[room.id])})`
            );

            for (const field of RECORD_FIELDS) {
                if (stored?.[field] !== room[field]) {
                    mismatches.push(`room ${room.id} ${field}: wanted ${room[field]}, got ${stored?.[field]}`);
                }
            }
        }

        if (mismatches.length > 0) {
            this.updateState({disabled: `0x2B readback mismatch: ${mismatches.join("; ")}`});

            Logger.error(`Room order: the robot didn't store what was sent. Switching the feature off. ${mismatches.join("; ")}`);

            throw new Error("The robot didn't store the room order as sent. Room order is now switched off, see the log.");
        }
    }

    /**
     * @private
     * @param {Array<object>} rooms room_cfg room entries
     * @returns {Promise<void>}
     */
    async sendRoomInfo(rooms) {
        const records = Buffer.alloc(rooms.length * RECORD_LENGTH);

        rooms.forEach((room, i) => {
            for (const field of RECORD_FIELDS) {
                const value = room[field];
                if (!Number.isInteger(value) || value < 0 || value > 255) {
                    throw new Error(`Room ${room.id} has an unexpected ${field} value: ${value}`);
                }
            }

            const fan = FAN_SPEED_TO_WIRE[room.fanSpeed];
            if (fan === undefined) {
                // Notably, 5 is known to be able to hard-shut the robot
                throw new Error(`Room ${room.id} has fan speed ${room.fanSpeed}, which is not sent`);
            }
            const route = ROUTE_TYPE_TO_WIRE[room.route_type];
            if (route === undefined) {
                throw new Error(`Room ${room.id} has an unknown route type ${room.route_type}`);
            }

            const offset = i * RECORD_LENGTH;
            records[offset] = room.id;
            records[offset + 1] = room.cleanCount;
            records[offset + 2] = room.vacuum_mop_mode;
            // offset + 3 is not read
            records[offset + 4] = fan;
            records[offset + 5] = room.infinite_water_speed;
            records[offset + 6] = room.cleanSeq;
            records[offset + 7] = room.fluidType;
            records[offset + 8] = route;
        });

        const payload = Buffer.concat([
            // Version 2 of the record format goes where other commands have 0x01
            Buffer.from([0xaa, 0x02, MSmartConst.SETTING.SET_ROOM_INFO, 0x00, rooms.length, RECORD_LENGTH]),
            records
        ]);

        Logger.info(`Room order: sending 0x2B ${payload.toString("hex")}`);

        const response = await this.robot.sendCommand(new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.SETTING,
            payload: payload
        }).toHexString());

        Logger.info(`Room order: 0x2B response payload: ${response?.payload?.toString("hex")}`);
    }

    /**
     * @private
     * @param {string} [filePath]
     * @returns {{[roomId: string]: object}}
     */
    readRooms(filePath = ROOM_CFG_PATH) {
        const rooms = {};

        try {
            const roomCfg = JSON.parse(fs.readFileSync(filePath).toString());

            for (const room of roomCfg.rooms ?? []) {
                rooms[room.id] = room;
            }
        } catch (e) {
            if (filePath === ROOM_CFG_PATH) {
                throw new Error(`Could not read ${filePath}: ${e.message}`);
            }
        }

        return rooms;
    }

    /**
     * @private
     * @param {object} changes
     */
    updateState(changes) {
        this.state = Object.assign({}, this.state, changes);
        this.store.set(this.state);
    }
}

/**
 * @param {object} room
 * @returns {string}
 */
function describe(room) {
    if (!room) {
        return "missing";
    }

    return RECORD_FIELDS.map(field => {
        return `${field}=${room[field]}`;
    }).join(" ");
}

/*
    room_cfg stores some fields on a different scale than the wire uses. These map the stored value to the one to send.

    Fan: stored 1 = quiet ... 4 = max, while the wire uses the global fan speed values (MideaValetudoRobot.FAN_SPEEDS:
    4 = min, 1 = low, 2 = medium, 3 = high). Seen on the robot: sending 2 stores 3.
    Route: stored 1 = standard, 2 = quick, 3 = fine, while the wire uses 0 = quick, 1 = standard, 2 = fine.
    Mode, water and fluid are stored as sent.
 */
const FAN_SPEED_TO_WIRE = Object.freeze({
    1: 4,
    2: 1,
    3: 2,
    4: 3
});
const ROUTE_TYPE_TO_WIRE = Object.freeze({
    1: 1,
    2: 0,
    3: 2
});
const RECORD_FIELDS = ["cleanCount", "vacuum_mop_mode", "fanSpeed", "infinite_water_speed", "cleanSeq", "fluidType", "route_type"];
const RECORD_LENGTH = 10;
const SAVE_TIMEOUT = 5000;
const JOB_START_TIMEOUT = 2 * 60 * 1000;
const STORE_KEY = "roomOrder";
// Same file MideaMapHacksProvider reads the room names from
const ROOM_CFG_PATH = "/oem/slam/room_cfg02.settings";
const ROOM_CFG_OTHER_PATH = "/oem/slam/room_cfg01.settings";

module.exports = MideaRoomOrderManager;
